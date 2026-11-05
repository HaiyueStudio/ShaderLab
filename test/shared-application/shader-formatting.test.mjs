import assert from 'node:assert/strict';
import {test} from 'node:test';
import {formatShader,shaderFormatEdits} from '../../shared/dist/domain/shaderFormatting.js';
import {PRACTICE_CHALLENGES,practiceStarter} from '../../shared/dist/domain/practice.js';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
import {transformSync} from 'esbuild';
const apply=(source,edits)=>{for(const edit of [...edits].reverse())source=source.slice(0,edit.from)+edit.insert+source.slice(edit.to);return source;};
test('formats a compressed shader with two-space indentation and expression spacing',()=>{
 const source='fn mainImage(fragCoord:vec2f)->vec4f{let uv=fragCoord/iResolution.xy;return vec4f(uv,0.5,1.0);}';
 const expected='fn mainImage(fragCoord: vec2f) -> vec4f {\n  let uv = fragCoord / iResolution.xy;\n  return vec4f(uv, 0.5, 1.0);\n}\n';assert.equal(formatShader(source),expected);assert.equal(apply(source,shaderFormatEdits(source)),expected);
});
test('keeps for headers together and preserves nested control flow and attributes',()=>{
 const source='@fragment fn f()->@location(0) vec4<f32>{for(var i=0;i<3;i++){if(i==1){continue;}else{let x=-1e-3;}}return vec4<f32>(1.);}' ;const out=formatShader(source);assert.ok(out.includes('for (var i = 0; i < 3; i++) {'));assert.ok(out.includes('} else {'));assert.ok(out.includes('let x = -1e-3;'));assert.ok(out.includes('@location(0) vec4<f32>'));assert.equal(formatShader(out),out);
});
test('never rewrites macros, continuations, comments or quoted text',()=>{
 const directive='#define ADD(x,y) ((x) + \\\n    (y))',comment='/* nested /* inner */ keep  spaces */',line='// preserve  this  comment',literal='"path//literal\\\\with\\\"quote"';
 const source=directive+'\n'+line+'\nvoid f(){'+comment+';float x=ADD(1.,2.);}\n#include '+literal+'\n';const out=formatShader(source,'glsl');for(const original of [directive,comment,line,literal])assert.ok(out.includes(original),original);assert.equal(apply(source,shaderFormatEdits(source,'glsl')),out);assert.equal(formatShader(out,'glsl'),out);
});
test('does not merge separate operators or split scientific/hex numbers',()=>{
 for(const language of ['wgsl','glsl','hlsl']){const source='void f(){a=1e-3+0x1.fp-2;a=b+ +c;a=b- -c;a=b/ *p;a=i++ + ++j;a=a>>2;a=a> >b;}';const out=formatShader(source,language);assert.ok(out.includes('1e-3'));assert.ok(out.includes('0x1.fp-2'));assert.ok(out.includes('b + +c'));assert.ok(out.includes('b - -c'));assert.ok(out.includes('b / *p'));assert.ok(out.includes('a >> 2'));assert.ok(out.includes('a > > b'));assert.equal(apply(source,shaderFormatEdits(source,language)),out);assert.equal(formatShader(out,language),out);}
});
test('structs, nested templates, HLSL semantics and empty/incomplete code remain editable',()=>{
 const wgsl='struct S{a:array<vec2<f32>,3>,b:vec4f,};fn f(){var p:ptr<function,array<vec2<f32>>>;}';assert.ok(formatShader(wgsl).includes('a: array<vec2<f32>, 3>,\n  b: vec4f,'));assert.equal(apply(wgsl,shaderFormatEdits(wgsl)),formatShader(wgsl));
 const hlsl='float4 f(float2 p:TEXCOORD0):SV_Target{float a[2]={1.,2.};return float4(a[0],a[1],0.,1.);}';assert.ok(formatShader(hlsl,'hlsl').includes('p : TEXCOORD0) : SV_Target'));assert.equal(apply(hlsl,shaderFormatEdits(hlsl,'hlsl')),formatShader(hlsl,'hlsl'));
 for(const source of ['', '  \n', 'fn f(){let x=', '// only a comment', '/* unfinished', '#define A(x) x \\\n + 1'])assert.equal(apply(source,shaderFormatEdits(source)),formatShader(source));
});
test('formatting all 36 practice answers and all language starters is idempotent and whitespace-only',()=>{
 for(const [source,language] of [...PRACTICE_CHALLENGES.map(c=>[c.reference,'wgsl']),...['wgsl','glsl','hlsl'].map(l=>[practiceStarter(l),l])]){const edits=shaderFormatEdits(source,language),formatted=apply(source,edits);assert.equal(formatted,formatShader(source,language));assert.equal(formatShader(formatted,language),formatted);for(const e of edits){assert.ok(/^\s*$/.test(source.slice(e.from,e.to)));assert.ok(/^\s*$/.test(e.insert));}}
});

test('Unicode identifiers and adjacent attributes remain separate shader tokens',()=>{const source='@group(0)@binding(1)var 纹理:texture_2d<f32>;fn f(){let 颜色=vec3f(0.2);let x=颜色.x;}';const out=formatShader(source);assert.ok(out.includes('@group(0) @binding(1) var 纹理: texture_2d<f32>;'));assert.ok(out.includes('let 颜色 = vec3f(0.2);'));assert.equal(apply(source,shaderFormatEdits(source)),out);assert.equal(formatShader(out),out);});

test('TypeScript formatting keeps type annotations and GPU type arguments compact',()=>{
 const source='interface Tint{color:vec3f;}export function shade(p:vec2f):vec3f{const t=gpu.construct<Tint>(vec3f(p,0.012));for(let i:i32=0;i<3;i++){t.color.x+=0.1;}return t.color;}';
 const out=formatShader(source,'typescript');assert.ok(out.includes('p: vec2f): vec3f'));assert.ok(out.includes('gpu.construct<Tint>('));assert.ok(out.includes('i < 3'));assert.equal(apply(source,shaderFormatEdits(source,'typescript')),out);assert.equal(formatShader(out,'typescript'),out);
});

test('native runtimes without Unicode property tables can load and format ASCII code with Chinese comments',()=>{
 const source=readFileSync(new URL('../../shared/dist/domain/shaderFormatting.js',import.meta.url),'utf8'),module={exports:{}};
 class NativeRegExp extends RegExp {constructor(pattern,flags){if(String(pattern).includes('ID_Start'))throw new SyntaxError('Unsupported native Unicode property');super(pattern,flags);}}
 runInNewContext(transformSync(source,{format:'cjs'}).code,{module,exports:module.exports,RegExp:NativeRegExp});
 const native=module.exports,ascii='// 中文注释保持不变\nfn mainImage(p:vec2f)->vec4f{return vec4f(0.012);}';
 assert.equal(native.formatShader(ascii),formatShader(ascii));assert.ok(native.shaderFormatEdits(ascii).length>0);
 const unicode='fn f(){let 颜色=vec3f(0.2);let x=颜色.x;}';assert.equal(native.formatShader(unicode),unicode);assert.equal(native.shaderFormatEdits(unicode).length,0);
});
