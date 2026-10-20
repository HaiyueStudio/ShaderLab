/// <reference types="@nativescript/types-ios/lib/ios/objc-x86_64/objc!Darwin" />
import {Application,Device,File,knownFolders,path,Utils,isAndroid} from '@nativescript/core';
import type {NativeSharedEditor} from './shared-editor';

export interface LifecycleProbe {
  disposed:boolean;
  pageLoaded:boolean;
  pageNative:boolean;
  canvasNative:boolean;
  engineState:string|undefined;
  frame:number;
  shared:ReturnType<NativeSharedEditor['diagnostics']>|undefined;
  scheduledCallbacks:number|undefined;
}
export interface LifecycleSession {snapshot():LifecycleProbe;leave():void;references():Record<string,WeakRef<object>>;}
const delay=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));

/** Explicit developer-only real navigation cycles. Does not claim GPU heap accounting. */
export async function validateNativeLifetimes(open:()=>LifecycleSession):Promise<void> {
  const file=File.fromPath(path.join(knownFolders.documents().path,'shaderlab-g07-lifecycle.json'));
  const report={status:'running',startedAt:new Date().toISOString(),completedAt:'',device:{os:Device.os,version:Device.osVersion,model:Device.model},
    weakReferenceProbes:isAndroid||!NSProcessInfo.processInfo.arguments.containsObject('--shaderlab-no-weak-probes'),
    kind:'50 real native editor/GPU host lifetimes; adapter and frame resources; process memory observation is not native GPU heap accounting',
    cycles:[] as unknown[],settled:undefined as {memory:Record<string,number>;retained:Record<string,boolean>[]} | undefined,error:''};
  const write=()=>file.writeText(JSON.stringify(report,null,2));
  const wait=async(test:()=>boolean,label:string)=>{const deadline=Date.now()+45000;while(!test()){if(Date.now()>deadline)throw Error(label+' timed out');await delay(50);}};
  const check=(ok:boolean,label:string)=>{if(!ok)throw Error(label);};
  let current:LifecycleSession|undefined;
  const retired:Record<string,WeakRef<object>>[]=[];
  const window=isAndroid?Application.android.foregroundActivity?.getWindow():undefined;
  const keepScreenOn=androidFlag();
  const hadKeepScreenOn=window?!!(window.getAttributes().flags&keepScreenOn):false;
  const iosApp=isAndroid?undefined:UIApplication.sharedApplication;
  const hadIdleTimerDisabled=iosApp?.idleTimerDisabled;
  if(iosApp)iosApp.idleTimerDisabled=true;
  window?.addFlags(keepScreenOn);
  try {
    await write();
    for(let i=0;i<50;i++){
      current=open();await wait(()=>current!.snapshot().frame>3,'GPU start');
      const active=current.snapshot();if(report.weakReferenceProbes)retired.push(current.references());check(active.engineState==='ready','engine not ready');
      current.leave();await wait(()=>current!.snapshot().disposed,'navigation disposal');
      await wait(()=>!current!.snapshot().pageNative&&!current!.snapshot().canvasNative&&!current!.snapshot().pageLoaded,'native view teardown');await delay(150);
      const released=current.snapshot();
      check(released.engineState==='destroyed','engine not destroyed');check(released.scheduledCallbacks===0,'frame callbacks retained');
      check(!!released.shared&&released.shared.controller.disposed&&released.shared.controller.subscriptions===0,'controller retained');
      for(const part of released.shared!.parts)check(part.activeNodes===0&&part.activeResources===0&&part.activeListeners===0,'adapter resources retained');
      current=undefined;Utils.GC();await delay(50);
      let memory:Record<string,number>|undefined;
      if(isAndroid){const info=new android.os.Debug.MemoryInfo();android.os.Debug.getMemoryInfo(info);memory={totalPssKiB:info.getTotalPss(),nativeHeapBytes:android.os.Debug.getNativeHeapAllocatedSize()};}
      else memory=readAppleProcessMemory();
      const retained=retired.map(refs=>Object.fromEntries(Object.entries(refs).map(([name,ref])=>[name,!!((ref as any).get?.()??ref.deref?.())])));
      const processStatus=isAndroid?File.fromPath('/proc/self/status').readTextSync().split('\n').filter(line=>/^(VmRSS|VmSwap|VmSize|Threads):/.test(line)):undefined;
      const systemMemory=isAndroid?File.fromPath('/proc/meminfo').readTextSync().split('\n').filter(line=>/^(MemAvailable|SwapFree|Slab|SUnreclaim|PageTables):/.test(line)):undefined;
      report.cycles.push({cycle:i+1,active,released,memory,retained,processStatus,systemMemory});await write();
    }
    if(!isAndroid){
      // Native autorelease/weak-wrapper cleanup can run after the first GC.
      // Cross another timer turn before checking the final page's liveness.
      await delay(1000);Utils.GC();await delay(200);Utils.GC();await delay(200);
      report.settled={memory:readAppleProcessMemory(),retained:retired.map(refs=>Object.fromEntries(Object.entries(refs).map(([name,ref])=>[name,!!((ref as any).get?.()??ref.deref?.())])))};
    }
    report.status='passed';
  }catch(error){report.status='failed';report.error=String(error instanceof Error?error.stack:error);current?.leave();}
  if(!hadKeepScreenOn)window?.clearFlags(keepScreenOn);
  if(iosApp)iosApp.idleTimerDisabled=hadIdleTimerDisabled!;
  report.completedAt=new Date().toISOString();await write();console.log('ShaderLab G07 host lifecycle: '+report.status);
}

function androidFlag(){return isAndroid?android.view.WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON:0;}

/** Mach process accounting, including the footprint charged to this process.
 * Graphics ledger values are not a complete Metal allocation inventory. */
function readAppleProcessMemory():Record<string,number>{
  const info=new task_vm_info();
  const count=new interop.Reference(interop.types.uint32,interop.sizeof(task_vm_info)/4);
  // TASK_VM_INFO is a C macro (22), so NativeScript metadata does not export it.
  const result=task_info(mach_task_self_,22,interop.handleof(info),count);
  if(result!==0||count.value<38)throw Error(`TASK_VM_INFO failed: ${result}, count=${count.value}`);
  return {residentBytes:info.resident_size,physicalFootprintBytes:info.phys_footprint,
    compressedBytes:info.compressed,internalBytes:info.internal,externalBytes:info.external,
    graphicsFootprintBytes:info.ledger_tag_graphics_footprint,
    graphicsCompressedBytes:info.ledger_tag_graphics_footprint_compressed,
    processAvailableBytes:os_proc_available_memory()};
}
