/// <reference types="@nativescript/types-ios/lib/ios/objc-x86_64/objc!CoreImage" />
/// <reference types="@nativescript/types-ios/lib/ios/objc-x86_64/objc!CoreVideo" />
/// <reference types="@nativescript/types-ios/lib/ios/objc-x86_64/objc!CoreMedia" />
import { Application, Utils } from '@nativescript/core';
import { ImageAsset } from '@nativescript/canvas';
import type { OpenCamera, CameraStream } from '../../shared/dist/ports/liveCamera.js';
import type { NativeCameraFrame } from './camera-types';

@NativeClass()
class FrameDelegate extends NSObject implements AVCaptureVideoDataOutputSampleBufferDelegate {
  static ObjCProtocols = [AVCaptureVideoDataOutputSampleBufferDelegate];
  receive: ((buffer: unknown) => void) | null = null;
  captureOutputDidOutputSampleBufferFromConnection(_output: AVCaptureOutput, buffer: unknown, _connection: AVCaptureConnection) { this.receive?.(buffer); }
}
export const openCamera: OpenCamera<NativeCameraFrame> = async (facing, current) => {
  const allowed = await new Promise<boolean>(resolve => AVCaptureDevice.requestAccessForMediaTypeCompletionHandler(AVMediaTypeVideo, resolve));
  if (!allowed) throw Error('未获授权，请在系统设置中允许相机后重新运行。');
  if (!current()) return { read: () => null, close() {} };
  return new Promise<CameraStream<NativeCameraFrame>>((resolve, reject) => Utils.executeOnMainThread(() => {
    const session = AVCaptureSession.new(), output = AVCaptureVideoDataOutput.new(), delegate = FrameDelegate.new() as FrameDelegate;
    let latest: UIImage | undefined, failure: unknown, dead = false, last = 0;
    const started = Date.now();
    const close = () => { if (dead) return; dead = true; delegate.receive = null; output.setSampleBufferDelegateQueue(null as unknown as AVCaptureVideoDataOutputSampleBufferDelegate, NSOperationQueue.mainQueue.underlyingQueue); session.stopRunning(); latest = undefined; };
    try {
      const context = CIContext.contextWithOptions(NSDictionary.new());
      const frameImage = new ImageAsset();
      if (!current()) { close(); resolve({ read: () => null, close }); return; }
      const devices = AVCaptureDevice.devicesWithMediaType(AVMediaTypeVideo);
      const position = facing === 'user' ? AVCaptureDevicePosition.Front : AVCaptureDevicePosition.Back;
      let device: AVCaptureDevice | undefined;
      for (let i = 0; i < devices.count; i++) if (devices.objectAtIndex(i).position === position) { device = devices.objectAtIndex(i); break; }
      if (!device) throw Error(facing === 'user' ? '未找到前置相机。' : '未找到后置相机。');
      const input = AVCaptureDeviceInput.deviceInputWithDeviceError(device);
      session.sessionPreset = AVCaptureSessionPreset640x480;
      output.alwaysDiscardsLateVideoFrames = true;
      output.videoSettings = NSDictionary.dictionaryWithObjectForKey(NSNumber.numberWithInt(kCVPixelFormatType_32BGRA), kCVPixelBufferPixelFormatTypeKey);
      if (!session.canAddInput(input) || !session.canAddOutput(output)) throw Error('设备不支持相机视频流。');
      session.addInput(input); session.addOutput(output);
      const connection = output.connectionWithMediaType(AVMediaTypeVideo);
      const orient = () => {
        const orientation = Application.ios.rootController?.view.window?.windowScene?.interfaceOrientation ?? UIInterfaceOrientation.Portrait;
        if (connection?.supportsVideoOrientation) connection.videoOrientation = Number(orientation) as AVCaptureVideoOrientation;
        if (connection?.supportsVideoMirroring) { connection.automaticallyAdjustsVideoMirroring = false; connection.videoMirrored = false; }
      };
      orient();
      delegate.receive = sample => {
        if (dead || Date.now() - last < 80) return;
        last = Date.now();
        try {
          const buffer = CMSampleBufferGetImageBuffer(sample); if (!buffer) return;
          const image = CIImage.imageWithCVPixelBuffer(buffer), cg = context.createCGImageFromRect(image, image.extent);
          if (!cg) return;
          // NativeScript owns the retained Core Foundation return value.
          // Releasing it here also releases the image again during bridge GC.
          latest = UIImage.imageWithCGImage(cg);
        } catch (error) { failure = error; }
      };
      output.setSampleBufferDelegateQueue(delegate, NSOperationQueue.mainQueue.underlyingQueue);
      session.startRunning();
      if (!session.running) throw Error('无法启动相机，请检查设备是否被其他应用占用。');
      resolve({ read() {
        if (failure) throw failure;
        if (dead) return null;
        orient();
        if (!latest) return null;
        const native = latest; latest = undefined;
        if (!frameImage.loadFromNativeSync(native)) throw Error('无法读取相机帧。');
        return { image: frameImage, time: (Date.now() - started) / 1000, release() {} };
      }, close });
    } catch (error) { close(); reject(error); }
  }));
};
