import {shaderAppearance, shaderTheme} from '../../../../shared/dist/views/presentation.js';
import {
  GuiRoot,
  GuiElement,
  GuiLabel,
  GuiButton,
  GuiImage,
  GuiSelect,
  GuiModal,
  GuiScrollView,
  type GuiRect,
} from "@haiyue/engine/gui";
import {
  saveMessage,
  type ShaderEditorViewState,
} from "../../../../shared/dist/views/editor-controller.js";
import { PREVIEW_SCALES, type ShaderProject } from "../../project";
export interface GuiActions {
  command(key: string, type: "activate" | "commit", value?: string): void;
  pane(value: "preview" | "code"): void;
  home(): void;
  create(): void;
  open(project: ShaderProject, fork: boolean): void;
  name(): void;
  keyboard(): void;
}
const C = shaderAppearance.color;
const S = shaderAppearance.size;
export const guiCharacters =
  "打开即可我的作品从灵感开始渲染分辨率预览模式当前实验仅支持所有图片保存编辑的已仍只比较收起于＋作品列表新建示例编辑预览代码设置工程名称保存运行暂停播放重置单帧渲染分辨率完成关闭取消键盘有未修改无正在编译成功失败返回请选择实验原生输入区域不属于本轮教程导入导出媒体设置范围球体立方圆环模式信息查看通道画布" +
  Array.from({ length: 95 }, (_, i) => String.fromCharCode(i + 32)).join("") +
  "…·🌙";
/** Product experiment, deliberately not a public portable UI backend. Same
 * application/controller commands; direct retained GUI bindings replace UIKit. */
