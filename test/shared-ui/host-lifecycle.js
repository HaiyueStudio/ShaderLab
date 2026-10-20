import {ShaderApplication} from '../../shared/dist/application/application.js';
import {preparedPreview} from '../../shared/dist/ports/preparedPreview.js';
import {mountWebSharedEditor} from '../../web/src/platform/shared-editor.ts';
import {ShaderRuntime} from '../../web/src/runtime.ts';
import {CodeEditor} from '../../web/src/codeEditor.ts';

// Test-only instrumentation. No production allocation/RAF/listener wrappers.
const timers=new Set(),frames=new Set(),listeners=[],devices=new Map();
const timeout=window.setTimeout,clearTimeoutOriginal=window.clearTimeout,raf=window.requestAnimationFrame,cancel=window.cancelAnimationFrame;
window.setTimeout=(callback,ms,...args)=>{const id=timeout(()=>{timers.delete(id);callback(...args);},ms);timers.add(id);return id;};
window.clearTimeout=id=>{timers.delete(id);clearTimeoutOriginal(id);};
window.requestAnimationFrame=callback=>{const id=raf(t=>{frames.delete(id);callback(t);});frames.add(id);return id;};
window.cancelAnimationFrame=id=>{frames.delete(id);cancel(id);};
const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
EventTarget.prototype.addEventListener=function(type,callback,options){
 if((this===window||this===document)&&callback&&!options?.signal?.aborted){
  const capture=typeof options==='boolean'?options:!!options?.capture;
  if(!listeners.some(e=>e.target===this&&e.type===type&&e.callback===callback&&e.capture===capture)){
   const entry={target:this,type,callback,capture};listeners.push(entry);
   if(options?.signal)add.call(options.signal,'abort',()=>{const i=listeners.indexOf(entry);if(i>=0)listeners.splice(i,1);},{once:true});
  }
 }
 return add.call(this,type,callback,options);
};
EventTarget.prototype.removeEventListener=function(type,callback,options){const capture=typeof options==='boolean'?options:!!options?.capture;const i=listeners.findIndex(e=>e.target===this&&e.type===type&&e.callback===callback&&e.capture===capture);if(i>=0)listeners.splice(i,1);return remove.call(this,type,callback,options);};
const request=GPUAdapter.prototype.requestDevice;
GPUAdapter.prototype.requestDevice=async function(...args){const d=await request.apply(this,args),resources=new Set();devices.set(d,resources);
 for(const name of ['createBuffer','createTexture']){const create=d[name].bind(d);d[name]=(...args)=>{const value=create(...args);resources.add(value);const destroy=value.destroy.bind(value);value.destroy=()=>{resources.delete(value);destroy();};return value;};}
 const destroy=d.destroy.bind(d);d.destroy=()=>{resources.clear();devices.delete(d);destroy();};return d;
};
const snapshot=()=>({timers:timers.size,frames:frames.size,globalListeners:listeners.length,gpuDevices:devices.size,gpuBuffersAndTextures:[...devices.values()].reduce((n,s)=>n+s.size,0),portableRoots:document.querySelectorAll('[data-hy-portable-root]').length});
const wait=async check=>{const until=Date.now()+30000;while(!check()){if(Date.now()>until)throw Error('Lifecycle GPU timeout');await new Promise(r=>setTimeout(r,16));}};
window.hostLifecycle={snapshot,async cycle(fixture){
 const root=document.getElementById('root');root.innerHTML='<section id="workspace"><div class="project-bar"></div><div class="playback-bar"></div><canvas id="shader-canvas" style="width:640px;height:360px"></canvas><div id="code-editor"></div></section>';
 for(const id of ['project-name','save-state','save-project','compile','play-pause','reset-time','step-frame','preview-scale','mode-canvas','mode-scene','mesh-select']){const el=document.createElement('div');el.id=id;root.append(el);}
 const app=new ShaderApplication({ids:{next:()=>crypto.randomUUID()},clock:{nowISO:()=>fixture.updatedAt}},fixture),canvas=document.getElementById('shader-canvas');
 const runtime=new ShaderRuntime(canvas);let failure;runtime.onError=message=>{failure=message;};
 await runtime.initialize();
 const editor=new CodeEditor(document.getElementById('code-editor'),(pass,source,language)=>app.setSource(pass,source,language),()=>{});
 editor.show('image',fixture.passes.find(p=>p.id==='image').code,'wgsl');
 app.connect({preview:preparedPreview(()=>({prepare:p=>runtime.prepare(p),commit:p=>runtime.commit(p),release:p=>runtime.releasePrepared(p),play:v=>runtime.setPlaying(v),step:()=>runtime.step(),reset:()=>runtime.reset()}))});
 const shared=mountWebSharedEditor(app,{ensurePreview:async()=>{},flushEditor:()=>app.setSource('image',editor.view.state.doc.toString(),'wgsl'),compiled(){},previewModeChanged(){},playbackChanged(){}},{canvas,editor:editor.view.dom,focusEditor:()=>editor.view.focus(),measureEditor:()=>editor.view.requestMeasure(),previewVisible:v=>runtime.setVisible(v)});
 await shared.controller.compile();await wait(()=>failure||runtime.status().frame>3);if(failure)throw Error(failure);
 const active={resources:snapshot(),shared:shared.diagnostics(),dimensions:[runtime.status().width,runtime.status().height]};
 shared.dispose();editor.destroy();app.dispose();await runtime.dispose();root.replaceChildren();
 await new Promise(r=>setTimeout(r,50));
 return {active,released:snapshot(),shared:shared.diagnostics()};
}};
