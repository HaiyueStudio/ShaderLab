import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { ShaderApplication, selectors } from '../../shared/dist/application/application.js';
import { createProject, parseProject, PREVIEW_SCALES } from '../../shared/dist/domain/model.js';
import { utf8Length } from '../../shared/dist/domain/values.js';
import { preparedPreview } from '../../shared/dist/ports/preparedPreview.js';

function environment() { let id = 0; return { ids: { next: () => `test-${++id}` }, clock: { nowISO: () => '2026-10-16T01:00:00.000Z' } }; }
function deferred() { let resolve, reject; const promise = new Promise((a,b) => { resolve=a; reject=b; }); return { promise, resolve, reject }; }
const tick = () => new Promise(resolve => setImmediate(resolve));
function fixture() {
  const env = environment(), app = new ShaderApplication(env), saved=[], drafts=[], prepared=[], committed=[], released=[], playback=[];
  let save = async snapshot => { saved.push(snapshot); return 'saved'; }, draft = async (snapshot, context) => { drafts.push({ snapshot, context }); }, open = async () => null;
  let prepare = async (snapshot, context) => { const handle = String(context.request); prepared.push({ snapshot, context }); return { handle, diagnostics: [] }; };
  app.connect({ projects: { save: (p,c) => save(p,c), saveDraft: (p,c) => draft(p,c), open: c => open(c) },
    preview: { prepare: (p,c) => prepare(p,c), commit: (h,c) => { assert.equal(c.signal.aborted,false); committed.push(h); }, release: h => released.push(h), play: value => playback.push(value), step: () => playback.push('step'), reset: () => playback.push('reset') } });
  return { app, env, saved, drafts, prepared, committed, released, playback,
    setSave: fn => {save=fn;}, setDraft: fn => {draft=fn;}, setOpen: fn => {open=fn;}, setPrepare: fn => {prepare=fn;} };
}
const rename = (app,name) => app.dispatch({type:'project.rename',name});

