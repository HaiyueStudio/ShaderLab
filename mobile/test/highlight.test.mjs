import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
const compile=file=>ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
const tokens={};vm.runInNewContext(compile('../src/highlight-tokens.ts'),{exports:tokens});
function fixture(android=false){
  const listeners=new Map(),observers=new Set(),timers=new Map();let timerId=0;
  const emit=name=>{for(const listener of [...(listeners.get(name)??[])])listener();};
  const notify=(name,object)=>{for(const o of [...observers])if(o.name===name&&o.object===object)o.callback();};
  const center={addObserverForNameObjectQueueUsingBlock(name,object,queue,callback){const o={name,object,callback};observers.add(o);return o;},removeObserver(o){observers.delete(o);}};
  let text='fn mainImage() -> vec4f { return vec4f(1.0); }',composing=false,colors=[],spans=[];
  const selection={location:3,length:0},undo={};
  const storage={beginEditing(){},endEditing(){notify('storage',storage);},addAttributeValueRange(name,color,r){assert.ok(r.location+r.length<=text.length);for(let i=r.location;i<r.location+r.length;i++)colors[i]=color;}};
  const native={get text(){return text;},get markedTextRange(){return composing?{}:null;},textStorage:storage,selectedRange:selection,undoManager:undo};
  for(const name of ['text','attributedText','selectedRange']){const descriptor=Object.getOwnPropertyDescriptor(native,name);Object.defineProperty(native,name,{get:descriptor?.get??(()=>descriptor?.value),set(){throw Error('Highlight must not replace '+name);},configurable:true});}
  const editable={toString:()=>text,length:()=>text.length,getSpans:()=>spans,removeSpan(s){spans=spans.filter(x=>x!==s);},setSpan(s,start,end){assert.ok(end<=text.length);spans.push({...s,start,end});}};
  const editor={ios:native,android:{getText:()=>editable},text,isLoaded:true,on(name,fn){if(!listeners.has(name))listeners.set(name,new Set());listeners.get(name).add(fn);},off(name,fn){listeners.get(name)?.delete(fn);}};
  const exports={};
  vm.runInNewContext(compile('../src/highlight.ts'),{exports,require:name=>name==='@nativescript/core'?{isAndroid:android,Color:class{constructor(color){this.ios=color;this.android=color;}}}:tokens,NSNotificationCenter:{defaultCenter:center},NSOperationQueue:{mainQueue:{}},NSForegroundColorAttributeName:'color',NSTextStorageDidProcessEditingNotification:'storage',UITextViewTextDidChangeNotification:'text',android:{view:{inputmethod:{BaseInputConnection:{getComposingSpanStart:()=>composing?0:-1}}},text:{style:{ForegroundColorSpan:class{static class='foreground';constructor(color){this.color=color;}}},Spannable:{SPAN_EXCLUSIVE_EXCLUSIVE:33}}},setTimeout(fn,delay){const id=++timerId;timers.set(id,{fn,delay});return id;},clearTimeout:id=>timers.delete(id)});
  let language='wgsl';const binding=exports.bindShaderHighlight(editor,()=>language);
  const step=()=>{const entry=timers.entries().next().value;if(!entry)return false;timers.delete(entry[0]);entry[1].fn();return true;};
  const flush=()=>{for(let i=0;step();i++)assert.ok(i<20,'Highlight queued itself indefinitely');};
  return {editor,binding,observers,timers,native,storage,emit,notify,step,flush,
    change(source,{model=true}={}){text=source;colors=Array(text.length).fill('#base');spans=[];if(model){editor.text=source;emit('textChange');}notify('storage',storage);notify('text',native);},
    reset(){colors.fill('#base');notify('storage',storage);},
    setComposing(value){composing=value;},setLanguage(value){language=value;binding.refresh();},
    color(token){return colors[text.indexOf(token)];},get spans(){return spans;},get source(){return text;}};
}
test('iOS native editing and subsequent attribute resets both restore all token colors without replacing source or selection',()=>{
  const f=fixture();f.flush();assert.equal(f.color('fn'),'#c4a5fa');
  const selection=f.native.selectedRange,undo=f.native.undoManager;
  f.change('fn mainImage() -> vec4f { return vec4f(0.5); }');f.flush();assert.equal(f.color('return'),'#c4a5fa');assert.equal(f.color('0.5'),'#efbd85');
  f.reset();assert.equal(f.color('fn'),'#base');f.flush();assert.equal(f.color('fn'),'#c4a5fa');
  assert.equal(f.native.selectedRange,selection);assert.equal(f.native.undoManager,undo);assert.equal(f.timers.size,0);
});
test('iOS IME is left untouched until commit, including commits without another textChange',()=>{
  const f=fixture();f.flush();f.setComposing(true);f.change('// 中文\nfn mainImage() {}');f.step();assert.equal(f.color('fn'),'#base');assert.equal(f.timers.size,1);
  f.setComposing(false);f.flush();assert.equal(f.color('fn'),'#c4a5fa');assert.equal(f.color('中文'),'#748397');assert.equal(f.timers.size,0);
});
test('native buffer leads the model: ranges use actual UTF-16 source after native paste and deletion',()=>{
  const f=fixture();f.flush();const previous=f.editor.text;
  f.change('// 😀\nfn mainImage() { return vec4f(1.0); }',{model:false});f.flush();assert.equal(f.editor.text,previous);assert.equal(f.color('fn'),'#c4a5fa');assert.equal(f.color('1.0'),'#efbd85');
  f.change('fn f() {}',{model:false});f.flush();assert.equal(f.color('fn'),'#c4a5fa');
  f.change('',{model:false});f.flush();assert.equal(f.source,'');
});
test('rapid edits coalesce and WGSL/GLSL/HLSL programmatic replacements keep highlighting',()=>{
  const f=fixture();f.flush();
  for(const [language,code,type] of [['wgsl','fn mainImage() -> vec4f { return vec4f(1.0); }','vec4f'],['glsl','void mainImage(out vec4 color) { color=vec4(1.0); }','vec4'],['hlsl','float4 mainImage(float2 coord) { return float4(1.0,0,0,1); }','float4']]){
    f.setLanguage(language);f.change(code+' ');f.change(code);assert.equal(f.timers.size,1);f.flush();assert.equal(f.color(type),'#8ad9cd');assert.equal(f.color('1.0'),'#efbd85');
  }
});
test('unload and dispose release native observers and pending IME retries; reload restores highlighting',()=>{
  const f=fixture();f.setComposing(true);f.step();assert.equal(f.observers.size,2);f.emit('unloaded');assert.equal(f.observers.size,0);assert.equal(f.timers.size,0);
  f.setComposing(false);f.emit('loaded');f.flush();assert.equal(f.color('fn'),'#c4a5fa');assert.equal(f.observers.size,2);
  f.binding.dispose();f.emit('textChange');f.emit('loaded');f.flush();assert.equal(f.observers.size,0);assert.equal(f.timers.size,0);
});
test('Android defers composing spans then colors committed edits and removes stale colors on deletion',()=>{
  const f=fixture(true);f.flush();assert.ok(f.spans.some(s=>s.color==='#c4a5fa'));
  f.setComposing(true);f.change('float4 mainImage() { return float4(1.0,0,0,1); }');f.step();assert.equal(f.spans.length,0);
  f.setComposing(false);f.flush();assert.ok(f.spans.some(s=>s.color==='#8ad9cd'));assert.equal(f.timers.size,0);
  f.change('// comment');f.flush();assert.equal(f.spans.length,1);assert.equal(f.spans[0].color,'#748397');assert.equal(f.source,'// comment');
});
