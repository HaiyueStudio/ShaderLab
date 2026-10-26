import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import factory from '../../vendor/slang-2026.19/slang-wasm.js';
import { createHlslTranslator } from '../dist/hlsl.js';
import { translateWgsl } from '../dist/wgsl.js';
import { createSourceConverter } from '../dist/sourceConversion.js';
import { ShaderWorkspace } from '../dist/workspace.js';
import { refreshProjectSources } from '../dist/sourceProject.js';
import { sourceOf, languageOf } from '../dist/sourceLanguage.js';
import { passOf, parseProject } from '../dist/model.js';
import { wrapShader } from '../dist/shaders.js';
import { parseWgsl, validate } from 'naga-wasm';
import { examples } from '../dist/examples.js';

const hlsl = createHlslTranslator(() =>
  factory({
    wasmBinary: readFileSync(
      new URL('../../vendor/slang-2026.19/slang-wasm.wasm', import.meta.url),
    ),
  }),
);
const convertSource = createSourceConverter({ wgsl: translateWgsl, hlsl });
const workspace = () => {
  const w = new ShaderWorkspace();
  w.application.connect({ convertSource });
  return w;
};

test('GLSL to HLSL removes generated local copies and split zero initialization',async()=>{
 const w=workspace();
 w.document.setSource('image','// palette calculation\nvoid mainImage(out vec4 fragColor,in vec2 fragCoord){vec2 uv=fragCoord/iResolution.xy;float t=iTime;vec3 color=vec3(uv,0.5+0.5*sin(t));fragColor=vec4(color,1.0);}','glsl');
 await w.setLanguage('image','hlsl');const code=sourceOf(w.document.state,'image');
 assert.doesNotMatch(code,/\b(?:float[234]?)\s+_e\d+\b/);assert.doesNotMatch(code,/\(float[234]?\)0|\(0\.0\)\.xxxx/);
 assert.match(code,/float2 uv\w* = .*fragCoord \/ iResolution\.xy/);assert.match(code,/float3 color = float3/);assert.match(code,/palette calculation/);await compiled(w);
});

test('GLSL local snapshots remain distinct when later writes need the old value',async()=>{
 const w=workspace();w.document.setSource('image','void mainImage(out vec4 c,in vec2 p){float x=0.2;float before=x;x=0.8;c=vec4(before,x,0.0,1.0);}','glsl');
 await w.setLanguage('image','hlsl');const code=sourceOf(w.document.state,'image');assert.match(code,/\bfloat before\b/);await compiled(w);
});

test('HLSL decimal constants stay concise through WGSL conversion and repeated language switches',async()=>{
  const w=workspace();
  w.document.setSource('image','// radius 0.012\nfloat4 mainImage(float2 p){return float4(0.012,0.1,0.000001,0.333333333);}','hlsl');
  for(const language of ['wgsl','hlsl','wgsl']){
    await w.setLanguage('image',language);
    const code=sourceOf(w.document.state,'image');
    if(language==='wgsl'){
      assert.match(code,/\b0\.012f\b/);assert.match(code,/\b0\.1f\b/);
      assert.doesNotMatch(code,/\d\.\d{10,}(?:e[+-]?\d+)?f\b/i);
    }
    assert.match(code,/radius 0\.012/);await compiled(w);
  }
});

test('HLSL authoring reads readonly builtins directly and retains author locals', async () => {
  const w = workspace();
  w.document.setSource('image', `// builtin reads stay readable
fn mainImage(p:vec2f)->vec4f {
  var size=iResolution;size.x+=1.0;
  return vec4f(p/iResolution.xy,iTime+iTimeDelta+iFrameRate+iSampleRate+f32(iFrame)+iMouse.x+iDate.x+iChannelTime[2]+iChannelResolution[1].x+size.x,1.0);
}`, 'wgsl');
  await w.setLanguage('image', 'hlsl');
  const code=sourceOf(w.document.state,'image');
  assert.doesNotMatch(code,/\b(?:float[234]?|int|uint)\s+_e\d+\s*=\s*i\w+(?:\.[xyzw]+|\[\d+\])*\s*;/);
  assert.match(code,/p\s*\/\s*iResolution\.xy/);
  assert.match(code,/float3 size\b/);
  assert.match(code,/\bsize\s*=\s*iResolution/);
  assert.match(code,/builtin reads stay readable/);
  await compiled(w);
});

for (const separate of [false,true])
  test(`HLSL keeps builtin snapshots when a ${separate?'Common':'Pass'} helper mutates the builtin`,async()=>{
    const w=workspace(),helper='fn change()->f32{iTime=0.75;return 0.2;}';
    if(separate)w.document.setSource('common',helper,'wgsl');
    w.document.setSource('image',(separate?'':helper)+'fn mainImage(p:vec2f)->vec4f{return vec4f(iTime,change(),iTime,1.0);}','wgsl');
    await w.setLanguage('image','hlsl');
    assert.match(sourceOf(w.document.state,'image'),/float _e\d+\s*=\s*iTime\s*;/);
    await compiled(w);
  });

