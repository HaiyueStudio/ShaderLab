import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import createSlang from '../../vendor/slang-2026.19/slang-wasm.js';
import {createHlslTranslator} from '../dist/hlsl.js';
import {translateWgsl} from '../dist/wgsl.js';
import {createSourceConverter} from '../dist/sourceConversion.js';
import {typescriptToWgsl} from '../dist/typescriptShader.js';
import {wgslToTypescript} from '../dist/wgslTypescript.js';
import {createProject,passOf,SHADER_LANGUAGES,DEFAULT_CODE,parseProject,validateProject} from '../dist/model.js';
import {sourceOf,detectShaderLanguage} from '../dist/sourceLanguage.js';
import {refreshProjectSources} from '../dist/sourceProject.js';
import {ShaderApplication} from '../../shared/dist/application/application.js';
import {preferredProject,preferredSource,parsePreferences} from '../../shared/dist/domain/preferences.js';
import {practiceStarter,practiceProject,PRACTICE_CHALLENGES,parsePracticeRecords} from '../../shared/dist/domain/practice.js';
import {examples} from '../dist/examples.js';
import {wrapShader} from '../dist/shaders.js';
import {parseWgsl,validate} from 'naga-wasm';

const hlsl=createHlslTranslator(()=>createSlang({wasmBinary:readFileSync(new URL('../../vendor/slang-2026.19/slang-wasm.wasm',import.meta.url))}));
const convert=createSourceConverter({wgsl:translateWgsl,hlsl});
const environment={ids:{next:()=>crypto.randomUUID()},clock:{nowISO:()=>new Date().toISOString()}};
function valid(project){for(const pass of [...project.passes,project.sound].filter(p=>p.enabled)){const m=parseWgsl(wrapShader(pass,project.common).code);try{const i=validate(m);i.free();}finally{m.free();}}}
function application(project=createProject()){const a=new ShaderApplication(environment,project);a.connect({convertSource:convert});return a;}

test('all five languages convert in every direction from the current edited source',async()=>{
  for(const from of SHADER_LANGUAGES){
    const a=application();await a.switchLanguage('image',from);
    const first=sourceOf(a.state.project,'image');
    for(const to of SHADER_LANGUAGES.filter(l=>l!==from)){
      const current=application(a.snapshot());current.setSource('image',first+'\n// current edit '+from,from);
      await current.switchLanguage('image',to);assert.equal(current.state.project.editorLanguages.image,to);
      assert.match(sourceOf(current.state.project,'image'),/current edit/);
      const p=current.snapshot();assert.deepEqual(await refreshProjectSources(p,hlsl,translateWgsl),[],from+' → '+to);valid(p);current.dispose();
    }
    a.dispose();
  }
});

test('TypeScript parses typed functions, structures, arrays, matrix operations, loops and Sound; rejects host code without execution',async()=>{
  const code=`interface Tint { color: vec3f; }
export function shade(p: vec2f): vec3f {
  let sum: number = 0;
  const values = gpu.array<number, 3>(0.012, 0.2, 0.3);
  for (let i: i32 = 0; i < 3; i++) { if (i === 1) { continue; } sum += values[i]; }
  const m = mat2x2f(vec2f(1, 0), vec2f(0, 1));
  const tint = gpu.construct<Tint>(vec3f(sum, Math.sin(iTime), 0.4));
  return gpu.add(tint.color, vec3f(gpu.mul(m, p), 0));
}
export function mainImage(p: vec2f): vec4f { return vec4f(shade(gpu.div(p, iResolution.xy)), 1); }`;
  const p=createProject();passOf(p,'image').typescript=code;p.editorLanguages={image:'typescript'};
  assert.deepEqual(await refreshProjectSources(p,hlsl,translateWgsl),[]);valid(p);
  const sound=createProject();sound.sound.enabled=true;sound.sound.typescript=preferredSource('sound','typescript');sound.editorLanguages={sound:'typescript'};
  assert.deepEqual(await refreshProjectSources(sound,hlsl,translateWgsl),[]);valid(sound);
  for(const bad of ['globalThis.sideEffect = 123;','import fs from "fs";','export async function mainImage(p:vec2f){return fetch("https://invalid");}','export function mainImage(p:vec2f):vec4f { return new Float32Array(4); }'])assert.equal(typescriptToWgsl(bad).code,null);
  assert.equal(typescriptToWgsl('export function mainImage(').diagnostics[0].line,1);
});

test('real Slang generics specialize to editable HLSL and every other language',async()=>{
  const source='T identity<T>(T value) { return value; }\nfloat4 mainImage(float2 p) { return identity<float4>(float4(p / iResolution.xy, 0.012, 1.0)); }';
  const a=application();a.setSource('image',source,'slang');
  for(const to of SHADER_LANGUAGES.filter(v=>v!=='slang')){
    const p=a.snapshot(),code=await convert(p,'image',to),b=application(p);b.setSource('image',code,to);
    const runtime=b.snapshot();assert.deepEqual(await refreshProjectSources(runtime,hlsl,translateWgsl),[],to);valid(runtime);
    if(to==='hlsl')assert.doesNotMatch(code,/identity\s*</);b.dispose();
  }
});

