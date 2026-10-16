import { WebView, isAndroid, type LoadEventData } from '@nativescript/core';
import type { WgslTranslationOptions, WgslTranslationResult } from '../../web/dist/wgsl.js';
/** Only the WASM source converter uses the system WebView. Rendering is native
 * WebGPU; the converter never receives application filesystem or GPU handles. */
export class MobileCompiler {
    readonly view = new WebView();
    private ready: Promise<void>;
    private sequence = 0;
    private disposed = false;
    constructor() {
        this.view.height = 1;
        this.view.opacity = .01;
        this.view.isUserInteractionEnabled = false;
        this.view.disableZoom = true;
        this.ready = new Promise((resolve, reject) => { this.view.once(WebView.loadFinishedEvent, data => { const event = data as LoadEventData; event.error ? reject(Error(event.error)) : resolve(); }); });
        void this.ready.catch(() => { });
        this.view.src = '~/compiler/index.html';
    }
    private evaluate(script: string): Promise<string> {
        return new Promise((resolve, reject) => {
            if (this.disposed) {
                reject(Error('转换服务已关闭'));
                return;
            }
            if (isAndroid)
                (this.view.android as android.webkit.WebView).evaluateJavascript(script, new android.webkit.ValueCallback({ onReceiveValue: (value: string) => { try {
                        resolve(JSON.parse(value));
                    }
                    catch (error) {
                        reject(error);
                    } } }));
            else
                (this.view.ios as WKWebView).evaluateJavaScriptCompletionHandler(script, (value, error) => error ? reject(Error(error.localizedDescription)) : resolve(String(value ?? '')));
        });
    }
    async translate(code: string, options: WgslTranslationOptions): Promise<WgslTranslationResult> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([this.ready, new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('转换器加载超时')), 15000); })]); } finally { if (timer) clearTimeout(timer); }
        const id = String(++this.sequence);
        await this.evaluate(`window.nativeShaderCompiler.start(${JSON.stringify(id)},${JSON.stringify(code)},${JSON.stringify(options)})`);
        for (let attempt = 0; attempt < 300; attempt++) {
            if (this.disposed)
                throw Error('转换已取消');
            const result = await this.evaluate(`window.nativeShaderCompiler.take(${JSON.stringify(id)})`);
            if (result)
                return JSON.parse(result) as WgslTranslationResult;
            await new Promise(r => setTimeout(r, 100));
        }
        await this.evaluate(`window.nativeShaderCompiler.cancel(${JSON.stringify(id)})`);
        throw Error('转换超时，请检查代码大小后重试');
    }
    dispose() { this.disposed = true; this.view.stopLoading(); }
}