test('domain/application load and execute with no browser/native globals', () => {
  const entry = new URL('../../shared/dist/application/application.js',import.meta.url).href;
  execFileSync(process.execPath,['--input-type=module','-e',`for(const name of ['window','document','navigator','crypto','structuredClone','TextEncoder','GPUDevice']) Object.defineProperty(globalThis,name,{configurable:true,get(){throw Error('Forbidden global '+name);}});const {ShaderApplication}=await import(${JSON.stringify(entry)});const app=new ShaderApplication({ids:{next:()=> 'headless'},clock:{nowISO:()=> '2026-10-16T00:00:00Z'}});app.dispatch({type:'preview.scale',value:.75});app.dispatch({type:'project.rename',name:'无界面 😀'});if(app.snapshot().preview.scale!==.75)throw Error('bad state');app.dispose();`]);
});
test('old v1 fixture, missing optional fields and UTF-8 limits retain their format', () => {
  const old = JSON.parse(readFileSync(new URL('../../review/m24-ui/g01/project.hyshader',import.meta.url),'utf8'));
  assert.deepEqual(parseProject(JSON.stringify(old)),old);
  delete old.sound; delete old.common; delete old.tabs;
  const parsed=parseProject(JSON.stringify(old)); assert.equal(parsed.common,''); assert.equal(parsed.sound.enabled,false);
  for (const text of ['', '汉字😀', '\ud800', '\udc00', 'a\ud800b', '\u0000']) assert.equal(utf8Length(text),new TextEncoder().encode(text).length);
});
test('deterministic replay, preview scales and independent pass/pane/playback state', async () => {
  const a=fixture(),b=fixture(), actions=[
    {type:'project.rename',name:'Shared'}, {type:'pass.add',pass:'buffer-a'},
    {type:'source.edit',pass:'buffer-a',language:'glsl',source:'void mainImage(out vec4 c,in vec2 p){c=vec4(1.);}'},
    ...[1,.75,.5,.25,1,.75].map(value=>({type:'preview.scale',value})),
    {type:'channel.set',pass:'image',index:0,channel:{kind:'buffer',pass:'buffer-a'}},
    {type:'preview.mode',mode:'scene',mesh:'torus'}, {type:'pane.select',pane:'channels'},
    {type:'preview.play',value:false},{type:'preview.step'},{type:'preview.reset'}, {type:'save.request'}, {type:'compile.request'},
  ];
  for (const action of actions) { await a.app.dispatch(action);await b.app.dispatch(action);assert.deepEqual(a.app.state,b.app.state); }
  assert.deepEqual(PREVIEW_SCALES,[1,.75,.5,.25]);assert.equal(selectors.dirty(a.app.state),false);assert.equal(selectors.compiled(a.app.state),true);
  const revision=a.app.state.revision; a.app.dispatch({type:'pass.select',pass:'image'});a.app.dispatch({type:'pane.select',pane:'preview'});assert.equal(a.app.state.revision,revision);
  assert.deepEqual(parseProject(JSON.stringify(a.app.snapshot())),a.app.snapshot());
});
test('invalid changes are atomic, repeated source/scale edits are no-ops, keystrokes retain assets', () => {
  const {app}=fixture(); const original=app.state;
  for (const action of [{type:'preview.scale',value:.6},{type:'project.rename',name:''},{type:'channel.set',pass:'image',index:4,channel:{kind:'none'}},{type:'source.edit',pass:'invalid',language:'wgsl',source:''}]) { assert.throws(()=>app.dispatch(action));assert.equal(app.state,original); }
  app.dispatch({type:'preview.scale',value:1});app.setSource('image',selectors.source(app.state),'wgsl');assert.equal(app.state,original);
  const assets=app.state.project.assets;app.setSource('image','fn mainImage(p:vec2f)->vec4f{return vec4f(1.);}','wgsl');assert.equal(app.state.project.assets,assets);assert.notEqual(app.state.project,original.project);
});
test('saving captures a revision; editing while saving keeps dirty and queued saves preserve order', async () => {
  const f=fixture(),pending=deferred(),calls=[];f.setSave(async (p,c)=>{calls.push({p,c});if(calls.length===1)await pending.promise;return 'saved';});
  rename(f.app,'A');const revisionA=f.app.state.revision, first=f.app.save();await tick();rename(f.app,'B');const revisionB=f.app.state.revision;
  pending.resolve();assert.equal(await first,true);assert.equal(f.app.state.savedRevision,revisionA);assert.equal(selectors.dirty(f.app.state),true);assert.equal(calls[0].p.name,'A');
  const next=deferred(); f.setSave(async p=>{calls.push({p});if(p.name==='B')await next.promise;return 'saved';});
  const second=f.app.save();rename(f.app,'C');const third=f.app.save();await tick();assert.equal(calls.at(-1).p.name,'B');next.resolve();await second;await third;
  assert.deepEqual(calls.map(x=>x.p.name),['A','B','C']);assert.ok(f.app.state.savedRevision>revisionB);assert.equal(selectors.dirty(f.app.state),false);
});
test('save cancel/failure/retry and an earlier failure do not replace newer pending status', async () => {
  const f=fixture();f.setSave(async()=> 'cancelled');assert.equal(await f.app.save(),false);assert.equal(selectors.dirty(f.app.state),true);
  f.setSave(async()=>{throw Error('disk full');});await assert.rejects(f.app.save(),/disk full/);assert.equal(f.app.state.save.status,'failed');
  const slow=deferred();let count=0;f.setSave(async()=>{if(++count===1)await slow.promise;return 'saved';});
  const a=f.app.save(),failure=assert.rejects(a,/old failure/);await tick();rename(f.app,'new');const b=f.app.save();const request=f.app.state.save.request;slow.reject(Error('old failure'));await failure;assert.equal(f.app.state.save.request,request);await b;assert.equal(f.app.state.save.status,'idle');assert.equal(selectors.dirty(f.app.state),false);
});
for (const transition of ['open','dispose']) test(`late save success/error after ${transition} cannot mutate state`, async () => {
  for (const fail of [false,true]) {
    const f=fixture(),pending=deferred();let context;f.setSave(async(p,c)=>{context=c;await pending.promise;return 'saved';});const saving=f.app.save();await tick();
    if(transition==='open')f.app.dispatch({type:'project.open',project:createProject('New',f.env),fork:false});else f.app.dispose();
    const state=f.app.state;assert.equal(context.signal.aborted,true);fail?pending.reject(Error('stale')):pending.resolve();assert.equal(await saving,false);assert.equal(f.app.state,state);
  }
});
test('draft ordering captures pass and cancels queued drafts after opening another project', async () => {
  const f=fixture(),pending=deferred();f.setSave(async()=>{await pending.promise;return 'saved';});const save=f.app.save();await tick();
  f.app.dispatch({type:'pass.add',pass:'common'});const draft=f.app.saveDraft();f.app.dispatch({type:'project.open',project:createProject('Next',f.env),fork:false});pending.resolve();await save;assert.equal(await draft,false);assert.equal(f.drafts.length,0);
  f.app.dispatch({type:'pass.add',pass:'common'});const latest=f.app.saveDraft();f.app.dispatch({type:'pass.select',pass:'image'});await latest;assert.equal(f.drafts[0].context.activePass,'common');
});
test('same-revision compiles supersede each other and release the older handle exactly once', async () => {
  const f=fixture(),slow=deferred();let n=0;f.setPrepare(async()=> ++n===1?slow.promise:{handle:'new',diagnostics:[]});
  const a=f.app.compile();const b=f.app.compile();assert.equal(await b,true);const state=f.app.state;slow.resolve({handle:'old',diagnostics:[]});assert.equal(await a,false);
  assert.equal(f.app.state,state);assert.deepEqual(f.committed,['new']);assert.deepEqual(f.released,['old']);
});
for (const transition of ['edit','open','dispose']) test(`compile completion after ${transition} releases resources and does not publish diagnostics`, async () => {
  for (const fail of [false,true]) {
    const f=fixture(),pending=deferred();f.setPrepare(()=>pending.promise);const compiling=f.app.compile();
    if(transition==='edit')rename(f.app,'Changed');else if(transition==='open')f.app.dispatch({type:'project.open',project:createProject('New',f.env),fork:false});else f.app.dispose();
    const state=f.app.state; fail?pending.reject(Error('obsolete diagnostic')):pending.resolve({handle:'stale',diagnostics:[]});assert.equal(await compiling,false);assert.equal(f.app.state,state);assert.deepEqual(f.committed,[]);assert.deepEqual(f.released,fail?[]:['stale']);
  }
});
test('prepared transactions roll back/dispose exactly once; compilation failure retains the previous accepted revision and can retry', async () => {
  const f=fixture();assert.equal(await f.app.compile(),true);const accepted=f.app.state.compile.acceptedRevision;
  rename(f.app,'Changed');f.setPrepare(async()=>({handle:'broken',diagnostics:[{pass:'image',severity:'error',message:'syntax',line:1,column:1}]}));
  assert.equal(await f.app.compile(),false);assert.equal(f.app.state.compile.acceptedRevision,accepted);assert.equal(f.app.state.compile.status,'failed');assert.ok(f.released.includes('broken'));
  f.setPrepare(async()=>({handle:'prepared',diagnostics:[]}));const token=await f.app.prepareCompilation();token.release();token.release();assert.equal(token.commit(),false);assert.equal(f.released.filter(h=>h==='prepared').length,1);
  assert.equal(await f.app.compile(),true);const prepared=await f.app.prepareCompilation();f.app.dispose();assert.equal(prepared.commit(),false);assert.equal(f.released.filter(h=>h==='prepared').length,2);
});
test('file picker cancellation and late results do not replace edits/new sessions', async () => {
  const f=fixture(),pending=deferred();f.setOpen(()=>pending.promise);const opening=f.app.pick();rename(f.app,'Edited');pending.resolve(createProject('Picked',f.env));assert.equal(await opening,false);assert.equal(f.app.state.project.name,'Edited');
  f.setOpen(async()=>null);assert.equal(await f.app.pick(),false);f.setOpen(async()=>createProject('Picked',f.env));assert.equal(await f.app.pick(),true);assert.equal(f.app.state.project.name,'Picked');
});
test('selector subscriptions ignore unrelated state changes; unsubscribe and dispose are idempotent', async () => {
  const f=fixture(),names=[];const unsubscribe=f.app.select(s=>s.project.name,value=>names.push(value));await f.app.compile();f.app.dispatch({type:'pane.select',pane:'code'});rename(f.app,'Selected');rename(f.app,'Selected');assert.deepEqual(names,['Selected']);unsubscribe();rename(f.app,'Unsubscribed');f.app.dispose();f.app.dispose();assert.deepEqual(names,['Selected']);assert.throws(()=>rename(f.app,'closed'),/已关闭/);
});
test('prepared resource adapter captures its renderer and swaps synchronously, aborted handle is released', async () => {
  const f=fixture(),swaps=[],drops=[];let owner=1;
  f.app.connect({preview:preparedPreview(()=>{const id=owner;return {prepare:async()=>({diagnostics:[],owner:id}),commit:value=>swaps.push(value.owner),release:value=>drops.push(value.owner),play:()=>{},step:()=>{},reset:()=>{}};})});
  const token=await f.app.prepareCompilation();owner=2;assert.equal(token.commit(),true);assert.deepEqual(swaps,[1]);const pending=await f.app.prepareCompilation();rename(f.app,'Cancel');assert.equal(pending.commit(),false);assert.deepEqual(drops,[2]);
});

