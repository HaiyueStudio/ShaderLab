import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderWorkspace } from '../dist/workspace.js';
import { languageOf, sourceOf } from '../dist/sourceLanguage.js';
import { refreshProjectSources } from '../dist/sourceProject.js';
import { translateGlsl } from '../dist/glsl.js';
import { projectTranslationOptions } from '../dist/glslProject.js';
import { createSourceConverter } from '../dist/sourceConversion.js';
import { translateWgsl } from '../dist/wgsl.js';
import { wrapShader } from '../dist/shaders.js';
import * as naga from 'naga-wasm';
import { passOf } from '../dist/model.js';
import { exportShadertoyPass } from '../dist/shadertoyExport.js';
import { glslCommon } from '../dist/sourceCommon.js';

test('external Common shares writable builtin copies and preserves Sound-specific builtin values',async()=>{
 const w=new ShaderWorkspace();
 w.document.setSource('common','fn value()->f32{return iTime;}','wgsl');
 w.document.setSource('image','fn mainImage(p:vec2f)->vec4f{iTime=0.25;return vec4f(value());}','wgsl');
 await w.setLanguage('image','glsl');
 const linked=await exportShadertoyPass(w.document.serialize(),'image');
 assert.ok(linked.code,JSON.stringify(linked.diagnostics));
 assert.match(linked.code,/slLinkiTime = 0.25/);
 assert.match(linked.code,/float slLinkiTime/);
 await validate(w,'image');
 w.document.setSource('sound','fn mainSound(s:i32,t:f32)->vec2f{return vec2f(value());}','wgsl');
 await w.setLanguage('sound','glsl');
 const library=await glslCommon(w.document.serialize(),'sound',translateWgsl);
 assert.match(library,/slLinkiTime/);
 assert.doesNotMatch(library,/\breturn iTime/);
 const snapshot=w.document.serialize();
 assert.deepEqual(await refreshProjectSources(snapshot,undefined,translateWgsl),[]);
 assert.ok((await exportShadertoyPass(snapshot,'sound')).code);
});

const glsl = 'void mainImage(out vec4 c, in vec2 p) { c = vec4(0.23, 0.41, 0.67, 1.0); }';
test('manual language selection converts current source, overwrites stale target draft and survives reopen', async () => {
  const w = new ShaderWorkspace();
  w.document.setSource('image', glsl, 'glsl');
  await w.setLanguage('image', 'wgsl');
  const converted = sourceOf(w.document.state, 'image');
  assert.match(converted, /0\.23/);
  assert.match(converted, /fn mainImage/);
  w.document.setSource('image', converted.replace('0.23', '0.81'), 'wgsl');
  await w.setLanguage('image', 'glsl');
  const reverse = sourceOf(w.document.state, 'image');
  assert.notEqual(reverse, glsl);
  assert.match(reverse, /0\.81/);
  assert.equal(translateGlsl(reverse, projectTranslationOptions(w.document.serialize(), 'image')).diagnostics.length, 0);
  const restored = new ShaderWorkspace(); restored.document.replace(w.document.serialize());
  assert.equal(sourceOf(restored.document.state, 'image'), reverse);
  await restored.setLanguage('image', 'wgsl');
  assert.match(sourceOf(restored.document.state, 'image'), /0\.81/);
});

test('invalid source and unsupported conversion retain language, code and revision', async () => {
  const w = new ShaderWorkspace();
  w.document.setSource('image', 'void mainImage(', 'glsl');
  const before = w.document.serialize(), revision = w.document.revision;
  await assert.rejects(w.setLanguage('image', 'wgsl'));
  await assert.rejects(w.setLanguage('image', 'hlsl'));
  assert.deepEqual(w.document.serialize(), before);
  assert.equal(w.document.revision, revision);
});

