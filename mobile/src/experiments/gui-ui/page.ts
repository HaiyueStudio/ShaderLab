import {configurePreviewExperiment, previewProfileSnapshot} from './preview-profile';
import {shaderAppearance} from '../../../../shared/dist/views/presentation.js';
import {
  GridLayout,
  Application,
  Color,
  File,
  Page,
  TextField,
  TextView,
  knownFolders,
  path,
  type View,
} from "@nativescript/core";
import { Canvas, ImageAsset } from "@nativescript/canvas";
import { Entity, type HaiyueEngine } from "@haiyue/engine";
import {
  NativeRenderHost,
  NativeTouchInput,
  NativeCanvasTextures,
} from "@haiyue/native/engine";
import { ShaderEditorController } from "../../../../shared/dist/views/editor-controller.js";
import { preparedPreview } from "../../../../shared/dist/ports/preparedPreview.js";
import { MobileSession } from "../../session";
import { MobileProjects } from "../../storage";
import { MobileCompiler } from "../../compiler";
import { NativeShaderRuntime } from "../../gpu-runtime";
import { createProject, parseProject, type ShaderProject } from "../../project";
import { examples } from "../../../../web/src/examples.js";
import { TrailingTask } from "../../platform/trailing-task";
import { installGuiProfile } from "./profile";
import { GuiEditorView, guiCharacters } from "./view";
import { guiComparisonRequested, experimentFlag } from "./flags";
import {
  measureGuiComparison,
  installFrameProbe,
  type FrameProbe,
} from "./sampling";

