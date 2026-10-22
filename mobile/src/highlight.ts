import { Color, TextView, isAndroid } from '@nativescript/core';
import type { ShaderLanguage } from './project';
import { shaderSpans } from './highlight-tokens';
/** Attribute-only updates preserve native selection, undo and IME composition.
 * Read the native buffer: UIKit's notifications can precede textChange. */
export function applyShaderHighlight(editor: TextView, language: ShaderLanguage): boolean {
    if (isAndroid) {
        const native = editor.android as android.widget.EditText | undefined;
        if (!native) return true;
        const value = native.getText();
        if (!value) return true;
        if (android.view.inputmethod.BaseInputConnection.getComposingSpanStart(value) >= 0) return false;
        const spans = shaderSpans(String(value.toString()), language);
        const old = value.getSpans(0, value.length(), android.text.style.ForegroundColorSpan.class);
        for (let i = 0; i < old.length; i++) value.removeSpan(old[i]);
        for (const s of spans)
            value.setSpan(new android.text.style.ForegroundColorSpan(new Color(s.color).android), s.start, s.end, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
    } else {
        const native = editor.ios as UITextView | undefined;
        if (!native) return true;
        if (native.markedTextRange) return false;
        const text = String(native.text ?? ''), value = native.textStorage;
        value.beginEditing();
        try {
            value.addAttributeValueRange(NSForegroundColorAttributeName, new Color('#d4dbe5').ios, { location: 0, length: text.length });
            for (const s of shaderSpans(text, language))
                value.addAttributeValueRange(NSForegroundColorAttributeName, new Color(s.color).ios, { location: s.start, length: s.end - s.start });
        } finally { value.endEditing(); }
    }
    return true;
}

/** Reapply after the native editing/style transaction, and after IME commit even
 * when committing the marked text does not change TextView.text again. */
export function bindShaderHighlight(editor: TextView, language: () => ShaderLanguage) {
    let timer: ReturnType<typeof setTimeout> | undefined, loaded = false, disposed = false, applying = false;
    let center: NSNotificationCenter | undefined;
    const observers: NSObjectProtocol[] = [];
    const cancel = () => { if (timer !== undefined) clearTimeout(timer); timer = undefined; };
    const schedule = (delay = 0) => {
        if (!loaded || disposed || applying) return;
        cancel();
        timer = setTimeout(() => {
            timer = undefined;
            if (!loaded || disposed) return;
            applying = true;
            let complete: boolean;
            try { complete = applyShaderHighlight(editor, language()); }
            finally { applying = false; }
            if (!complete) schedule(80);
        }, delay);
    };
    const refresh = () => schedule();
    const unload = () => {
        loaded = false; cancel();
        for (const observer of observers) center?.removeObserver(observer);
        observers.length = 0; center = undefined;
    };
    const load = () => {
        unload(); loaded = true;
        if (!isAndroid && editor.ios) {
            center = NSNotificationCenter.defaultCenter;
            // Also observe native attribute resets (e.g. focus/style updates),
            // which do not emit NativeScript textChange. Ignore our own writes.
            observers.push(center.addObserverForNameObjectQueueUsingBlock(NSTextStorageDidProcessEditingNotification, editor.ios.textStorage, NSOperationQueue.mainQueue, refresh));
            observers.push(center.addObserverForNameObjectQueueUsingBlock(UITextViewTextDidChangeNotification, editor.ios, NSOperationQueue.mainQueue, refresh));
        }
        refresh();
    };
    editor.on('loaded', load); editor.on('unloaded', unload);
    editor.on('textChange', refresh); editor.on('focus', refresh); editor.on('blur', refresh);
    if (editor.isLoaded) load();
    return { refresh, dispose() {
        disposed = true; unload();
        editor.off('loaded', load); editor.off('unloaded', unload);
        editor.off('textChange', refresh); editor.off('focus', refresh); editor.off('blur', refresh);
    } };
}