test('HLSL retains indexed builtin snapshots when an intervening call changes the index',async()=>{
  const w=workspace();
  w.document.setSource('image','var<private> cursor:u32=0u;fn change()->f32{cursor=1u;return 0.2;}fn mainImage(p:vec2f)->vec4f{return vec4f(iChannelTime[cursor],change(),iChannelTime[cursor],1.0);}','wgsl');
  await w.setLanguage('image','hlsl');
  assert.match(sourceOf(w.document.state,'image'),/float _e\d+\s*=\s*iChannelTime\[/);
  await compiled(w);
});
async function compiled(w, id = 'image') {
  const p = w.document.serialize();
  assert.deepEqual(await refreshProjectSources(p, hlsl, translateWgsl), []);
  const code = wrapShader(passOf(p, id), p.common).code,
    m = parseWgsl(code);
  try {
    const info = validate(m);
    info.free();
  } finally {
    m.free();
  }
  return code;
}
for (const pass of ['image', 'buffer-a', 'sound'])
  for (const initial of ['wgsl', 'glsl']) {
    test(`${pass}: ${initial} -> HLSL -> WGSL/GLSL converts latest source and survives save/reopen`, async () => {
      let w = workspace();
      const source =
        pass === 'sound'
          ? initial === 'wgsl'
            ? '// author note\nfn mainSound(s:i32,t:f32)->vec2f{return vec2f(sin(t)*0.23);}'
            : '// author note\nvec2 mainSound(int s,float t){return vec2(sin(t)*0.23);}'
          : initial === 'wgsl'
            ? '// author note\nfn mainImage(p:vec2f)->vec4f{if(p.x<2.0){return vec4f(0.23);}return vec4f(p/iResolution.xy,0.23,1.0);}'
            : '// author note\nvoid mainImage(out vec4 c,in vec2 p){if(p.x<2.0){c=vec4(0.23);return;}c=vec4(p/iResolution.xy,0.23,1.0);}';
      w.document.setSource(pass, source, initial);
      if (pass !== 'image') w.setEnabled(pass, true);
      await w.setLanguage(pass, 'hlsl');
      assert.equal(languageOf(w.document.state, pass), 'hlsl');
      assert.match(
        sourceOf(w.document.state, pass),
        /float[24] main(?:Image|Sound)/,
      );
      assert.match(sourceOf(w.document.state, pass), /author note/);
      assert.doesNotMatch(
        sourceOf(w.document.state, pass),
        /register\(|nagaSamplerHeap|SV_Target/,
      );
      await compiled(w, pass);
      w.document.setSource(
        pass,
        sourceOf(w.document.state, pass).replaceAll('0.23', '0.81'),
        'hlsl',
      );
      const saved = parseProject(JSON.stringify(w.document.serialize()));
      w = workspace();
      w.document.replace(saved);
      for (const language of ['wgsl', 'hlsl', 'glsl', 'hlsl']) {
        await w.setLanguage(pass, language);
        await compiled(w, pass);
        assert.match(sourceOf(w.document.state, pass), /0\.81/);
        assert.doesNotMatch(
          sourceOf(w.document.state, pass),
          /@fragment|@binding|SV_Target|0\.23/,
        );
      }
    });
  }
for (const language of ['wgsl', 'glsl'])
  test(`HLSL conversion keeps ${language} Common external and reflects edits after conversion back`, async () => {
    const w = workspace();
    const common =
      language === 'wgsl'
        ? 'struct Tint { color:vec4f }; const scale:f32=0.23; fn tint(x:f32)->Tint{return Tint(vec4f(x*scale));}'
        : 'struct Tint { vec4 color; }; const float scale=0.23; Tint tint(float x){return Tint(vec4(x*scale));}';
    w.document.setSource('common', common, language);
    w.document.setSource(
      'image',
      language === 'wgsl'
        ? 'fn mainImage(p:vec2f)->vec4f{return tint(0.5).color;}'
        : 'void mainImage(out vec4 c,in vec2 p){c=tint(0.5).color;}',
      language,
    );
    await w.setLanguage('image', 'hlsl');
    assert.match(
      sourceOf(w.document.state, 'image'),
      /@haiyue-common-external/,
    );
    assert.doesNotMatch(
      sourceOf(w.document.state, 'image'),
      /\bstruct Tint|0\.23/,
    );
    await compiled(w);
    w.document.setSource('common', common.replaceAll('0.23', '0.81'), language);
    assert.match(await compiled(w), /0\.81/);
    await w.setLanguage('image', 'wgsl');
    await compiled(w);
    assert.doesNotMatch(
      sourceOf(w.document.state, 'image'),
      /slCommonX|0\.23|0\.81/,
    );
    w.document.setSource('common', common.replaceAll('0.23', '0.62'), language);
    assert.match(await compiled(w), /0\.62/);
    await w.setLanguage('image', 'hlsl');
    await compiled(w);
  });
test('HLSL writer handles matrices, loops, arrays, builtin writes and both texture dimensions', async () => {
  const w = workspace();
  w.document.setSource(
    'image',
    `fn mainImage(p:vec2f)->vec4f{
 var a=array<f32,2>(0.2,0.3);var v=vec2f(0.0);let m=mat2x2f(1,0,0,1);
 for(var i=0u;i<2u;i++){v+=vec2f(a[i]);}iTime=0.25;
 return channel0(m*v)+channel1(normalize(vec3f(p,1.0)))+vec4f(iTime);
}`,
    'wgsl',
  );
  // The hint is a supported way of compiling an unbound Cubemap placeholder.
  w.document.setSource(
    'image',
    '// @haiyue-channel iChannel1 cube\n' + sourceOf(w.document.state, 'image'),
    'wgsl',
  );
  await w.setLanguage('image', 'hlsl');
  await compiled(w);
  await w.setLanguage('image', 'wgsl');
  await compiled(w);
});
test('HLSL texture sampling can round-trip through GLSL with an independent Common', async () => {
  const w = workspace();
  w.document.setSource('common', 'fn gain(x:f32)->f32{return x*.5;}', 'wgsl');
  w.document.setSource(
    'image',
    'fn mainImage(p:vec2f)->vec4f{return channel0(p/iResolution.xy)*gain(.8);}',
    'wgsl',
  );
  for (const language of ['hlsl', 'glsl', 'wgsl', 'hlsl']) {
    await w.setLanguage('image', language);
    await compiled(w);
  }
});
test('invalid source or unsupported resources leave source, language and revision intact', async () => {
  for (const source of [
    'fn mainImage(',
    '@group(3) @binding(0) var<uniform> custom:vec4f;fn mainImage(p:vec2f)->vec4f{return custom;}',
  ]) {
    const w = workspace();
    w.document.setSource('image', source, 'wgsl');
    const before = w.document.serialize(),
      revision = w.document.revision;
    await assert.rejects(w.setLanguage('image', 'hlsl'));
    assert.deepEqual(w.document.serialize(), before);
    assert.equal(w.document.revision, revision);
  }
});
for (const order of ['Common first', 'Pass first'])
  test(`${order}: converting the Common tab to HLSL keeps converted Pass references valid`, async () => {
    const w = workspace();
    w.document.setSource(
      'common',
      'fn gain(x:f32)->f32{return x*0.23;}',
      'wgsl',
    );
    w.document.setSource(
      'image',
      'fn mainImage(p:vec2f)->vec4f{return vec4f(gain(.5));}',
      'wgsl',
    );
    for (const pass of order === 'Common first'
      ? ['common', 'image']
      : ['image', 'common'])
      await w.setLanguage(pass, 'hlsl');
    await compiled(w);
    w.document.setSource(
      'common',
      sourceOf(w.document.state, 'common').replace('0.23', '0.81'),
      'hlsl',
    );
    assert.match(await compiled(w), /0\.81/);
  });

for (const example of examples())
  test(`${example.project.name}: all enabled Gallery passes convert to valid HLSL`, async () => {
    const w = workspace();
    w.document.replace(example.project);
    for (const pass of w.document.state.passes.filter((p) => p.enabled))
      await w.setLanguage(pass.id, 'hlsl');
    for (const pass of w.document.state.passes.filter((p) => p.enabled))
      await compiled(w, pass.id);
  });

test('an HLSL Common graph can switch through WGSL/GLSL and back to HLSL', async () => {
  const w = workspace();
  w.document.setSource('common', 'float gain(float x){return x*.23;}', 'hlsl');
  w.document.setSource(
    'image',
    'float4 mainImage(float2 p){return float4(gain(.5));}',
    'hlsl',
  );
  for (const language of ['wgsl', 'glsl', 'hlsl']) {
    await w.setLanguage('image', language);
    await compiled(w);
  }
});
test('legacy generated WGSL modules convert to current HLSL without restoring a stale draft', async () => {
  const w = workspace();
  const old = await hlsl(
    'float4 mainImage(float2 p){return float4(.81,0,0,1);}',
  );
  assert.ok(old.code);
  w.document.setSource('image', old.code, 'wgsl');
  await w.setLanguage('image', 'hlsl');
  assert.match(sourceOf(w.document.state, 'image'), /0\.81/);
  await compiled(w);
});
