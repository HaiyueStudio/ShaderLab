import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

const js=ts.transpileModule(readFileSync(new URL('../src/platform/validation.ts',import.meta.url),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
for(const interrupt of [false,true])test(`performance fixture restores idle policy and observers (interrupted=${interrupt})`,async()=>{
 const exports={},events=new Map(),writes=[],app={idleTimerDisabled:false};let clock=0,scale=1,operations=0;
 const core={isIOS:true,Application:{suspendEvent:'suspend',on:(event,fn)=>events.set(event,fn),off:(event,fn)=>{assert.equal(events.get(event),fn);events.delete(event);}},Device:{os:'test',osVersion:'test',model:'test'},File:{fromPath:()=>({writeText:async text=>{writes.push(JSON.parse(text));}})},knownFolders:{documents:()=>({path:'/test'})},path:{join:(...a)=>a.join('/')}};
 vm.runInNewContext(js,{exports,require:()=>core,UIApplication:{sharedApplication:app},CACurrentMediaTime:()=>clock+=.001,crypto:{randomUUID:()=> 'run'},setTimeout,console});
 await exports.measureNativeEditor({mode:'shared',application:{state:{compile:{status:'ready'}}},disposed:()=>false,
  scale(value){scale=value;operations++;if(interrupt&&operations===3)events.get('suspend')();},frame:async()=>{assert.equal(app.idleTimerDisabled,true);},
  status:()=>({frame:4,ready:true,width:Math.floor(512*scale),height:Math.floor(288*scale)}),surfaceSize:()=>({width:512,height:288}),diagnostics:()=>({})});
 assert.equal(app.idleTimerDisabled,false);assert.equal(events.size,0);
 assert.equal(writes.at(-1).status,interrupt?'failed':'passed');assert.equal(writes.at(-1).foregroundContinuous,!interrupt);
 assert.equal(operations,interrupt?3:100);if(!interrupt)assert.equal(writes.at(-1).intervals.length,120);
});
