import {guiComparisonRequested} from '../experiments/gui-ui/flags';
import { Application, Device, File, knownFolders, path, isIOS } from '@nativescript/core';
import type { ShaderApplication } from '../../../shared/dist/application/application.js';
import type { ShaderProject } from '../../../shared/dist/domain/model.js';
import { sourceOf } from '../../../shared/dist/domain/sourceLanguage.js';
import type { NativeSharedEditor } from './shared-editor';

/** Explicit developer flag. Ordinary launches never replay or write fixtures. */
export function nativeValidationRequested(): boolean {
  if(guiComparisonRequested()||nativePerformanceRequested()||nativeLifecycleRequested())return true;
  if (isIOS) return Array.from({length:NSProcessInfo.processInfo.arguments.count},(_,i)=>String(NSProcessInfo.processInfo.arguments.objectAtIndex(i))).includes('--shaderlab-ui-check');
  return Application.android.startActivity?.getIntent()?.getBooleanExtra('shaderlab-ui-check',false) ?? false;
}
export function nativeLifecycleRequested():boolean {
  if(isIOS)return Array.from({length:NSProcessInfo.processInfo.arguments.count},(_,i)=>String(NSProcessInfo.processInfo.arguments.objectAtIndex(i))).includes('--shaderlab-ui-lifecycle');
  return Application.android.startActivity?.getIntent()?.getBooleanExtra('shaderlab-ui-lifecycle',false)??false;
}
export function nativePerformanceRequested(): boolean {
  if(isIOS)return Array.from({length:NSProcessInfo.processInfo.arguments.count},(_,i)=>String(NSProcessInfo.processInfo.arguments.objectAtIndex(i))).includes('--shaderlab-ui-performance');
  return Application.android.startActivity?.getIntent()?.getBooleanExtra('shaderlab-ui-performance',false)??false;
}
export interface PerformancePorts {
  mode:'legacy'|'shared';
  application:ShaderApplication;
  disposed():boolean;
  scale(value:number):void;
  frame():Promise<void>;
  status():{frame:number;width:number;height:number;ready:boolean;capture?:{active:boolean;width:number;height:number;time:number}};
  surfaceSize():{width:number;height:number};
  diagnostics():unknown;
}
/** Same fixture and fixed logical canvas in both modes. Picker animation is excluded. */
export async function measureNativeEditor(p:PerformancePorts):Promise<void> {
  const report:Record<string,unknown>={status:'running',mode:p.mode,startedAt:new Date().toISOString(),runId:crypto.randomUUID(),device:{os:Device.os,version:Device.osVersion,model:Device.model},kind:'native semantic scale handler and compile/presentation settling; frame cadence is not GPU timestamp',samples:[]};
  const file=File.fromPath(path.join(knownFolders.documents().path,'shaderlab-g07-performance.json'));
  const write=()=>file.writeText(JSON.stringify(report,null,2));
  const now=()=>isIOS?CACurrentMediaTime()*1000:java.lang.System.nanoTime()/1e6;
  const samples=report.samples as {scale:number;handler:number;settled:number}[];
  const p95=(values:number[])=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*.95)-1];
  const app=isIOS?UIApplication.sharedApplication:undefined,previousIdle=app?.idleTimerDisabled;
  let interrupted=false;
  report.foregroundContinuous=true;
  const suspended=()=>{interrupted=true;report.foregroundContinuous=false;report.status='failed';report.error='Application entered background during performance sampling';void write().catch(error=>console.error(error));};
  const check=()=>{if(interrupted||p.disposed())throw Error('Performance sampling interrupted');};
  Application.on(Application.suspendEvent,suspended);
  if(app)app.idleTimerDisabled=true;
  try {
    await write();
    const deadline=Date.now()+60000;
    while(!p.status().ready){if(p.disposed()||Date.now()>deadline)throw Error('GPU initialization timed out');await new Promise(r=>setTimeout(r,50));}
    for(let i=0;i<30;i++){await p.frame();check();}
    const size=p.surfaceSize();report.surface=size;report.initial=p.diagnostics();
    for(const scale of Array.from({length:20},()=>[.75,.5,.25,1,.75]).flat()){
      const start=now();p.scale(scale);const handler=now()-start;
      let settled=false;
      for(let i=0;i<600;i++){
        await p.frame();check();const status=p.status();
        const factor=Math.min(scale,1280/Math.max(size.width,size.height),Math.sqrt(786432/(size.width*size.height)));
        if(p.application.state.compile.status==='ready'&&status.frame>2&&status.width===Math.floor(size.width*factor)&&status.height===Math.floor(size.height*factor)){settled=true;break;}
      }
      if(!settled)throw Error('Scale did not settle: '+scale);
      if(JSON.stringify(p.surfaceSize())!==JSON.stringify(size))throw Error('Canvas dimensions changed during measurement');
      samples.push({scale,handler,settled:now()-start});
    }
    const intervals:number[]=[];let previous=now();
    for(let i=0;i<150;i++){await p.frame();check();const t=now();if(i>=30)intervals.push(t-previous);previous=t;}
    report.intervals=intervals;report.p95={handler:p95(samples.map(s=>s.handler)),settled:p95(samples.map(s=>s.settled)),cadence:p95(intervals)};
    report.final=p.diagnostics();report.status='passed';
  }catch(error){report.status='failed';report.error=String(error instanceof Error?error.stack:error);}
  finally{Application.off(Application.suspendEvent,suspended);if(app)app.idleTimerDisabled=previousIdle!;}
  report.completedAt=new Date().toISOString();await write();
}
export interface ValidationPorts {
  application: ShaderApplication;
  shared: NativeSharedEditor;
  disposed(): boolean;
  status(): {frame:number;width:number;height:number;ready:boolean;capture?:{active:boolean;width:number;height:number;time:number}};
  surfaceSize(): {width:number;height:number};
  setSource(source:string):void;
  saved():Promise<ShaderProject[]>;
  pixels():Promise<{width:number;height:number;pixels:Uint8Array}>;
}

