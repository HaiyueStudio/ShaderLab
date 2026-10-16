import { AudioSink } from './audio-sink';
import { SoundTransport } from './audio-transport';
import type { StereoSound } from '../../web/dist/sound.js';
export class NativeSoundStream extends SoundTransport {
    constructor(render: (start: number, count: number) => Promise<StereoSound>, error: (message: string) => void) { super(render, error, (volume, interrupted) => new AudioSink(volume, interrupted)); }
}
