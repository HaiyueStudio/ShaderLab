import { ImageAsset } from '@nativescript/canvas';
import { File } from '@nativescript/core';
import { cacheDataUrl } from './files';
export class NativeVideo {
    private file: string;
    private decoder = new android.media.MediaMetadataRetriever();
    readonly duration: number;
    private frame = -1;
    private width = 1024;
    private height = 1024;
    private bitmap?: android.graphics.Bitmap;
    constructor(url: string, id: string) { this.file = cacheDataUrl(url, 'shaderlab-video-' + id.replace(/[^a-zA-Z0-9_-]/g, '') + '.mp4'); this.decoder.setDataSource(this.file); const w = Number(this.decoder.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_WIDTH)), h = Number(this.decoder.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_VIDEO_HEIGHT)), factor = Math.min(1, 1024 / Math.max(w, h)); if (w > 0 && h > 0) {
        this.width = Math.max(1, Math.round(w * factor));
        this.height = Math.max(1, Math.round(h * factor));
    } this.duration = Number(this.decoder.extractMetadata(android.media.MediaMetadataRetriever.METADATA_KEY_DURATION)) / 1000; if (!Number.isFinite(this.duration) || this.duration <= 0)
        throw Error('视频时长无效'); }
    at(time: number) { const frame = Math.floor(time % this.duration * 12); if (frame === this.frame)
        return null; const bitmap = android.os.Build.VERSION.SDK_INT >= 27 ? this.decoder.getScaledFrameAtTime(Math.round(frame / 12 * 1e6), android.media.MediaMetadataRetriever.OPTION_CLOSEST, this.width, this.height) : this.decoder.getFrameAtTime(Math.round(frame / 12 * 1e6), android.media.MediaMetadataRetriever.OPTION_CLOSEST); if (!bitmap)
        throw Error('无法解码视频帧'); const image = new ImageAsset(); if (!image.loadFromNativeSync(bitmap)) {
        bitmap.recycle();
        throw Error('视频图片加载失败');
    } this.bitmap?.recycle(); this.bitmap = bitmap; this.frame = frame; return image; }
    dispose() { this.decoder.release(); this.bitmap?.recycle(); this.bitmap = undefined; void File.fromPath(this.file).remove().catch(() => { }); }
}