export function guiExperimentPage() {
  (globalThis as any).__shaderlabGuiBaseline = experimentFlag("shaderlab-gui-baseline") === "true";
  return new GuiExperimentPage().page;
}
export class GuiExperimentPage {
  readonly page = new Page();
  private readonly layout = new GridLayout();
  private readonly canvas = new Canvas();
  private readonly code = new TextView();
  private readonly ime = new TextField();
  private readonly compiler = new MobileCompiler();
  private readonly session = new MobileSession();
  private readonly projects = new MobileProjects("ShaderLab-GUI-Experiment");
  private readonly controller: ShaderEditorController;
  private gui?: GuiEditorView;
  private host?: NativeRenderHost;
  private runtime?: NativeShaderRuntime;
  private scene?: ReturnType<HaiyueEngine["createScene"]>;
  private raster?: NativeCanvasTextures;
  private readonly thumbnails = new Map<string,GPUTexture>();
  private touch?: NativeTouchInput;
  private probe?: FrameProbe;
  private profile?: ReturnType<typeof installGuiProfile>;
  private testFrame?: () => void;
  private engine?: HaiyueEngine;
  private codeRegion = { x: 12, y: 254, width: 256, height: 144 };
  private regionKey = "";
  private dead = false;
  private foreground = true;
  private unlisten = () => {};
  private changing = false;
  private readonly draft = new TrailingTask(
    500,
    () =>
      void this.session.application
        .saveDraft()
        .catch((e) => this.controller.report(String(e))),
  );
  constructor() {
    this.page.actionBarHidden = true;
    this.page.backgroundColor = new Color(shaderAppearance.color.canvas);
    this.page.content = this.layout;
    this.layout.iosOverflowSafeArea = false;
    this.layout.iosOverflowSafeAreaEnabled = false;
    this.canvas.style.width = "100%";
    this.canvas.style.height = "100%";
    this.canvas.ignoreTouchEvents = true;
    this.layout.addChild(this.canvas);
    this.code.horizontalAlignment = "left";
    this.code.verticalAlignment = "top";
    this.code.fontSize = 14;
    this.code.color = new Color("#e4e8f1");
    this.code.backgroundColor = new Color("#101318");
    this.code.visibility = "collapse";
    this.layout.addChild(this.code);
    // Native IME transports text; its one-pixel view is outside the visible UI.
    // The name field itself is drawn by GuiButton. OS keyboard is not a GUI widget.
    this.ime.returnKeyType = "done";
    this.ime.width = 1;
    this.ime.height = 1;
    this.ime.opacity = 0.01;
    this.ime.horizontalAlignment = "left";
    this.ime.verticalAlignment = "top";
    this.ime.marginLeft = -10;
    this.layout.addChild(this.ime);
    this.layout.addChild(this.compiler.view);
    this.ime.on("textChange", () => {
      if (!this.changing)
        this.controller.dispatch({
          key: "/shader-project/name/field",
          type: "valueChange",
          value: this.ime.text,
          reason: "keyboard",
          transaction: 1,
        });
    });
    this.ime.on("returnPress", () => this.hideKeyboard());
    this.code.on("textChange", () => {
      if (!this.changing) {
        this.session.setSource(this.code.text ?? "");
        this.draft.request();
      }
    });
    this.session.application.connect({
      projects: {
        open: async () => null,
        save: async (snapshot, c) => {
          if (c.signal.aborted) return "cancelled";
          await this.projects.save(snapshot as ShaderProject);
          return "saved";
        },
        saveDraft: async (snapshot, c) => {
          if (!c.signal.aborted)
            await this.projects.draft(snapshot as ShaderProject, c.activePass);
        },
      },
      preview: preparedPreview(() => {
        const rt = this.runtime;
        if (!rt) throw Error("GPU initializing");
        return {
          prepare: (p) => rt.prepareOwnedSnapshot(p),
          commit: (v) => rt.commit(v),
          release: (v) => rt.releasePrepared(v),
          play: (v) => rt.setPlaying(v),
          step: () => rt.step(),
          reset: () => rt.reset(),
        };
      }),
    });
    this.session.open(createProject());
    this.controller = new ShaderEditorController(this.session.application, {
      ensurePreview: async () => {
        if (!this.runtime) throw Error("GPU initializing");
      },
      flushEditor: () => {
        if (this.code.text !== this.session.source)
          this.session.setSource(this.code.text ?? "");
      },
      previewModeChanged: () =>
        this.controller.report("实验只比较 Canvas 预览；3D 模式不属于本轮。"),
      playbackChanged: () => {},
      compiled: () => {
        if (this.session.application.state.compile.status === "failed")
          this.controller.report("编译失败");
      },
    });
    let revision = this.session.revision;
    this.unlisten = this.controller.subscribe(
      (s) => s,
      (state) => {
        this.gui?.apply(state);
        if (revision !== state.application.revision) {
          revision = state.application.revision;
          this.draft.request();
        }
        this.host?.requestFrame();
      },
    );
    this.layout.on("layoutChanged", this.arrange);
    this.canvas.on("loaded", () => this.initialize());
    this.page.on("navigatingFrom", (e) => {
      if ((e as { isBackNavigation?: boolean }).isBackNavigation)
        this.dispose();
    });
    Application.on(Application.suspendEvent, this.suspend);
    Application.on(Application.resumeEvent, this.resume);
  }
  private hideKeyboard() {
    this.code.dismissSoftInput();
    this.ime.dismissSoftInput();
  }
  private readonly suspend = () => {
    this.foreground = false;
    this.hideKeyboard();
    this.runtime?.setCaptureVisible(false);
    this.scene?.guiSystem?.stopAnimations();
  };
  private readonly resume = () => {
    this.foreground = true;
    this.host?.requestFrame();
  };
  private readonly arrange = () => {
    if (this.dead) return;
    const { width, height } = this.layout.getActualSize();
    if (!width || !height) return;
    this.gui?.layout(width, height);
    this.host?.requestFrame();
  };
  private region(rect: typeof this.codeRegion, code: boolean) {
    this.codeRegion = { ...rect };
    const key = [rect.x, rect.y, rect.width, rect.height, code].join(":");
    if (key === this.regionKey) return;
    this.regionKey = key;
    this.code.marginLeft = rect.x;
    this.code.marginTop = rect.y;
    this.code.width = rect.width;
    this.code.height = rect.height;
    this.code.visibility = code ? "visible" : "collapse";
    if (!code) this.code.dismissSoftInput();
  }
  private syncCode() {
    this.changing = true;
    this.code.text = this.session.source;
    this.ime.text = this.controller.getSnapshot().name;
    this.changing = false;
  }
  private async open(project: ShaderProject, fork = false) {
    this.hideKeyboard();
    this.session.open(project, fork);
    this.syncCode();
    this.gui?.showEditor();
    await this.controller.compile();
    this.host?.requestFrame();
  }
  private thumbnail(project: ShaderProject): GPUTexture | null {
    const sample=examples().find(x=>x.project.id===project.id);
    if(!sample || !this.raster)return null;
    const cached=this.thumbnails.get(sample.id);if(cached)return cached;
    const image=new ImageAsset();
    if(!image.fromFileSync(path.join(knownFolders.currentApp().path,'assets','gallery',sample.id+'.png')))return null;
    const canvas=this.raster.createCanvas2D(256,140),context=canvas.getContext('2d')!;
    const iw=Number(image.width),ih=Number(image.height),scale=Math.max(256/iw,140/ih);
    context.drawImage(image as unknown as CanvasImageSource,(256-iw*scale)/2,(140-ih*scale)/2,iw*scale,ih*scale);
    const texture=this.raster.textureFromCanvas(canvas,'gallery:'+sample.id);this.thumbnails.set(sample.id,texture);return texture;
  }
  private async gallery() {
    this.hideKeyboard();
    this.runtime?.setPlaying(false);
    this.gui?.showGallery(
      await this.projects.list(),
      examples()
        .slice(0, 8)
        .map((x) => x.project),
    );
    this.host?.requestFrame();
  }
  private initialize() {
    if (this.host || this.dead) return;
    this.touch = new NativeTouchInput(this.canvas, () =>
      this.host?.requestFrame(),
    );
    this.host = new NativeRenderHost(
      this.canvas,
      (text) => {
        console.log("GUI experiment: " + text);
      },
      {
        diagnosticName: "shaderlab-gui-experiment",
        diagnosticIntervalFrames: 0,
        canvasInput: this.touch.target as unknown as HTMLCanvasElement,
        needsAnimationFrame: () =>
          (this.foreground && (this.runtime?.playing ?? false)) ||
          !!this.scene?.guiSystem?.animating,
        engineOptions: { clearColor: { r: 0.08, g: 0.1, b: 0.13, a: 1 } },
        prepareScene: async (engine) => {
          this.engine = engine;
          this.probe = installFrameProbe(engine);
          this.runtime = new NativeShaderRuntime(
            engine,
            () => this.host?.requestFrame(),
            this.touch!.target as unknown as HTMLCanvasElement,
            (c, o) => this.compiler.hlsl(c, o),
            {
              size: () =>
                guiComparisonRequested()
                  ? { width: 512, height: 288 }
                  : {
                      width: Math.round(this.codeRegion.width * 2),
                      height: Math.round(this.codeRegion.height * 2),
                    },
              output: (texture) => this.gui?.output(texture),
            },
          );
          configurePreviewExperiment(this.runtime, engine);
          await this.runtime.initialize();
          this.raster = new NativeCanvasTextures(engine.device);
          this.scene = engine.createScene({
            name: "ShaderLab engine GUI experiment",
            render3D: false,
            render2D: false,
            gui: {
              loadOp: "clear",
              font: {
                chars:
                  guiCharacters +
                  examples()
                    .slice(0, 8)
                    .map((x) => x.project.name)
                    .join(""),
                fontSize: 32,
                atlasSize: 2048,
                canvasFactory: this.raster.createCanvas2D,
                readAtlasPixels: this.raster.readAtlasPixels,
              },
            },
          });
          if (experimentFlag("shaderlab-gui-profile") === "true") this.profile = installGuiProfile(engine, this.scene.guiSystem);
          this.gui = new GuiEditorView(
            {
              command: (key, type, value) =>
                this.controller.dispatch({
                  key,
                  type,
                  ...(value === undefined ? {} : { value }),
                  reason: "pointer",
                  transaction: 1,
                }),
              pane: (value) => {
                this.hideKeyboard();
                this.gui!.setPane(value);
                this.session.application.dispatch({
                  type: "pane.select",
                  pane: value,
                });
                this.host?.requestFrame();
              },
              home: () => void this.gallery(),
              create: () => void this.open(createProject()),
              open: (p, f) => void this.open(p, f),
              name: () => {
                this.changing = true;
                this.ime.text = this.controller.getSnapshot().name;
                this.changing = false;
                this.ime.focus();
              },
              keyboard: () => this.hideKeyboard(),
            },
            (r, c) => this.region(r, c),
            guiComparisonRequested(),
            !!(globalThis as any).__shaderlabGuiPatch && !(globalThis as any).__shaderlabGuiBaseline,
            project => this.thumbnail(project),
          );
          this.scene.add(
            new Entity("ShaderLab preview image").addComponent(
              this.gui.previewRoot,
            ),
          );
          this.scene.add(
            new Entity("ShaderLab GUI shell").addComponent(this.gui.root),
          );
          if (this.gui.controlsRoot) this.scene.add(new Entity("ShaderLab dynamic controls").addComponent(this.gui.controlsRoot));
          engine.switchScene(this.scene);
          this.arrange();
          this.gui.apply(this.controller.getSnapshot());
          if (experimentFlag("shaderlab-gui-ui-check") === "true") {
            this.canvas.accessibilityIdentifier = "gui-shell";
            this.canvas.accessibilityLabel = "GUI experiment";
            this.canvas.accessibilityRole = "image";
            this.canvas.accessible = true;
            this.testFrame = () => {
              this.canvas.accessibilityValue = JSON.stringify(
                this.gui!.testSnapshot(),
              );
            };
            engine.on("after-update", this.testFrame);
          }
          if (guiComparisonRequested()) {
            const fixture = parseProject(
              File.fromPath(
                path.join(
                  knownFolders.currentApp().path,
                  "assets/g07/project.hyshader",
                ),
              ).readTextSync(),
            );
            await this.open(fixture);
            void measureGuiComparison({
              frameWorkOptimized:()=>this.runtime!.optimizeFrameWork,
              previewProfile:()=>previewProfileSnapshot(this.runtime!),
              mode: "gui",
              application: this.session.application,
              engine,
              probe: this.probe,
              disposed: () => this.dead,
              scale: (value) =>
                this.controller.dispatch({
                  key: "/shader-toolbar/controls/scale",
                  type: "commit",
                  value: String(value),
                  reason: "keyboard",
                  transaction: 1,
                }),
              status: () => this.runtime!.status(),
              surfaceSize: () => ({ width: 512, height: 288 }),
              diagnostics: () => ({ ...this.gui!.snapshot(), profile: this.profile?.snapshot() }),
              readPixels: () => this.runtime!.readImage(),
            });
          } else await this.gallery();
          return {
            experiment: "engine-gui",
            nativeVisibleControls: "code only",
          };
        },
        bindInput: () => ({
          suspend: () => this.touch?.suspend(),
          resume: () => this.touch?.resume(),
          dispose: () => this.touch?.dispose(),
          snapshot: () => this.touch?.snapshot(),
        }),
        disposeScene: () => {
          if (this.testFrame) this.engine?.off("after-update", this.testFrame);
          this.profile?.dispose();
          this.probe?.dispose();
          this.gui?.dispose();
          this.scene?.destroy();
          this.runtime?.dispose();
          this.raster?.dispose();
          this.thumbnails.clear();
        },
      },
    );
    this.arrange();
  }
  dispose() {
    if (this.dead) return;
    this.dead = true;
    this.hideKeyboard();
    this.draft.dispose();
    this.unlisten();
    this.controller.dispose();
    this.host?.dispose();
    this.compiler.dispose();
    this.layout.off("layoutChanged", this.arrange);
    Application.off(Application.suspendEvent, this.suspend);
    Application.off(Application.resumeEvent, this.resume);
  }
}
