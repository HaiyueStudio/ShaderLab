export interface StreamSink {
    readonly played: number;
    enqueue(audio: import('../../web/dist/sound.js').StereoSound): Promise<void>;
    dispose(): void;
}
import type { StereoSound } from '../../web/dist/sound.js';
/** Continuous bounded scheduling. Project duration is only an export length. */
export class SoundTransport {
    private sink?: StreamSink;
    private timer?: ReturnType<typeof setTimeout>;
    private generation = 0;
    private next = 0;
    private base = 0;
    private cursor = 0;
    private readonly render: (start: number, count: number) => Promise<StereoSound>;
    private readonly error: (message: string) => void;
    private readonly createSink: (volume: number, onInterrupt: () => void) => StreamSink;
    constructor(render: (start: number, count: number) => Promise<StereoSound>, error: (message: string) => void, createSink: (volume: number, onInterrupt: () => void) => StreamSink) { this.render = render; this.error = error; this.createSink = createSink; }
    get playing() { return !!this.sink; }
    start(volume: number) { if (this.sink)
        return; try {
        const generation = ++this.generation;
        this.base = this.cursor;
        this.next = this.base;
        this.sink = this.createSink(volume, () => this.pause());
        void this.pump(generation);
    }
    catch (error) {
        this.pause();
        this.error(String(error));
    } }
    private async pump(generation: number) { if (generation !== this.generation || !this.sink)
        return; try {
        while (generation === this.generation && this.sink && this.next - (this.base + this.sink.played) < 44100) {
            const count = 11025, audio = await this.render(this.next, count);
            if (generation !== this.generation || !this.sink)
                return;
            await this.sink.enqueue(audio);
            if (generation !== this.generation)
                return;
            this.next += count;
        }
        if (generation === this.generation)
            this.timer = setTimeout(() => void this.pump(generation), 100);
    }
    catch (error) {
        if (generation !== this.generation)
            return;
        this.pause();
        this.error(String(error));
    } }
    pause() { ++this.generation; if (this.timer)
        clearTimeout(this.timer); this.timer = undefined; if (this.sink) {
        this.cursor = Math.min(this.next, this.base + this.sink.played);
        this.sink.dispose();
        this.sink = undefined;
    } }
    reset() { this.pause(); this.cursor = 0; }
    dispose() { this.reset(); }
}
