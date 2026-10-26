import test from 'node:test';
import assert from 'node:assert/strict';
import {simplifyHlslAuthoring as clean} from '../dist/hlslCleanup.js';

test('generated straight-line loads inline through pure math while comments and named locals survive',()=>{
 const source='float4 mainImage(float2 p){float2 uv=(float2)0;uv=p;float2 _e1=uv;float t=(float)0;t=0.2;float _e2=t;float3 color=(float3)0;color=float3(_e1,sin(_e2));float3 _e3=color;return float4(_e3,1.0);}// _e1 stays in comments';
 const result=clean(source);assert.doesNotMatch(result,/\b(?:float[234]?)\s+_e\d+/);assert.match(result,/float2 uv=p;/);assert.match(result,/float t=0.2;/);assert.match(result,/float3 color=float3\(uv,sin\(t\)\)/);assert.match(result,/\/\/ _e1 stays in comments/);assert.equal(clean(result),result);
});
test('a final self-assignment can read the local directly, but its zero initializer is still needed',()=>{
 const result=clean('float4 mainImage(float2 p){float x=(float)0;float _e1=x;x=_e1+0.2;return float4(x);}');
 assert.doesNotMatch(result,/\b_e1\b/);assert.match(result,/float x=\(float\)0;/);assert.match(result,/x=x\+0.2;/);
});
for(const body of [
 'float x=0.2;float _e1=x;x=0.8;return float4(_e1,x,0,1);',
 'float x=0.2;float _e1=x;return float4(++x,_e1,0,1);',
 'float x=0.2;float _e1=x;update(x);return float4(_e1,x,0,1);',
 'float x=0.2;float _e1=x;if(p.x>0.5){x=0.8;}return float4(_e1,x,0,1);',
 'float a[2];a[0]=0.2;float _e1=a[0];a[0]=0.8;return float4(_e1);',
 'float x=0.2;float _e1=x;return float4(frexp(1.0,x),_e1,0,1);',
 'uint x=1u;uint _e1=x;asuint(1.0,x,y);return float4(_e1);',
])test('snapshots survive writes, calls, branches and output arguments: '+body.slice(0,65),()=>{
 assert.match(clean('float4 mainImage(float2 p){'+body+'}'),/\b_e1\b/);
});
test('user functions that share an intrinsic name are not treated as pure',()=>{
 const source='float x=0.2;float sin(float v){x=0.8;return v;}float4 mainImage(float2 p){float _e1=x;return float4(sin(p.x),_e1,x,1);}';
 assert.match(clean(source),/float _e1=x/);
});
test('author-named variables and field identifiers are preserved',()=>{
 const source='float4 mainImage(float2 p){float x=0.2;float _e9=x;return float4(_e9);}';
 assert.match(clean(source,'fn mainImage(p:vec2f)->vec4f{let _e9=0.2;return vec4f(_e9);}'),/float _e9=x/);
 const fields=clean('float4 mainImage(float2 p){float x=0.2;float _e1=x;float y=_e1;return float4(y,obj._e1,0,1);}');
 assert.match(fields,/float y=x;/);assert.match(fields,/obj\._e1/);
});
test('zero initialization stays when an earlier read or branch needs it',()=>{
 for(const body of ['float x=0.0;read(x);x=0.2;return float4(x);','float x=0.0;if(p.x>0.5){x=0.2;}return float4(x);','float x=0.0;x=x+0.2;return float4(x);']){
  assert.match(clean('float4 mainImage(float2 p){'+body+'}'),/float x=0.0;/);
 }
});
