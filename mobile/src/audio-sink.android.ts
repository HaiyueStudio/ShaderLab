import { Application, Utils } from '@nativescript/core';
import type { StereoSound } from '../../web/src/sound.js';
export class AudioSink {
    private track: android.media.AudioTrack;
    private dead = false;
    private focus: android.media.AudioManager.OnAudioFocusChangeListener;
    private manager: android.media.AudioManager;
    private focusRequest: android.media.AudioFocusRequest;
    private wraps = 0;
    private previous = 0;
    constructor(volume: number, onInterrupt: () => void) { this.manager = Utils.android.getApplicationContext().getSystemService(android.content.Context.AUDIO_SERVICE) as android.media.AudioManager; this.focus = new android.media.AudioManager.OnAudioFocusChangeListener({ onAudioFocusChange: value => { if (value < 0)
            onInterrupt(); } }); const attributes = new android.media.AudioAttributes.Builder().setUsage(android.media.AudioAttributes.USAGE_MEDIA).setContentType(android.media.AudioAttributes.CONTENT_TYPE_MUSIC).build(); this.focusRequest = new android.media.AudioFocusRequest.Builder(android.media.AudioManager.AUDIOFOCUS_GAIN).setAudioAttributes(attributes).setOnAudioFocusChangeListener(this.focus).build(); if (this.manager.requestAudioFocus(this.focusRequest) !== android.media.AudioManager.AUDIOFOCUS_REQUEST_GRANTED)
        throw Error('无法取得音频焦点'); const format = new android.media.AudioFormat.Builder().setEncoding(android.media.AudioFormat.ENCODING_PCM_FLOAT).setSampleRate(44100).setChannelMask(android.media.AudioFormat.CHANNEL_OUT_STEREO).build(); this.track = new android.media.AudioTrack.Builder().setAudioAttributes(attributes).setAudioFormat(format).setTransferMode(android.media.AudioTrack.MODE_STREAM).setBufferSizeInBytes(44100 * 8 * 2).build(); if (this.track.getState() !== android.media.AudioTrack.STATE_INITIALIZED)
        throw Error('音频输出初始化失败'); this.track.setVolume(volume); this.track.play(); }
    get played() { const position = this.track.getPlaybackHeadPosition() >>> 0; if (position < this.previous)
        this.wraps += 4294967296; this.previous = position; return this.wraps + position; }
    async enqueue(audio: StereoSound) { const count = audio.left.length, buffer = java.nio.ByteBuffer.allocateDirect(count * 8).order(java.nio.ByteOrder.nativeOrder()), values = new Float32Array((ArrayBuffer as unknown as {
        from(b: java.nio.ByteBuffer): ArrayBuffer;
    }).from(buffer)); for (let i = 0; i < count; i++) {
        values[i * 2] = Number.isFinite(audio.left[i]) ? Math.max(-1, Math.min(1, audio.left[i]!)) : 0;
        values[i * 2 + 1] = Number.isFinite(audio.right[i]) ? Math.max(-1, Math.min(1, audio.right[i]!)) : 0;
    } while (!this.dead && buffer.hasRemaining()) {
        const written = this.track.write(buffer, buffer.remaining(), android.media.AudioTrack.WRITE_NON_BLOCKING);
        if (written < 0)
            throw Error('音频写入失败 ' + written);
        if (!written)
            await new Promise(r => setTimeout(r, 10));
    } }
    dispose() { if (this.dead)
        return; this.dead = true; this.track.pause(); this.track.flush(); this.track.release(); this.manager.abandonAudioFocusRequest(this.focusRequest); }
}
