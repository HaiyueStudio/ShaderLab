import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { HY_COMPONENTS } from '@haiyue/ui/core';
import { ShaderApplication } from '../../shared/dist/application/application.js';
import { ShaderEditorController, saveMessage, saveIndicator, saveFeedback } from '../../shared/dist/views/editor-controller.js';
import { mountShaderEditorPart } from '../../shared/dist/views/editor-page.js';

const fixture=JSON.parse(readFileSync(new URL('../../review/m24-ui/g01/project.hyshader',import.meta.url)));
const deferred=()=>{let resolve;const promise=new Promise(r=>resolve=r);return {promise,resolve};};
const tick=()=>new Promise(resolve=>setImmediate(resolve));
function setup(overrides={}) {
  let next=0;const writes=[],commits=[],released=[];
  const application=new ShaderApplication({ids:{next:()=>`id-${++next}`},clock:{nowISO:()=>fixture.updatedAt}},fixture);
  application.dispatch({type:'project.open',project:fixture,fork:false});
  application.connect({projects:{open:async()=>fixture,save:async project=>{writes.push(project);return 'saved';},saveDraft:async()=>{}},preview:{prepare:async()=>({handle:`handle-${++next}`,diagnostics:[]}),commit:handle=>{commits.push(handle);},release:handle=>released.push(handle),play(){},step(){},reset(){}}});
  const controller=new ShaderEditorController(application,{ensurePreview:async()=>{},flushEditor(){},previewModeChanged(){},playbackChanged(){},compiled(){},exportProject(){},...overrides});
  return {application,controller,writes,commits,released};
}
class Recorder {
  capabilities={contract:1,backend:'web',components:HY_COMPONENTS,features:['text.composition','text.selection','text.secure','accessibility']};
  nodes=new Map();batches=[];created=0;disposed=false;
  mount(emit){this.emit=emit;}
  commit(_revision,mutations){this.batches.push(mutations);for(const m of mutations){if(m.type==='create'){this.nodes.set(m.node.key,{identity:{},node:m.node});this.created++;}else if(m.type==='update'){this.nodes.get(m.node.key).node=m.node;}else if(m.type==='remove'){for(const k of this.nodes.keys())if(k===m.key||k.startsWith(m.key+'/'))this.nodes.delete(k);}}}
  focus(){} suspend(){} resume(){} dispose(){this.disposed=true;this.nodes.clear();}
  event(key,type,value){this.emit({key,type,value,reason:'pointer',transaction:1});}
}

test('shared controls commit one scale action, retain special views and preserve preview on failure',async()=>{
  let flushes=0;
  const {controller,application}=setup({flushEditor(){flushes++;}});
  const renderers=['project','toolbar','preview','editor'].map(part=>{const r=new Recorder();return {r,page:mountShaderEditorPart(r,controller,part)};});
  const initial=renderers.map(({r})=>({created:r.created,identities:[...r.nodes].map(([key,v])=>[key,v.identity])}));
  const toolbar=renderers[1].r;
  for(const value of ['0.75','0.5','0.25','1','0.75']){
    const revision=application.state.revision;
    toolbar.event('/shader-toolbar/controls/scale','valueChange',value);
    assert.equal(application.state.revision,revision,'discrete valueChange is not a second command');
    toolbar.event('/shader-toolbar/controls/scale','commit',value);await tick();
    assert.equal(application.state.project.preview.scale,Number(value));assert.equal(application.state.pane,'preview');
  }
  for(const [i,{r}] of renderers.entries()){assert.equal(r.created,initial[i].created);for(const [key,identity] of initial[i].identities)assert.equal(r.nodes.get(key).identity,identity);}
  assert.equal(flushes,5,'one editor flush per committed scale selection');
  application.connect({preview:{prepare:async()=>{throw Error('test compiler error');},commit(){},release(){},play(){},step(){},reset(){}}});
  assert.equal(await controller.compile(),false);assert.equal(application.state.compile.status,'failed');assert.equal(application.state.pane,'preview');
  for(const {page} of renderers)page.dispose();assert.equal(controller.diagnostics.subscriptions,0);controller.dispose();application.dispose();
});

test('save flushes uncommitted name and editor content; composition cannot silently save an earlier draft',async()=>{
  let application;const x=setup({flushEditor(){application.setSource('image','// edited 🌙\n'+fixture.passes.find(p=>p.id==='image').code,'wgsl');}});application=x.application;
  const r=new Recorder(),page=mountShaderEditorPart(r,x.controller,'project');
  assert.equal(saveIndicator(x.controller.getSnapshot()),'saved');assert.equal(r.nodes.get('/shader-project/status').node.props.visible,false);
  r.event('/shader-project/name/field','valueChange','海月 🌙 未失焦');
  assert.equal(saveIndicator(x.controller.getSnapshot()),'modified');
  assert.notEqual(application.state.project.name,'海月 🌙 未失焦');
  assert.equal(await x.controller.save(),true);assert.equal(x.writes[0].name,'海月 🌙 未失焦');assert.match(x.writes[0].passes.find(p=>p.id==='image').code,/edited 🌙/);
  assert.equal(saveIndicator(x.controller.getSnapshot()),'saved');assert.equal(saveFeedback(x.controller.getSnapshot()),'');assert.equal(r.nodes.get('/shader-project/status').node.props.visible,false);
  application.setSource('image','// later edit','wgsl');assert.equal(saveMessage(x.controller.getSnapshot()),'有未保存的修改');
  r.event('/shader-project/name/field','compositionStart');await assert.rejects(x.controller.save(),/候选/);assert.equal(x.writes.length,1);
  r.event('/shader-project/name/field','compositionEnd');r.event('/shader-project/name/field','valueChange','完成候选');await x.controller.save();assert.equal(x.writes[1].name,'完成候选');
  page.dispose();x.controller.dispose();application.dispose();
});