test('all eight examples retain renderable passes through TypeScript, including Common and feedback channels',async()=>{
  for(const target of ['typescript','slang'])for(const example of examples()){
    const a=application(example.project);
    if(a.state.project.common.trim())await a.switchLanguage('common',target);
    for(const p of [...a.state.project.passes,a.state.project.sound].filter(p=>p.enabled))await a.switchLanguage(p.id,target);
    const runtime=a.snapshot(),errors=await refreshProjectSources(runtime,hlsl,translateWgsl);assert.deepEqual(errors,[],target+' '+example.id);valid(runtime);
    if(target==='slang'){
      for(const p of [...a.state.project.passes,a.state.project.sound].filter(p=>p.enabled))await a.switchLanguage(p.id,'typescript');
      const linked=a.snapshot();assert.deepEqual(await refreshProjectSources(linked,hlsl,translateWgsl),[],example.id+' Slang → TypeScript');valid(linked);
    }
    for(const p of [...a.state.project.passes,a.state.project.sound].filter(p=>p.enabled))await a.switchLanguage(p.id,'wgsl');
    a.dispose();
  }
});

test('five-language preferences, project serialization and practice drafts preserve authored source and reject invalid fields',()=>{
  for(const language of SHADER_LANGUAGES){
    const project=preferredProject(language,environment),restored=parseProject(JSON.stringify(project));assert.equal(sourceOf(restored,'image'),preferredSource('image',language));
    assert.equal(parsePreferences(JSON.stringify({shaderLanguage:language})).shaderLanguage,language);
    const source=practiceStarter(language),practice=practiceProject(PRACTICE_CHALLENGES[0],source,language);assert.equal(sourceOf(parseProject(JSON.stringify(practice)),'image'),source);
    assert.equal(parsePracticeRecords(JSON.stringify({[PRACTICE_CHALLENGES[0].id]:{source,language,best:0,passed:false}}))[PRACTICE_CHALLENGES[0].id].source,source);
  }
  for(const field of ['typescript','slang']){const p=createProject();passOf(p,'image')[field]=8;assert.throws(()=>validateProject(p),/100 KB/);}
});

test('TypeScript Common stays external and changing it changes the next compiled pass; failed conversions are atomic and undo retains variants',async()=>{
  const a=application();a.setSource('common','export function gain(v: number): number { return v * 0.4; }','typescript');
  a.setSource('image','export function mainImage(p:vec2f):vec4f{return vec4f(gain(0.5));}','typescript');
  await a.switchLanguage('image','hlsl');assert.equal(a.state.project.editorLanguages.common,'typescript');
  let p=a.snapshot();assert.deepEqual(await refreshProjectSources(p,hlsl,translateWgsl),[]);valid(p);
  a.setSource('common','export function gain(v: number): number { return v * 0.8; }','typescript');p=a.snapshot();assert.deepEqual(await refreshProjectSources(p,hlsl,translateWgsl),[]);assert.match(p.passes.at(-1).code,/0\.8/);
  const b=application();b.setSource('image',preferredSource('image','typescript'),'typescript');await b.switchLanguage('image','slang');assert.equal(b.undoSource('image'),true);assert.equal(b.state.project.editorLanguages.image,'typescript');assert.equal(b.redoSource('image'),true);assert.equal(b.state.project.editorLanguages.image,'slang');
  b.setSource('image','export function mainImage(', 'typescript');const before=b.snapshot();await assert.rejects(()=>b.switchLanguage('image','wgsl'));assert.deepEqual(b.snapshot(),before);
  assert.equal(detectShaderLanguage(preferredSource('image','typescript')),'typescript');assert.equal(detectShaderLanguage('T identity<T>(T value){return value;}','slang'),'slang');
});

test('structural TypeScript output is source code, preserves for loops and short float literals',()=>{
  const out=wgslToTypescript(DEFAULT_CODE+'\nfn count()->f32{var s=0.0;for(var i=0;i<4;i++){s+=0.012;}return s;}');
  assert.match(out,/export function mainImage/);assert.match(out,/gpu\.div/);assert.match(out,/for\s*\(/);assert.match(out,/0\.012/);assert.doesNotMatch(out,/eval|WGSL_SOURCE|while\s*\(true\)/);assert.ok(typescriptToWgsl(out).code);
});

test('emitted TypeScript is recompiled before committing; hexadecimal floats retain their numeric value',async()=>{
  const a=application();a.setSource('image','fn mainImage(p:vec2f)->vec4f{return vec4f(0x1p-2,0x1.8p-2,0.012,1.0);}','wgsl');await a.switchLanguage('image','typescript');assert.match(sourceOf(a.state.project,'image'),/0\.25/);assert.match(sourceOf(a.state.project,'image'),/0\.375/);const p=a.snapshot();assert.deepEqual(await refreshProjectSources(p,hlsl,translateWgsl),[]);valid(p);
  a.setSource('image','var<private> gpu:f32; fn mainImage(p:vec2f)->vec4f{return vec4f(gpu);}','wgsl');const before=a.snapshot();await assert.rejects(()=>a.switchLanguage('image','typescript'),/保留命名空间/);assert.deepEqual(a.snapshot(),before);
  a.setSource('image','var<private> calls:i32;fn index()->i32{calls+=1;return 0;}fn mainImage(p:vec2f)->vec4f{var a:array<f32,1>;a[index()]+=1.0;return vec4f(a[0],f32(calls),0.0,1.0);}','wgsl');const indexed=a.snapshot();await assert.rejects(()=>a.switchLanguage('image','typescript'),/索引包含函数调用/);assert.deepEqual(a.snapshot(),indexed);
});
