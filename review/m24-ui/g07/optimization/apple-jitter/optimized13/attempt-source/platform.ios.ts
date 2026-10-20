import { ImageSource, type Button, type View } from '@nativescript/core';
import type { HYNativeTextHandle, HYTextObservation } from './types';
import { createNativeCallback } from './native-callback';
import { TextBase, textProperty } from '@nativescript/core/ui/text-base';

export function assertMainThread(): void {
  if (!NSThread.isMainThread) throw new Error('Native UI commits must run on the main thread');
}
export function isAccessibilityInteraction(): boolean { return UIAccessibilityIsVoiceOverRunning(); }
export function focusNative(view: View): void {
  view.focus();
  const native = view.ios instanceof UIViewController ? view.ios.view : view.ios;
  if (UIAccessibilityIsVoiceOverRunning() && native) UIAccessibilityPostNotification(UIAccessibilityLayoutChangedNotification, native);
}
export function setClipping(view: View, clip: boolean): void {
  const native = view.ios instanceof UIViewController ? view.ios.view : view.ios;
  if (native) native.clipsToBounds = clip;
}
export function systemIcon(name: string): ImageSource | undefined {
  const image = UIImage.systemImageNamed(name); return image ? new ImageSource(image) : undefined;
}
export function observeText(view: View, changed: (state: HYTextObservation) => void, dismissLabel = 'Done'): HYNativeTextHandle {
  const input = view.ios as UITextField | UITextView;
  const center = NSNotificationCenter.defaultCenter;
  let disposed = false, writing = false;
  // A visible text button works for multiline/secure inputs and keyboards
  // without Return. Do not rely on UIBarButtonItem's OS-specific Done rendering.
  const previousAccessory = input.inputAccessoryView;
  const width = input.window?.bounds.size.width || UIScreen.mainScreen.bounds.size.width;
  const toolbar = UIView.alloc().initWithFrame(CGRectMake(0, 0, width, 52));
  toolbar.autoresizingMask = UIViewAutoresizing.FlexibleWidth;
  // Leave the keyboard's rounded silhouette visible. Only the action has a
  // material background; an opaque accessory would add a full-width strip.
  toolbar.backgroundColor = UIColor.clearColor;
  toolbar.opaque = false;
  const material = UIVisualEffectView.alloc().initWithEffect(UIBlurEffect.effectWithStyle(UIBlurEffectStyle.SystemMaterial));
  material.frame = CGRectMake(width - 108, 4, 96, 44);
  material.autoresizingMask = UIViewAutoresizing.FlexibleLeftMargin;
  material.layer.cornerRadius = 22;
  material.clipsToBounds = true;
  material.userInteractionEnabled = false;
  material.isAccessibilityElement = false;
  toolbar.addSubview(material);
  const done = UIButton.buttonWithType(UIButtonType.System);
  done.frame = CGRectMake(width - 108, 4, 96, 44);
  done.autoresizingMask = UIViewAutoresizing.FlexibleLeftMargin;
  done.setTitleForState(dismissLabel, UIControlState.Normal);
  done.titleLabel.font = UIFont.systemFontOfSizeWeight(17, UIFontWeightSemibold);
  done.tintColor = UIColor.systemBlueColor;
  done.accessibilityIdentifier = 'haiyue.keyboard.done';
  done.accessibilityLabel = dismissLabel;
  const dismissCallback = createNativeCallback(() => {
    if (!disposed) input.resignFirstResponder();
  });
  const action = UIAction.actionWithTitleImageIdentifierHandler(dismissLabel, null!, 'haiyue.keyboard.dismiss', dismissCallback.invoke);
  done.addActionForControlEvents(action, UIControlEvents.TouchUpInside);
  toolbar.addSubview(done);
  input.inputAccessoryView = toolbar;
  if (input.isFirstResponder) input.reloadInputViews();
  const read = (): HYTextObservation => ({value: String(input.text ?? ''), composing: !!input.markedTextRange});
  // Observe after UIKit edits; NativeScript TextField.textChange can run BEFORE marked text is installed.
  const name = input instanceof UITextView ? UITextViewTextDidChangeNotification : UITextFieldTextDidChangeNotification;
  const textCallback = createNativeCallback(() => {
    if (!disposed && !writing) changed(read());
  });
  const token = center.addObserverForNameObjectQueueUsingBlock(name, input, NSOperationQueue.mainQueue, textCallback.invoke);
  return {read, write(value) {
    if (disposed || value === String(input.text ?? '')) return;
    const selection = input.selectedTextRange;
    const start = selection ? input.offsetFromPositionToPosition(input.beginningOfDocument, selection.start) : value.length;
    const end = selection ? input.offsetFromPositionToPosition(input.beginningOfDocument, selection.end) : start;
    writing = true;
    try {
      // The public NativeScript property keeps its binding cache coherent. No private delegate/field mutation.
      (view as View & {text: string}).text = value;
      const a = input.positionFromPositionOffset(input.beginningOfDocument, Math.min(start, value.length));
      const b = input.positionFromPositionOffset(input.beginningOfDocument, Math.min(end, value.length));
      if (a && b) input.selectedTextRange = input.textRangeFromPositionToPosition(a, b);
    } finally { writing = false; }
  }, dispose() {
    if (!disposed) {
      disposed = true;
      dismissCallback.dispose();
      textCallback.dispose();
      center.removeObserver(token);
      if (input.inputAccessoryView === toolbar) {
        input.inputAccessoryView = previousAccessory;
        if (input.isFirstResponder) input.reloadInputViews();
      }
      // Release the action block as well as the view when a node is unloaded.
      done.removeActionForControlEvents(action, UIControlEvents.TouchUpInside);
      done.removeFromSuperview();
      material.removeFromSuperview();
    }
  }};
}
export function observeKeyboard(view: View, changed: (height: number) => void): () => void {
  const center = NSNotificationCenter.defaultCenter;
  const callback = createNativeCallback((notification: NSNotification) => {
    const native = view.ios as UIView;
    if (!native?.window) return;
    const frame = (notification.userInfo.objectForKey(UIKeyboardFrameEndUserInfoKey) as NSValue).CGRectValue;
    const bounds = native.convertRectToView(native.bounds, null!);
    // Ignore floating/split keyboards; UIScrollView retains native caret scrolling there.
    const overlapX = Math.min(bounds.origin.x + bounds.size.width, frame.origin.x + frame.size.width) - Math.max(bounds.origin.x, frame.origin.x);
    const overlap = overlapX >= bounds.size.width - 1 ? Math.max(0, bounds.origin.y + bounds.size.height - frame.origin.y) : 0;
    changed(Math.min(bounds.size.height, overlap));
  });
  const token = center.addObserverForNameObjectQueueUsingBlock(UIKeyboardWillChangeFrameNotification, null, NSOperationQueue.mainQueue, callback.invoke);
  let disposed = false;
  return () => {
    if (disposed) return;
    disposed = true;
    callback.dispose();
    center.removeObserver(token);
  };
}

