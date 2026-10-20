import * as presentation from '../../shared/dist/views/presentation.js';
import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import ts from "typescript";
import * as gui from "@haiyue/engine/gui";
import { ShaderApplication } from "../../shared/dist/application/application.js";
import {
  ShaderEditorController,
  saveMessage,
} from "../../shared/dist/views/editor-controller.js";
import { createProject as project } from "../../shared/dist/domain/model.js";
const environment = {
  ids: { next: () => crypto.randomUUID() },
  clock: { nowISO: () => new Date().toISOString() },
};
const createProject = () => project("GUI test", environment);
const exports = {};
const source = ts.transpileModule(
  readFileSync(
    new URL("../src/experiments/gui-ui/view.ts", import.meta.url),
    "utf8",
  ),
  {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2022,
    },
  },
).outputText;
new Function("require", "exports", source)(
  (name) =>
    name === "@haiyue/engine/gui"
      ? gui
      : name.includes("presentation") ? presentation : name.includes("editor-controller")
        ? { saveMessage }
        : { PREVIEW_SCALES: [1, 0.75, 0.5, 0.25] },
  exports,
);
const { GuiEditorView } = exports;
function fixture(retainedLayers = false) {
  const calls = [],
    regions = [],
    app = new ShaderApplication({
      ids: { next: () => crypto.randomUUID() },
      clock: { nowISO: () => new Date().toISOString() },
    });
  app.dispatch({ type: "project.open", project: createProject(), fork: false });
  const controller = new ShaderEditorController(app, {
    ensurePreview: async () => {},
    flushEditor() {},
    previewModeChanged() {},
    playbackChanged() {},
    compiled() {},
  });
  const view = new GuiEditorView(
    {
      command: (...a) => calls.push(a),
      pane() {},
      home() {},
      create() {},
      open() {},
      name() {},
      keyboard() {},
    },
    (r, code) => regions.push({ r: { ...r }, code }),
    true,
    retainedLayers,
  );
  view.layout(430, 820);
  view.apply(controller.getSnapshot());
  view.showEditor();
  view.root.layout(430, 820);
  view.previewRoot.layout(430, 820);
  view.controlsRoot?.layout(430, 820);
  return {
    view,
    controller,
    app,
    calls,
    regions,
    dispose() {
      view.dispose();
      controller.dispose();
    },
  };
}
test("GUI comparison keeps a fixed shader display region and selection command identities", () => {
  const f = fixture();
  try {
    assert.equal(f.view.preview.rect.width, 256);
    assert.equal(f.view.preview.rect.height, 144);
    const scale = f.view.root.findById("gui-scale");
    scale.setValue("0.75", true);
    assert.deepEqual(f.calls[0], [
      "/shader-toolbar/controls/scale",
      "commit",
      "0.75",
    ]);
    f.app.dispatch({ type: "preview.scale", value: 0.5 });
    f.view.apply(f.controller.getSnapshot());
    assert.equal(scale.value, "0.5");
    f.view.setPane("code");
    assert.equal(f.regions.at(-1).code, true);
    assert.equal(f.view.previewRoot.root.visible, false);
    f.view.setPane("preview");
    assert.equal(f.regions.at(-1).code, false);
  } finally {
    f.dispose();
  }
});
test("changing a preview texture dirties only its own GUI layer", () => {
  const f = fixture();
  try {
    f.view.root.clearDirty();
    f.view.previewRoot.clearDirty();
    f.view.output({ width: 256, height: 144 });
    assert.equal(f.view.root.dirty, false);
    assert.equal(f.view.previewRoot.dirty, true);
  } finally {
    f.dispose();
  }
});
test("GUI dialog, gallery layout, viewport changes and disposal keep independent state", () => {
  const f = fixture();
  try {
    f.controller.dispatch({
      key: "/shader-project/actions/information",
      type: "activate",
      reason: "pointer",
      transaction: 1,
    });
    f.view.apply(f.controller.getSnapshot());
    assert.equal(f.view.snapshot().dialog, true);
    f.view.layout(820, 430);
    f.view.root.layout(820, 430);
    assert.equal(
      f.view.root.findById("gui-settings-dialog").dialogRect.width,
      460,
    );
    assert.equal(f.view.root.findById("gui-dialog-scale").rect.width, 140);
    f.view.showGallery([createProject()], []);
    f.view.root.layout(820, 430);
    const item = f.view.root.findById("gui-work-0");
    assert.equal(item.rect.x, 16);
    assert.equal(item.rect.y, 106);
    assert.equal(item.rect.width, 390); // Two equal card columns on a wide viewport.
    assert.ok(item.children.every(child=>child.rect.x+child.rect.width<=item.rect.x+item.rect.width));
    assert.equal(f.view.snapshot().gallery, true);
    f.view.dispose();
    assert.equal(f.view.root.root.children.length, 0);
    assert.equal(f.view.previewRoot.root.children.length, 0);
  } finally {
    f.dispose();
  }
});

test("compact editor reserves a usable preview and keeps keyboard dismissal above the code region", () => {
  const f = fixture();
  try {
    f.view.layout(820, 350);
    f.view.root.layout(820, 350);
    f.view.previewRoot.layout(820, 350);
    const dismiss = f.view.root.findById("gui-keyboard").rect;
    assert.ok(dismiss.y + dismiss.height <= f.view.preview.rect.y);
    assert.ok(f.view.preview.rect.y + f.view.preview.rect.height <= 350);
    f.view.layout(430, 820);
    f.view.root.layout(430, 820);
    assert.equal(f.view.root.findById("gui-keyboard").rect.y, 144);
  } finally {
    f.dispose();
  }
});

test("retained control layer isolates scale/compile changes and preserves target bounds and gallery hiding", () => {
  const baseline = fixture(), optimized = fixture(true);
  try {
    for (const f of [baseline, optimized]) {
      f.view.root.clearDirty(); f.view.controlsRoot?.clearDirty();
      f.app.dispatch({ type: "preview.scale", value: 0.5 });
      f.view.apply(f.controller.getSnapshot());
    }
    assert.equal(baseline.view.root.dirty, true);
    assert.equal(optimized.view.root.dirty, false);
    assert.equal(optimized.view.controlsRoot.dirty, true);
    const settings = optimized.view.root.findById("gui-settings");
    const x = settings.rect.x + settings.rect.width / 2, y = settings.rect.y + settings.rect.height / 2;
    assert.equal(optimized.view.controlsRoot.hitTest(x, y), null, "empty overlay must pass clicks to static settings button");
    assert.equal(optimized.view.root.hitTest(x, y), settings);
    const scale = optimized.view.controlsRoot.findById("gui-scale");
    assert.equal(optimized.view.controlsRoot.hitTest(scale.rect.x + 5, scale.rect.y + 5), scale);
    assert.deepEqual(optimized.view.testSnapshot().targets["gui-scale"], baseline.view.testSnapshot().targets["gui-scale"]);
    optimized.controller.dispatch({ key: "/shader-project/actions/information", type: "activate", reason: "pointer", transaction: 1 });
    optimized.view.apply(optimized.controller.getSnapshot());
    assert.equal(optimized.view.root.findById("gui-dialog-scale").value, "0.5", "opening settings synchronizes the deferred value");
    optimized.view.showGallery([], []);
    assert.equal(optimized.view.controlsRoot.root.visible, false);
    optimized.view.showEditor();
    assert.equal(optimized.view.controlsRoot.root.visible, true);
  } finally { baseline.dispose(); optimized.dispose(); }
});
