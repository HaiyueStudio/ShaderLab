import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const compiled=ts.transpileModule(readFileSync(new URL('../src/compiler.ts',import.meta.url),'utf8'),{
 compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS},
}).outputText;
function setup(isAndroid=true){
 const browsers=[],calls=[];
 class GridLayout {
  children=[];
  addChild(view){this.children.push(view);}
  removeChild(view){this.children.splice(this.children.indexOf(view),1);view.destroyed++;}
 }
 class WebView {
  static loadFinishedEvent='loadFinished';
  destroyed=0;stopped=0;hold=false;
  constructor(){browsers.push(this);}
  once(_event,callback){this.loaded=callback;}
  off(){this.loaded=undefined;}
  stopLoading(){this.stopped++;}
  reply(script,callback){calls.push(script);if(this.hold){this.delayed=callback;return;}
   callback(script.includes('.take(')?JSON.stringify({code:'converted',diagnostics:[],warnings:[]}):'');}
  android={evaluateJavascript:(script,callback)=>this.reply(script,value=>callback.onReceiveValue(JSON.stringify(value)))};
  ios={evaluateJavaScriptCompletionHandler:(script,callback)=>this.reply(script,value=>callback(value,null))};
 }
 const exports={};
 vm.runInNewContext(compiled,{exports,require:()=>({GridLayout,WebView,isAndroid}),setTimeout,clearTimeout,
  android:{webkit:{ValueCallback:class{constructor(callback){Object.assign(this,callback);}}}}});
 return {compiler:new exports.MobileCompiler(),browsers,calls};
}
const settle=async()=>{for(let i=0;i<10;i++)await Promise.resolve();};

test('opening and disposing ordinary editors never creates a converter WebView',async()=>{
 for(let i=0;i<50;i++){
  const {compiler,browsers}=setup();assert.equal(browsers.length,0);
  compiler.dispose();compiler.dispose();assert.equal(browsers.length,0);
  await assert.rejects(compiler.hlsl('code'),/转换服务已关闭/);
 }
});
for(const isAndroid of [true,false])test(`converter loads once on demand and detaches on ${isAndroid?'Android':'iOS'}`,async()=>{
 const {compiler,browsers,calls}=setup(isAndroid);
 const first=compiler.translate('wgsl',{});assert.equal(browsers.length,1);
 assert.equal(browsers[0].src,'~/compiler/index.html');browsers[0].loaded({});
 assert.equal((await first).code,'converted');assert.equal((await compiler.hlsl('hlsl')).code,'converted');
 assert.equal(browsers.length,1);assert.ok(calls.some(s=>s.includes('.start(')));assert.ok(calls.some(s=>s.includes('.hlsl(')));
 compiler.dispose();compiler.dispose();assert.equal(browsers[0].destroyed,1);assert.equal(browsers[0].stopped,1);
 assert.equal(compiler.view.children.length,0);
});
test('dispose cancels a pending load and removes its callback',async()=>{
 const {compiler,browsers}=setup();const job=compiler.hlsl('code');
 compiler.dispose();await assert.rejects(job,/转换服务已关闭/);
 assert.equal(browsers[0].loaded,undefined);assert.equal(browsers[0].destroyed,1);
});
test('dispose settles an outstanding native evaluation even when native callback never arrives',async()=>{
 const {compiler,browsers}=setup();const job=compiler.hlsl('code');
 browsers[0].hold=true;browsers[0].loaded({});await settle();assert.ok(browsers[0].delayed);
 compiler.dispose();await assert.rejects(job,/转换服务已关闭/);
 browsers[0].delayed('');assert.equal(browsers[0].destroyed,1);
});
