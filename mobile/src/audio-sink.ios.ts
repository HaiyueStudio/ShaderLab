import { File, knownFolders, path } from '@nativescript/core';
import { encodeWave, type StereoSound } from '../../web/dist/sound.js';
import { writeBytes } from './files';
/** AVAudioPlayerNode retains the scheduled PCM; completion stays on native threads. */
export class AudioSink {
    private engine = AVAudioEngine.new();
    private node = AVAudioPlayerNode.new();
    private format = AVAudioFormat.alloc().initStandardFormatWithSampleRateChannels(44100, 2);
    private dead = false;
    private started = false;
    private file = path.join(knownFolders.temp().path, 'shaderlab-stream-' + Date.now() + '.wav');
    private observers: NSObjectProtocol[] = [];
    constructor(volume: number, onInterrupt: () => void) { const session = AVAudioSession.sharedInstance(); if (!session.setCategoryError(AVAudioSessionCategoryPlayback) || !session.setActiveError(true))
        throw Error('无法启用音频会话'); this.engine.attachNode(this.node); this.engine.connectToFormat(this.node, this.engine.mainMixerNode, this.format); this.node.volume = volume; this.engine.prepare(); if (!this.engine.startAndReturnError())
        throw Error('音频引擎启动失败'); const center = NSNotificationCenter.defaultCenter; this.observers.push(center.addObserverForNameObjectQueueUsingBlock(AVAudioSessionInterruptionNotification, null, NSOperationQueue.mainQueue, n => { if (Number(n.userInfo?.objectForKey(AVAudioSessionInterruptionTypeKey)) === AVAudioSessionInterruptionType.Began)
        onInterrupt(); })); this.observers.push(center.addObserverForNameObjectQueueUsingBlock(AVAudioSessionRouteChangeNotification, null, NSOperationQueue.mainQueue, n => { if (Number(n.userInfo?.objectForKey(AVAudioSessionRouteChangeReasonKey)) === AVAudioSessionRouteChangeReason.OldDeviceUnavailable)
        onInterrupt(); })); }
    get played() { const render = this.node.lastRenderTime, time = render ? this.node.playerTimeForNodeTime(render) : null; return time ? Math.max(0, Number(time.sampleTime)) : 0; }
    async enqueue(audio: StereoSound) { if (this.dead)
        return; writeBytes(this.file, encodeWave(audio)); const file = AVAudioFile.alloc().initForReadingError(NSURL.fileURLWithPath(this.file)), buffer = AVAudioPCMBuffer.alloc().initWithPCMFormatFrameCapacity(file.processingFormat, Number(file.length)); if (!file.readIntoBufferError(buffer))
        throw Error('PCM 解码失败'); this.node.scheduleBufferAtTimeOptionsCompletionHandler(buffer, null as unknown as AVAudioTime, 0 as AVAudioPlayerNodeBufferOptions, null as unknown as () => void); if (!this.started) {
        this.started = true;
        this.node.play();
    } }
    dispose() { if (this.dead)
        return; this.dead = true; this.node.stop(); this.engine.stop(); this.engine.detachNode(this.node); for (const observer of this.observers)
        NSNotificationCenter.defaultCenter.removeObserver(observer); this.observers = []; void File.fromPath(this.file).remove().catch(() => { }); }
}
