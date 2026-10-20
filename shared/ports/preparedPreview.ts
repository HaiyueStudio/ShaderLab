import type { ShaderDiagnostic, ShaderProject } from '../domain/model.js';
import type { ShaderServices } from './services.js';

/** Only this adapter closure holds platform/GPU objects; state stores opaque IDs. */
export function preparedPreview<T extends { diagnostics: readonly ShaderDiagnostic[] }>(owner: () => {
  prepare(project: ShaderProject): Promise<T>;
  commit(value: T): void;
  release(value: T): void;
  play(value: boolean): void;
  step(): void;
  reset(): void;
}): ShaderServices['preview'] {
  const pending = new Map<string, { value: T; runtime: ReturnType<typeof owner> }>();
  return {
    async prepare(snapshot, context) {
      const runtime = owner(), value = await runtime.prepare(snapshot as ShaderProject);
      const handle = `${context.session}:${context.request}`;
      pending.set(handle, { value, runtime });
      return { handle, diagnostics: value.diagnostics };
    },
    commit(handle, context) {
      const entry = pending.get(handle);
      if (!entry) throw new Error('预览编译资源已释放。');
      if (context.signal.aborted) { pending.delete(handle); entry.runtime.release(entry.value); return; }
      // Synchronous guarded swap participates in the editor automation transaction.
      entry.runtime.commit(entry.value); pending.delete(handle);
    },
    release(handle) { const entry = pending.get(handle); if (entry) { pending.delete(handle); entry.runtime.release(entry.value); } },
    play(value) { owner().play(value); }, step() { owner().step(); }, reset() { owner().reset(); },
  };
}
