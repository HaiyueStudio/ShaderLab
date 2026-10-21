import test from 'node:test';
import assert from 'node:assert/strict';
import {compactShaderWhitespace} from '../dist/shaderWhitespace.js';
import {translateGlsl} from '../dist/glsl.js';
import {translateWgsl} from '../dist/wgsl.js';
import {maskComments} from '../dist/wgslModules.js';
import {ShaderWorkspace} from '../dist/workspace.js';
import {sourceOf} from '../dist/sourceLanguage.js';

test('generated whitespace is compact and idempotent without changing tokens',()=>{
 const source='\n\nfn f() {\n  \n\n  let x = 1;  \n\n\n  return x;\n \n}\n\n\nfn g() {\n\n  f();\n\n}\n\n';
 const result=compactShaderWhitespace(source);
 assert.equal(result,'fn f() {\n  let x = 1;\n\n  return x;\n}\n\nfn g() {\n  f();\n}\n');
 assert.equal(result.replace(/\s/g,''),source.replace(/\s/g,''));
 assert.equal(compactShaderWhitespace(result),result);
});

test('comment bodies, nested comments and preprocessor continuation lines remain intact',()=>{
 const comment='/* first {\n\n\n  /* nested */\n\n last } */';
 const macro='#define VALUE \\\n\n';
 const source=comment+'\n\n\n'+macro+'// braces in a comment { }\nvoid f() {\n\n  return;\n\n}\n';
 const result=compactShaderWhitespace(source);
 assert.ok(result.includes(comment));assert.ok(result.includes(macro));
 assert.equal(maskComments(result).replace(/\s/g,''),maskComments(source).replace(/\s/g,''));
 assert.equal(compactShaderWhitespace(result),result);
});

test('both conversion directions and separate Common remove generated empty gaps',async()=>{
 const w=new ShaderWorkspace();
 w.document.setSource('common','fn tint(x:f32)->vec4f{return vec4f(x);}','wgsl');
 const original='// keep author formatting\n\n\nfn mainImage(p:vec2f)->vec4f {\n\n  return tint(p.x/iResolution.x);\n\n}\n';
 w.document.setSource('image',original,'wgsl');
 const converted=await translateWgsl(original,{common:sourceOf(w.document.state,'common'),commonMode:'separate'});
 assert.ok(converted.code,JSON.stringify(converted.diagnostics));
 for(const code of [converted.code,converted.common]){
  assert.doesNotMatch(code,/\n[ \t]*\n[ \t]*\n|\{\n[ \t]*\n|\n[ \t]*\n[ \t]*}/);
 }
 const forward=translateGlsl(converted.code,{common:converted.common});
 assert.ok(forward.code,JSON.stringify(forward.diagnostics));
 assert.doesNotMatch(forward.code,/\n[ \t]*\n[ \t]*\n|\{\n[ \t]*\n|\n[ \t]*\n[ \t]*}/);
 await w.setLanguage('image','glsl');
 const clean=sourceOf(w.document.state,'image');
 await w.setLanguage('image','wgsl');
 assert.equal(sourceOf(w.document.state,'image'),original,'reuse preserves authored comments and spacing');
 await w.setLanguage('image','glsl');assert.equal(sourceOf(w.document.state,'image'),clean);
 // Force fresh reverse conversion, including Common detachment.
 w.document.setSource('image',clean.replace('p.x','(p.x + 0.1)'),'glsl');
 await w.setLanguage('image','wgsl');
 assert.doesNotMatch(sourceOf(w.document.state,'image'),/\n[ \t]*\n[ \t]*\n/);
});