test('conversion keeps Common independent; supports Buffer and Sound', async () => {
  const w = new ShaderWorkspace();
  w.document.setSource('common', 'float gain(float x) { return x * .7; }', 'glsl');
  for (const pass of ['image', 'buffer-a', 'sound']) {
    w.document.setSource(pass, pass === 'sound'
      ? 'vec2 mainSound(int s, float t) { return vec2(gain(t)); }'
      : 'void mainImage(out vec4 c, in vec2 p) { c=vec4(gain(.5)); }', 'glsl');
    await w.setLanguage(pass, 'wgsl');
    await w.setLanguage(pass, 'glsl');
    const snapshot = w.document.serialize();
    assert.equal(projectTranslationOptions(snapshot, pass).common, snapshot.commonGlsl);
    assert.match(sourceOf(snapshot,pass), /gain\(/);
    assert.doesNotMatch(sourceOf(snapshot,pass), /float slCommonX/);
    assert.deepEqual(await refreshProjectSources(snapshot,undefined,translateWgsl), []);
    assert.match(passOf(snapshot, pass).code, /@haiyue-common-included/);
    const exported = await exportShadertoyPass(w.document.state, pass);
    assert.ok(exported.code.length > sourceOf(w.document.state,pass).length, 'standalone export explicitly links the current library');
  }
  await w.setLanguage('common', 'wgsl');
  assert.match(sourceOf(w.document.state, 'common'), /gain/);
  const before = w.document.serialize();
  await assert.rejects(w.setLanguage('common', 'glsl'), /Common/);
  assert.deepEqual(w.document.serialize(), before);
});

for (const id of ['image', 'buffer-a', 'sound']) for (const initial of ['wgsl', 'glsl']) {
  test(`${id} ${initial}: repeated switching and reopen preserve exact sources; edited output is converted`, async () => {
    let w = new ShaderWorkspace();
    const source = id === 'sound'
      ? initial === 'wgsl' ? 'fn mainSound(s:i32,t:f32)->vec2f{return vec2f(sin(t) * 0.23);}'
        : 'vec2 mainSound(int s,float t){return vec2(sin(t) * 0.23);}'
      : initial === 'wgsl' ? 'fn mainImage(p:vec2f)->vec4f{if(p.x<2.0){return vec4f(0.23);}return vec4f(p/iResolution.xy,0.23,1.0);}'
        : 'void mainImage(out vec4 c,in vec2 p){if(p.x<2.0){c=vec4(0.23);return;}c=vec4(p/iResolution.xy,0.23,1.0);}';
    w.document.setSource(id, source, initial);
    const other = initial === 'wgsl' ? 'glsl' : 'wgsl';
    await w.setLanguage(id, other);
    const converted = sourceOf(w.document.state, id);
    for (let cycle = 0; cycle < 6; cycle++) {
      const reopened = new ShaderWorkspace(); reopened.document.replace(w.document.serialize()); w = reopened;
      await w.setLanguage(id, initial); assert.equal(sourceOf(w.document.state, id), source);
      await w.setLanguage(id, other); assert.equal(sourceOf(w.document.state, id), converted);
    }
    const edited = converted.replaceAll('0.23', '0.81');
    w.document.setSource(id, edited, other);
    await w.setLanguage(id, initial);
    const updated = sourceOf(w.document.state, id);
    assert.match(updated, /0\.81/); assert.doesNotMatch(updated, /0\.23/);
    for (let cycle = 0; cycle < 4; cycle++) {
      await w.setLanguage(id, other); assert.equal(sourceOf(w.document.state, id), edited);
      await w.setLanguage(id, initial); assert.equal(sourceOf(w.document.state, id), updated);
    }
    if (id !== 'sound') await validate(w, id);
  });
}

test('reverse conversion emits the author entry directly, preserving early returns and user helpers', async () => {
  const result = await translateWgsl('fn tint(x:f32)->vec4f{return vec4f(x);} fn mainImage(p:vec2f)->vec4f{if(p.x<3.0){return tint(0.2);}return tint(0.8);}');
  assert.ok(result.code, JSON.stringify(result.diagnostics));
  assert.doesNotMatch(result.code, /vec4 stExportImage\s*\(/);
  assert.equal((result.code.match(/\bvoid mainImage\s*\(/g) ?? []).length, 1);
  assert.match(result.code, /vec4 tint/);
  const translated = translateGlsl(result.code); assert.ok(translated.code, JSON.stringify(translated.diagnostics));
  const w = new ShaderWorkspace(); w.document.setSource('image', translated.code, 'wgsl'); await validate(w, 'image');
  const sound = await translateWgsl('fn mainSound(s:i32,t:f32)->vec2f{return vec2f(sin(t)+iTime);}', {entryPoint:'sound'});
  assert.ok(sound.code, JSON.stringify(sound.diagnostics));
  assert.doesNotMatch(sound.code, /vec2 stExportSound\s*\(/);
  assert.ok(translateGlsl(sound.code, {entryPoint:'sound'}).code);
});

test('native compiler injection receives the active HLSL source and channel/Common context', async () => {
  const w = new ShaderWorkspace();
  w.document.setSource('common', 'float gain(float x) { return x; }', 'hlsl');
  w.document.setSource('image', 'float4 mainImage(float2 p) { return float4(gain(.5)); }', 'hlsl');
  let received;
  w.application.connect({ convertSource: createSourceConverter({
    wgsl: async () => { throw Error('wrong compiler'); },
    hlsl: async (code, options) => {
      received = {code, options};
      return {code:'// @haiyue-hlsl-module\nfn mainImage_0(p:vec2f)->vec4f{return vec4f(.5);}\nstruct Output { @location(0) color:vec4f };\n@fragment fn hy_fragment(@builtin(position) p:vec4f)->Output{return Output(mainImage_0(p.xy));}',diagnostics:[],warnings:[]};
    },
  }) });
  await w.setLanguage('image', 'wgsl');
  assert.match(received.code, /float4 mainImage/);
  assert.match(received.options.common, /gain/);
  assert.equal(received.options.entryPoint, 'image');
  assert.equal(languageOf(w.document.state, 'image'), 'wgsl');
  assert.deepEqual(await refreshProjectSources(w.document.serialize()), []);
});

const validate = async (w, id) => {
 const snapshot=w.document.serialize();
 assert.deepEqual(await refreshProjectSources(snapshot,undefined,translateWgsl),[]);
 const module=naga.parseWgsl(wrapShader(passOf(snapshot,id),snapshot.common).code);
 try { const info=naga.validate(module);info.free(); } finally { module.free(); }
 return passOf(snapshot,id).code;
};
for(const commonLanguage of ['glsl','wgsl']) test(`external ${commonLanguage} Common survives repeated conversions and edits without duplicating definitions`,async()=>{
 const w=new ShaderWorkspace();
 const common=commonLanguage==='glsl'?'float gain(float x){return x * 0.7;}':'fn gain(x:f32)->f32{return x * 0.7;}';
 w.document.setSource('common',common,commonLanguage);
 for(const id of ['image','buffer-a','sound']) {
  w.document.setSource(id,id==='sound'
   ? (commonLanguage==='glsl'?'vec2 mainSound(int s,float t){return vec2(gain(t));}':'fn mainSound(s:i32,t:f32)->vec2f{return vec2f(gain(t));}')
   : (commonLanguage==='glsl'?'void mainImage(out vec4 c,in vec2 p){c=vec4(gain(.5));}':'fn mainImage(p:vec2f)->vec4f{return vec4f(gain(.5));}'),commonLanguage);
  if(commonLanguage==='glsl')await w.setLanguage(id,'wgsl');
  let savedGlsl, savedWgsl;
  for(let i=0;i<2;i++) {
   await w.setLanguage(id,'glsl');
   if (i) assert.equal(sourceOf(w.document.state,id), savedGlsl);
   else savedGlsl = sourceOf(w.document.state,id);
   assert.doesNotMatch(sourceOf(w.document.state,id),/0\.7|float slCommonX/);
   await validate(w,id);
   await w.setLanguage(id,'wgsl');
   if (i) assert.equal(sourceOf(w.document.state,id), savedWgsl);
   else savedWgsl = sourceOf(w.document.state,id);
   if(commonLanguage==='glsl')assert.doesNotMatch(sourceOf(w.document.state,id),/hy_common_library_init\s*\(/);
   await validate(w,id);
  }
  await w.setLanguage(id,'glsl');
 }
 assert.equal(sourceOf(w.document.state,'common'),common);
 const sources=['image','buffer-a','sound'].map(id=>sourceOf(w.document.state,id));
 w.document.setSource('common',common.replace('0.7','0.9'),commonLanguage);
 for(const [index,id] of ['image','buffer-a','sound'].entries()) {
  assert.equal(sourceOf(w.document.state,id),sources[index]);
  assert.match(await validate(w,id),/0\.9/);
 }
});

test('Common constants, mutable globals, structs, overloads and output parameters remain external',async()=>{
 const w=new ShaderWorkspace();
 const common=`const float GAIN = 0.25;
 float bias = 0.1;
 struct Tint { vec3 color; };
 float gain(float x){ return x * GAIN + bias; }
 vec3 gain(vec3 x){ return x * GAIN; }
 void tint(inout vec3 c) { c = gain(c); }
 Tint makeTint(float x) { return Tint(vec3(gain(x))); }`;
 w.document.setSource('common',common,'glsl');
 w.document.setSource('image','void mainImage(out vec4 c,in vec2 p){ Tint t=makeTint(.5); tint(t.color); c=vec4(t.color,1.0); }','glsl');
 await w.setLanguage('image','wgsl');
 await w.setLanguage('image','glsl');
 const saved=sourceOf(w.document.state,'image');
 assert.doesNotMatch(saved,/0\.25|struct slCommonX|float slCommonX|void slCommonX/);
 await validate(w,'image');
 w.document.setSource('common',common.replace('0.25','0.4'),'glsl');
 assert.match(await validate(w,'image'),/0\.4/);
 assert.equal(sourceOf(w.document.state,'image'),saved);
});

test('direct WGSL Common constants are external reads and change on the next compile',async()=>{
 const w=new ShaderWorkspace();
 w.document.setSource('common','const brightness: f32 = 0.25; fn gain(x:f32)->f32{return x * brightness;}','wgsl');
 w.document.setSource('image','fn mainImage(p:vec2f)->vec4f{return vec4f(brightness + gain(0.5));}','wgsl');
 await w.setLanguage('image','glsl');
 assert.doesNotMatch(sourceOf(w.document.state,'image'),/0\.25/);
 await validate(w,'image');
 w.document.setSource('common','const brightness: f32 = 0.6; fn gain(x:f32)->f32{return x * brightness;}','wgsl');
 assert.match(await validate(w,'image'),/0\.6/);
});

test('an edited embedded Common is rejected rather than silently discarding the Pass edit',async()=>{
 const w=new ShaderWorkspace();
 w.document.setSource('common','float gain(float x){return x * 0.7;}','glsl');
 w.document.setSource('image','void mainImage(out vec4 c,in vec2 p){c=vec4(gain(0.5));}','glsl');
 await w.setLanguage('image','wgsl');
 w.document.setSource('image',sourceOf(w.document.state,'image').replace('0.7','0.3'),'wgsl');
 const before=w.document.serialize();
 await assert.rejects(w.setLanguage('image','glsl'),/无法安全拆分/);
 assert.deepEqual(w.document.serialize(),before);
});

test('Common texture helpers link with the current channel dimensions',async()=>{
 const w=new ShaderWorkspace();
 w.document.setSource('common','fn sampleColor(p:vec2f)->vec4f{return channel0(p);}','wgsl');
 w.document.setSource('image','fn mainImage(p:vec2f)->vec4f{return sampleColor(p / iResolution.xy);}','wgsl');
 await w.setLanguage('image','glsl');
 await validate(w,'image');
 assert.doesNotMatch(sourceOf(w.document.state,'image'),/vec4 channel0_|vec4 slCommonX/);
});

test('unchanged GLSL generated by the previous version can safely return to a separate Common',async()=>{
 const w=new ShaderWorkspace();
 w.document.setSource('common','float gain(float x){return x * 0.7;}','glsl');
 w.document.setSource('image','void mainImage(out vec4 c,in vec2 p){c=vec4(gain(0.5));}','glsl');
 await w.setLanguage('image','wgsl');
 const retained=sourceOf(w.document.state,'image');
 const old=await translateWgsl(retained,{common:translateGlsl(sourceOf(w.document.state,'common'),{entryPoint:'common'}).code,legacyEntryWrapper:true});
 w.document.setSource('image','// @haiyue-common-included\n'+old.code,'glsl');
 await w.setLanguage('image','wgsl');
 assert.equal(sourceOf(w.document.state,'image'),retained);
 await w.setLanguage('image','glsl');
 assert.doesNotMatch(sourceOf(w.document.state,'image'),/0\.7|float slCommonX/);
 await validate(w,'image');
});
