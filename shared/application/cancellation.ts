import type { ShaderCancelSignal } from '../ports/services.js';

export class Cancellation implements ShaderCancelSignal {
  private cancelled = false;
  private listeners = new Set<() => void>();
  get aborted() { return this.cancelled; }
  onAbort(callback: () => void) {
    if (this.cancelled) { callback(); return () => {}; }
    this.listeners.add(callback);
    return () => { this.listeners.delete(callback); };
  }
  abort() {
    if (this.cancelled) return;
    this.cancelled = true;
    try { for (const callback of this.listeners) callback(); }
    finally { this.listeners.clear(); }
  }
}