test('late draft failures are ignored and disposal during a notification stops remaining callbacks', async () => {
  const f=fixture(),pending=deferred();f.setDraft(()=>pending.promise);const draft=f.app.saveDraft();await tick();f.app.dispatch({type:'project.open',project:createProject('New',f.env),fork:false});pending.reject(Error('old recovery write'));assert.equal(await draft,false);
  let called=false;f.app.subscribe(()=>f.app.dispose());f.app.subscribe(()=>{called=true;});rename(f.app,'Dispose');assert.equal(called,false);
});

test('scale edits preserve immutable graph branches, reject invalid metadata and isolate exported snapshots', async () => {
  const f=fixture(),before=f.app.state;
  let notifications=0;f.app.subscribe(()=>notifications++);
  f.app.dispatch({type:'preview.scale',value:.75});
  const after=f.app.state;
  assert.equal(after.revision,before.revision+1);assert.equal(notifications,1);
  assert.equal(before.project.preview.scale,1);assert.equal(after.project.preview.scale,.75);
  for(const key of ['passes','assets','sound','editorLanguages','tabs'])assert.equal(after.project[key],before.project[key]);
  assert.notEqual(after.project.preview,before.project.preview);
  const exported=f.app.snapshot();exported.preview.scale=.25;exported.passes[0].code='changed outside';
  assert.equal(f.app.state.project.preview.scale,.75);assert.notEqual(f.app.state.project.passes[0].code,'changed outside');
  for(const value of [0,NaN,Infinity,'0.5',.1]){assert.throws(()=>f.app.dispatch({type:'preview.scale',value}),/预览/);assert.equal(f.app.state,after);}
  f.env.clock.nowISO=()=> 'invalid';assert.throws(()=>f.app.dispatch({type:'preview.scale',value:.5}),/日期/);assert.equal(f.app.state,after);
  f.app.dispatch({type:'preview.scale',value:.75});assert.equal(notifications,1);
  f.app.dispose();
});

test('scale-only edits still cancel pending compilation and preserve recovery/save snapshots', async () => {
  const f=fixture(),pending=deferred();let signal;
  f.setPrepare((_project,context)=>{signal=context.signal;return pending.promise;});
  const compiling=f.app.compile();
  f.app.dispatch({type:'preview.scale',value:.5});assert.equal(signal.aborted,true);
  pending.resolve({handle:'obsolete',diagnostics:[]});assert.equal(await compiling,false);
  assert.deepEqual(f.committed,[]);assert.deepEqual(f.released,['obsolete']);
  assert.equal(await f.app.saveDraft(),true);assert.equal(f.drafts[0].snapshot.preview.scale,.5);
  assert.equal(await f.app.save(),true);assert.equal(f.saved[0].preview.scale,.5);
  f.app.dispatch({type:'preview.scale',value:.25});assert.equal(f.saved[0].preview.scale,.5);assert.equal(selectors.dirty(f.app.state),true);
  f.app.dispose();
});
