import { Application, knownFolders, path } from '@nativescript/core';
let delegate: PickerDelegate | null = null;
function host() { let view = Application.ios.rootController; while (view?.presentedViewController)
    view = view.presentedViewController; if (!view)
    throw Error('没有活动窗口'); return view; }
@NativeClass()
class PickerDelegate extends NSObject implements UIDocumentPickerDelegate {
    static ObjCProtocols = [UIDocumentPickerDelegate];
    done!: (file: string | null, error?: Error) => void;
    documentPickerDidPickDocumentsAtURLs(_picker: UIDocumentPickerViewController, urls: NSArray<NSURL>) { const url = urls.firstObject; if (!url) {
        this.done(null);
        return;
    } const scoped = url.startAccessingSecurityScopedResource(); try {
        const data = NSData.dataWithContentsOfURL(url);
        if (!data || data.length > 128 * 1024 * 1024)
            throw Error('文件无法读取或超过 128 MB');
        const target = path.join(knownFolders.temp().path, Date.now() + '-' + url.lastPathComponent);
        if (!data.writeToFileAtomically(target, true))
            throw Error('文件复制失败');
        this.done(target);
    }
    catch (error) {
        this.done(null, Error(String(error)));
    }
    finally {
        if (scoped)
            url.stopAccessingSecurityScopedResource();
    } }
    documentPickerWasCancelled() { this.done(null); }
}
export function pickFile(kind: 'project' | 'image' | 'video'): Promise<string | null> { if (delegate)
    throw Error('文件选择器已打开'); return new Promise((resolve, reject) => { const picker = UIDocumentPickerViewController.alloc().initWithDocumentTypesInMode(kind === 'image' ? ['public.image'] : kind === 'video' ? ['public.movie'] : ['public.data'], UIDocumentPickerMode.Import); delegate = PickerDelegate.new() as PickerDelegate; delegate.done = (file, error) => { delegate = null; error ? reject(error) : resolve(file); }; picker.delegate = delegate; picker.allowsMultipleSelection = false; host().presentViewControllerAnimatedCompletion(picker, true, () => { }); }); }
export function shareFile(file: string) { return new Promise<void>((resolve, reject) => { try {
    const view = host(), controller = UIActivityViewController.alloc().initWithActivityItemsApplicationActivities([NSURL.fileURLWithPath(file)], []);
    controller.completionWithItemsHandler = (_a, _b, _c, error) => error ? reject(Error(error.localizedDescription)) : resolve();
    const popover = controller.popoverPresentationController;
    if (popover) {
        popover.sourceView = view.view;
        popover.sourceRect = CGRectMake(view.view.bounds.size.width / 2, view.view.bounds.size.height / 2, 1, 1);
        popover.permittedArrowDirections = 0 as UIPopoverArrowDirection;
    }
    view.presentViewControllerAnimatedCompletion(controller, true, () => { });
}
catch (error) {
    reject(error);
} }); }
export function dataUrl(file: string, mime: string) { const data = NSData.dataWithContentsOfFile(file); if (!data)
    throw Error('文件不可读'); return 'data:' + mime + ';base64,' + data.base64EncodedStringWithOptions(0 as NSDataBase64EncodingOptions); }
export function cacheDataUrl(url: string, name: string) { const data = NSData.alloc().initWithBase64EncodedStringOptions(url.slice(url.indexOf(',') + 1), 0 as NSDataBase64DecodingOptions); if (!data)
    throw Error('文件编码不正确'); const file = path.join(knownFolders.temp().path, name); if (!data.writeToFileAtomically(file, true))
    throw Error('缓存写入失败'); return file; }
export function writeBytes(file: string, bytes: Uint8Array) { if (!NSData.dataWithBytesLength(interop.handleof(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength)), bytes.byteLength).writeToFileAtomically(file, true))
    throw Error('文件写入失败'); }
