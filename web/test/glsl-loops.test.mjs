import test from 'node:test';
import assert from 'node:assert/strict';
import {translateWgsl} from '../dist/wgsl.js';
import {translateGlsl} from '../dist/glsl.js';
import {restoreGlslForLoops} from '../dist/glslLoops.js';
import {parseWgsl,validate} from 'naga-wasm';
import {createProject,passOf} from '../dist/model.js';
import {wrapShader} from '../dist/shaders.js';

async function roundtrip(source){
 const result=await translateWgsl(source);assert.ok(result.code,JSON.stringify(result.diagnostics));
 const imported=translateGlsl(result.code);assert.ok(imported.code,JSON.stringify(imported.diagnostics));
 const project=createProject();passOf(project,'image').code=imported.code;
 const module=parseWgsl(wrapShader(passOf(project,'image'),'').code);let info;try{info=validate(module);}finally{info?.free();module.free();}
 return result.code;
}
for(const update of ['i++','i+=2','i--'])test(`counted loop ${update} exports as GLSL for and round-trips`,async()=>{
 const code=await roundtrip(`fn mainImage(p:vec2f)->vec4f{var sum=0.0;for(var i=${update==='i--'?'7':'0'};${update==='i--'?'i>=0':'i<8'};${update}){if(i==3){continue;}if(sum>10.0){break;}sum+=f32(i);}return vec4f(sum);}`);
 assert.match(code,/for\s*\(int i\s*=/);assert.doesNotMatch(code,/loop_init|while\s*\(true\)/);
 assert.match(code,/\bcontinue;/);assert.match(code,/\bbreak;/);
});
test('nested loops and variables used after the loop retain their scope',async()=>{
 const code=await roundtrip('fn mainImage(p:vec2f)->vec4f{var sum=0.0;var i=0;for(;i<3;i++){for(var j=0;j<2;j++){sum+=f32(i+j);}}return vec4f(sum+f32(i));}');
 assert.equal((code.match(/for\s*\(/g)??[]).length,2);assert.match(code,/int i = 0;/);assert.doesNotMatch(code,/loop_init/);
});
test('an unbounded for restores its update; ordinary while loops stay while',async()=>{
 const code=await roundtrip('fn mainImage(p:vec2f)->vec4f{var sum=0.0;for(var i=0;;i++){if(i>=4){break;}sum+=f32(i);}var j=0;while(j<2){j++;sum+=1.0;}return vec4f(sum);}');
 assert.match(code,/for\s*\([^;]*;\s*;\s*i\+\+\)/);assert.match(code,/while\s*\(true\)/);
});
test('effectful conditions stay in the body instead of reordering loads and calls',async()=>{
 const code=await roundtrip('var<private> limit:i32=4;fn bound()->i32{limit-=1;return limit;}fn mainImage(p:vec2f)->vec4f{var s=0.0;for(var i=0;i<bound();i++){s+=f32(i);}return vec4f(s);}');
 assert.match(code,/for\s*\(/);assert.match(code,/\bint _e\d+ = bound\(/);assert.doesNotMatch(code,/loop_init/);
});
test('complex continuing expressions are not reordered by the presentation cleanup',async()=>{
 const code=await roundtrip('fn step(i:i32)->i32{return i+1;}fn mainImage(p:vec2f)->vec4f{var s=0.0;for(var i=0;i<4;i=step(i)){s+=f32(i);}return vec4f(s);}');
 assert.match(code,/loop_init/);assert.equal(restoreGlslForLoops(code),code);
});
test('legacy source-pair verification retains the historical loop scaffold',async()=>{
 const source='fn mainImage(p:vec2f)->vec4f{var s=0.0;for(var i=0;i<4;i++){s+=f32(i);}return vec4f(s);}';
 const legacy=await translateWgsl(source,{legacyEntryWrapper:true});assert.ok(legacy.code,JSON.stringify(legacy.diagnostics));assert.match(legacy.code,/loop_init/);
 assert.doesNotMatch(await roundtrip(source),/loop_init/);
});
