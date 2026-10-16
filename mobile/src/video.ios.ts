import { ImageAsset } from '@nativescript/canvas';
import { File } from '@nativescript/core';
import { cacheDataUrl } from './files';
export class NativeVideo {
    private file: string;
    private generator: AVAssetImageGenerator;
    readonly duration: number;
    private frame = -1;
    private image?: ImageAsset;
    constructor(url: string, id: string) { this.file = cacheDataUrl(url, 'shaderlab-video-' + id.replace(/[^a-zA-Z0-9_-]/g, '') + '.mp4'); const asset = AVURLAsset.URLAssetWithURLOptions(NSURL.fileURLWithPath(this.file), NSDictionary.new()); this.duration = Number(asset.duration.value) / asset.duration.timescale; if (!Number.isFinite(this.duration) || this.duration <= 0)
        throw Error('视频时长无效'); this.generator = AVAssetImageGenerator.assetImageGeneratorWithAsset(asset); this.generator.appliesPreferredTrackTransform = true; this.generator.maximumSize = CGSizeMake(1024, 1024); this.generator.requestedTimeToleranceBefore = { value: 0, timescale: 1, flags: 1, epoch: 0 }; this.generator.requestedTimeToleranceAfter = { value: 0, timescale: 1, flags: 1, epoch: 0 }; }
    at(time: number) { const frame = Math.floor(time % this.duration * 12); if (frame === this.frame && this.image)
        return null; const cg = this.generator.copyCGImageAtTimeActualTimeError({ value: frame * 50, timescale: 600, flags: 1, epoch: 0 }, null as unknown as interop.Pointer); if (!cg)
        throw Error('无法解码视频帧'); try {
        const image = new ImageAsset();
        if (!image.loadFromNativeSync(UIImage.imageWithCGImage(cg)))
            throw Error('视频图片加载失败');
        this.image = image;
        this.frame = frame;
        return image;
    }
    finally {
        CGImageRelease(cg);
    } }
    dispose() { this.generator.cancelAllCGImageGeneration(); this.image = undefined; void File.fromPath(this.file).remove().catch(() => { }); }
}
