import { GridLayout, WebView, isAndroid, type LoadEventData } from '@nativescript/core';
import type { WgslTranslationOptions, WgslTranslationResult } from '../../web/src/wgsl.js';
import type { HlslTranslationOptions, HlslTranslationResult } from '../../web/src/hlslTypes.js';
/** Only the WASM source converter uses the system WebView. Rendering is native
 * WebGPU; the converter never receives application filesystem or GPU handles. */
export class MobileCompiler {
    readonly view = new GridLayout();
    private browser?: WebView;
    private ready?: Promise<void>;
    private rejectReady?: (error: Error) => void;
    private pending = new Set<(error: Error) => void>();
    private sequence = 0;
    private disposed = false;
    constructor() {
        this.view.height = 1;
        this.view.opacity = .01;
        this.view.isUserInteractionEnabled = false;
    }
    private load(): Promise<void> {
        if (this.disposed) return Promise.reject(Error('转换服务已关闭'));
        if (this.ready) return this.ready;
        // Ordinary WGSL/GLSL rendering never needs a converter process. Retain
        // only an empty layout slot until export or HLSL actually requests it.
        const browser = this.browser = new WebView();
        browser.disableZoom = true;
        this.ready = new Promise((resolve, reject) => {
            this.rejectReady = reject;
            browser.once(WebView.loadFinishedEvent, data => {
                this.rejectReady = undefined;
                const event = data as LoadEventData;
                event.error ? reject(Error(event.error)) : resolve();
            });
        });
        void this.ready.catch(() => { });
        this.view.addChild(browser);
        browser.src = '~/compiler/index.html';
        return this.ready;
    }
    private evaluate(script: string): Promise<string> {
        return new Promise((resolve, reject) => {
            const browser = this.browser;
            if (this.disposed || !browser) {
                reject(Error('转换服务已关闭'));
                return;
            }
            const fail = (error: Error) => { this.pending.delete(fail); reject(error); };
            const complete = (value: string) => { this.pending.delete(fail); resolve(value); };
            this.pending.add(fail);
            try {
                if (isAndroid)
                    (browser.android as android.webkit.WebView).evaluateJavascript(script, new android.webkit.ValueCallback({ onReceiveValue: (value: string) => {
                        try { complete(JSON.parse(value)); } catch (error) { fail(error as Error); }
                    } }));
                else
                    (browser.ios as WKWebView).evaluateJavaScriptCompletionHandler(script, (value, error) => error ? fail(Error(error.localizedDescription)) : complete(String(value ?? '')));
            } catch (error) { fail(error as Error); }
        });
    }
    async translate(code: string, options: WgslTranslationOptions): Promise<WgslTranslationResult> {
        return this.run('start', code, options);
    }
    async hlsl(code: string, options: HlslTranslationOptions = {}): Promise<HlslTranslationResult> {
        return this.run('hlsl', code, options);
    }
    private async run(method: 'start' | 'hlsl', code: string, options: WgslTranslationOptions | HlslTranslationOptions): Promise<WgslTranslationResult> {
        let timer: ReturnType<typeof setTimeout> | undefined;
        try { await Promise.race([this.load(), new Promise<never>((_, reject) => { timer = setTimeout(() => reject(Error('转换器加载超时')), 15000); })]); } finally { if (timer) clearTimeout(timer); }
        const id = String(++this.sequence);
        await this.evaluate(`window.nativeShaderCompiler.${method}(${JSON.stringify(id)},${JSON.stringify(code)},${JSON.stringify(options)})`);
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
    dispose() {
        if (this.disposed) return;
        this.disposed = true;
        const error = Error('转换服务已关闭');
        this.rejectReady?.(error); this.rejectReady = undefined;
        for (const reject of this.pending) reject(error);
        const browser = this.browser; this.browser = undefined;
        if (browser) {
            browser.off(WebView.loadFinishedEvent);
            browser.stopLoading();
            // Removal runs NativeScript's native teardown (including Android
            // WebView.destroy), independently of Page/JS garbage collection.
            this.view.removeChild(browser);
        }
    }
}
