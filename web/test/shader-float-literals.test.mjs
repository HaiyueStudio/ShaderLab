import test from 'node:test';
import assert from 'node:assert/strict';
import {compactWgslFloatLiterals as compact} from '../dist/shaderFloatLiterals.js';
import {parseWgsl,validate} from 'naga-wasm';

test('generated f32 noise becomes readable decimals and scientific notation',()=>{
  const source='vec4f(0.01200000010430813f,0.10000000149011612f,9.99999997475242708e-07f,0.3333333432674408f)';
  assert.equal(compact(source),'vec4f(0.012f,0.1f,1e-6f,0.33333334f)');
  assert.equal(compact(compact(source)),compact(source));
});

test('only explicit decimal f32 literals change; comments, names, integers, f16 and abstract floats survive',()=>{
  const source=`// 0.01200000010430813f
/* outer 0.01200000010430813f /* nested 0.01200000010430813f */ */
let x0f=0x012f;let raw=0x3c449ba6u;let hex=0x1.8p+2f;
let half=0.01200103759765625h;let abstract=0.01200000010430813;
let integer=123456789u;let x=0.01200000010430813f;`;
  assert.equal(compact(source),source.replace('let x=0.01200000010430813f;','let x=0.012f;'));
});

test('finite f32 bit patterns round-trip exactly, including extremes and signed zero',()=>{
  const view=new DataView(new ArrayBuffer(4));let seed=0x91e10da5;
  const bits=[0,0x80000000,1,0x80000001,0x007fffff,0x00800000,0x3f7fffff,0x3f800000,0x3f800001,0x7f7fffff,0xff7fffff];
  for(let i=0;i<12000;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;bits.push(seed);}
  for(const pattern of bits){
    view.setUint32(0,pattern);const value=view.getFloat32(0);if(!Number.isFinite(value))continue;
    const original=(Object.is(value,-0)?'-0.0000000000000000':value.toPrecision(17))+'f';
    const result=compact(original);view.setFloat32(0,Number(result.slice(0,-1)));
    assert.equal(view.getUint32(0),pattern,`${original} -> ${result}`);
    assert.equal(compact(result),result);
  }
});

test('overflow and underflow literals are left to compiler diagnostics',()=>{
  for(const source of ['1e400f','1e39f','1e-50f','1e-400f'])assert.equal(compact(source),source);
});

test('shortened tiny/large values and mantissas remain valid typed WGSL',()=>{
  const values=[1.40129846432481707e-45,1.1754943508222875e-38,3.4028234663852886e38,0.01200000010430813,0.3333333432674408,16777216];
  for(const value of values){const source=compact(`fn mainImage(p:vec2f)->vec4f{return vec4f(${value.toPrecision(17)}f);}`);const module=parseWgsl(source);let info;try{info=validate(module);}finally{info?.free();module.free();}}
});
