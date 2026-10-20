import test from 'node:test';
import assert from 'node:assert/strict';
import {cloneValue} from '../../shared/dist/domain/values.js';

test('JSON snapshots own their nested data and preserve reserved object keys safely',()=>{
 const source=JSON.parse('{"__proto__":{"polluted":true},"constructor":{"name":"user"},"prototype":null,"items":[1,false,null,{"source":"shader 🌙"}]}');
 Object.freeze(source.items[3]);Object.freeze(source.items);Object.freeze(source);
 const copy=cloneValue(source);assert.deepEqual(copy,source);
 assert.equal(Object.getPrototypeOf(copy),Object.prototype);assert.equal({}.polluted,undefined);
 assert.equal(Object.hasOwn(copy,'__proto__'),true);assert.notEqual(copy.__proto__,source.__proto__);
 copy.items[3].source='edited';assert.equal(source.items[3].source,'shader 🌙');
 copy.__proto__.polluted=false;assert.equal(source.__proto__.polluted,true);
});

test('snapshot arrays preserve holes, undefined entries and independent repeated branches',()=>{
 const branch={code:'original'},source=[branch,,undefined,branch],copy=cloneValue(source);
 assert.deepEqual(copy,source);assert.equal(1 in copy,false);assert.equal(2 in copy,true);
 assert.notEqual(copy[0],copy[3]);copy[0].code='changed';assert.equal(copy[3].code,'original');assert.equal(branch.code,'original');
});


test('snapshots exclude inherited and non-enumerable properties',()=>{
 const source=Object.assign(Object.create({inherited:{code:'ignore'}}),{own:{code:'keep'},hasOwnProperty:'data'});
 Object.defineProperty(source,'hidden',{value:42});
 const copy=cloneValue(source);assert.deepEqual(copy,{own:{code:'keep'},hasOwnProperty:'data'});assert.notEqual(copy.own,source.own);
});
