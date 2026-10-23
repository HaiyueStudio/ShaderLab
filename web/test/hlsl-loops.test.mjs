import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import factory from '../../vendor/slang-2026.19/slang-wasm.js';
import {createHlslTranslator} from '../dist/hlsl.js';
import {translateWgsl} from '../dist/wgsl.js';
import {translateGlsl} from '../dist/glsl.js';
import {restoreHlslForLoops} from '../dist/glslLoops.js';
import {parseWgsl,validate} from 'naga-wasm';

const hlsl=createHlslTranslator(()=>factory({wasmBinary:readFileSync(new URL('../../vendor/slang-2026.19/slang-wasm.wasm',import.meta.url))}));
async function converted(source,options={}){
 const result=await translateWgsl(source,{target:'hlsl',...options});assert.ok(result.code,JSON.stringify(result.diagnostics));
 const runtime=await hlsl(result.code,{entryPoint:options.entryPoint??'image',common:result.common??''});assert.ok(runtime.code,JSON.stringify(runtime.diagnostics));
 const module=parseWgsl(runtime.code);let info;try{info=validate(module);}finally{info?.free();module.free();}
 return result;
}
for(const update of ['i++','i+=2','i--'])test(`${update}: HLSL keeps a for header, wrapping arithmetic, continue and break`,async()=>{
 const {code}=await converted(`// counted loop\nfn mainImage(p:vec2f)->vec4f{var s=0.0;for(var i=${update==='i--'?'7':'0'};${update==='i--'?'i>=0':'i<8'};${update}){if(i==3){continue;}if(s>10.0){break;}s+=f32(i);}return vec4f(s);}`);
 assert.match(code,/for\s*\(int i\s*=/);assert.doesNotMatch(code,/loop_init|while\s*\(/);
 assert.match(code,/asint\(asuint\(i\)/);assert.match(code,/\bcontinue;/);assert.match(code,/\bbreak;/);assert.match(code,/counted loop/);
 assert.equal(restoreHlslForLoops(code),code);
});
test('nested loops preserve externally used counters and generated bounds',async()=>{
 const {code}=await converted('fn mainImage(p:vec2f)->vec4f{var s=0.0;var i=0;for(;i<3;i++){for(var j=0;j<2;j++){s+=f32(i+j);}}return vec4f(s+f32(i));}');
 assert.equal((code.match(/for\s*\(/g)??[]).length,2);assert.match(code,/int i = int\(0\);/);assert.doesNotMatch(code,/loop_init|while\s*\(/);
 assert.equal((code.match(/uint2 loop_bound\w* =/g)??[]).length,2);
 assert.match(code,/i = all\(loop_bound == uint2\(0u, 0u\)\) \? i :/);
});
test('effectful loop tests stay in the body; for without a test keeps its update',async()=>{
 const {code}=await converted('var<private> limit:i32=5;fn bound()->i32{limit-=1;return limit;}fn mainImage(p:vec2f)->vec4f{var s=0.0;for(var i=0;i<bound();i++){s+=f32(i);}for(var j=0;;j++){if(j>=2){break;}s+=1.0;}return vec4f(s);}');
 assert.equal((code.match(/for\s*\(/g)??[]).length,2);assert.match(code,/\bint _e\d+ = bound\(/);assert.doesNotMatch(code,/loop_init|while\s*\(/);
});
test('complex continuing calls keep statement order inside for syntax',async()=>{
 const {code}=await converted('fn step(i:i32)->i32{return i+1;}fn mainImage(p:vec2f)->vec4f{var s=0.0;for(var i=0;i<4;i=step(i)){if(i==1){continue;}s+=f32(i);}return vec4f(s);}');
 assert.match(code,/for\s*\(;;\)/);assert.match(code,/loop_init/);assert.match(code,/step_?\(_e\d+\)/);assert.doesNotMatch(code,/while\s*\(/);assert.equal(restoreHlslForLoops(code),code);
});
test('ordinary WGSL while loops retain their own syntax',async()=>{
 const {code}=await converted('fn mainImage(p:vec2f)->vec4f{var i=0;while(i<3){i++;}return vec4f(f32(i));}');
 assert.match(code,/while\s*\(true\)/);assert.doesNotMatch(code,/for\s*\(/);
});
test('GLSL for can pass through WGSL into an HLSL for',async()=>{
 const wgsl=translateGlsl('void mainImage(out vec4 c,in vec2 p){float s=0.0;for(int i=0;i<3;i++){s+=float(i);}c=vec4(s);}');assert.ok(wgsl.code,JSON.stringify(wgsl.diagnostics));
 const {code}=await converted(wgsl.code);assert.match(code,/for\s*\(/);assert.doesNotMatch(code,/while\s*\(/);
});
test('Common and Sound also restore their for loops',async()=>{
 const result=await converted('fn mainSound(s:i32,t:f32)->vec2f{var v=0.0;for(var k=0;k<3;k++){v+=gain(t);}return vec2f(v);}',{entryPoint:'sound',common:'fn gain(t:f32)->f32{var s=0.0;for(var j=0;j<2;j++){s+=t;}return s;}',commonMode:'separate'});
 assert.match(result.code,/for\s*\(/);assert.match(result.common,/for\s*\(/);assert.doesNotMatch(result.code+result.common,/while\s*\(/);
});
