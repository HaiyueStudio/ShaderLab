import test from 'node:test';
import assert from 'node:assert/strict';
import {translateWgsl} from '../dist/wgsl.js';
import {translateGlsl} from '../dist/glsl.js';
import {shaderComments} from '../dist/shaderComments.js';
import {ShaderWorkspace} from '../dist/workspace.js';
import {sourceOf} from '../dist/sourceLanguage.js';
import {exportShadertoyPass} from '../dist/shadertoyExport.js';

const header='/* Copyright Example Author\n * 原作说明，不应丢失。\n */';
const wgsl=`${header}
// 曲线函数
fn curve(x:f32)->f32 { return x*x; /* 保留公式说明 */ }
fn mainImage(p:vec2f)->vec4f {
  // 按屏幕尺寸归一化
  let uv=p/iResolution.xy;
  return vec4f(curve(uv.x),uv.y,0.2,1.0); // 输出颜色
}
// 文件结尾说明`;
const notes=[header,'// 曲线函数','/* 保留公式说明 */','// 按屏幕尺寸归一化','// 输出颜色','// 文件结尾说明'];
const occurrences=(text,part)=>text.split(part).length-1;

test('WGSL exports preserve author comments near their declaration without the generated banner',async()=>{
 const result=await translateWgsl(wgsl);
 assert.ok(result.code,JSON.stringify(result.diagnostics));
 for(const note of notes)assert.equal(occurrences(result.code,note),1,note);
 assert.doesNotMatch(result.code,/Shadertoy GLSL ES 3\.00/);
 assert.ok(result.code.indexOf('// 按屏幕尺寸归一化')<result.code.indexOf('void mainImage'));
 assert.ok(translateGlsl(result.code).code);
 const again=translateGlsl(result.code);
 for(const note of notes)assert.equal(occurrences(again.code,note),1,note);
});

test('GLSL comments survive fresh conversion, edits, saved projects and repeated language switches',async()=>{
 let w=new ShaderWorkspace();
 const original=`${header}\nvoid mainImage(out vec4 c,in vec2 p){\n// 可编辑说明\n c=vec4(p/iResolution.xy,0.2,1.0); /* 行尾说明 */\n}`;
 w.document.setSource('image',original,'glsl');
 await w.setLanguage('image','wgsl');
 assert.ok(sourceOf(w.document.state,'image').includes(header));
 // Editing only a comment must not restore the stale GLSL draft.
 w.document.setSource('image',sourceOf(w.document.state,'image').replace('可编辑说明','更新后的说明'),'wgsl');
 await w.setLanguage('image','glsl');
 const converted=sourceOf(w.document.state,'image');
 assert.match(converted,/更新后的说明/);assert.doesNotMatch(converted,/可编辑说明|Shadertoy GLSL ES/);
 const reopened=new ShaderWorkspace();reopened.document.replace(w.document.serialize());w=reopened;
 for(let i=0;i<3;i++){
  await w.setLanguage('image','wgsl');
  await w.setLanguage('image','glsl');
  assert.equal(sourceOf(w.document.state,'image'),converted);
  assert.equal(occurrences(sourceOf(w.document.state,'image'),'更新后的说明'),1);
 }
});

for(const language of ['wgsl','glsl'])test(`${language} Common and Pass comments remain independently owned`,async()=>{
 const w=new ShaderWorkspace();
 const common=language==='wgsl'?'// Common 专属说明\nfn tint(x:f32)->vec4f{return vec4f(x);}'
  :'// Common 专属说明\nvec4 tint(float x){return vec4(x);}';
 const source=language==='wgsl'?'// Pass 专属说明\nfn mainImage(p:vec2f)->vec4f{\n// 图像步骤\nreturn tint(p.x/iResolution.x);}'
  :'// Pass 专属说明\nvoid mainImage(out vec4 c,in vec2 p){\n// 图像步骤\nc=tint(p.x/iResolution.x);}';
 w.document.setSource('common',common,language);w.document.setSource('image',source,language);
 for(const next of language==='wgsl'?['glsl','wgsl','glsl']:['wgsl','glsl','wgsl','glsl']){
  await w.setLanguage('image',next);
  const code=sourceOf(w.document.state,'image');
  assert.match(code,/Pass 专属说明/);assert.match(code,/图像步骤/);
  assert.doesNotMatch(code,/Common 专属说明/);
  assert.equal(sourceOf(w.document.state,'common'),common);
 }
 const exported=await exportShadertoyPass(w.document.serialize(),'image');
 assert.ok(exported.code,JSON.stringify(exported.diagnostics));
 assert.match(exported.code,/Common 专属说明/);assert.match(exported.code,/Pass 专属说明/);
});

test('nested WGSL comments and trailing backslashes cannot expose comment text as GLSL code',async()=>{
 const source='/* outer /* nested */ still comment */\n// Windows path C:\\\nfn mainImage(p:vec2f)->vec4f{return vec4f(1.0);}';
 const result=await translateWgsl(source);
 assert.ok(result.code,JSON.stringify(result.diagnostics));
 assert.match(result.code,/outer.*nested.*still comment/);
 assert.match(result.code,/Windows path/);
 assert.ok(translateGlsl(result.code).code,'mainImage must not be swallowed by a continued comment');
 const continued='// continuation \\\nnot_shader_code\nvoid mainImage(out vec4 c,in vec2 p){c=vec4(1.0);}';
 const converted=translateGlsl(continued);
 assert.ok(converted.code,JSON.stringify(converted.diagnostics));
 const back=await translateWgsl(converted.code);
 assert.ok(back.code,JSON.stringify(back.diagnostics));
 assert.ok(translateGlsl(back.code).code);
 assert.deepEqual(shaderComments('const char* s=\"https://example.test/*path*/\"; // actual','glsl').map(c=>c.text),['// actual']);
});

test('repeated author comments are retained rather than globally deduplicated',async()=>{
 const result=await translateWgsl('fn mainImage(p:vec2f)->vec4f{\n// step\nlet x=p.x;\n// step\nreturn vec4f(x);}');
 assert.ok(result.code);assert.equal(occurrences(result.code,'// step'),2);
 const combined=await translateWgsl('// step\nfn mainImage(p:vec2f)->vec4f{return vec4f(gain(p.x));}',{common:'// step\nfn gain(x:f32)->f32{return x;}'});
 assert.ok(combined.code);assert.equal(occurrences(combined.code,'// step'),2);
});

test('Pass comments around GLSL macros survive detaching compiled Common',async()=>{
 const w=new ShaderWorkspace();
 w.document.setSource('common','// library note\nfloat gain(float x){return x*.5;}','glsl');
 w.document.setSource('image','// macro note\n#define VALUE 0.8\nvoid mainImage(out vec4 c,in vec2 p){\n// pixel note\nc=vec4(gain(VALUE));}','glsl');
 await w.setLanguage('image','wgsl');
 // Force actual reverse compilation instead of reusing the original draft.
 w.document.setSource('image',sourceOf(w.document.state,'image').replace('0.8','0.6'),'wgsl');
 await w.setLanguage('image','glsl');
 assert.match(sourceOf(w.document.state,'image'),/macro note/);
 assert.match(sourceOf(w.document.state,'image'),/pixel note/);
 assert.doesNotMatch(sourceOf(w.document.state,'image'),/library note/);
});
