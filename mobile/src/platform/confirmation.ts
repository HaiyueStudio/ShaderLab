import {GridLayout,Label,Color,type View} from '@nativescript/core';
import {HYNativeButton,hyShowNativeOverlay,type HYNativeOverlayHandle} from '@haiyue/native/ui';
import {shaderTheme} from '../../../shared/dist/views/presentation.js';
import {t} from '../../../shared/dist/views/i18n.js';
/** Host-owned confirmation uses the same explicit colors as the rest of the app. */
export async function confirmNative(owner:View,options:{title:string;message:string;accept:string;destructive?:boolean;returnFocus?:View}):Promise<boolean> {
  const message=new Label();message.text=options.message;message.textWrap=true;message.padding=20;message.fontSize=shaderTheme.fontSize;message.color=new Color(shaderTheme.color.text);message.accessibilityIdentifier='confirmation-message';
  const actions=new GridLayout();actions.columns='*,8,*';
  const cancel=new HYNativeButton({text:t('取消'),variant:'secondary'},shaderTheme);
  const accept=new HYNativeButton({text:options.accept,variant:options.destructive?'danger':'primary'},shaderTheme);
  cancel.id=cancel.accessibilityIdentifier='confirmation-cancel';accept.id=accept.accessibilityIdentifier='confirmation-accept';
  GridLayout.setColumn(accept,2);actions.addChild(cancel);actions.addChild(accept);
  let result=false,settled=false,overlay:HYNativeOverlayHandle;
  const finish=(value:boolean)=>{if(settled)return;settled=true;result=value;cancel.isEnabled=false;accept.isEnabled=false;overlay.close();};
  cancel.on('tap',()=>finish(false));accept.on('tap',()=>finish(true));
  try {
    overlay=hyShowNativeOverlay(owner,{title:options.title,content:message,footer:actions,theme:shaderTheme,width:420,height:280,closeLabel:t('关闭'),returnFocus:options.returnFocus});
    overlay.page.accessibilityIdentifier='shader-confirmation';
    await overlay.closed;
    return result;
  } finally {cancel.off('tap');accept.off('tap');}
}
