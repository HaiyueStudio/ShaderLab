import type { HaiyueEngine } from '@haiyue/engine';
import type { NativeShaderRuntime } from '../../gpu-runtime';
import { experimentFlag } from './flags';
import { monotonicNow } from './sampling';
const profiles = new WeakMap<NativeShaderRuntime, () => unknown>();
/** Product methods only: native GPU methods are read-only. Disabled in formal runs. */
export function configurePreviewExperiment(runtime: NativeShaderRuntime, engine: HaiyueEngine) {
  runtime.optimizeFrameWork = experimentFlag('shaderlab-preview-baseline') !== 'true';
  if (experimentFlag('shaderlab-preview-profile') !== 'true') return;
  const frames: Record<string, number>[] = [], restore: (() => void)[] = [];
  let current: Record<string, number> = {};
  const add = (key: string, value: number) => { current[key] = (current[key] ?? 0) + value; };
  const wrap = (object: any, name: string, label = name) => {
    const original = object[name];
    object[name] = function(...args: any[]) {
      const start = monotonicNow();
      try { const result = original.apply(this, args); if (result === true) add(label + '.changed', 1); return result; }
      finally { add(label + '.ms', monotonicNow() - start); add(label + '.calls', 1); }
    };
    restore.push(() => { object[name] = original; });
  };
  for (const name of ['render', 'resize', 'inputs', 'bindInputs', 'bindOutput', 'uploadKeyboard', 'updatePresentSize', 'submitCommands']) wrap(runtime, name);
  wrap(runtime.keyboard, 'pixels', 'keyboardPixels');
  const flush = () => { frames.push(current); current = {}; };
  engine.on('after-update', flush);
  profiles.set(runtime, () => ({ frames: frames.slice(), timing: 'inclusive synchronous wall duration; diagnostic only' }));
  const dispose = runtime.dispose;
  runtime.dispose = function() {
    engine.off('after-update', flush); profiles.delete(runtime);
    for (const undo of restore.reverse()) undo();
    runtime.dispose = dispose; dispose.call(runtime);
  };
}
export function previewProfileSnapshot(runtime: NativeShaderRuntime) { return profiles.get(runtime)?.(); }
