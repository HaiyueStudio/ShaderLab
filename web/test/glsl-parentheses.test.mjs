import test from 'node:test';
import assert from 'node:assert/strict';
import {simplifyGlslParentheses as simplify} from '../dist/glslParentheses.js';
import {formatShader} from '../../shared/dist/domain/shaderFormatting.js';
import {translateWgsl} from '../dist/wgsl.js';
import {translateGlsl} from '../dist/glsl.js';
import {createProject,passOf} from '../dist/model.js';
import {wrapShader} from '../dist/shaders.js';
import {ShaderWorkspace} from '../dist/workspace.js';
import {sourceOf} from '../dist/sourceLanguage.js';
import {parseWgsl,validate,writeWgsl} from 'naga-wasm';
import {buildSync} from 'esbuild';
import {runInNewContext} from 'node:vm';
import {fileURLToPath} from 'node:url';

function canonical(source){
  const translated=translateGlsl(source);assert.ok(translated.code,JSON.stringify(translated.diagnostics));
  const p=createProject(),pass=passOf(p,'image');pass.code=translated.code;
  const module=parseWgsl(wrapShader(pass,p.common).code),info=validate(module);
  try{return writeWgsl(module,info);}finally{info.free();module.free();}
}

test('generated expression groups disappear while required arithmetic grouping remains',()=>{
  const cases=[
    ['((a + (b * c)))','a + b * c'],['(((a + b) * c))','(a + b) * c'],
    ['(a - (b - c))','a - (b - c)'],['(a / (b / c))','a / (b / c)'],
    ['(a + (b + c))','a + (b + c)'],['(a * (b * c))','a * (b * c)'],
    ['((a - b) - c)','a - b - c'],['((a / b) / c)','a / b / c'],
    ['(((a)))','a'],['((-(a + b)))','-(a + b)'],['(-(-a))','- -a'],
    ['(a + (+b))','a + +b'],['(a - (-b))','a - -b'],
    ['((a << (b + c)))','a << b + c'],['((a & b) | c)','a & b | c'],
  ];
  for(const [from,to]of cases){const source='float f(float a,float b,float c){return '+from+';}',expected='float f(float a,float b,float c){return '+to+';}';const out=simplify(source);assert.equal(out,formatShader(expected,'glsl'),from);assert.equal(simplify(out),out);}
});

test('control heads, call arguments, ternaries, arrays and members keep their required delimiters',()=>{
  const source='void f(){for(int i=0;((i<4));i=(i+1)){if(((a<b)&&((b<c)||(a>c)))){x=f(((a+b)),((a-(b-c))),((a?b:c)));y=((v+w)).xy[z+((i*2))];}}}';
  const expected='void f(){for(int i=0;i<4;i=i+1){if(a<b&&(b<c||a>c)){x=f(a+b,a-(b-c),a?b:c);y=(v+w).xy[z+i*2];}}}';
  assert.equal(simplify(source),formatShader(expected,'glsl'));
  const comma='void f(){x=g(((a,b)),((c)));}';assert.equal(simplify(comma),formatShader('void f(){x=g((a,b),c);}','glsl'));
});

test('the GLSL importer and Naga retain exactly the same canonical shader after simplification',()=>{
  const sources=[
    'void mainImage(out vec4 c,in vec2 p){float a=p.x;float b=p.y;float d=0.012;c=vec4((a-(b-d)),(a/(b/d)),((a+b)*d),(a+(b+d)));}',
    'void mainImage(out vec4 c,in vec2 p){int a=int(p.x);int b=int(p.y);int d=3;bool f=((a<b)&&((b<d)||(a>d)));c=vec4(float(((a&d)|b)),float((a<<(b&d))),float((a>>(b&d))),f?1.0:0.0);}',
    'int calls=0;float nextValue(){calls+=1;return float(calls);}void mainImage(out vec4 c,in vec2 p){float x=(nextValue()-(nextValue()-nextValue()));float y=(nextValue()/(nextValue()/nextValue()));c=vec4(x,y,float(calls),1.0);}',
    'void mainImage(out vec4 c,in vec2 p){vec3 a[2]=vec3[2](vec3(0.1),vec3(0.2));int i=int(p.x)%2;vec3 v=(((a[((i))])));v.x=(v.x+(p.x*(p.y-0.012)));c=vec4(((v+p.x*vec3(0.1))).xyz,1.0);}',
    'void mainImage(out vec4 c,in vec2 p){float x=p.x;float y=p.y;for(int i=0;((i<3));i++){if(((x<y))){x=(x+(y*(x-0.012)));}else{x=(x-(y-x));}}c=vec4(x,y,0.012,1.0);}',
    'void mainImage(out vec4 c,in vec2 p){float x=p.x;float y=p.y;float z=((x<y)?(x+(y*0.012)):(y-(x-0.1)));c=vec4(z,(x+(y+z)),(x*(y*z)),1.0);}',
    'void mainImage(out vec4 c,in vec2 p){float x=p.x;float y=p.y;float z=((x<y)?(x=(x+0.1)):(y=(y-0.1)));c=vec4(x,y,z,1.0);}',
    'void mainImage(out vec4 c,in vec2 p){int i=int(p.x);float x=float(((++i)+(i++)));c=vec4(x,float(i),0.012,1.0);}',
  ];
  for(const source of sources){const out=simplify(source);assert.notEqual(out,source);assert.equal(canonical(out),canonical(source),source);assert.equal(simplify(out),out);}
});

