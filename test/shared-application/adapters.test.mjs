import test from 'node:test';
import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { MobileSession } from '../../mobile/src/session.ts';
const root=resolve(import.meta.dirname,'../..'), out=resolve(root,'artifacts/shared-application/workspace.mjs');
mkdirSync(resolve(root,'artifacts/shared-application'),{recursive:true});
await build({entryPoints:[resolve(root,'web/src/workspace.ts')],outfile:out,bundle:true,platform:'node',format:'esm',packages:'external',alias:{'shaderlab:slang-wasm':resolve(root,'vendor/slang-2026.19/slang-wasm.wasm')},loader:{'.wasm':'file'}});
const {ShaderDocument,ShaderWorkspace}=await import(pathToFileURL(out));
const environment=()=>{let id=0;return{ids:{next:()=>`id-${++id}`},clock:{nowISO:()=> '2026-10-16T00:00:00.000Z'}};};
test('existing Web document and MobileSession use the same state for identical operations',()=>{
 const web=new ShaderDocument(environment()),mobile=new MobileSession(environment());
 const a=web.application,b=mobile.application;assert.deepEqual(a.state,b.state);
 mobile.open(web.serialize(),true);a.dispatch({type:'project.open',project:web.serialize(),fork:true});assert.deepEqual(a.state,b.state);
 web.setSource('image','void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}','glsl');mobile.setSource('void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}','glsl');assert.deepEqual(a.state,b.state);
 a.restoreLanguageDraft('image','wgsl');b.restoreLanguageDraft('image','wgsl');assert.deepEqual(a.state,b.state);
 for(const value of [1,.75,.5,.25,1,.75]){a.dispatch({type:'preview.scale',value});b.dispatch({type:'preview.scale',value});assert.deepEqual(a.state,b.state);}
 a.dispatch({type:'pass.add',pass:'buffer-a'});mobile.add('buffer-a');a.dispatch({type:'channel.set',pass:'buffer-a',index:0,channel:{kind:'buffer',pass:'buffer-b'}});mobile.channel(0,{kind:'buffer',pass:'buffer-b'});assert.deepEqual(a.state,b.state);
 web.dispose();b.dispose();
});
test('EditorPlatform compile rollback rejects a changed revision and releases prepared GPU resources',async()=>{
 const workspace=new ShaderWorkspace();await workspace.start();let resolve,started,release=0,commit=0;const ready=new Promise(r=>{started=r;});
 workspace.runtime={prepare:()=>{started();return new Promise(r=>{resolve=r;});},commit:()=>{commit++;},releasePrepared:()=>{release++;},invalidate(){},dispose:async()=>{},setPlaying(){}};
 const running=workspace.api.execute({apiVersion:'1',requestId:'compile-race',operation:'shader.compile',documentId:workspace.document.identity.id,expectedRevision:workspace.document.revision,params:{}});
 await ready;workspace.document.setSource('image','fn mainImage(p:vec2f)->vec4f{return vec4f(1.);}','wgsl');resolve({diagnostics:[]});
 const result=await running;assert.equal(result.status,'failed');assert.equal(result.error.code,'REVISION_CONFLICT');assert.equal(commit,0);assert.equal(release,1);assert.equal(workspace.compiledRevision,0);
 await workspace.dispose();
});
