import {SHADER_LANGUAGES,LANGUAGE_LABELS,type ShaderLanguage as SupportedShaderLanguage} from '../project';
import {HYNativeButton,HYNativeFormField,hyPickNativeOption,hyShowNativeOverlay,type HYNativeOverlayHandle} from '@haiyue/native/ui';
import { ActionItem, Page, StackLayout, ScrollView, Label, Button, Switch, Dialogs, Color } from '@nativescript/core';
import { preferences, savePreferences } from '../preferences';
import { t, onLocaleChange,LOCALE_OPTIONS,localeLabel } from '../../../shared/dist/views/i18n.js';
import {isLocale} from '../../../shared/dist/domain/locales.js';
import { shaderAppearance,shaderTheme } from '../../../shared/dist/views/presentation.js';
import {installSettingsReview} from './settings-review';
import {localizedNativeText} from './localization';
export {localizedNativeText} from './localization';
export function installNativeSettings(owner:Page,setMSAA:(value:boolean)=>void=()=>{},options:{inline?:boolean}={}) {
  let active:HYNativeOverlayHandle|undefined;
  const action=new ActionItem(),gear=new HYNativeButton({text:'',icon:'settings',variant:'quiet',a11y:{label:t('设置')}},shaderTheme);gear.width=44;gear.height=44;localizedNativeText(gear,'','设置');gear.id=gear.accessibilityIdentifier='app-settings';if(!options.inline){action.actionView=gear;action.ios.position='right';}
  gear.on('tap',()=>{
    if(active)return;
    const body=new StackLayout();body.padding=20;
    const feedback=new Label();feedback.textWrap=true;feedback.color=new Color(shaderTheme.color.danger);feedback.visibility='collapse';feedback.accessibilityLiveRegion='polite';
    const failure=(error:unknown)=>{feedback.text=String(error instanceof Error?error.message:error);feedback.visibility='visible';};
    const locale=new HYNativeButton({text:localeLabel(preferences().locale),icon:'chevronDown'},shaderTheme);
    const shader=new HYNativeButton({text:LANGUAGE_LABELS[preferences().shaderLanguage],icon:'chevronDown'},shaderTheme);
    locale.id=locale.accessibilityIdentifier='settings-locale';shader.id=shader.accessibilityIdentifier='settings-shader';
    const msaa=new Switch();msaa.checked=preferences().msaa;
    const localeField=new HYNativeFormField(locale,{label:t('界面语言')},shaderTheme);
    const msaaField=new HYNativeFormField(msaa,{label:t('开启 MSAA'),description:t('4× 抗锯齿，平滑 3D 预览物体的边缘。'),inline:true},shaderTheme);
    const shaderField=new HYNativeFormField(shader,{label:t('首选 Shader 语言'),description:t('用于新建作品和新代码页签，不修改已有代码。')},shaderTheme);
    body.addChild(localeField);body.addChild(msaaField);body.addChild(shaderField);body.addChild(feedback);
    const refresh=()=>{active?.setTitle(t('设置'),t('关闭'));locale.setPresentation({text:localeLabel(preferences().locale),icon:'chevronDown'},shaderTheme);localeField.update({label:t('界面语言')});msaaField.update({label:t('开启 MSAA'),description:t('4× 抗锯齿，平滑 3D 预览物体的边缘。'),inline:true});shaderField.update({label:t('首选 Shader 语言'),description:t('用于新建作品和新代码页签，不修改已有代码。')});};
    const off=onLocaleChange(refresh),pickers=new Set<()=>void>();
    const pick=async(anchor:Button,title:string,options:{value:string;label:string}[],value:string)=>{const picker=hyPickNativeOption(anchor,{title:t(title),theme:shaderTheme,cancelLabel:t('取消'),options,value});pickers.add(picker.cancel);try{return await picker.result;}finally{pickers.delete(picker.cancel);}};
    locale.on('tap',()=>{void pick(locale,'界面语言',LOCALE_OPTIONS.map(option=>({...option})),preferences().locale).then(choice=>{if(active&&isLocale(choice))savePreferences({locale:choice});}).catch(failure);});
    shader.on('tap',()=>{void pick(shader,'首选 Shader 语言',SHADER_LANGUAGES.map(value=>({value:LANGUAGE_LABELS[value],label:LANGUAGE_LABELS[value]})),LANGUAGE_LABELS[preferences().shaderLanguage]).then(choice=>{if(active&&choice&&SHADER_LANGUAGES.some(value=>LANGUAGE_LABELS[value]===choice)){savePreferences({shaderLanguage:choice.toLowerCase() as SupportedShaderLanguage});shader.setPresentation({text:choice,icon:'chevronDown'},shaderTheme);shaderField.update({label:t('首选 Shader 语言'),description:t('用于新建作品和新代码页签，不修改已有代码。')});}}).catch(failure);});
    let restoring=false;msaa.on('checkedChange',()=>{if(restoring)return;try{savePreferences({msaa:msaa.checked});setMSAA(msaa.checked);}catch(error){restoring=true;msaa.checked=preferences().msaa;restoring=false;failure(error);}});
    active=hyShowNativeOverlay(owner,{title:t('设置'),content:body,theme:shaderTheme,height:510,closeLabel:t('关闭'),returnFocus:gear,onClosed:()=>{off();for(const cancel of pickers)cancel();active=undefined;}});
  });if(!options.inline)owner.actionBar.actionItems.addItem(action);installSettingsReview(owner,gear,()=>active?.page);return gear;
}
