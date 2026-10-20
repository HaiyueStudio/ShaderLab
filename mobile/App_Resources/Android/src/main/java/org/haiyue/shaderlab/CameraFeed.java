package org.haiyue.shaderlab;

import android.Manifest;
import android.content.Context;
import android.content.pm.PackageManager;
import android.graphics.Bitmap;
import android.graphics.ImageFormat;
import android.graphics.Matrix;
import android.hardware.camera2.*;
import android.media.Image;
import android.media.ImageReader;
import android.os.Handler;
import android.os.HandlerThread;
import android.os.SystemClock;
import android.util.Size;
import android.view.WindowManager;
import java.nio.ByteBuffer;
import java.util.Collections;

/** Camera2 owns YUV conversion off the JS/UI thread; only the newest bitmap is retained. */
public final class CameraFeed {
    private final Context context;
    private final boolean front;
    private final int displayRotation;
    private final HandlerThread thread = new HandlerThread("ShaderLabCamera");
    private Handler handler;
    private ImageReader reader;
    private volatile CameraDevice device;
    private volatile CameraCaptureSession session;
    private volatile boolean closed;
    private volatile String error;
    private Bitmap latest;
    private int sensorOrientation;
    private long lastFrame;

    public CameraFeed(Context context, boolean front, int displayRotation) { this.context = context; this.front = front; this.displayRotation = displayRotation; }
    public String getError() { return error; }
    public synchronized Bitmap takeFrame() { Bitmap frame = latest; latest = null; return frame; }
    public void start() {
        thread.start(); handler = new Handler(thread.getLooper());
        handler.post(() -> {
            if (closed) return;
            try {
                CameraManager manager = (CameraManager) context.getSystemService(Context.CAMERA_SERVICE);
                String selected = null; CameraCharacteristics info = null;
                for (String id : manager.getCameraIdList()) {
                    CameraCharacteristics c = manager.getCameraCharacteristics(id);
                    Integer facing = c.get(CameraCharacteristics.LENS_FACING);
                    if (facing != null && facing == (front ? CameraCharacteristics.LENS_FACING_FRONT : CameraCharacteristics.LENS_FACING_BACK)) { selected = id; info = c; break; }
                }
                if (selected == null) throw new Exception(front ? "未找到前置相机。" : "未找到后置相机。");
                Size[] sizes = info.get(CameraCharacteristics.SCALER_STREAM_CONFIGURATION_MAP).getOutputSizes(ImageFormat.YUV_420_888);
                Size size = null; long best = Long.MAX_VALUE;
                for (Size candidate : sizes) {
                    long pixels = (long) candidate.getWidth() * candidate.getHeight();
                    long score = Math.abs(pixels - 640L * 480L) + (pixels > 640L * 480L ? 100000000L : 0);
                    if (score < best) { best = score; size = candidate; }
                }
                if (size == null) throw new Exception("设备不支持相机视频流。");
                Integer sensor = info.get(CameraCharacteristics.SENSOR_ORIENTATION);
                sensorOrientation = sensor == null ? 0 : sensor;
                reader = ImageReader.newInstance(size.getWidth(), size.getHeight(), ImageFormat.YUV_420_888, 2);
                reader.setOnImageAvailableListener(this::frame, handler);
                if (context.checkSelfPermission(Manifest.permission.CAMERA) != PackageManager.PERMISSION_GRANTED) throw new Exception("相机授权已被撤销。");
                manager.openCamera(selected, new CameraDevice.StateCallback() {
                    @Override public void onOpened(CameraDevice camera) {
                        device = camera;
                        if (closed) { camera.close(); return; }
                        try {
                            camera.createCaptureSession(Collections.singletonList(reader.getSurface()), new CameraCaptureSession.StateCallback() {
                                @Override public void onConfigured(CameraCaptureSession capture) {
                                    if (closed) { capture.close(); return; }
                                    session = capture;
                                    try { CaptureRequest.Builder request = camera.createCaptureRequest(CameraDevice.TEMPLATE_PREVIEW); request.addTarget(reader.getSurface()); capture.setRepeatingRequest(request.build(), null, handler); }
                                    catch (Exception e) { fail(e.getMessage()); }
                                }
                                @Override public void onConfigureFailed(CameraCaptureSession capture) { capture.close(); fail("相机视频流配置失败。"); }
                            }, handler);
                        } catch (Exception e) { fail(e.getMessage()); }
                    }
                    @Override public void onDisconnected(CameraDevice camera) { camera.close(); fail("相机已断开，请重新运行。"); }
                    @Override public void onError(CameraDevice camera, int code) { camera.close(); fail("无法打开相机（" + code + "），请检查是否被其他应用占用。"); }
                }, handler);
            } catch (Exception e) { fail(e.getMessage()); }
        });
    }
    private void fail(String message) { if (!closed) error = message == null ? "相机视频流异常。" : message; }
    private static int clamp(int value) { return Math.max(0, Math.min(255, value)); }
    private void frame(ImageReader source) {
        Image image = null;
        try {
            image = source.acquireLatestImage();
            long now = SystemClock.elapsedRealtime();
            if (image == null || closed || now - lastFrame < 80) return;
            lastFrame = now;
            int width = image.getWidth(), height = image.getHeight();
            Image.Plane[] planes = image.getPlanes();
            ByteBuffer yy = planes[0].getBuffer(), uu = planes[1].getBuffer(), vv = planes[2].getBuffer();
            int ys = planes[0].getRowStride(), us = planes[1].getRowStride(), vs = planes[2].getRowStride();
            int yp = planes[0].getPixelStride(), up = planes[1].getPixelStride(), vp = planes[2].getPixelStride();
            int[] pixels = new int[width * height];
            for (int y = 0; y < height; y++) for (int x = 0; x < width; x++) {
                int l = Math.max(0, (yy.get(y * ys + x * yp) & 255) - 16), u = (uu.get(y / 2 * us + x / 2 * up) & 255) - 128, v = (vv.get(y / 2 * vs + x / 2 * vp) & 255) - 128;
                int r = clamp((298 * l + 409 * v + 128) >> 8), g = clamp((298 * l - 100 * u - 208 * v + 128) >> 8), b = clamp((298 * l + 516 * u + 128) >> 8);
                pixels[y * width + x] = 0xff000000 | r << 16 | g << 8 | b;
            }
            Bitmap bitmap = Bitmap.createBitmap(pixels, width, height, Bitmap.Config.ARGB_8888);
            WindowManager window = (WindowManager) context.getSystemService(Context.WINDOW_SERVICE);
            int degrees = (window == null ? displayRotation : window.getDefaultDisplay().getRotation()) * 90;
            int rotation = (sensorOrientation + (front ? degrees : -degrees) + 360) % 360;
            if (rotation != 0) { Matrix matrix = new Matrix(); matrix.postRotate(rotation); Bitmap rotated = Bitmap.createBitmap(bitmap, 0, 0, width, height, matrix, true); if (rotated != bitmap) bitmap.recycle(); bitmap = rotated; }
            synchronized (this) { if (closed) bitmap.recycle(); else { if (latest != null) latest.recycle(); latest = bitmap; } }
        } catch (Exception e) { fail(e.getMessage()); }
        finally { if (image != null) image.close(); }
    }
    public void close() {
        closed = true;
        synchronized (this) { if (latest != null) latest.recycle(); latest = null; }
        if (session != null) session.close();
        if (device != null) device.close();
        if (handler != null) handler.post(() -> { if (reader != null) reader.close(); thread.quitSafely(); });
    }
}
