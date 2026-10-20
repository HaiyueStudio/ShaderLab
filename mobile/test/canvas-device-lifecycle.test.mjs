import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createRequire} from 'node:module';
import vm from 'node:vm';
import {spawnSync} from 'node:child_process';
import {patchDeviceSource,patchOneShotSource} from '../scripts/patch-canvas.mjs';
const require=createRequire(import.meta.url);
const source=readFileSync(require.resolve('@nativescript/canvas/WebGPU/GPUDevice.js'),'utf8');
test('device patch is idempotent and rejects an unknown binding',()=>{
 const patched=patchDeviceSource(source);assert.equal(patchDeviceSource(patched),patched);
 assert.throws(()=>patchDeviceSource('unknown'),/audited/);
});
for(const android of [true,false])test(`native GPU errors retain a weak observable without rooting the device (${android?'Android':'iOS'})`,()=>{
 const notices=[],contexts=[];
 const context={EventTarget:class{},WeakRef:class{constructor(value){this.value=value;}get(){return this.value;}deref(){return this.value;}},
  fromObject:()=>({hasListeners:()=>true,notify:event=>notices.push(event)}),native_:Symbol(),adapter_:Symbol(),__ANDROID__:android,
  GPUValidationError:class{constructor(message){this.message=message;}},GPUDeviceLostInfo:class{},console};
 vm.createContext(context);
 vm.runInContext(patchDeviceSource(source).replace(/^import .*$/gm,'').replace(/^export /gm,'')+'\nglobalThis.Subject=GPUDevice;',context);
 const Type=context.Subject,handler=Type.prototype._uncapturederror;
 Type.prototype._uncapturederror=function(...args){contexts.push(this);return handler.apply(this,args);};
 const native={lost:new Promise(()=>{}),setuncapturederror(callback){this.error=callback;},destroy(){this.destroyed=true;}};
 const device=Type.fromNative(native,{});native.error(3,'validation failure');
 assert.equal(notices.length,1);assert.equal(notices[0].error.message,'validation failure');
 assert.notEqual(contexts[0],device);assert.deepEqual(Object.keys(contexts[0]),['_emitter']);
 device.destroy();assert.equal(native.destroyed,true);
});

function makeDevice(nativeLost){
 const context={fromObject:()=>({}),WeakRef,native_:Symbol(),adapter_:Symbol(),__ANDROID__:true,console};
 vm.createContext(context);
 vm.runInContext(patchDeviceSource(source).replace(/^import .*$/gm,'').replace(/^export /gm,'')+'\nglobalThis.Subject=GPUDevice;',context);
 let destroys=0;
 const native={lost:nativeLost,setuncapturederror(){},destroy(){destroys++;}};
 return {device:context.Subject.fromNative(native,{}),destroyCount:()=>destroys};
}
test('destroy settles lost even when the native callback never arrives, and only destroys once',async()=>{
 const {device,destroyCount}=makeDevice(new Promise(()=>{}));
 let result;device.lost.then(info=>{result=info;});
 await Promise.resolve();assert.equal(result,undefined);
 device.destroy();device.destroy();await Promise.resolve();
 assert.equal(result.reason,'destroyed');assert.equal(destroyCount(),1);
});
test('native loss forwards reason/message and late native loss cannot replace explicit destruction',async()=>{
 let finish;const nativeLost=new Promise(resolve=>{finish=resolve;});
 const first=makeDevice(nativeLost),second=makeDevice(nativeLost);
 first.device.destroy();finish({reason:0,message:'GPU removed'});
 const [a,b]=await Promise.all([first.device.lost,second.device.lost]);
 assert.equal(a.reason,'destroyed');assert.equal(b.reason,'unknown');assert.equal(b.message,'GPU removed');
 second.device.destroy();assert.equal(second.destroyCount(),1);
});
test('native loss rejection is handled and forwarded',async()=>{
 const error=new Error('native failure'),{device}=makeDevice(Promise.reject(error));
 await assert.rejects(device.lost,error);device.destroy();
});

test('pending native loss cannot retain a destroyed device or its engine subscribers',()=>{
 const script = `
 import assert from 'node:assert/strict';
 import vm from 'node:vm';
 import {readFileSync} from 'node:fs';
 import {patchDeviceSource,patchOneShotSource} from ${JSON.stringify(new URL('../scripts/patch-canvas.mjs',import.meta.url).href)};
 const source=readFileSync(${JSON.stringify(require.resolve('@nativescript/canvas/WebGPU/GPUDevice.js'))},'utf8');
 const context={fromObject:()=>({}),WeakRef,native_:Symbol(),adapter_:Symbol(),__ANDROID__:true,console};
 vm.createContext(context);
 vm.runInContext(patchDeviceSource(source).replace(/^import .*$/gm,'').replace(/^export /gm,'')+'\\n;globalThis.Subject=GPUDevice',context);
 // Simulate the C++ persistent resolver, independent of JS GPUDevice lifetime.
 let nativeResolve;const nativeLost=new Promise(resolve=>{nativeResolve=resolve;});
 const native={lost:nativeLost,setuncapturederror(fn){this.error=fn;},destroy(){}};
 const adapterSource=readFileSync(${JSON.stringify(require.resolve('@nativescript/canvas/WebGPU/GPUAdapter.js'))},'utf8');
 vm.runInContext(patchOneShotSource(adapterSource,['requestDevice']).replace(/^import .*$/gm,'').replace(/^export /gm,'')+'\\n;globalThis.Adapter=GPUAdapter',context);
 const callbacks=[];
 const adapter=new context.Adapter({requestDevice(options,callback){callbacks.push(callback);callback(null,native);}});
 async function lifetime(){
   const device=await adapter.requestDevice({requiredFeatures:[],requiredLimits:{}}),owner={device};
   device.lost.then(()=>{owner.notified=true;});
   device.destroy();return [new WeakRef(device),new WeakRef(owner)];
 }
 const refs=await lifetime();
 for(let i=0;i<10;i++){await new Promise(r=>setTimeout(r,0));global.gc();}
 for(const ref of refs)assert.equal(ref.deref(),undefined);
 nativeResolve({reason:0,message:'late'});await Promise.resolve();
 `;
 const result=spawnSync(process.execPath,['--expose-gc','--input-type=module','-e',script],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr);
});

for(const [name,methods] of [['GPU',['requestAdapter']],['GPUAdapter',['requestDevice']]])test(name+' one-shot patch is idempotent',()=>{
 const code=readFileSync(require.resolve('@nativescript/canvas/WebGPU/'+name+'.js'),'utf8');
 const patched=patchOneShotSource(code,methods);assert.equal(patchOneShotSource(patched,methods),patched);
 assert.throws(()=>patchOneShotSource('unknown',methods),/audited/);
});
test('retained one-shot callbacks neither repeat construction nor retain their closures after completion',()=>{
 const body=patchOneShotSource(readFileSync(require.resolve('@nativescript/canvas/WebGPU/GPU.js'),'utf8'),['requestAdapter']);
 const context={};vm.createContext(context);
 vm.runInContext(body.slice(0,body.indexOf('import '))+';globalThis.once=hyNativeOnce;',context);
 let calls=0;const callback=context.once(()=>{calls++;throw Error('failure');});
 assert.throws(()=>callback('x'),/failure/);assert.equal(callback('x'),undefined);assert.equal(calls,1);
});
