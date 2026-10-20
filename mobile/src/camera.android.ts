import { Application, Utils } from '@nativescript/core';
import { ImageAsset } from '@nativescript/canvas';
import type { OpenCamera } from '../../shared/dist/ports/liveCamera.js';
import type { NativeCameraFrame } from './camera-types';

declare const org: { haiyue: { shaderlab: { CameraFeed: new (context: android.content.Context, front: boolean, rotation: number) => {
  start(): void; close(): void; getError(): string | null; takeFrame(): android.graphics.Bitmap | null;
} } } };
let permission: Promise<void> | undefined;
function requestPermission(): Promise<void> {
  const activity = Application.android.foregroundActivity ?? Application.android.startActivity;
  if (!activity) return Promise.reject(Error('请在前台打开相机。'));
  const name = android.Manifest.permission.CAMERA;
  if (activity.checkSelfPermission(name) === android.content.pm.PackageManager.PERMISSION_GRANTED) return Promise.resolve();
  return permission ??= new Promise<void>((resolve, reject) => {
    const requestCode = 7361;
    const listener = (event: { requestCode: number; grantResults: number[] }) => {
      if (event.requestCode !== requestCode) return;
      Application.android.off(Application.android.activityRequestPermissionsEvent, listener);
      event.grantResults[0] === android.content.pm.PackageManager.PERMISSION_GRANTED ? resolve() : reject(Error('未获授权，请在系统设置中允许相机后重新运行。'));
    };
    Application.android.on(Application.android.activityRequestPermissionsEvent, listener);
    activity.requestPermissions([name], requestCode);
  }).finally(() => { permission = undefined; });
}
export const openCamera: OpenCamera<NativeCameraFrame> = async (facing, current) => {
  await requestPermission();
  if (!current()) return { read: () => null, close() {} };
  const activity = Application.android.foregroundActivity ?? Application.android.startActivity;
  if (!activity) throw Error('请在前台打开相机。');
  const feed = new org.haiyue.shaderlab.CameraFeed(Utils.android.getApplicationContext(), facing === 'user', activity.getWindowManager().getDefaultDisplay().getRotation());
  let dead = false, first: android.graphics.Bitmap | null = null;
  const image = new ImageAsset();
  const started = Date.now();
  const close = () => { if (dead) return; dead = true; feed.close(); first?.recycle(); first = null; };
  try {
    feed.start();
    for (let i = 0; i < 150; i++) {
      if (!current()) { close(); return { read: () => null, close }; }
      const error = feed.getError(); if (error) throw Error(String(error));
      first = feed.takeFrame(); if (first) break;
      await new Promise(resolve => setTimeout(resolve, 100));
    }
    if (!first) throw Error('等待相机画面超时，请重新运行。');
    return { read() {
      if (dead) return null;
      const error = feed.getError(); if (error) throw Error(String(error));
      const bitmap = first ?? feed.takeFrame(); first = null;
      if (!bitmap) return null;
      if (!image.loadFromNativeSync(bitmap)) { bitmap.recycle(); throw Error('无法读取相机帧。'); }
      return { image, time: (Date.now() - started) / 1000, release: () => bitmap.recycle() };
    }, close };
  } catch (error) { close(); throw error; }
};
