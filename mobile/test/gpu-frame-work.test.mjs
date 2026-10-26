import {FRAME_BYTES,FRAME_FLOATS,parameterData} from '../../shared/dist/domain/parameters.js';
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';
import {FrameRate} from '../../shared/dist/views/frame-rate.js';
const load=(file,require)=>{const exports={};vm.runInNewContext(ts.transpileModule(readFileSync(new URL(file,import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText,{exports,require});return exports;};
const {KeyboardState}=load('../../web/src/keyboardTexture.ts',()=>({}));
function fixture(optimized=true, embedded=false){
 const noop=class{},writes=[],submissions=[],encoders=[],outputs=[];
 const fake={FRAME_BYTES,FRAME_FLOATS,parameterData,cameraFacing:()=>null,SphericalTransform3D:noop,BasicMaterial:noop,KeyboardState,LiveCamera:class{read(){return null;}configure(){}},createSphere3D:()=>({}),createBox3D:()=>({}),createTorus3D:()=>({})};
 const {NativeShaderRuntime}=load('../src/gpu-runtime.ts',name=>name.endsWith('/frame-rate.js')?{FrameRate}:fake);
 const device={features:new Set(),queue:{writeTexture(d,data){writes.push({kind:'keys',data:Uint8Array.from(data)});},writeBuffer(b,o,data){writes.push({kind:b.name,data:Array.from(data)});},submit(buffers){submissions.push(buffers);}},createCommandEncoder(){const record=[];encoders.push(record);return {beginRenderPass(d){record.push(d);return {setPipeline(){},setBindGroup(){},draw(){},end(){}};},finish(){return record;}};}};
 const engine={device,width:512,height:288,getOutputView:()=> 'screen'};
 const runtime=new NativeShaderRuntime(engine,()=>{},{},undefined,embedded?{size:()=>({width:512,height:288}),output:t=>outputs.push(t)}:undefined);
 runtime.profiler={begin(){},pass(){return{};},resolveInto(){},endPass(){},submitted(){}};runtime.optimizeFrameWork=optimized;runtime.resize=()=>{};runtime.width=512;runtime.height=288;
 runtime.keys={texture:{}};runtime.presentSize={name:'present'};
 runtime.active={project:{},passes:[{pass:{id:'image',channels:Array.from({length:4},()=>({kind:'none'}))},uniform:{name:'frame'},pipeline:{},group:{}}],videos:new Map()};
 runtime.targets.set('image',[{view:'a',texture:'ta'},{view:'b',texture:'tb'}]);runtime.inputs=()=>Array.from({length:4},()=>({width:1,height:1}));runtime.bindInputs=()=>({});runtime.bindOutput=()=>({});
 return {runtime,engine,writes,submissions,encoders,outputs};
}
test('static preview skips keyboard/size uploads and combines Canvas graph/present without dropping passes',()=>{
 for(const optimized of [false,true]){
  const f=fixture(optimized);for(let i=0;i<100;i++)f.runtime.render(1/60);
  assert.equal(f.writes.filter(x=>x.kind==='keys').length,optimized?1:100);
  assert.equal(f.writes.filter(x=>x.kind==='present').length,optimized?1:100);
  assert.equal(f.writes.filter(x=>x.kind==='frame').length,100);
  assert.equal(f.encoders.length,optimized?100:200);assert.equal(f.submissions.length,optimized?100:200);
  const passes=f.submissions.flat(2);assert.equal(passes.length,200);
  for(let i=0;i<100;i++){assert.equal(passes[i*2].colorAttachments[0].view,i%2?'a':'b');assert.equal(passes[i*2+1].colorAttachments[0].view,'screen');}
  f.engine.width=768;f.runtime.render(1/60);assert.equal(f.writes.filter(x=>x.kind==='present').at(-1).data[0],768);
 }
});
test('keyboard cache preserves pressed pulse, held, toggle, release, reset and repeated-key semantics',()=>{
 const f=fixture(),k=f.runtime.keyboard;const pixels=()=>f.writes.filter(x=>x.kind==='keys').at(-1).data;
 const key=65,held=2*1024+key*4,pressed=1024+key*4,toggle=key*4;
 f.runtime.render(1/60);assert.equal(k.down(key),true);assert.equal(k.down(key),false);
 f.runtime.render(1/60);assert.equal(pixels()[held],255);assert.equal(pixels()[pressed],255);assert.equal(pixels()[toggle],255);
 f.runtime.render(1/60);assert.equal(pixels()[held],255);assert.equal(pixels()[pressed],0);
 const count=f.writes.length;f.runtime.render(1/60);assert.equal(f.writes.length-count,1);
 k.up(key);f.runtime.render(1/60);assert.equal(pixels()[held],0);assert.equal(pixels()[toggle],255);
 k.down(key);k.up(key);f.runtime.render(1/60);assert.equal(pixels()[pressed],255);assert.equal(pixels()[held],0);assert.equal(pixels()[toggle],0);
 k.release();f.runtime.render(1/60);assert.equal(pixels()[pressed],0);
 k.down(key);f.runtime.render(1/60);k.reset();f.runtime.render(1/60);assert.equal(pixels()[toggle],0);
});
test('embedded/scene output keeps graph submission and paused Canvas still presents',()=>{
 const f=fixture(true,true);for(let i=0;i<5;i++)f.runtime.render(1/60);
 assert.equal(f.submissions.length,5);assert.equal(f.submissions.flat(2).length,5);assert.equal(f.outputs.length,5);assert.equal(f.writes.filter(x=>x.kind==='present').length,0);
 const s=fixture();s.runtime.mode='scene';s.runtime.render(1/60);assert.equal(s.submissions.length,1);assert.equal(s.submissions.flat(2).length,1);
 const p=fixture();p.runtime.render(1/60);p.runtime.playing=false;p.runtime.render(1/60);assert.equal(p.runtime.frame,1);assert.equal(p.submissions.at(-1)[0].length,1);
});

test('manual export frames only submit offscreen work and never acquire a surface outside the host frame',()=>{const f=fixture();f.runtime.reset=()=>{f.runtime.frame=0;f.runtime.time=0;};f.engine.getOutputView=()=>{throw Error('Surface unavailable outside host frame');};f.runtime.renderExportFrame(0,15);f.runtime.renderExportFrame(1,15);assert.equal(f.submissions.length,2);assert.equal(f.submissions.flat(2).length,2);assert.equal(f.runtime.frame,2);assert.equal(f.runtime.offscreenRendering,false);});
test('GPU preparation keeps demand rendering alive until every overlapping request settles',async()=>{const f=fixture(),states=[],complete=[];f.runtime.requestFrame=()=>states.push(f.runtime.hasPendingGpuWork);f.runtime.prepareSnapshot=()=>new Promise((resolve,reject)=>complete.push({resolve,reject}));const a=f.runtime.prepareOwnedSnapshot({}),b=f.runtime.prepareOwnedSnapshot({});assert.equal(f.runtime.hasPendingGpuWork,true);complete[0].resolve('a');assert.equal(await a,'a');assert.equal(f.runtime.hasPendingGpuWork,true);complete[1].reject(Error('invalid pipeline'));await assert.rejects(b,/invalid pipeline/);assert.equal(f.runtime.hasPendingGpuWork,false);assert.deepEqual(states,[true,true,true,false]);});
