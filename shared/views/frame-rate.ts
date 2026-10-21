/** Wall-clock rate of rendered shader frames; independent of shader time/steps. */
export class FrameRate {
  value = 0;
  private start: number | undefined;
  private frames = 0;
  reset() { this.value = 0; this.start = undefined; this.frames = 0; }
  tick(now: number) {
    if (this.start === undefined || now < this.start || now - this.start > 2000) {
      this.start = now; this.frames = 0; this.value = 0; return;
    }
    this.frames++;
    const elapsed = now - this.start;
    if (elapsed >= 500) { this.value = this.frames * 1000 / elapsed; this.start = now; this.frames = 0; }
  }
}
