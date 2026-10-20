import type { OpenCamera } from '../../shared/dist/ports/liveCamera.js';
export interface CameraFrame { video: HTMLVideoElement; width: number; height: number; time: number }

export const openCamera: OpenCamera<CameraFrame> = async (facing, current) => {
  if (!navigator.mediaDevices?.getUserMedia) throw Error('当前环境无法使用相机，请使用 HTTPS 或本机地址。');
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false, video: { facingMode: { ideal: facing }, width: { ideal: 640 }, height: { ideal: 480 }, frameRate: { ideal: 15, max: 30 } } });
  } catch (error) {
    const name = (error as DOMException).name;
    throw Error(name === 'NotAllowedError' ? '未获授权，请在浏览器设置中允许相机后重新运行。' : name === 'NotFoundError' ? '未找到可用相机。' : '无法打开相机，请检查设备是否被其他应用占用。');
  }
  const video = document.createElement('video');
  video.muted = true; video.playsInline = true; video.srcObject = stream;
  let dead = false;
  const close = () => { if (dead) return; dead = true; stream.getTracks().forEach(track => track.stop()); video.pause(); video.srcObject = null; };
  if (!current()) { close(); return { read: () => null, close }; }
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => finish(Error('等待相机画面超时，请重新运行。')), 15000);
      const cancelled = setInterval(() => { if (!current()) { close(); finish(Error('相机已关闭。')); } }, 100);
      const loaded = () => finish();
      const error = () => finish(Error('无法读取相机视频流。'));
      const finish = (failure?: Error) => { clearTimeout(timer); clearInterval(cancelled); video.removeEventListener('loadeddata', loaded); video.removeEventListener('error', error); failure ? reject(failure) : resolve(); };
      video.addEventListener('loadeddata', loaded); video.addEventListener('error', error);
      void video.play().catch(error => finish(error instanceof Error ? error : Error(String(error))));
    });
    if (!current()) close();
    if (video.videoWidth > 4096 || video.videoHeight > 4096) throw Error('相机视频尺寸不能超过 4096。');
    return { read: () => {
      if (!dead && !stream.active) throw Error('相机视频流已中断，请重新运行。');
      return !dead && video.readyState >= 2 && video.videoWidth > 0 ? { video, width: video.videoWidth, height: video.videoHeight, time: video.currentTime } : null;
    }, close };
  } catch (error) { close(); throw error; }
};
