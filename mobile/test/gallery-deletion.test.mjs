import test from 'node:test';
import assert from 'node:assert/strict';
import {createGalleryDeleteAction} from '../src/platform/gallery-deletion.ts';
const target={id:'owned-test-project',name:'My shader'};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
test('duplicate activations open one confirmation; cancel keeps the work and allows a later request',async()=>{
 let prompts=0;const removed=[],first=deferred();
 const run=createGalleryDeleteAction({confirm:()=>{prompts++;return first.promise;},remove:async id=>removed.push(id),refresh:async()=>{throw Error('Cancelled work must not refresh');}});
 const pending=run(target);await Promise.all([run(target),run({...target,id:'other'})]);assert.equal(prompts,1);first.resolve(false);await pending;assert.deepEqual(removed,[]);
 await run(target);assert.equal(prompts,2);
});
test('confirmation stays guarded through removal and refresh, deleting the captured work exactly once',async()=>{
 const confirm=deferred(),remove=deferred(),refresh=deferred(),events=[];
 const run=createGalleryDeleteAction({confirm:async p=>{events.push(['confirm',p.id]);return confirm.promise;},remove:async id=>{events.push(['remove',id]);await remove.promise;},refresh:async()=>{events.push(['refresh']);await refresh.promise;}});
 const pending=run(target);confirm.resolve(true);await new Promise(r=>setImmediate(r));await run(target);assert.deepEqual(events,[['confirm',target.id],['remove',target.id]]);
 remove.resolve();await new Promise(r=>setImmediate(r));await run(target);assert.deepEqual(events,[['confirm',target.id],['remove',target.id],['refresh']]);refresh.resolve();await pending;
});
test('confirmation, storage and refresh failures release the guard so retry is possible',async()=>{
 for(const fail of ['confirm','remove','refresh']){
  let broken=true,prompts=0;
  const run=createGalleryDeleteAction({confirm:async()=>{prompts++;if(broken&&fail==='confirm')throw Error(fail);return true;},remove:async()=>{if(broken&&fail==='remove')throw Error(fail);},refresh:async()=>{if(broken&&fail==='refresh')throw Error(fail);}});
  await assert.rejects(run(target),new RegExp(fail));broken=false;await run(target);assert.equal(prompts,2);
 }
});

test('the work shown in the confirmation stays the delete target even if the caller later changes its record',async()=>{
 const decision=deferred(),removed=[],record={...target};let shown;
 const run=createGalleryDeleteAction({confirm:async p=>{shown=p;return decision.promise;},remove:async id=>removed.push(id),refresh:async()=>{}});
 const pending=run(record);record.id='different-work';record.name='Renamed';assert.deepEqual(shown,target);decision.resolve(true);await pending;assert.deepEqual(removed,[target.id]);
});
