import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import ts from 'typescript';

test('final GPU disposal destroys resources before the host destroys the device, without a deferred fence',()=>{
 const destroyed=[],exports={};let fences=0;
 const noop=class{};
 const fake={SphericalTransform3D:noop,BasicMaterial:noop,KeyboardState:noop,
  createSphere3D:()=>({}),createBox3D:()=>({}),createTorus3D:()=>({}),
  LiveCamera:class{dispose(){destroyed.push('camera');}}};
 const js=ts.transpileModule(readFileSync(new URL('../src/gpu-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{exports,require:()=>fake});
 const engine={device:{features:new Set(),queue:{onSubmittedWorkDone(){fences++;return new Promise(()=>{});}}}};
 const runtime=new exports.NativeShaderRuntime(engine,()=>{},{});
 const resource=name=>({destroy(){destroyed.push(name);}});
 runtime.targets.set('image',[{texture:resource('target-a')},{texture:resource('target-b')}]);
 runtime.active={passes:[{uniform:resource('uniform')}],images:new Map([['image',{texture:resource('image')}]]),videos:new Map(),sound:{dispose(){destroyed.push('sound');}}};
 runtime.cameraTexture={texture:resource('camera-texture')};
 for(const key of ['black','cube','keys'])runtime[key]={texture:resource(key)};
 runtime.presentSize=resource('present-uniform');runtime.scene=resource('scene');
 runtime.dispose();runtime.dispose();
 assert.equal(fences,0);
 assert.deepEqual(destroyed.sort(),['target-a','target-b','uniform','image','sound','camera','camera-texture','black','cube','keys','present-uniform','scene'].sort());
 assert.equal(runtime.targets.size,0);assert.equal(runtime.active,undefined);
});

test('prepare owns a validated snapshot before asynchronous source translation mutates it',async()=>{
 const {createProject,validateProject}=await import('../../shared/dist/domain/model.js');
 const source=createProject('Owned input',{ids:{next:()=> 'owned'},clock:{nowISO:()=> '2026-10-18T00:00:00Z'}}),before=JSON.stringify(source),exports={},noop=class{};
 let translated;
 const fake={SphericalTransform3D:noop,BasicMaterial:noop,KeyboardState:noop,LiveCamera:noop,
  createSphere3D:()=>({}),createBox3D:()=>({}),createTorus3D:()=>({}),validateProject,
  refreshProjectSources:async snapshot=>{translated=snapshot;assert.notEqual(snapshot,source);snapshot.passes[0].code='translated';await Promise.resolve();return [{severity:'error',message:'stop before GPU allocation',pass:'image',line:1,column:1}];}};
 const js=ts.transpileModule(readFileSync(new URL('../src/gpu-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 // This JSON path must not need an additional platform structuredClone.
 vm.runInNewContext(js,{exports,require:()=>fake});
 const runtime=new exports.NativeShaderRuntime({device:{features:new Set()}},()=>{},{});
 await assert.rejects(runtime.prepare(source),error=>error instanceof exports.NativeCompileError&&error.diagnostics[0].message==='stop before GPU allocation');
 assert.ok(translated);assert.equal(JSON.stringify(source),before);
});

test('frame bindings are reused for both feedback slots and invalidated on texture replacement or reset',()=>{
 const exports={},noop=class{},groups=[];
 const fake={SphericalTransform3D:noop,BasicMaterial:noop,KeyboardState:noop,LiveCamera:noop,
  createSphere3D:()=>({}),createBox3D:()=>({}),createTorus3D:()=>({})};
 const js=ts.transpileModule(readFileSync(new URL('../src/gpu-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{exports,require:()=>fake});
 const device={features:new Set(),createBindGroup:descriptor=>{const group={descriptor};groups.push(group);return group;}};
 const runtime=new exports.NativeShaderRuntime({device},()=>{},{}),compiled={layout:{}},view=()=>({view:{}});
 const a=[view(),view(),view(),view()],b=[a[0],view(),a[2],a[3]];
 const ga=runtime.bindInputs(compiled,a,0),gb=runtime.bindInputs(compiled,b,1);
 for(let i=0;i<100;i++){assert.equal(runtime.bindInputs(compiled,a,0),ga);assert.equal(runtime.bindInputs(compiled,b,1),gb);}
 assert.equal(groups.length,2);
 a[2]=view();const changed=runtime.bindInputs(compiled,a,0);assert.notEqual(changed,ga);assert.equal(changed.descriptor.entries[3].resource,a[2].view);
 assert.equal(runtime.bindInputs(compiled,b,1),gb);
 runtime.presenter={getBindGroupLayout:()=>({})};runtime.presentSize={};const output=view();
 const present=runtime.bindOutput(output);assert.equal(runtime.bindOutput(output),present);
 assert.notEqual(runtime.bindOutput(view()),present);
 runtime.clearTargets(true);
 assert.notEqual(runtime.bindInputs(compiled,a,0),changed);assert.notEqual(runtime.bindOutput(output),present);
});

test('pipeline reuse preserves warnings, owns uniforms and invalidates source, Common and texture dimension changes',async()=>{
 const {createProject}=await import('../../shared/dist/domain/model.js');
 const source=createProject('Pipeline',{ids:{next:()=> 'pipeline'},clock:{nowISO:()=> '2026-10-18T00:00:00Z'}}),exports={},noop=class{};
 let modules=0,pipelines=0,fail=false,destroyed=0;
 const fake={SphericalTransform3D:noop,BasicMaterial:noop,KeyboardState:noop,LiveCamera:class{dispose(){}},
  createSphere3D:()=>({}),createBox3D:()=>({}),createTorus3D:()=>({}),validateProject:project=>{if(!project)throw Error('invalid project');return structuredClone(project);},
  refreshProjectSources:async()=>[],resolveChannelBindings:pass=>({dimensions:pass.channels.map(c=>c.kind==='cubemap'?'cube':'2d'),diagnostics:[]}),
  wrapShader:pass=>({code:pass.code,sourceLocation:()=>({pass:pass.id,line:1})})};
 const device={features:new Set(),queue:{onSubmittedWorkDone:async()=>{}},createBindGroupLayout:()=>({}),createPipelineLayout:()=>({}),
  pushErrorScope(){},popErrorScope:async()=>null,createShaderModule(){modules++;return {getCompilationInfo:async()=>({messages:[{type:fail?'error':'warning',message:fail?'invalid shader':'warning',lineNum:1,linePos:1}]})};},
  createRenderPipelineAsync:async()=>{pipelines++;return {};},createBuffer:()=>({destroy(){destroyed++;}}),createBindGroup:()=>({})};
 const js=ts.transpileModule(readFileSync(new URL('../src/gpu-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{exports,require:()=>fake,GPUShaderStage:{FRAGMENT:1},GPUBufferUsage:{UNIFORM:1,COPY_DST:2}});
 const runtime=new exports.NativeShaderRuntime({device},()=>{},{});
 const first=await runtime.prepare(source);
 await assert.rejects(runtime.prepare(null),/invalid project/);assert.throws(()=>runtime.commit(first),/已失效/);
 first.diagnostics[0].message='caller mutation';
 source.preview.scale=.75;const scaled=await runtime.prepare(source);
 assert.equal(modules,1);assert.equal(pipelines,1);assert.equal(scaled.passes[0].pipeline,first.passes[0].pipeline);
 assert.notEqual(scaled.passes[0].uniform,first.passes[0].uniform);assert.equal(scaled.diagnostics[0].message,'warning');
 runtime.releasePrepared(first);await Promise.resolve();assert.equal(destroyed,1);
 source.passes.find(p=>p.id==='image').code+='\n// change';await runtime.prepare(source);assert.equal(pipelines,2);
 source.common='// common';await runtime.prepare(source);assert.equal(pipelines,3);
 source.passes.find(p=>p.id==='image').channels[0]={kind:'cubemap',assetId:'test-binding-only'};
 await runtime.prepare(source);assert.equal(pipelines,4);
 fail=true;source.common+=' changed';await assert.rejects(runtime.prepare(source));await assert.rejects(runtime.prepare(source));
 assert.equal(modules,6);assert.equal(pipelines,4);assert.equal(runtime.pipelineCache.size,1);
 runtime.dispose();assert.equal(runtime.pipelineCache.size,0);
});

test('application compile hands off an independent snapshot without validating or copying it again',async()=>{
 const {ShaderApplication}=await import('../../shared/dist/application/application.js');
 const {preparedPreview}=await import('../../shared/dist/ports/preparedPreview.js');
 const app=new ShaderApplication({ids:{next:()=> 'transfer'},clock:{nowISO:()=> '2026-10-18T00:00:00Z'}}),before=JSON.stringify(app.state.project),exports={},noop=class{};
 let handed,translated,validations=0;
 const fake={SphericalTransform3D:noop,BasicMaterial:noop,KeyboardState:noop,LiveCamera:noop,
  createSphere3D:()=>({}),createBox3D:()=>({}),createTorus3D:()=>({}),validateProject:()=>{validations++;throw Error('unexpected repeated validation');},
  refreshProjectSources:async snapshot=>{translated=snapshot;snapshot.passes[0].code='generated';await Promise.resolve();return [{severity:'error',message:'stop before GPU allocation',pass:'image',line:1,column:1}];}};
 const js=ts.transpileModule(readFileSync(new URL('../src/gpu-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{exports,require:()=>fake});
 const runtime=new exports.NativeShaderRuntime({device:{features:new Set()}},()=>{},{});
 app.connect({preview:preparedPreview(()=>({prepare:snapshot=>{handed=snapshot;return runtime.prepareOwnedSnapshot(snapshot);},commit(){},release(){},play(){},step(){},reset(){}}))});
 assert.equal(await app.compile(),false);assert.equal(validations,0);assert.equal(handed,translated);
 assert.notEqual(handed,app.state.project);assert.notEqual(handed.passes[0],app.state.project.passes[0]);assert.equal(JSON.stringify(app.state.project),before);
 app.dispose();
});

test('embedded preview compilation leaves the caller GUI scene active; standalone keeps scene selection',()=>{
 const exports={},noop=class{},switches=[],fake={SphericalTransform3D:noop,BasicMaterial:noop,KeyboardState:noop,LiveCamera:noop,OrbitControl:noop,
  createSphere3D:()=>({}),createBox3D:()=>({}),createTorus3D:()=>({})};
 const js=ts.transpileModule(readFileSync(new URL('../src/gpu-runtime.ts',import.meta.url),'utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.CommonJS}}).outputText;
 vm.runInNewContext(js,{exports,require:()=>fake});
 const engine={device:{features:new Set()},switchScene:scene=>switches.push(scene)};
 let requested=0;
 const embedded=new exports.NativeShaderRuntime(engine,()=>requested++,{},undefined,{size:()=>({width:512,height:288}),output(){}});
 embedded.setMode('canvas');assert.equal(switches.length,0);assert.equal(requested,1);
 const standalone=new exports.NativeShaderRuntime(engine,()=>{},{});standalone.mesh={};standalone.scene={};
 standalone.setMode('canvas');standalone.setMode('scene');assert.deepEqual(switches,[null,standalone.scene]);
});
