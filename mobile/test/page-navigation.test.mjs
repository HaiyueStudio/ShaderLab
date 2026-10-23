import test from 'node:test';
import assert from 'node:assert/strict';
import {createPageNavigation} from '../src/platform/page-navigation.ts';

test('duplicate activations queue one page factory, including delayed callbacks after arrival',()=>{
  const owner={},destination={},queued=[];let current=owner,built=0;
  const navigation=createPageNavigation(owner,{current:()=>current,navigate:create=>queued.push(create)});
  const create=()=>{built++;return destination;};
  assert.equal(navigation.open(create),true);
  assert.equal(navigation.open(create),false);
  assert.equal(navigation.open(()=>({other:true})),false);
  assert.equal(queued.length,1);assert.equal(built,0);
  current=queued[0]();assert.equal(built,1);
  assert.equal(navigation.open(create),false);assert.equal(queued.length,1);
  current=owner;navigation.returned();
  assert.equal(navigation.open(create),true);assert.equal(queued.length,2);
});

test('a stale owner cannot navigate even after its state has been reset',()=>{
  const owner={};let pushes=0;
  const navigation=createPageNavigation(owner,{current:()=>({}),navigate:()=>pushes++});
  navigation.returned();assert.equal(navigation.open(()=>({})),false);assert.equal(pushes,0);
});

test('a synchronous navigation failure unlocks the owner for a retry',()=>{
  const owner={};let attempts=0;
  const navigation=createPageNavigation(owner,{current:()=>owner,navigate:create=>{attempts++;create();}});
  assert.throws(()=>navigation.open(()=>{throw Error('Unable to create page');}),/Unable to create page/);
  assert.equal(navigation.open(()=>({})),true);assert.equal(attempts,2);
});
