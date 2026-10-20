import test from 'node:test';
import assert from 'node:assert/strict';
import {MobileSession} from '../src/session.ts';
import {observeEditorDocument} from '../src/platform/editor-document.ts';
import {TrailingTask} from '../src/platform/trailing-task.ts';

test('trailing draft keeps latest deadline without per-edit timer replacement, and releases on disposal',()=>{
 let now=0,id=0,created=0,cancelled=0,runs=0;const timers=new Map();
 const schedule=(fn,delay)=>{created++;const key=++id;timers.set(key,{fn,at:now+delay});return key;};
 const cancel=key=>{cancelled++;timers.delete(key);};
 const advance=to=>{while(true){const next=[...timers].sort((a,b)=>a[1].at-b[1].at)[0];if(!next||next[1].at>to)break;now=next[1].at;timers.delete(next[0]);next[1].fn();}now=to;};
 const task=new TrailingTask(500,()=>runs++,()=>now,schedule,cancel);
 for(let i=0;i<10;i++){advance(i*40);task.request();assert.equal(timers.size,1);}
 assert.equal(created,1);assert.equal(cancelled,0);advance(859);assert.equal(runs,0);advance(860);assert.equal(runs,1);assert.equal(timers.size,0);
 task.request();advance(900);task.request();task.dispose();advance(3000);task.request();assert.equal(runs,1);assert.equal(timers.size,0);assert.equal(cancelled,1);
});

test('draft callback can request a later save without losing its timer',()=>{
 let now=0,callback,runs=0;const task=new TrailingTask(500,()=>{runs++;if(runs===1)task.request();},()=>now,fn=>{callback=fn;return 0;},()=>{});
 task.request();now=500;callback();assert.equal(runs,1);now=1000;callback();assert.equal(runs,2);task.dispose();
});

test('native document projection ignores compile status and preserves rename, source, pass, open, draft and unsubscribe',async()=>{
 let nextId=0;const session=new MobileSession({ids:{next:()=>String(++nextId)},clock:{nowISO:()=> '2026-10-19T00:00:00Z'}});
 const a=session.application,events=[];
 a.connect({preview:{prepare:async()=>({handle:'h',diagnostics:[]}),commit(){},release(){},play(){},step(){},reset(){}}});
 const off=observeEditorDocument(session,{showSource:()=>events.push('show'),renderChannels:()=>events.push('channels'),syncSource:s=>events.push(['source',s]),title:n=>events.push(['title',n]),draft:()=>events.push('draft')});
 await a.compile();a.dispatch({type:'preview.play',value:false});a.markSaved();assert.deepEqual(events,[]);
 a.dispatch({type:'preview.scale',value:.75});await a.compile();assert.deepEqual(events,['draft']);events.length=0;
 a.dispatch({type:'project.rename',name:'Renamed'});await a.compile();assert.deepEqual(events,[['title','Renamed'],'draft']);events.length=0;
 session.setSource('// changed');assert.deepEqual(events,[['source','// changed'],'draft']);events.length=0;
 session.add('buffer-a');assert.ok(events.includes('show'));assert.ok(events.includes('channels'));events.length=0;
 session.open(session.project,true);assert.ok(events.includes('show'));assert.ok(events.includes('channels'));events.length=0;
 off();session.setSource('// after unsubscribe');assert.deepEqual(events,[]);a.dispose();
});
