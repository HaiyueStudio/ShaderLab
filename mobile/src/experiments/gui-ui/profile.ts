import type { HaiyueEngine } from '@haiyue/engine';
import { monotonicNow } from './sampling';
/** Opt-in diagnostic run only. Counters/timers are excluded from formal timings. */
export function installGuiProfile(engine: HaiyueEngine, system: unknown) {
  const frames: Record<string, number>[] = [], restore: (() => void)[] = [];
  let current: Record<string, number> = {};
  const add = (key: string, value = 1) => { current[key] = (current[key] ?? 0) + value; };
  const wrap = (object: any, method: string, name: string, counter?: (args: any[], result: any) => void) => {
    const original = object[method];
    object[method] = function(...args: any[]) {
      const start = monotonicNow();
      try { const result = original.apply(this, args); counter?.(args, result); return result; }
      finally { add(name + '.ms', monotonicNow() - start); add(name + '.calls'); }
    };
    restore.push(() => { object[method] = original; });
  };
  const gui = system as any, renderer = gui.renderer;
  wrap(gui, 'record', 'gui'); wrap(gui, 'prepareRoots', 'prepareRoots');
  wrap(renderer, 'rebuildRoot', 'rebuildRoot');
  for (const name of ['shape', 'text', 'image']) wrap(renderer[name + 'Renderer'], 'render', name);
  // Native Canvas GPU objects expose read-only methods. Instrument only our
  // JS renderer methods; hardware timings must not use diagnostic runs.
  wrap(renderer.shapeRenderer, 'uploadBatch', 'shapeUpload');
  wrap(renderer.textRenderer, 'uploadBatch', 'textUpload');
  wrap(renderer.imageRenderer, 'uploadGroup', 'imageUpload');
  const flush = () => { frames.push(current); current = {}; };
  engine.on('after-update', flush);
  return {
    snapshot: () => ({ frames: [...frames], timing: 'inclusive; diagnostic instrumentation only' }),
    dispose: () => { engine.off('after-update', flush); for (const undo of restore.reverse()) undo(); },
  };
}
