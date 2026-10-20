/** Trailing debounce with one live timer, even during sustained editing. */
export class TrailingTask {
  private timer: ReturnType<typeof setTimeout> | undefined;
  private deadline = 0;
  private dead = false;
  private readonly delay: number;
  private readonly run: () => void;
  private readonly clock: () => number;
  private readonly schedule: typeof setTimeout;
  private readonly cancel: typeof clearTimeout;
  constructor(delay: number, run: () => void, clock = () => Date.now(),
    schedule = setTimeout, cancel = clearTimeout) {
    this.delay = delay; this.run = run; this.clock = clock;
    this.schedule = schedule; this.cancel = cancel;
  }
  request(): void {
    if (this.dead) return;
    this.deadline = this.clock() + this.delay;
    if (this.timer === undefined) this.timer = this.schedule(this.tick, this.delay);
  }
  private readonly tick = () => {
    this.timer = undefined;
    if (this.dead) return;
    const remaining = this.deadline - this.clock();
    if (remaining > 0) this.timer = this.schedule(this.tick, remaining);
    else this.run();
  };
  dispose(): void {
    this.dead = true;
    if (this.timer !== undefined) this.cancel(this.timer);
    this.timer = undefined;
  }
}