export class GuiEditorView {
  readonly root = new GuiRoot({
    theme: {
      fontSize: shaderTheme.fontSize,
      radius: shaderTheme.radius,
      colors: {
        text: C.text,
        textMuted: C.muted,
        primary: C.accent,
        danger: C.danger,
        background: C.canvas,
        surface: C.surface,
        border: C.border,
        hover: C.hover,
        active: C.selected,
        disabled: C.disabled,
      },
    },
  });
  readonly previewRoot = new GuiRoot();
  readonly controlsRoot?: GuiRoot;
  readonly preview = new GuiImage();
  private readonly gallery = this.root.add(
    new GuiElement({ width: "100%", height: "100%" }),
  );
  private readonly editor = this.root.add(
    new GuiElement({ width: "100%", height: "100%" }),
  );
  private readonly list = this.gallery.add(
    new GuiScrollView({ showScrollbar: true }),
  );
  private readonly widgets: GuiElement[] = [];
  private readonly positions = new Map<GuiElement, GuiRect>();
  private title!: GuiButton;
  private status!: GuiLabel;
  private running!: GuiButton;
  private playing!: GuiButton;
  private scale!: GuiSelect<string>;
  private readonly dialog: GuiModal;
  private readonly dialogScale: GuiSelect<string>;
  private readonly dialogIdentity: GuiLabel;
  private readonly dialogProjectId: GuiLabel;
  private readonly dialogModeLabel: GuiLabel;
  private readonly dialogMode: GuiButton;
  private readonly galleryCards: GuiElement[] = [];
  private readonly galleryBoxes = new Map<GuiElement,GuiRect>();
  private paneValue: "preview" | "code" = "preview";
  private showingGallery = true;
  private width = 0;
  private height = 0;
  private state?: ShaderEditorViewState;
  commits = 0;
  layouts = 0;
  constructor(
    private readonly actions: GuiActions,
    private readonly region: (r: GuiRect, code: boolean) => void,
    readonly benchmark = false,
    retainedLayers = false,
    private readonly thumbnail: (project: ShaderProject) => GPUTexture | null = () => null,
  ) {
    if (retainedLayers) {
      this.controlsRoot = new GuiRoot({ theme: this.root.theme, visible: false });
      const hit = this.controlsRoot.hitTest.bind(this.controlsRoot);
      // The overlay owns its controls, not the empty space above static buttons.
      this.controlsRoot.hitTest = (x, y) => {
        const target = hit(x, y);
        return target === this.controlsRoot!.root ? null : target;
      };
    }
    this.gallery.setStyle({ backgroundColor: C.canvas });
    const position = (e: GuiElement) => {
      this.positions.set(e, { x: 0, y: 0, width: 1, height: 1 });
      const original = e.layout;
      e.layout = (parent) => {
        original.call(e, parent);
        Object.assign(e.rect, this.positions.get(e));
        if (e instanceof GuiScrollView) {
          const content = {
            ...e.rect,
            y: e.rect.y - e.scrollY,
            height: e.contentHeight,
          };
          for (const child of e.children) child.layout(content);
        }
      };
      return e;
    };
    const button = (
      parent: GuiElement,
      text: string,
      click: () => void,
      id: string,
    ) => {
      const e = parent.add(
        new GuiButton({
          id,
          text,
          onClick: click,
          style: { radius: S.radius, hoverBackgroundColor: C.hover },
        }),
      );
      position(e);
      return e;
    };
    const label = (parent: GuiElement, text: string, id: string) => {
      const e = parent.add(new GuiLabel({ id, text, fontSize: 14 }));
      position(e);
      return e;
    };
    this.widgets.push(
      label(this.gallery, "ShaderLab · 作品列表", "gui-gallery-title"),
      button(this.gallery, "＋ 新建", actions.create, "gui-new"),
    );
    position(this.list);
    this.widgets.push(button(this.editor, "返回", actions.home, "gui-home"));
    this.title = button(
      this.editor,
      "Untitled shader",
      actions.name,
      "gui-name",
    );
    this.widgets.push(
      button(
        this.editor,
        "保存作品",
        () => actions.command("/shader-project/actions/save", "activate"),
        "gui-save",
      ),
      button(
        this.editor,
        "工程设置",
        () =>
          actions.command("/shader-project/actions/information", "activate"),
        "gui-settings",
      ),
    );
    this.status = label(this.editor, "", "gui-status");
    this.widgets.push(
      button(
        this.editor,
        "预览",
        () => actions.pane("preview"),
        "gui-preview-tab",
      ),
      button(this.editor, "代码", () => actions.pane("code"), "gui-code-tab"),
    );
    this.running = button(
      this.editor,
      "运行",
      () => actions.command("/shader-toolbar/controls/run", "activate"),
      "gui-run",
    );
    this.playing = button(
      this.editor,
      "暂停",
      () => actions.command("/shader-toolbar/controls/play", "activate"),
      "gui-play",
    );
    const options = PREVIEW_SCALES.map((value) => ({
      value: String(value),
      label: `${value * 100}%`,
    }));
    this.scale = this.editor.add(
      new GuiSelect({
        id: "gui-scale",
        value: "1",
        options,
        onChange: (value) =>
          actions.command("/shader-toolbar/controls/scale", "commit", value),
      }),
    );
    position(this.scale);
    this.widgets.push(
      button(
        this.editor,
        "重置",
        () => actions.command("/shader-toolbar/controls/reset", "activate"),
        "gui-reset",
      ),
      button(
        this.editor,
        "单帧",
        () => actions.command("/shader-toolbar/controls/step", "activate"),
        "gui-step",
      ),
      button(this.editor, "收起键盘", actions.keyboard, "gui-keyboard"),
    );
    this.previewRoot.add(this.preview);
    position(this.preview);
    this.dialog = this.root.add(
      new GuiModal({
        id: "gui-settings-dialog",
        title: "工程设置",
        message: "渲染分辨率",
        width: S.dialogWidth,
        height: 310,
        style: {backgroundColor:C.surface, color:C.text, borderColor:C.border, radius:S.radius},
        backdropColor:C.backdrop,
        closeOnBackdrop:true,
        visible: false,
        showConfirmButton: true,
        confirmText: "完成",
        showCancelButton: false,
        onClose: () =>
          actions.command("/shader-project/information/close", "activate"),
      }),
    );
    this.dialogScale = this.dialog.add(
      new GuiSelect({
        id: "gui-dialog-scale",
        value: "1",
        options,
        onChange: (value) =>
          actions.command(
            "/shader-project/information/scale-row/scale",
            "commit",
            value,
          ),
      }),
    );
    this.dialog.titleLabel.setFontSize(S.dialogTitle);
    this.dialog.messageLabel.setFontSize(S.font);
    this.dialog.confirmButton.variant = 'default';
    this.dialogIdentity = this.dialog.add(new GuiLabel({id:'gui-dialog-identity',text:'',fontSize:S.font,style:{color:C.text}}));
    this.dialogProjectId = this.dialog.add(new GuiLabel({id:'gui-dialog-project-id',text:'',fontSize:S.font,style:{color:C.text}}));
    this.dialogModeLabel = this.dialog.add(new GuiLabel({text:'预览模式',fontSize:S.font}));
    this.dialogMode = this.dialog.add(new GuiButton({id:'gui-dialog-mode',text:'Canvas',disabled:true}));
    // GuiModal positions its built-in children itself; custom content must be
    // laid out after dialogRect is resolved, not through the generic child flow.
    const layoutDialog = this.dialog.layout.bind(this.dialog);
    this.dialog.layout = (rect) => {
      layoutDialog(rect);
      const r = this.dialog.dialogRect;
      Object.assign(this.dialog.messageLabel.rect, {
        x: r.x + 20,
        y: r.y + 116,
        width: 140,
        height: 44,
      });
      Object.assign(this.dialogScale.rect, {
        x: r.x + r.width - 164,
        y: r.y + 116,
        width: 140,
        height: 44,
      });
      Object.assign(this.dialogIdentity.rect,{x:r.x+20,y:r.y+64,width:r.width-40,height:20});
      Object.assign(this.dialogProjectId.rect,{x:r.x+20,y:r.y+88,width:r.width-40,height:20});
      Object.assign(this.dialogModeLabel.rect,{x:r.x+20,y:r.y+168,width:140,height:44});
      Object.assign(this.dialogMode.rect,{x:r.x+r.width-164,y:r.y+168,width:140,height:44});
      this.dialog.confirmButton.rect.height=S.control;
    };
    this.scale.setStyle({backgroundColor:C.input});
    this.dialogScale.setStyle({backgroundColor:C.input});
    this.status.setStyle({color:C.muted});
    this.title.setStyle({backgroundColor:C.input});
    this.root.findById('gui-new')!.setStyle({backgroundColor:C.selected,borderColor:C.accent});
    this.editor.setVisible(false);
    // Compile/scale state changes must not invalidate the static navigation,
    // project title, gallery or modal batches. Keep popup/modal ordering in GuiSystem.
    if (this.controlsRoot) for (const e of [this.status, this.running, this.playing, this.scale]) this.controlsRoot.add(e);
  }
  setBox(
    element: GuiElement,
    x: number,
    y: number,
    width: number,
    height: number,
  ) {
    Object.assign(this.positions.get(element)!, { x, y, width, height });
    element.markDirty();
  }
  layout(width: number, height: number) {
    if (this.width === width && this.height === height) return;
    this.width = width;
    this.height = height;
    this.layouts++;
    // Only a viewport change lays out the shell. Value changes retain geometry.
    const find = (id: string) => this.root.findById(id)!;
    const box = (id: string, x: number, y: number, w: number, h = 44) =>
      this.setBox(find(id), x, y, w, h);
    box("gui-gallery-title", 16, 12, width - 32, 28);
    box("gui-new", 16, 50, 110);
    this.setBox(this.list, 16, 106, width - 32, height - 122);
    this.layoutGallery();
    box("gui-home", 12, 8, 64);
    this.setBox(this.title, 88, 8, width - 100, 44);
    box("gui-save", 12, 62, 110);
    box("gui-settings", 130, 62, 110);
    this.setBox(this.status, 12, 112, width - 24, 26);
    box("gui-preview-tab", 12, 144, 76);
    box("gui-code-tab", 96, 144, 76);
    const w = Math.max(50, (width - 40) / 5);
    this.setBox(this.running, 12, 198, w, 44);
    this.setBox(this.playing, 18 + w, 198, w, 44);
    this.setBox(this.scale, 24 + w * 2, 198, w, 44);
    box("gui-reset", 30 + w * 3, 198, w);
    box("gui-step", 36 + w * 4, 198, w);
    box("gui-keyboard", 180, 144, Math.min(130, width - 192));
    const compact = height < 500;
    if (compact) {
      this.setBox(this.title, 88, 8, width - 344, 44);
      box("gui-save", width - 244, 8, 110);
      box("gui-settings", width - 126, 8, 114);
      box("gui-preview-tab", 12, 62, 76);
      box("gui-code-tab", 96, 62, 76);
      box("gui-keyboard", 180, 62, 110);
      this.setBox(this.status, 306, 68, width - 318, 26);
      this.setBox(this.running, 12, 116, w, 44);
      this.setBox(this.playing, 18 + w, 116, w, 44);
      this.setBox(this.scale, 24 + w * 2, 116, w, 44);
      box("gui-reset", 30 + w * 3, 116, w);
      box("gui-step", 36 + w * 4, 116, w);
    }
    const y = compact ? 172 : 254;
    const rect = {
      x: 12,
      y,
      width: this.benchmark ? 256 : width - 24,
      height: this.benchmark ? 144 : Math.max(60, height - y - 12),
    };
    this.setBox(this.preview, rect.x, rect.y, rect.width, rect.height);
    this.region(rect, this.paneValue === "code" && !this.showingGallery);
    this.root.root.markDirty();
  }
  setPane(value: "preview" | "code") {
    this.paneValue = value;
    for (const [id,pane] of [['gui-preview-tab','preview'],['gui-code-tab','code']] as const) {
      const tab=this.root.findById(id)!; const selected=pane===value;
      const color=selected?C.selected:undefined;
      if(tab.style.backgroundColor!==color)tab.setStyle({backgroundColor:color});
    }
    this.previewRoot.root.setVisible(
      value === "preview" && !this.showingGallery,
    );
    this.region(
      this.positions.get(this.preview)!,
      value === "code" && !this.showingGallery,
    );
  }
  showEditor() {
    this.showingGallery = false;
    this.gallery.setVisible(false);
    this.editor.setVisible(true);
    this.controlsRoot?.root.setVisible(true);
    this.setPane("preview");
  }
  showGallery(
    works: readonly ShaderProject[],
    samples: readonly ShaderProject[],
  ) {
    this.showingGallery = true;
    this.previewRoot.root.setVisible(false);
    this.editor.setVisible(false);
    this.gallery.setVisible(true);
    this.controlsRoot?.root.setVisible(false);
    this.dialog.hide();
    this.region(this.positions.get(this.preview)!, false);
    for (const child of [...this.list.children]) this.list.remove(child);
    this.galleryCards.length=0;
    this.galleryBoxes.clear();
    [...works.map(project=>({project,fork:false})),...samples.map(project=>({project,fork:true}))].forEach(({project,fork},i)=>{
      const card=this.list.add(new GuiButton({id:`gui-work-${i}`,text:'',height:fork?216:76,style:{backgroundColor:C.elevated,hoverBackgroundColor:C.hover,radius:S.cardRadius},onClick:()=>this.actions.open(project,fork)}));
      const source=this.thumbnail(project);
      if(source)card.add(new GuiImage({source,x:12,y:12,width:'100%',height:140,disabled:true}));
      else if(fork) card.add(new GuiLabel({text:'示例',x:12,y:12,width:'100%',height:140,fontSize:20,style:{color:C.muted},textAlign:'center'}));
      card.add(new GuiLabel({text:project.name,x:12,y:fork?164:12,width:'100%',height:24,fontSize:16}));
      card.add(new GuiLabel({text:fork?'示例 · 打开即可编辑':'我的作品 · 已保存',x:12,y:fork?190:44,width:'100%',height:20,fontSize:12,style:{color:C.muted}}));
      const layout=card.layout.bind(card);card.layout=r=>{layout(r);const box=this.galleryBoxes.get(card)!;Object.assign(card.rect,{...box,x:r.x+box.x,y:r.y+box.y});for(const c of card.children){c.layout(card.rect);c.rect.width=Math.max(0,card.rect.width-24);}};
      this.galleryCards.push(card);
    });
    this.layoutGallery();
  }
  private layoutGallery() {
    const width=Math.max(1,this.width-32),columns=width>=1000?3:width>=600?2:1;
    const cell=(width-(columns-1)*S.gap)/columns;
    let top=0;
    for(let i=0;i<this.galleryCards.length;i+=columns){
      const row=this.galleryCards.slice(i,i+columns),height=Math.max(...row.map(card=>Number(card.getLayoutOptions().height)));
      row.forEach((card,column)=>{this.galleryBoxes.set(card,{x:column*(cell+S.gap),y:top,width:cell,height});card.markDirty();});top+=height+S.gap;
    }
    this.list.setContentHeight(top);
  }

