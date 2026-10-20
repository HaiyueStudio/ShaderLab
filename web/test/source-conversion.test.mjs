import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderWorkspace } from '../dist/workspace.js';
import { languageOf, sourceOf } from '../dist/sourceLanguage.js';
import { refreshProjectSources } from '../dist/sourceProject.js';
import { translateGlsl } from '../dist/glsl.js';
import { projectTranslationOptions } from '../dist/glslProject.js';
import { createSourceConverter } from '../dist/sourceConversion.js';
import { passOf } from '../dist/model.js';
import { exportShadertoyPass } from '../dist/shadertoyExport.js';

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
  await assert.rejects(w.setLanguage('image', 'hlsl'), /不支持生成 HLSL/);
  assert.deepEqual(w.document.serialize(), before);
  assert.equal(w.document.revision, revision);
});

test('conversion roundtrip links Common once; supports Buffer and Sound', async () => {
  const w = new ShaderWorkspace();
  w.document.setSource('common', 'float gain(float x) { return x * .7; }', 'glsl');
  for (const pass of ['image', 'buffer-a', 'sound']) {
    w.document.setSource(pass, pass === 'sound'
      ? 'vec2 mainSound(int s, float t) { return vec2(gain(t)); }'
      : 'void mainImage(out vec4 c, in vec2 p) { c=vec4(gain(.5)); }', 'glsl');
    await w.setLanguage(pass, 'wgsl');
    await w.setLanguage(pass, 'glsl');
    const snapshot = w.document.serialize();
    assert.equal(projectTranslationOptions(snapshot, pass).common, undefined);
    assert.deepEqual(await refreshProjectSources(snapshot), []);
    assert.match(passOf(snapshot, pass).code, /@haiyue-common-included/);
    const exported = await exportShadertoyPass(w.document.state, pass);
    assert.equal(exported.code, sourceOf(w.document.state, pass), 'already linked Common is not prepended again on export');
  }
  await w.setLanguage('common', 'wgsl');
  assert.match(sourceOf(w.document.state, 'common'), /gain/);
  const before = w.document.serialize();
  await assert.rejects(w.setLanguage('common', 'glsl'), /Common/);
  assert.deepEqual(w.document.serialize(), before);
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
      return {code:'// @haiyue-common-included\n// @haiyue-hlsl-module\n@fragment fn converted() {}',diagnostics:[],warnings:[]};
    },
  }) });
  await w.setLanguage('image', 'wgsl');
  assert.match(received.code, /float4 mainImage/);
  assert.match(received.options.common, /gain/);
  assert.equal(received.options.entryPoint, 'image');
  assert.equal(languageOf(w.document.state, 'image'), 'wgsl');
  assert.deepEqual(await refreshProjectSources(w.document.serialize()), []);
});