/** Synthetic semantic replay on real GPU and storage; physical input is a separate check. */
export async function validateNativeEditor(p:ValidationPorts):Promise<void> {
  const report:Record<string,unknown>={status:'running',startedAt:new Date().toISOString(),runId:crypto.randomUUID(),kind:'native synthetic semantic replay, real GPU and file storage',device:{os:Device.os,version:Device.osVersion,model:Device.model},checks:[]};
  const checks=report.checks as unknown[],file=File.fromPath(path.join(knownFolders.documents().path,'shaderlab-g07.json'));
  const save=()=>file.writeText(JSON.stringify(report,null,2));
  const wait=async (condition:()=>boolean,label:string)=>{
    const deadline=Date.now()+45000;
    while(!condition()){if(p.disposed())throw Error('Page disposed during '+label);if(Date.now()>deadline)throw Error('Timed out: '+label);await new Promise(resolve=>setTimeout(resolve,50));}
  };
  const equal=(actual:unknown,expected:unknown,label:string)=>{if(JSON.stringify(actual)!==JSON.stringify(expected))throw Error(label+': '+JSON.stringify({actual,expected}));};
  try {
    await save();
    await wait(()=>p.status().frame>3,'first rendered frames');
    report.initial=p.shared.diagnostics();
    for(const scale of [.75,.5,.25,1,.75]) {
      p.shared.controller.dispatch({key:'/shader-toolbar/controls/scale',type:'commit',value:String(scale),reason:'keyboard',transaction:checks.length+1});
      await wait(()=>p.application.state.compile.status==='ready'&&p.application.state.project.preview.scale===scale&&p.status().frame>3,'scale '+scale);
      const size=p.surfaceSize(),factor=Math.min(scale,1280/Math.max(size.width,size.height),Math.sqrt(786432/(size.width*size.height)));
      const status=p.status();equal([status.width,status.height],[Math.max(1,Math.floor(size.width*factor)),Math.max(1,Math.floor(size.height*factor))],'GPU dimensions');
      equal(p.application.state.pane,'preview','pane');
      checks.push({scale,surface:size,target:[status.width,status.height],frame:status.frame});await save();
    }
    const camera=p.application.state.project.passes.some(pass=>pass.enabled&&pass.channels.some(channel=>channel.kind==='camera'));
    if(camera){await wait(()=>{const c=p.status().capture;return !!c?.active&&c.width>1&&c.height>1&&c.time>0;},'camera video frame');report.camera={firstFrame:p.status().capture};}
    p.shared.controller.dispatch({key:'/shader-toolbar/controls/play',type:'activate',reason:'pointer',transaction:20});
    equal(p.application.state.playing,false,'pause');
    if(camera){equal(p.status().capture?.active,false,'paused camera released');(report.camera as Record<string,unknown>).paused=p.status().capture;}
    p.shared.controller.dispatch({key:'/shader-toolbar/controls/play',type:'activate',reason:'pointer',transaction:21});
    equal(p.application.state.playing,true,'play');
    if(camera){await wait(()=>!!p.status().capture?.active,'camera resume');(report.camera as Record<string,unknown>).resumed=p.status().capture;}
    const pixels=await p.pixels(),center=((pixels.height>>1)*pixels.width+(pixels.width>>1))*4;
    report.readback={width:pixels.width,height:pixels.height,bytes:pixels.pixels.length,nonzero:pixels.pixels.some(v=>v!==0),centerRGBA:Array.from(pixels.pixels.slice(center,center+4))};
    equal(pixels.pixels.some(v=>v!==0),true,'GPU readback');
    p.shared.controller.dispatch({key:'/shader-project/name/field',type:'valueChange',value:'海月 G07 🌙',reason:'keyboard',transaction:22});
    p.application.dispatch({type:'pass.select',pass:'image'});
    p.setSource(sourceOf(p.application.state.project,'image')+'\n// G07 共享页面验收 🌙\n');
    equal(await p.shared.controller.save(),true,'save');
    const snapshot=p.application.snapshot(),saved=(await p.saved()).find(value=>value.id===snapshot.id);
    equal(saved,snapshot,'persisted file');equal(saved?.name,'海月 G07 🌙','uncommitted name');
    p.application.dispatch({type:'project.open',project:saved!,fork:false});
    equal(p.application.snapshot(),saved,'reopen');
    await p.shared.controller.compile();equal(p.application.state.compile.status,'ready','reopened compile');await wait(()=>p.status().frame>3,'reopened GPU frames');
    const final=p.shared.diagnostics();equal([final.preview,final.editor],[1,1],'PlatformView mount count');
    report.final=final;report.persisted=saved;report.render=p.status();report.application={pane:p.application.state.pane,compile:p.application.state.compile.status,save:p.application.state.save.status};
    report.status='passed';
  } catch(error) {report.status='failed';report.error=String(error instanceof Error?error.stack:error);}
  report.completedAt=new Date().toISOString();await save();console.log('ShaderLab G07 validation: '+report.status);
}
