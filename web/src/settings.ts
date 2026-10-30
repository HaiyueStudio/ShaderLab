import {SHADER_LANGUAGES,LANGUAGE_LABELS,type ShaderLanguage as SupportedShaderLanguage} from './model.js';
import { t, getLocale, onLocaleChange,LOCALE_OPTIONS } from '../../shared/dist/views/i18n.js';
import {isLocale} from '../../shared/dist/domain/locales.js';
import { preferences, savePreferences } from './preferences.js';
import type { HYSelect, HYCheckbox } from '@haiyue/ui';

/** Capture only authored UI present at startup, before user projects are mounted. */
export function localizeStaticUI(root:HTMLElement=document.body) {
  const texts:{node:Text;source:string}[]=[],attrs:{node:Element;name:string;source:string}[]=[];
  const dynamic='#compile-state,#diagnostics,#diagnostics-count,#channel-kinds,#time-label,#fps-label,#resolution-label,#notice-text,#project-count,#gpu-message';
  const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);
  while(walker.nextNode()){const node=walker.currentNode as Text;if(!node.parentElement?.closest('script,style,'+dynamic)&&node.textContent?.trim())texts.push({node,source:node.textContent});}
  for(const node of [root,...root.querySelectorAll('*')])for(const name of ['aria-label','title','placeholder','label','alt'])if(node.hasAttribute(name))attrs.push({node,name,source:node.getAttribute(name)!});
  const apply=()=>{document.documentElement.lang=getLocale();for(const {node,source} of texts)if(node.isConnected){const trim=source.trim(),text=source.replace(trim,t(trim));if(node.textContent!==text)node.textContent=text;}for(const {node,name,source} of attrs)if(node.isConnected&&node.getAttribute(name)!==t(source))node.setAttribute(name,t(source));};
  apply();return onLocaleChange(apply);
}
export function initializeSettings(setMSAA:(enabled:boolean)=>void) {
  const dialog=document.getElementById('settings-dialog') as HTMLDialogElement;
  const language=document.getElementById('settings-locale') as HYSelect,shader=document.getElementById('settings-shader-language') as HYSelect,msaa=document.getElementById('settings-msaa') as HYCheckbox;
  language.options=LOCALE_OPTIONS.map(option=>({...option}));shader.options=SHADER_LANGUAGES.map(value=>({value,label:LANGUAGE_LABELS[value]}));
  const sync=()=>{const value=preferences();language.value=value.locale;shader.value=value.shaderLanguage;msaa.checked=value.msaa;};
  const save=(patch:Parameters<typeof savePreferences>[0])=>{try{if(patch.msaa!==undefined)setMSAA(patch.msaa);savePreferences(patch);document.getElementById('settings-message')!.textContent=t('设置已保存');}catch(error){sync();setMSAA(preferences().msaa);document.getElementById('settings-message')!.textContent=t('无法保存设置')+': '+String(error instanceof Error?error.message:error);}};
  let pressedBackdrop=false;
  const outside=(event:MouseEvent)=>{const rect=dialog.getBoundingClientRect();return event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom;};
  const pointerDown=(event:PointerEvent)=>{pressedBackdrop=event.target===dialog&&outside(event);};
  const pointerCancel=()=>{pressedBackdrop=false;};
  const backdropClick=(event:MouseEvent)=>{if(pressedBackdrop&&event.target===dialog&&outside(event))dialog.close();pressedBackdrop=false;};
  dialog.addEventListener('pointerdown',pointerDown);dialog.addEventListener('pointercancel',pointerCancel);dialog.addEventListener('click',backdropClick);
  const show=()=>{pressedBackdrop=false;sync();document.getElementById('settings-message')!.textContent='';dialog.showModal();};
  document.getElementById('settings-button')!.addEventListener('click',show);
  document.getElementById('settings-close')!.addEventListener('click',()=>dialog.close());
  language.addEventListener('value-change',()=>{if(isLocale(language.value))save({locale:language.value});});
  shader.addEventListener('value-change',()=>save({shaderLanguage:shader.value as SupportedShaderLanguage}));
  msaa.addEventListener('checked-change',()=>save({msaa:msaa.checked}));
  sync();return ()=>{dialog.removeEventListener('pointerdown',pointerDown);dialog.removeEventListener('pointercancel',pointerCancel);dialog.removeEventListener('click',backdropClick);dialog.close();};
}