test('export flushes the focused name and editor, and rejects unconfirmed composition',async()=>{
  let exported,application;const x=setup({flushEditor(){application.setSource('image','// export latest','wgsl');},exportProject(){exported=application.snapshot();}});application=x.application;
  x.controller.dispatch({key:'/shader-project/name/field',type:'valueChange',value:'导出未失焦 🌙',reason:'keyboard',transaction:1});
  await x.controller.exportProject();assert.equal(exported.name,'导出未失焦 🌙');assert.equal(exported.passes.find(p=>p.id==='image').code,'// export latest');assert.equal(x.writes.length,0);
  exported=undefined;x.controller.dispatch({key:'/shader-project/name/field',type:'compositionStart',reason:'keyboard',transaction:2});
  await assert.rejects(x.controller.exportProject(),/候选/);assert.equal(exported,undefined);
  x.controller.dispose();application.dispose();
});

test('late preview initialization and save completion cannot overwrite a newly opened project',async()=>{
  const ready=deferred(),save=deferred();const x=setup({ensurePreview:()=>ready.promise});
  const compiling=x.controller.compile();
  x.application.dispatch({type:'project.open',project:{...fixture,id:'new-project',name:'New'},fork:false});ready.resolve();assert.equal(await compiling,false);assert.deepEqual(x.commits,[]);
  x.application.connect({projects:{open:async()=>null,save:()=>save.promise,saveDraft:async()=>{}}});
  const saving=x.controller.save();await tick();x.application.dispatch({type:'project.open',project:fixture,fork:false});save.resolve('saved');assert.equal(await saving,false);assert.equal(x.controller.getSnapshot().message,'');
  x.controller.dispose();x.application.dispose();
});

test('cancel and failed save remain retryable with the same shared document',async()=>{
  const x=setup();let mode='cancelled';x.application.connect({projects:{open:async()=>null,save:async()=>{if(mode==='failed')throw Error('disk full');return mode;},saveDraft:async()=>{}}});
  x.controller.dispatch({key:'/shader-project/name/field',type:'valueChange',value:'retained',reason:'keyboard',transaction:1});
  assert.equal(await x.controller.save(),false);assert.equal(x.application.state.project.name,'retained');
  mode='failed';await assert.rejects(x.controller.save(),/disk full/);assert.equal(x.application.state.save.status,'failed');
  assert.equal(saveIndicator(x.controller.getSnapshot()),'modified');assert.match(saveFeedback(x.controller.getSnapshot()),/disk full/);
  mode='saved';assert.equal(await x.controller.save(),true);assert.equal(x.application.state.savedRevision,x.application.state.revision);
  x.controller.dispose();x.application.dispose();
});

test('50 page mounts release subscriptions and late events without disposing the application',async()=>{
  const {controller,application}=setup();
  for(let i=0;i<50;i++){
    const r=new Recorder(),page=mountShaderEditorPart(r,controller,'project');assert.equal(controller.diagnostics.subscriptions,1);
    page.dispose();assert.equal(controller.diagnostics.subscriptions,0);assert.equal(r.nodes.size,0);
    r.event('/shader-project/name/field','valueChange','late');assert.equal(controller.getSnapshot().name,fixture.name);
  }
  assert.equal(application.disposed,false);controller.dispose();application.dispose();
});

test('shared editor buttons carry vector names, semantic variants and accessible names',()=>{
 const x=setup(),parts=['project','toolbar'].map(part=>{const r=new Recorder();return {r,page:mountShaderEditorPart(r,x.controller,part)};});
 try{
  const buttons=parts.flatMap(({r})=>[...r.nodes.values()].map(e=>e.node).filter(n=>n.kind==='Button'&&n.props.icon));
  assert.equal(buttons.length,6);for(const {props} of buttons){assert.equal(props.text,'');assert.ok(props.a11y.label);assert.equal(props.layout.minHeight,44);assert.ok(['primary','quiet'].includes(props.variant));}
  assert.equal(parts[0].r.nodes.get('/shader-project/actions/save').node.props.icon,'save');assert.equal(parts[1].r.nodes.get('/shader-toolbar/controls/play').node.props.icon,'pause');
 }finally{parts.forEach(({page})=>page.dispose());x.controller.dispose();x.application.dispose();}
});
