import { HYNativeButton, hyPickNativeOption } from '@haiyue/native/ui';
import type { HYIconName, HYOption } from '@haiyue/ui/core';
import { Color, type Button, type View } from '@nativescript/core';
import { shaderTheme } from '../../../shared/dist/views/presentation.js';
import { t } from '../../../shared/dist/views/i18n.js';
export { HYNativeButton };
export function nativeAction(text:string,primary=false,icon?:HYIconName):HYNativeButton {
  return new HYNativeButton({text,variant:primary?'primary':'quiet',size:'compact',...(icon?{icon}:{})},shaderTheme);
}
const tabStates=new WeakMap<Button,{selected:boolean;segmented:boolean}>();
function paintTab(button:Button,selected:boolean,segmented:boolean,pressed=false):void {
  button.backgroundColor=new Color(pressed?shaderTheme.color.pressed:segmented&&selected?shaderTheme.color.selected:'transparent');button.borderWidth=0;button.borderBottomWidth=selected&&!segmented?2:0;button.borderColor=new Color(shaderTheme.color.accent);button.borderRadius=segmented?8:0;button.color=new Color(selected?shaderTheme.color.text:shaderTheme.color.muted);button.accessibilityState=selected?'selected':undefined;
}
export function nativeTab(button:Button,selected:boolean,segmented=false):void {
  if(!tabStates.has(button))button.on('touch',(event:any)=>{const state=tabStates.get(button)!;paintTab(button,state.selected,state.segmented,event.action==='down');});
  tabStates.set(button,{selected,segmented});paintTab(button,selected,segmented);
}
export function pickNative(anchor:View,title:string,options:readonly HYOption[],value=''):Promise<string|null> {
  const picker=hyPickNativeOption(anchor,{title:t(title),value,options,theme:shaderTheme,cancelLabel:t('取消')});
  const close=()=>picker.cancel();anchor.on('unloaded',close);
  return picker.result.finally(()=>anchor.off('unloaded',close));
}