test('comments, macro bodies and unsupported or deeply nested expressions remain safe',()=>{
  const note='/* Keep (these) notes */',line='// (reference)';const source=note+'\nvoid f(){'+line+'\nx=((a+(b*c)));}';
  const out=simplify(source);assert.ok(out.includes(note));assert.ok(out.includes(line));assert.match(out,/x = a \+ b \* c/);
  const macro='#define NEG(x) -x\n#define ADD(x,y) ((x) + \\\n (y))\nvoid f(){x=NEG((a+b));}';assert.equal(simplify(macro),macro);
  for(const unknown of ['x=((a+b);','x=*ptr+(a+b);','float x = '+'('.repeat(300)+'a+b'+')'.repeat(300)+';'])assert.equal(simplify(unknown),unknown);
});

test('WGSL exports simplify expressions in Image, Sound and separate Common without changing legacy output',async()=>{
  const result=await translateWgsl('fn curve(a:f32,b:f32,c:f32)->f32{return a-(b-c);} fn mainImage(p:vec2f)->vec4f{let uv=p/iResolution.xy;return vec4f(uv,curve(uv.x,uv.y,0.012),1.0);}');
  assert.ok(result.code,JSON.stringify(result.diagnostics));assert.match(result.code,/return a - \(b - c\);/);assert.match(result.code,/= p \/ iResolution.xy;/);assert.doesNotMatch(result.code,/return \(a -|= \(p \/ /);canonical(result.code);
  const sound=await translateWgsl('fn mainSound(s:i32,t:f32)->vec2f{return vec2f(sin((t+0.1)*2.0));}',{entryPoint:'sound'});assert.ok(sound.code,JSON.stringify(sound.diagnostics));assert.match(sound.code,/sin\(\(t \+ 0.1\) \* 2.0\)/);
  const common=await translateWgsl('fn mainImage(p:vec2f)->vec4f{return tint(p.x/iResolution.x);}',{common:'fn tint(x:f32)->vec4f{return vec4f((x+0.1)*0.5);}',commonMode:'separate'});assert.ok(common.code,JSON.stringify(common.diagnostics));assert.match(common.common,/\(x \+ 0.1\) \* 0.5/);assert.ok(translateGlsl(common.code,{common:common.common}).code);
  const legacy=await translateWgsl('fn mainImage(p:vec2f)->vec4f{return vec4f(p/iResolution.xy,0.012,1.0);}',{legacyEntryWrapper:true});assert.ok(legacy.code);assert.match(legacy.code,/return vec4\(\(p \/ _e\d+\.xy\)/);
});

test('cached GLSL drafts are cleaned and repeated WGSL/GLSL switches remain stable',async()=>{
  const w=new ShaderWorkspace();w.document.setSource('image','// retain comment\nvoid mainImage(out vec4 c,in vec2 p){vec2 uv=((p/iResolution.xy));c=vec4(((uv)),0.012,1.0);}','glsl');
  await w.setLanguage('image','wgsl');await w.setLanguage('image','glsl');const first=sourceOf(w.document.state,'image');assert.match(first,/uv = p \/ iResolution.xy/);assert.doesNotMatch(first,/\(\(uv\)\)|= \(p \/ /);
  for(let i=0;i<8;i++){await w.setLanguage('image','wgsl');await w.setLanguage('image','glsl');assert.equal(sourceOf(w.document.state,'image'),first);}
});

test('cached passes using macros from external Common retain argument grouping',async()=>{
  const w=new ShaderWorkspace();w.document.setSource('common','#define NEG(x) -x','glsl');
  const source='void mainImage(out vec4 c,in vec2 p){c=vec4(NEG((p.x+p.y)));}';w.document.setSource('image',source,'glsl');
  await w.setLanguage('image','wgsl');await w.setLanguage('image','glsl');const result=sourceOf(w.document.state,'image');assert.match(result,/NEG\(\(p.x \+ p.y\)\)/);assert.equal(canonical(result.replace('NEG((p.x + p.y))','-((p.x + p.y))')),canonical(source.replace('NEG((p.x+p.y))','-((p.x+p.y))')));
});

test('the native-side cleanup loads without Unicode property tables and preserves Chinese comments',()=>{
  const result=buildSync({entryPoints:[fileURLToPath(new URL('../dist/glslParentheses.js',import.meta.url))],bundle:true,format:'cjs',write:false}),module={exports:{}};
  class NativeRegExp extends RegExp {constructor(pattern,flags){if(String(pattern).includes('ID_Start'))throw new SyntaxError('Unsupported native Unicode property');super(pattern,flags);}}
  runInNewContext(result.outputFiles[0].text,{module,exports:module.exports,RegExp:NativeRegExp});
  const source='// 中文注释\nfloat f(float a,float b,float c){return ((a+(b*c)));}';
  assert.equal(module.exports.simplifyGlslParentheses(source),simplify(source));
});
