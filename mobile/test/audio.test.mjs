import {test} from 'node:test';import assert from 'node:assert/strict';import {SoundTransport} from '../src/audio-transport.ts';
const settle=async()=>{for(let i=0;i<20;i++)await Promise.resolve();};
test('native streaming passes 16 and 120 seconds continuously with bounded synthesis and preserves pause position',async t=>{
 t.mock.timers.enable({apis:['setTimeout']});const calls=[],errors=[],sinks=[];
 const stream=new SoundTransport(async(start,count)=>{calls.push([start,count]);return{left:new Float32Array(count),right:new Float32Array(count),sampleRate:44100};},e=>errors.push(e),()=>{const sink={played:0,enqueued:0,dead:false,async enqueue(a){assert.equal(this.dead,false);this.enqueued+=a.left.length;},dispose(){this.dead=true;}};sinks.push(sink);return sink;});
 stream.start(.25);await settle();const first=sinks[0];
 for(let i=0;i<1500;i++){first.played+=4410;t.mock.timers.tick(100);await settle();assert.ok(first.enqueued-first.played<=55125);}
 assert.ok(calls.at(-1)[0]>44100*120);for(let i=1;i<calls.length;i++)assert.equal(calls[i][0],calls[i-1][0]+calls[i-1][1]);
 stream.pause();assert.equal(first.dead,true);const resume=first.played;stream.start(.25);await settle();assert.equal(calls.findLast(([start])=>start===resume)?.[0],resume);assert.deepEqual(errors,[]);stream.dispose();t.mock.timers.reset();
});
test('replacement discards asynchronous samples from a stopped generation',async()=>{let resolve;const writes=[],errors=[];const stream=new SoundTransport(()=>new Promise(r=>resolve=r),e=>errors.push(e),()=>({played:0,async enqueue(a){writes.push(a);},dispose(){}}));stream.start(.2);stream.pause();resolve({left:new Float32Array(4),right:new Float32Array(4),sampleRate:44100});await settle();assert.deepEqual(writes,[]);assert.deepEqual(errors,[]);stream.dispose();});
