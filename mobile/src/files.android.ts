import { Application, Utils, knownFolders, path, File, Folder, type AndroidActivityResultEventData } from '@nativescript/core';
let picking = false;
export function pickFile(kind: 'project' | 'image' | 'video'): Promise<string | null> { if (picking)
    throw Error('文件选择器已打开'); picking = true; return new Promise((resolve, reject) => { const request = 45321; const done = (event: AndroidActivityResultEventData) => { if (event.requestCode !== request)
    return; Application.android.off(Application.android.activityResultEvent, done); picking = false; if (event.resultCode !== android.app.Activity.RESULT_OK) {
    resolve(null);
    return;
} try {
    const uri = event.intent?.getData();
    if (!uri)
        throw Error('没有选择文件');
    const input = Utils.android.getApplicationContext().getContentResolver().openInputStream(uri);
    if (!input)
        throw Error('文件不可读');
    const file = path.join(knownFolders.temp().path, Date.now() + '-' + (kind === 'video' ? 'video.mp4' : kind === 'image' ? 'image.png' : 'project.hyshader'));
    const output = new java.io.FileOutputStream(file), buffer = Array.create('byte', 65536);
    try {
        let count = 0, total = 0;
        while ((count = input.read(buffer)) !== -1) {
            total += count;
            if (total > 128 * 1024 * 1024)
                throw Error('文件超过 128 MB');
            output.write(buffer, 0, count);
        }
    }
    finally {
        input.close();
        output.close();
    }
    resolve(file);
}
catch (error) {
    reject(error);
} }; Application.android.on(Application.android.activityResultEvent, done); try {
    const intent = new android.content.Intent(android.content.Intent.ACTION_OPEN_DOCUMENT);
    intent.setType(kind === 'image' ? 'image/*' : kind === 'video' ? 'video/*' : '*/*');
    intent.addCategory(android.content.Intent.CATEGORY_OPENABLE);
    (Application.android.foregroundActivity ?? Application.android.startActivity).startActivityForResult(intent, request);
}
catch (error) {
    picking = false;
    Application.android.off(Application.android.activityResultEvent, done);
    reject(error);
} }); }
export async function shareFile(file: string) { const context = Utils.android.getApplicationContext(), folder = Folder.fromPath(path.join(context.getCacheDir().getAbsolutePath(), 'haiyue-share')), target = path.join(folder.path, File.fromPath(file).name); await File.fromPath(file).copy(target); const uri = androidx.core.content.FileProvider.getUriForFile(context, context.getPackageName() + '.haiyue.share', new java.io.File(target)); const intent = new android.content.Intent(android.content.Intent.ACTION_SEND); intent.setType(file.endsWith('.png') ? 'image/png' : file.endsWith('.wav') ? 'audio/wav' : 'application/octet-stream'); intent.putExtra(android.content.Intent.EXTRA_STREAM, uri); intent.addFlags(android.content.Intent.FLAG_GRANT_READ_URI_PERMISSION); const activity = Application.android.foregroundActivity ?? Application.android.startActivity; activity.startActivity(android.content.Intent.createChooser(intent, '导出 ShaderLab 文件')); }
export function dataUrl(file: string, mime: string) { const bytes = java.nio.file.Files.readAllBytes(new java.io.File(file).toPath()); return 'data:' + mime + ';base64,' + android.util.Base64.encodeToString(bytes, android.util.Base64.NO_WRAP); }
export function cacheDataUrl(url: string, name: string) { const file = path.join(knownFolders.temp().path, name); java.nio.file.Files.write(new java.io.File(file).toPath(), android.util.Base64.decode(url.slice(url.indexOf(',') + 1), android.util.Base64.DEFAULT), []); return file; }
export function writeBytes(file: string, bytes: Uint8Array) { const native = java.nio.ByteBuffer.allocateDirect(bytes.byteLength); new Uint8Array((ArrayBuffer as unknown as {
    from(b: java.nio.ByteBuffer): ArrayBuffer;
}).from(native)).set(bytes); const stream = new java.io.FileOutputStream(file); try {
    while (native.hasRemaining())
        stream.getChannel().write(native);
}
finally {
    stream.close();
} }