  apply(state: ShaderEditorViewState) {
    this.state = state;
    this.commits++;
    this.title.setText(state.name);
    this.status.setText(saveMessage(state));
    this.running.setText(
      state.application.compile.status === "compiling" ? "编译中" : "运行",
    );
    this.running.setDisabled(
      state.composing || state.application.compile.status === "compiling",
    );
    this.playing.setText(state.application.playing ? "暂停" : "播放");
    this.scale.setValue(String(state.application.project.preview.scale));
    // A hidden settings picker must not dirty the static shell on every scale update.
    if (!this.controlsRoot || state.informationOpen) this.dialogScale.setValue(String(state.application.project.preview.scale));
    if (state.informationOpen) {
      this.dialogIdentity.setText(state.application.project.name);
      this.dialogProjectId.setText('工程 '+state.application.project.id);
      this.dialog.show();
      this.region(this.positions.get(this.preview)!, false);
    } else {
      this.dialog.hide();
      this.region(
        this.positions.get(this.preview)!,
        this.paneValue === "code" && !this.showingGallery,
      );
    }
  }
  output(texture: GPUTexture) {
    if (this.preview.source !== texture) this.preview.setSource(texture);
  }
  testSnapshot() {
    const targets: Record<string, GuiRect> = {};
    const visit = (e: GuiElement) => {
      if (!e.visible) return;
      if (e.id) targets[e.id] = { ...e.rect };
      for (const c of e.children) visit(c);
    };
    visit(this.root.root);
    if (this.controlsRoot) visit(this.controlsRoot.root);
    if (this.dialog.visible)
      targets["gui-dialog-confirm"] = { ...this.dialog.confirmButton.rect };
    return {
      ...this.snapshot(),
      name: this.state?.name,
      saved: this.state ? saveMessage(this.state) : "",
      compile: this.state?.application.compile.status,
      playing: this.state?.application.playing,
      targets,
    };
  }
  snapshot() {
    return {
      commits: this.commits,
      layouts: this.layouts,
      gallery: this.showingGallery,
      pane: this.paneValue,
      scale: this.scale.value,
      dialog: this.dialog.visible,
      retainedLayers: !!this.controlsRoot,
      nativeVisibleControls:
        "code TextView only; hidden IME proxy for GUI name input",
    };
  }
  dispose() {
    for (const e of [...this.root.root.children]) this.root.remove(e);
    for (const e of [...this.previewRoot.root.children])
      this.previewRoot.remove(e);
    if (this.controlsRoot) for (const e of [...this.controlsRoot.root.children]) this.controlsRoot.remove(e);
    this.positions.clear();
    this.galleryCards.length=0;
    this.galleryBoxes.clear();
    this.state = undefined;
  }
}
