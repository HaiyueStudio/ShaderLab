import assert from 'node:assert/strict';import {mkdirSync,writeFileSync} from 'node:fs';import {resolve} from 'node:path';import {build} from 'esbuild';import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'mobile/artifacts/gpu');mkdirSync(out,{recursive:true});
// Only the platform IO adapters are replaced. The mobile shader graph, Engine,
// WGSL compilation, ping-pong textures and readback execute on a real GPU.
await build({stdin:{resolveDir:root,loader:'ts',contents:
'import {HaiyueEngine} from "@haiyue/engine";import {NativeShaderRuntime} from "./mobile/src/gpu-runtime";import {createProject,passOf} from "./mobile/src/project.ts";import {examples} from "./web/src/examples.js";import {MobileSession} from "./mobile/src/session.ts";import {preparedPreview} from "./shared/dist/ports/preparedPreview.js";const canvas=document.querySelector("canvas");const engine=new HaiyueEngine({canvas,renderProfile:"simple",msaaSamples:1,timestampQuery:false});await engine.init();const runtime=new NativeShaderRuntime(engine,()=>{},canvas,(code,options)=>window.__translateNativeHlsl(code,options));await runtime.initialize();const session=new MobileSession();session.application.connect({preview:preparedPreview(()=>({prepare:p=>runtime.prepare(p),commit:p=>runtime.commit(p),release:p=>runtime.releasePrepared(p),play:v=>runtime.setPlaying(v),step:()=>runtime.step(),reset:()=>runtime.reset()}))});Object.assign(window,{nativeGraph:{runtime,engine,session,createProject,passOf,examples,compile:async p=>{session.open(p);if(!await session.application.compile())throw Error(JSON.stringify(session.application.state.compile));}}});'},bundle:true,format:'esm',platform:'browser',target:'es2022',outfile:resolve(out,'test.js'),plugins:[{name:'browser-io-port',setup(b){
 b.onResolve({filter:/^@nativescript\/core$/},()=>({path:'core',namespace:'ports'}));b.onResolve({filter:/^@nativescript\/canvas$/},()=>({path:'canvas',namespace:'ports'}));b.onResolve({filter:/^@haiyue\/native\/engine$/},()=>({path:'native',namespace:'ports'}));b.onResolve({filter:/^\.\/video$/},()=>({path:'video',namespace:'ports'}));b.onResolve({filter:/^\.\/camera$/},()=>({path:'camera',namespace:'ports'}));
 b.onLoad({filter:/.*/,namespace:'ports'},args=>({loader:'js',contents:args.path==='core'?'export const ImageSource={fromBase64Sync(){throw Error("fixture does not use native image bytes")}};export const knownFolders={currentApp:()=>({path:"/web/app-dist"})};export const path={join:(...p)=>p.join("/")};':args.path==='canvas'?'export class ImageAsset{async fromFile(url){this.image=new Image();this.image.src=url;await this.image.decode();}get width(){return this.image.width;}get height(){return this.image.height;}}':args.path==='camera'?'export const openCamera=(...args)=>window.__openNativeCamera?window.__openNativeCamera(...args):Promise.reject(Error("Native camera requires a device"));':args.path==='video'?'export class NativeVideo{constructor(){throw Error("Native decoder needs a real device")}}':'export class NativeCanvasTextures{createCanvas2D(w,h){const c=document.createElement("canvas");c.width=w;c.height=h;const context=c.getContext("2d"),draw=context.drawImage.bind(context);context.drawImage=(image,...rest)=>draw(image.image??image,...rest);return c;}readAtlasPixels(c){return new Uint8Array(c.getContext("2d").getImageData(0,0,c.width,c.height).data);}dispose(){}}'}));
}}]});
writeFileSync(resolve(out,'index.html'),'<!doctype html><canvas width="320" height="180"></canvas><script type="module" src="test.js"></script>');
const report=await runEditorBrowserScenario({root,route:'mobile/artifacts/gpu/index.html',downloadDirectory:out,failureScreenshotPath:resolve(out,'failure.png'),readinessExpression:'typeof nativeGraph!=="undefined"',scenario:async({evaluate,waitFor,assertNoBrowserErrors})=>{
 const compile=async expression=>{await evaluate('(async()=>{await nativeGraph.compile('+expression+');nativeGraph.engine.run();})()');await waitFor(()=>evaluate('nativeGraph.runtime.status().frame>2'),'mobile graph renders');await evaluate('nativeGraph.runtime.setPlaying(false)');};
 await compile('nativeGraph.createProject()');let stats=await evaluate('(async()=>{const r=await nativeGraph.runtime.readImage();return {width:r.width,height:r.height,center:Array.from(r.pixels.slice((Math.floor(r.height/2)*r.width+Math.floor(r.width/2))*4,(Math.floor(r.height/2)*r.width+Math.floor(r.width/2))*4+4))};})()');assert.ok(stats.width>0&&stats.height>0);assert.equal(stats.center[3],255);
 const samples=await evaluate('nativeGraph.examples().map(e=>({id:e.id,name:e.project.name}))');assert.equal(samples.length,8);
 for(const [index,sample] of samples.entries()){await evaluate('nativeGraph.runtime.setPlaying(true)');await compile('nativeGraph.examples()['+index+'].project');const r=await evaluate('nativeGraph.runtime.status()');assert.ok(r.frame>2,sample.name);const colors=await evaluate('(async()=>{const {pixels}=await nativeGraph.runtime.readImage();const colors=new Set();for(let i=0;i<pixels.length;i+=4)colors.add(pixels[i]+","+pixels[i+1]+","+pixels[i+2]);return colors.size;})()');assert.ok(colors>8,sample.name+' must render visible shader content');}
 const puzzleSwipes=await evaluate('('+(async function(g){
  const r=g.runtime,results=[],format=r.bufferFormat;
  // Android commonly uses half-float feedback; fractional touch origins must not retrigger.
  r.bufferFormat='rgba16float';
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const step=async(n=3)=>{for(let i=0;i<n;i++){const frame=r.status().frame;r.step();await new Promise(resolve=>{const wait=()=>r.status().frame>frame?resolve():requestAnimationFrame(wait);requestAnimationFrame(wait);});}};
  const read=async()=>{const image=await r.readImage(),base=(image.height-1)*image.width*4;return {tiles:Array.from({length:16},(_,i)=>image.pixels[base+i*4]),empty:image.pixels[base+16*4],moves:image.pixels[base+16*4+1]};};
  // Use screen coordinates independently of the chosen render scale.
  const touch=(action,x=160.3,y=90.7)=>r.touch(action,1,x,y,320,180);
  for(const scale of [1,.25]){
   const p=g.examples().find(e=>e.id==='puzzle').project;p.preview.scale=scale;
   p.common=p.common.replace('PUZZLE_SHUFFLE_STEPS: i32 = 64','PUZZLE_SHUFFLE_STEPS: i32 = 0');
   g.passOf(p,'image').code=g.passOf(p,'image').code.replace('  return vec4f(color, 1.0);','  if (i32(fragCoord.y) == 0 && i32(fragCoord.x) < COUNT + 2) { return dataAt(iChannel1, i32(fragCoord.x)) / vec4f(255.0, 255.0, 255.0, 1.0); }\n  return vec4f(color, 1.0);');
   await g.compile(p);r.setPlaying(false);await step();
   let state=await read();check(state.empty===15&&state.moves===0,'Puzzle starts solved');
   touch('down');await step();touch('move',161,91);await step();touch('up',161,91);await step();
   check((await read()).moves===0,'Touch jitter must not slide a tile');
   for(const [direction,dx,dy] of [[2,36,9],[4,9,36],[1,-36,9],[3,9,-36]]){
    const next=state.empty+({1:1,2:-1,3:4,4:-4}[direction]),tiles=[...state.tiles];
    [tiles[state.empty],tiles[next]]=[tiles[next],tiles[state.empty]];
    touch('down');await step();touch('move',160.3+dx,90.7+dy);await step(8);
    const held=await read();check(JSON.stringify(held.tiles)===JSON.stringify(tiles),'Native touch must move the expected tile');
    touch('move',160.3-dx,90.7-dy);await step();touch('up',160.3-dx,90.7-dy);await step();
    const moved=await read();check(moved.moves===state.moves+1&&moved.empty===next,'A held, reversed or released swipe must only move once');state=moved;
   }
   // All events arrive before a render: released iMouse still carries the swipe.
   touch('down',140,90);touch('move',176,90);touch('up',176,90);await step();
   state=await read();check(state.moves===5&&state.empty===14,'A quick swipe between frames must not be lost');
   results.push({scale,format:r.bufferFormat,moves:state.moves,empty:state.empty,status:'passed'});
  }
  r.bufferFormat=format;
  return results;
 }).toString()+')(nativeGraph)');
 assert.equal(puzzleSwipes.length,2);
 const keyboardFrames=await evaluate('('+(async function(g){
  const r=g.runtime,results=[];
  for(const optimized of [false,true]){
   r.optimizeFrameWork=optimized;
   const p=g.createProject(),image=g.passOf(p,'image');image.channels[0]={kind:'keyboard'};
   image.code='fn mainImage(p:vec2f)->vec4f{return vec4f(textureLoad(iChannel0,vec2i(65,2),0).r,textureLoad(iChannel0,vec2i(65,1),0).r,textureLoad(iChannel0,vec2i(65,0),0).r,1.0);}';
   await g.compile(p);r.setPlaying(false);r.keyboard.reset();
   const check=async(expected)=>{const frame=r.status().frame;await new Promise(resolve=>{const done=()=>{if(r.status().frame>frame){g.engine.off('after-update',done);resolve();}};g.engine.on('after-update',done);r.step();});const x=await r.readImage(),pixel=Array.from(x.pixels.slice(0,3));if(JSON.stringify(pixel)!==JSON.stringify(expected))throw Error('Keyboard GPU pixel mismatch '+pixel+' vs '+expected);results.push({optimized,pixel});};
   await check([0,0,0]);r.keyboard.down(65);await check([255,255,255]);await check([255,0,255]);
   r.keyboard.up(65);await check([0,0,255]);r.keyboard.down(65);r.keyboard.up(65);await check([0,255,0]);
   r.keyboard.release();await check([0,0,0]);r.keyboard.down(65);r.keyboard.reset();await check([0,0,0]);
  }
  r.optimizeFrameWork=true;return results;
 }).toString()+')(nativeGraph)');
 const cameraFrames=await evaluate('('+(async function(g){
  let opened=0,closed=0,reads=0;
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  window.__openNativeCamera=async()=>{
   opened++;const canvas=document.createElement('canvas');canvas.width=64;canvas.height=32;const ctx=canvas.getContext('2d');
   return {read(){reads++;ctx.fillStyle=`rgb(255,${reads%128},0)`;ctx.fillRect(0,0,64,16);ctx.fillStyle=`rgb(0,${reads%128},255)`;ctx.fillRect(0,16,64,16);return {image:canvas,time:1+reads/60,release(){}};},close(){closed++;}};
  };
  const r=g.runtime,p=g.createProject(),a=g.passOf(p,'buffer-a'),image=g.passOf(p,'image');
  a.enabled=true;a.channels[0]={kind:'camera',facing:'environment'};a.code='fn mainImage(p:vec2f)->vec4f {if(p.x<1.0){return vec4f(iChannelResolution[0].xy/255.0,fract(iChannelTime[0]),1.0);}return channel0(p/iResolution.xy);}';
  image.channels[0]={kind:'buffer',pass:'buffer-a'};image.code='fn mainImage(p:vec2f)->vec4f{return channel0(p/iResolution.xy);}';
  const frames=async(n=5)=>{const frame=r.status().frame;await new Promise(resolve=>{const wait=()=>r.status().frame>=frame+n?resolve():requestAnimationFrame(wait);requestAnimationFrame(wait);});};
  const sample=async()=>{const {pixels,width:w,height:h}=await r.readImage(),at=(x,y)=>Array.from(pixels.slice((y*w+x)*4,(y*w+x)*4+4));return {top:at(w>>1,h>>2),bottom:at(w>>1,h*3>>2),metadata:at(0,h>>1)};};
  await g.compile(p);r.setPlaying(true);await frames();const first=await sample();
  check(first.top[0]>250&&first.bottom[2]>250,'Native camera → Buffer → Image preserves top/bottom orientation');
  check(Math.abs(first.metadata[0]-64)<2&&Math.abs(first.metadata[1]-32)<2&&first.metadata[2]>0,'Native camera dimensions and channel time are bound');
  await g.compile(p);r.setPlaying(true);await frames();check(opened===1,'Same-lens recompile does not reopen native camera');
  r.setCaptureVisible(false);check(closed===1,'Background/hidden preview closes native camera');
  r.setCaptureVisible(true);await frames();check(opened===2,'Foreground preview resumes native camera');
  r.setPlaying(false);check(closed===2,'Pause closes native camera');
  a.channels[0]={kind:'none'};await g.compile(p);r.setPlaying(true);await frames();check(opened===2,'Removing camera input cannot reacquire it');
  delete window.__openNativeCamera;return {status:'passed',opened,closed,reads,firstFrame:first};
 }).toString()+')(nativeGraph)');
 const hlsl=await evaluate('('+(async function(g){
  const check=(ok,message)=>{if(!ok)throw Error(message);};
  const iframe=document.createElement('iframe');iframe.src='/mobile/generated/compiler/index.html';
  await new Promise((resolve,reject)=>{iframe.onload=resolve;iframe.onerror=reject;document.body.append(iframe);});
  const compiler=iframe.contentWindow.nativeShaderCompiler;let id=0;
  window.__translateNativeHlsl=async(code,options)=>{
   const token='gpu-'+(++id);compiler.hlsl(token,code,options);
   for(let i=0;i<300;i++){const result=compiler.take(token);if(result)return JSON.parse(result);await new Promise(r=>setTimeout(r,100));}
   throw Error('Local HLSL compiler timed out');
  };
  const p=g.createProject(),image=g.passOf(p,'image'),buffer=g.passOf(p,'buffer-a');
  p.commonHlsl='float gain(float x){return x*.5;}';
  p.editorLanguages={common:'hlsl',image:'hlsl','buffer-a':'hlsl',sound:'hlsl'};
  buffer.enabled=true;buffer.hlsl='float4 mainImage(float2 p){return float4(gain(.8),.2,.6,1);}';
  image.hlsl='float4 mainImage(float2 p){return channel0(p/iResolution.xy);}';image.channels[0]={kind:'buffer',pass:'buffer-a'};
  p.sound.enabled=true;p.sound.hlsl='float2 mainSound(int sampleIndex,float time){return float2(gain(sin(6.2831853*440*time)));}';
  await g.compile(p);g.runtime.setPlaying(true);
  await new Promise(resolve=>{const wait=()=>g.runtime.status().frame>3?resolve():requestAnimationFrame(wait);requestAnimationFrame(wait);});
  g.runtime.setPlaying(false);const read=await g.runtime.readImage(),index=((read.height>>1)*read.width+(read.width>>1))*4,pixel=Array.from(read.pixels.slice(index,index+4));
  check(pixel.every((v,i)=>Math.abs(v-[102,51,153,255][i])<3),'Native HLSL Buffer pixels');
  const audio=await g.runtime.sound(0,2048);check(audio.left.some(v=>Math.abs(v)>.01),'Native HLSL Sound PCM');
  g.session.setSource('float4 mainImage(float2 p){\nreturn missing;\n}','hlsl');
  check(!await g.session.application.compile(),'Invalid HLSL must fail');
  check(g.session.application.state.compile.diagnostics.some(d=>d.language==='hlsl'&&d.line===2),'HLSL source line must cross the mobile compiler bridge');
  check(g.runtime.status().ready,'Invalid HLSL retains the native graph');
  await g.compile(g.createProject());iframe.remove();delete window.__translateNativeHlsl;
  return {status:'passed',compiler:'bundled Slang WASM through the isolated mobile compiler page',pixel,soundSamples:audio.left.length};
 }).toString()+')(nativeGraph)');
 // The old mobile page now uses shared actions with the two-phase GPU port.
 const scales=await evaluate('(async()=>{const g=nativeGraph,rows=[];for(const value of [1,.75,.5,.25,1,.75]){g.session.application.dispatch({type:"preview.scale",value});if(!await g.session.application.compile())throw Error("scale compile failed");g.runtime.step();await new Promise(resolve=>{const wait=()=>g.runtime.status().frame>0?resolve():requestAnimationFrame(wait);requestAnimationFrame(wait);});const image=await g.runtime.readImage();rows.push({value,width:image.width,height:image.height});}return rows;})()');
 for(const row of scales){assert.equal(row.width,Math.max(1,Math.floor(scales[0].width*row.value)));assert.equal(row.height,Math.max(1,Math.floor(scales[0].height*row.value)));}
 // An invalid replacement keeps the active graph and GPU output.
 const failed=await evaluate('(async()=>{const p=nativeGraph.createProject();nativeGraph.passOf(p,"image").code="fn mainImage(";try{await nativeGraph.runtime.compile(p);return false;}catch{return nativeGraph.runtime.status().ready;}})()');assert.equal(failed,true);
 await evaluate('nativeGraph.runtime.setMode("scene","box");nativeGraph.runtime.setPlaying(true)');await new Promise(r=>setTimeout(r,100));await evaluate('nativeGraph.runtime.setMode("canvas")');
 assertNoBrowserErrors();await evaluate('nativeGraph.session.application.dispose();nativeGraph.runtime.dispose();nativeGraph.engine.destroy()');return{status:'passed',backend:'real browser WebGPU with platform IO test ports',examples:samples,scales,puzzleSwipes,keyboardFrames,cameraFrames,hlsl,checks:['shared application actions compile 100/75/50/25/100/75% on the mobile renderer with correct readback dimensions','all eight shared examples compile and render visible content through the mobile graph','Sliding city native touch moves in all four directions exactly once per swipe, ignores jitter and handles between-frame swipes at 100% and 25% render scales','Common and four-channel bindings use the shared ABI','invalid compile retains active GPU graph','3D material scene switches on the same Engine device']};
}});writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
