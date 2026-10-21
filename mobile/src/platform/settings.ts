import { ActionItem, Page, StackLayout, ScrollView, Label, Button, Switch, Dialogs, Color } from '@nativescript/core';
import { preferences, savePreferences } from '../preferences';
import { t, onLocaleChange } from '../../../shared/dist/views/i18n.js';
import { shaderAppearance } from '../../../shared/dist/views/presentation.js';

type Entry={view:WeakRef<Label|Button>;source:string;last:string;accessibility:string};
const labels=new Set<Entry>(),entries=new WeakMap<Label|Button,Entry>(),collected=new FinalizationRegistry<Entry>(entry=>labels.delete(entry));
export function localizedNativeText<V extends Label|Button>(view:V,source:string,accessibility=source):V {
  const previous=entries.get(view);if(previous){labels.delete(previous);collected.unregister(previous);}
  view.text=t(source);const entry={view:new WeakRef(view),source,last:view.text,accessibility};labels.add(entry);entries.set(view,entry);collected.register(view,entry,entry);return view;
}
onLocaleChange(()=>{for(const entry of labels){const view=entry.view.deref();if(!view){labels.delete(entry);continue;}if(view.text===entry.last){view.text=t(entry.source);entry.last=view.text;if(view instanceof Button)view.accessibilityLabel=t(entry.accessibility);}}});
export function installNativeSettings(owner:Page,setMSAA:(value:boolean)=>void=()=>{}) {
  const action=new ActionItem();action.text='⚙';action.ios.position='right';action.on('tap',()=>{
    const modal=new Page(),body=new StackLayout();modal.actionBarHidden=true;modal.backgroundColor=new Color(shaderAppearance.color.surface);body.padding=20;
    const label=(source:string)=>localizedNativeText(new Label(),source),button=(source:string,run:()=>void)=>{const view=localizedNativeText(new Button(),source);view.accessibilityLabel=t(source);view.on('tap',run);return view;};
    body.addChild(label('设置'));body.addChild(label('界面语言'));
    body.addChild(button('中文 / English',()=>{void Dialogs.action({title:t('界面语言'),cancelButtonText:t('取消'),actions:['中文','English']}).then(choice=>{if(choice==='中文'||choice==='English')savePreferences({locale:choice==='English'?'en':'zh-CN'});});}));
    body.addChild(label('开启 MSAA'));const msaa=new Switch();msaa.checked=preferences().msaa;msaa.accessibilityLabel=t('开启 MSAA');msaa.on('checkedChange',()=>{savePreferences({msaa:msaa.checked});setMSAA(msaa.checked);});body.addChild(msaa);
    const hint=label('4× 抗锯齿，平滑 3D 预览物体的边缘。');hint.textWrap=true;body.addChild(hint);body.addChild(label('首选 Shader 语言'));
    const shader=button(preferences().shaderLanguage.toUpperCase(),()=>{void Dialogs.action({title:t('首选 Shader 语言'),cancelButtonText:t('取消'),actions:['WGSL','GLSL','HLSL']}).then(choice=>{if(['WGSL','GLSL','HLSL'].includes(choice)){savePreferences({shaderLanguage:choice.toLowerCase() as 'wgsl'|'glsl'|'hlsl'});shader.text=choice;}});});body.addChild(shader);
    const note=label('用于新建作品和新代码页签，不修改已有代码。');note.textWrap=true;body.addChild(note);body.addChild(button('完成',()=>modal.closeModal()));
    const scroll=new ScrollView();scroll.content=body;modal.content=scroll;owner.showModal(modal,{fullscreen:false,closeCallback:()=>{}});
  });owner.actionBar.actionItems.addItem(action);
}
