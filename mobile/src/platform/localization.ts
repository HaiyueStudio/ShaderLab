import {Button,Label} from '@nativescript/core';
import {t,onLocaleChange} from '../../../shared/dist/views/i18n.js';

type Entry={view:WeakRef<object>;property:string;source:string;values:Record<string,string|number>;last:string};
const entries=new Set<Entry>(),bindings=new WeakMap<object,Map<string,Entry>>();
const collected=new FinalizationRegistry<Entry>(entry=>entries.delete(entry));
function refresh(entry:Entry){
  const view=entry.view.deref() as Record<string,unknown>|undefined;if(!view){entries.delete(entry);return;}
  // NativeScript can retain JS wrappers after disposing a Page's controller.
  // Writing its ActionBar title then dereferences a null navigationItem.
  // Back-stack views catch up through their next loaded event instead.
  if(view.isLoaded===false||(view.page as {isLoaded?:boolean}|undefined)?.isLoaded===false)return;
  if(entry.property!=='text'||view[entry.property]===entry.last){entry.last=t(entry.source,entry.values);view[entry.property]=entry.last;}
}
/** Retained back-stack pages update too; dynamic text and user edits are never overwritten. */
export function localizedProperty<T extends object>(view:T,property:keyof T,source:string,values:Record<string,string|number>={}) {
  let properties=bindings.get(view);if(!properties){
    properties=new Map();bindings.set(view,properties);
    const lifecycle=view as T&{on?:(event:string,callback:()=>void)=>void};
    lifecycle.on?.('loaded',()=>{for(const entry of bindings.get(view)?.values()??[])refresh(entry);});
  }
  const key=String(property),previous=properties.get(key);if(previous){entries.delete(previous);collected.unregister(previous);}
  const last=t(source,values);(view as Record<string,unknown>)[key]=last;
  const entry:Entry={view:new WeakRef(view),property:key,source,values,last};properties.set(key,entry);entries.add(entry);collected.register(view,entry,entry);return view;
}
export function localizedNativeText<V extends Label|Button>(view:V,source:string,accessibility=source,values:Record<string,string|number>={}):V {
  localizedProperty(view,'text',source,values);
  if(view instanceof Button)localizedProperty(view,'accessibilityLabel',accessibility,values);
  return view;
}
onLocaleChange(()=>{for(const entry of entries)refresh(entry);});