/** Small per-control cache of titles already laid out by NativeScript. Never
 * synthesize typography or bypass the public text property notification path. */
export function selectionText(view: Button): {write(text: string): void; clear(): void} {
  let owner: UIButton | undefined, signature: unknown[] = [];
  const titles = new Map<string, NSAttributedString>();
  const clear = () => { owner = undefined; signature = []; titles.clear(); };
  return {clear, write(text) {
    if (view.text === text) return;
    const native = view.ios as UIButton | undefined, style = view.style;
    // Formatted or stroked text has additional mutable state; retain the normal path.
    if (!view.isLoaded || !native || view.formattedText || style.textStroke) { clear(); view.text = text; return; }
    // NativeScript updates fontInternal/fontScaleInternal for Dynamic Type too;
    // no need to read titleLabel.font through the ObjC bridge on each selection.
    const next = [style.fontInternal, style.fontScaleInternal, style.color, style.lineHeight,
      style.letterSpacing, style.textDecoration, style.textTransform, style.textAlignment,
      view.iosAccessibilityAdjustsFontSize, view.iosAccessibilityMinFontScale, view.iosAccessibilityMaxFontScale];
    if (owner !== native || next.some((value, i) => !Object.is(value, signature[i]))) {
      titles.clear(); owner = native; signature = next;
    }
    const title = titles.get(text);
    if (title) {
      const animate = view.iosTextAnimation === 'inherit' ? TextBase.iosTextAnimationFallback : view.iosTextAnimation;
      if (animate) native.setAttributedTitleForState(title, UIControlState.Normal);
      else UIView.performWithoutAnimation(() => native.setAttributedTitleForState(title, UIControlState.Normal));
      textProperty.nativeValueChange(view, text);
      // Same layout invalidation as NativeScript's ordinary text setter.
      view.requestLayout();
    } else {
      view.text = text;
      const rendered = native.attributedTitleForState(UIControlState.Normal);
      if (rendered) {
        if (titles.size === 8) titles.delete(titles.keys().next().value!);
        titles.set(text, rendered.copy() as NSAttributedString);
      }
    }
  }};
}
