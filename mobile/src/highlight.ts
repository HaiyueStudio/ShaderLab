import { Color, TextView, isAndroid } from '@nativescript/core';
import type { ShaderLanguage } from './project';
import { shaderSpans } from './highlight-tokens';
/** Attribute-only updates preserve native selection, undo and IME composition. */
export function applyShaderHighlight(editor: TextView, language: ShaderLanguage) {
    const text = editor.text ?? '', spans = shaderSpans(text, language);
    if (isAndroid) {
        const native = editor.android as android.widget.EditText | undefined;
        if (!native)
            return;
        const value = native.getText();
        if (!value || android.view.inputmethod.BaseInputConnection.getComposingSpanStart(value) >= 0)
            return;
        const old = value.getSpans(0, value.length(), android.text.style.ForegroundColorSpan.class);
        for (let i = 0; i < old.length; i++)
            value.removeSpan(old[i]);
        for (const s of spans)
            value.setSpan(new android.text.style.ForegroundColorSpan(new Color(s.color).android), s.start, s.end, android.text.Spannable.SPAN_EXCLUSIVE_EXCLUSIVE);
    }
    else {
        const native = editor.ios as UITextView | undefined;
        if (!native || native.markedTextRange)
            return;
        const value = native.textStorage;
        value.beginEditing();
        value.addAttributeValueRange(NSForegroundColorAttributeName, new Color('#d4dbe5').ios, { location: 0, length: text.length });
        for (const s of spans)
            value.addAttributeValueRange(NSForegroundColorAttributeName, new Color(s.color).ios, { location: s.start, length: s.end - s.start });
        value.endEditing();
    }
}
