import type { CameraFacing } from '../domain/model.js';

export interface CameraStream<T> { read(): T | null; close(): void }
export type OpenCamera<T> = (facing: CameraFacing, current: () => boolean) => Promise<CameraStream<T>>;

/** Capture starts only after a graph commits. Stale permissions/startups cannot outlive their owner. */
export class LiveCamera<T> {
  private generation = 0;
  private source: CameraStream<T> | undefined;
  private wanted: CameraFacing | null = null;
  private pending = false;
  private dead = false;
  constructor(private readonly open: OpenCamera<T>, private readonly changed: () => void, private readonly failed: (message: string) => void) {}
  configure(facing: CameraFacing | null, enabled: boolean) {
    const wanted = enabled ? facing : null;
    if (this.dead || (wanted === this.wanted && (this.source || this.pending || !wanted))) return;
    this.wanted = wanted;
    const generation = ++this.generation;
    this.source?.close(); this.source = undefined; this.pending = false;
    if (!wanted) return;
    this.pending = true;
    const current = () => !this.dead && generation === this.generation;
    void Promise.resolve().then(() => current() ? this.open(wanted, current) : null).then(source => {
      if (!current()) { source?.close(); return; }
      this.pending = false; this.source = source ?? undefined; this.changed();
    }, error => {
      if (!current()) return;
      this.pending = false; this.failed('相机：' + (error instanceof Error ? error.message : String(error)));
    });
  }
  read() {
    try { return this.source?.read() ?? null; }
    catch (error) { this.configure(null, false); this.failed('相机：' + (error instanceof Error ? error.message : String(error))); return null; }
  }
  get active() { return !!this.source; }
  dispose() { this.dead = true; ++this.generation; this.source?.close(); this.source = undefined; this.pending = false; }
}
