import type { ImageAsset } from '@nativescript/canvas';
export interface NativeCameraFrame { image: ImageAsset; time: number; release(): void }
