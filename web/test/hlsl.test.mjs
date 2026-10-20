import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import createSlang from '../../vendor/slang-2026.19/slang-wasm.js';
import {createHlslTranslator} from '../dist/hlsl.js';
import {refreshProjectSources} from '../dist/sourceProject.js';
import {ShaderWorkspace} from '../dist/workspace.js';
import {defaultHlsl,detectShaderLanguage,sourceOf,languageOf} from '../dist/sourceLanguage.js';
import {createProject,passOf,parseProject,validateProject} from '../dist/model.js';
import {wrapShader} from '../dist/shaders.js';
import {exportShadertoyPass} from '../dist/shadertoyExport.js';
import {parseWgsl,validate} from 'naga-wasm';

const translate=createHlslTranslator(()=>createSlang({wasmBinary:readFileSync(new URL('../../vendor/slang-2026.19/slang-wasm.wasm',import.meta.url))}));
function valid(code){const module=parseWgsl(code);try{const info=validate(module);info.free();}finally{module.free();}}

test('HLSL choices preserve independent drafts, including invalid code, save/reopen and language detection',()=>{
 const w=new ShaderWorkspace(),wgsl=sourceOf(w.document.state,'image');
 for(const pass of ['image','common','buffer-a','sound']){
  w.application.restoreLanguageDraft(pass,'hlsl');assert.equal(sourceOf(w.document.state,pass),defaultHlsl(pass));
  w.document.setSource(pass,'// unfinished\nfloat4 mainImage(','hlsl');
  w.application.restoreLanguageDraft(pass,'glsl');w.document.setSource(pass,'// GLSL draft','glsl');
  w.application.restoreLanguageDraft(pass,'hlsl');assert.equal(sourceOf(w.document.state,pass),'// unfinished\nfloat4 mainImage(');
 }
 const restored=parseProject(JSON.stringify(w.document.serialize()));
 assert.equal(restored.passes.find(p=>p.id==='image').code,wgsl);
 for(const pass of ['image','common','buffer-a','sound'])assert.equal(languageOf(restored,pass),'hlsl');
 assert.equal(detectShaderLanguage(defaultHlsl('image')),'hlsl');
 assert.equal(detectShaderLanguage('float gain(float x){return x;}','hlsl'),'hlsl');
 assert.equal(detectShaderLanguage('float4 f(float2 p){return vec4f(1.0);}'),null);
 assert.equal(detectShaderLanguage('// float4 x;\nfn f(){}'),'wgsl');
 const bad=structuredClone(restored);bad.commonHlsl=7;assert.throws(()=>validateProject(bad),/HLSL/);
 const missing=structuredClone(restored);delete missing.sound.hlsl;assert.throws(()=>validateProject(missing),/HLSL/);
 w.document.setCode('image',wgsl+'\n// code.set');assert.equal(w.document.state.passes.find(p=>p.id==='image').hlsl,undefined);
});
test('real Slang compiles HLSL Common, matrix mul, loops, channels and Sound into valid WGSL',async()=>{
 for(const [source,options] of [
  [defaultHlsl('image'),{}],
  ['float4 mainImage(float2 p){float2x2 m=float2x2(1,0,0,1);float2 uv=mul(m,p/iResolution.xy);for(int i=0;i<3;i++)uv+=0.01;return tint(float4(uv,1,1));}',{common:'float4 tint(float4 c){return c*float4(0.2,0.4,0.6,1); }'}],
  ['float4 mainImage(float2 p){return channel0(normalize(float3(p,1)))+iChannel1.SampleLevel(iSampler,p/iResolution.xy,0);}',{channelTypes:['cube','2d']}],
  [defaultHlsl('sound'),{entryPoint:'sound'}],
 ]){
  const result=await translate(source,options);assert.deepEqual(result.diagnostics,[]);assert.ok(result.code?.startsWith('// @haiyue-hlsl-module'));
  valid(wrapShader({...passOf(createProject(),'image'),code:result.code}).code);
 }
});
test('HLSL diagnostics point to original pass/Common lines and subsequent compilation recovers',async()=>{
 const pass=await translate('float4 mainImage(float2 p){\n return missing;\n}');
 assert.equal(pass.code,null);assert.ok(pass.diagnostics.some(d=>d.source==='pass'&&d.line===2&&d.column>1));
 const common=await translate('float4 mainImage(float2 p){return tint(p);}',{common:'// common\nfloat4 tint(float2 p){return missing;}'});
 assert.equal(common.code,null);assert.ok(common.diagnostics.some(d=>d.source==='common'&&d.line===2));
 assert.ok((await translate(defaultHlsl('image'))).code);
 const resources=await translate('Texture2D<float4> extra; float4 mainImage(float2 p){return extra.Load(int3(0));}');
 assert.equal(resources.code,null);assert.match(resources.diagnostics[0].message,/自定义/);
});
test('HLSL graph compilation uses snapshots, enforces Common compatibility and never exports stale WGSL as GLSL',async()=>{
 const w=new ShaderWorkspace();w.document.setSource('common','float gain(float x){return x*.5;}','hlsl');
 for(const id of ['image','buffer-a']){w.document.setSource(id,'float4 mainImage(float2 p){return float4(gain(.8),0,0,1);}','hlsl');w.setEnabled(id,true);}
 w.document.setSource('buffer-d','unfinished','hlsl');
 const original=w.document.serialize(),snapshot=w.document.serialize();
 assert.deepEqual(await refreshProjectSources(snapshot,translate),[]);
 for(const id of ['image','buffer-a'])assert.match(passOf(snapshot,id).code,/@haiyue-hlsl-module/);
 assert.deepEqual(w.document.serialize(),original);
 w.application.restoreLanguageDraft('image','wgsl');assert.ok((await refreshProjectSources(w.document.serialize(),translate)).some(d=>d.pass==='image'&&/Common/.test(d.message)));
 const exported=await exportShadertoyPass(original,'image');assert.equal(exported.code,null);assert.match(exported.diagnostics[0].message,/HLSL/);
});
