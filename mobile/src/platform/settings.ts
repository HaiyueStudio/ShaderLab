import {HYNativeButton,HYNativeFormField,hyPickNativeOption,hyShowNativeOverlay,type HYNativeOverlayHandle} from '@haiyue/native/ui';
import { ActionItem, Page, StackLayout, ScrollView, Label, Button, Switch, Dialogs, Color } from '@nativescript/core';
import { preferences, savePreferences } from '../preferences';
import { t, onLocaleChange } from '../../../shared/dist/views/i18n.js';
import { shaderAppearance,shaderTheme } from '../../../shared/dist/views/presentation.js';

type Entry={view:WeakRef<Label|Button>;source:string;last:string;accessibility:string};
const labels=new Set<Entry>(),entries=new WeakMap<Label|Button,Entry>(),collected=new FinalizationRegistry<Entry>(entry=>labels.delete(entry));
export function localizedNativeText<V extends Label|Button>(view:V,source:string,accessibility=source):V {
  const previous=entries.get(view);if(previous){labels.delete(previous);collected.unregister(previous);}
  view.text=t(source);const entry={view:new WeakRef(view),source,last:view.text,accessibility};labels.add(entry);entries.set(view,entry);collected.register(view,entry,entry);return view;
}
onLocaleChange(()=>{for(const entry of labels){const view=entry.view.deref();if(!view){labels.delete(entry);continue;}if(view.text===entry.last){view.text=t(entry.source);entry.last=view.text;if(view instanceof Button)view.accessibilityLabel=t(entry.accessibility);}}});
export function installNativeSettings(owner:Page,setMSAA:(value:boolean)=>void=()=>{},options:{inline?:boolean}={}) {
  let active:HYNativeOverlayHandle|undefined;
  const action=new ActionItem(),gear=new HYNativeButton({text:'',icon:'settings',variant:'quiet',a11y:{label:t('设置')}},shaderTheme);gear.width=44;gear.height=44;localizedNativeText(gear,'','设置');gear.accessibilityIdentifier='app-settings';if(!options.inline){action.actionView=gear;action.ios.position='right';}
  gear.on('tap',()=>{
    if(active)return;
    const body=new StackLayout();body.padding=20;
    const feedback=new Label();feedback.textWrap=true;feedback.color=new Color(shaderTheme.color.danger);feedback.visibility='collapse';feedback.accessibilityLiveRegion='polite';
    const failure=(error:unknown)=>{feedback.text=String(error instanceof Error?error.message:error);feedback.visibility='visible';};
    const locale=new HYNativeButton({text:preferences().locale==='en'?'English':'中文',icon:'chevronDown'},shaderTheme);
    const shader=new HYNativeButton({text:preferences().shaderLanguage.toUpperCase(),icon:'chevronDown'},shaderTheme);
    const msaa=new Switch();msaa.checked=preferences().msaa;
    const localeField=new HYNativeFormField(locale,{label:t('界面语言')},shaderTheme);
    const msaaField=new HYNativeFormField(msaa,{label:t('开启 MSAA'),description:t('4× 抗锯齿，平滑 3D 预览物体的边缘。'),inline:true},shaderTheme);
    const shaderField=new HYNativeFormField(shader,{label:t('首选 Shader 语言'),description:t('用于新建作品和新代码页签，不修改已有代码。')},shaderTheme);
    body.addChild(localeField);body.addChild(msaaField);body.addChild(shaderField);body.addChild(feedback);
    const refresh=()=>{active?.setTitle(t('设置'),t('关闭'));locale.setPresentation({text:preferences().locale==='en'?'English':'中文',icon:'chevronDown'},shaderTheme);localeField.update({label:t('界面语言')});msaaField.update({label:t('开启 MSAA'),description:t('4× 抗锯齿，平滑 3D 预览物体的边缘。'),inline:true});shaderField.update({label:t('首选 Shader 语言'),description:t('用于新建作品和新代码页签，不修改已有代码。')});};
    const off=onLocaleChange(refresh),pickers=new Set<()=>void>();
    const pick=async(anchor:Button,title:string,options:{value:string;label:string}[],value:string)=>{const picker=hyPickNativeOption(anchor,{title:t(title),theme:shaderTheme,cancelLabel:t('取消'),options,value});pickers.add(picker.cancel);try{return await picker.result;}finally{pickers.delete(picker.cancel);}};
    locale.on('tap',()=>{void pick(locale,'界面语言',[{value:'zh-CN',label:'中文'},{value:'en',label:'English'}],preferences().locale).then(choice=>{if(active&&(choice==='en'||choice==='zh-CN'))savePreferences({locale:choice});}).catch(failure);});
    shader.on('tap',()=>{void pick(shader,'首选 Shader 语言',['WGSL','GLSL','HLSL'].map(label=>({value:label,label})),preferences().shaderLanguage.toUpperCase()).then(choice=>{if(active&&choice&&['WGSL','GLSL','HLSL'].includes(choice)){savePreferences({shaderLanguage:choice.toLowerCase() as 'wgsl'|'glsl'|'hlsl'});shader.setPresentation({text:choice,icon:'chevronDown'},shaderTheme);shaderField.update({label:t('首选 Shader 语言'),description:t('用于新建作品和新代码页签，不修改已有代码。')});}}).catch(failure);});
    let restoring=false;msaa.on('checkedChange',()=>{if(restoring)return;try{savePreferences({msaa:msaa.checked});setMSAA(msaa.checked);}catch(error){restoring=true;msaa.checked=preferences().msaa;restoring=false;failure(error);}});
    active=hyShowNativeOverlay(owner,{title:t('设置'),content:body,theme:shaderTheme,height:510,closeLabel:t('关闭'),returnFocus:gear,onClosed:()=>{off();for(const cancel of pickers)cancel();active=undefined;}});
  });if(!options.inline)owner.actionBar.actionItems.addItem(action);return gear;
}
