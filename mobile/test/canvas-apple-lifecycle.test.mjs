import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {appleCanvasCallbacks,appleReadyFactory,patchAppleCanvasSource} from '../scripts/patch-canvas.mjs';

test('ready listeners reuse one ObjC class and keep instance state separate',()=>{
 let classes=0;const NSObject={extend(methods){classes++;return {new:()=>Object.create(methods)};}};
 const create=new Function('NSObject','NSCCanvasListener',appleReadyFactory+'return hyCreateReadyListener;')(NSObject,{});
 const events=[],a={_readyEvent(){events.push('a');}},b={_readyEvent(){events.push('b');}};
 const first=create(new WeakRef(a)),second=create(new WeakRef(b));
 first.contextReady();first.contextReady();second.contextReady();
 assert.equal(classes,1);assert.deepEqual(events,['a','b']);
});

test('retained native lifecycle blocks do not retain a disposed JS Canvas',()=>{
 const result=spawnSync(process.execPath,['--expose-gc','--input-type=module','-e',`
  import assert from 'node:assert/strict';
  ${appleCanvasCallbacks}
  const events=[];
  let owner={__native__context:{__stopRaf(){events.push('stop');},__startRaf(){events.push('start');}},_handleEvents(e){events.push(e);}};
  const ref=new WeakRef(owner),native=hyCanvasCallbacks(ref);
  native.background();native.active();native.touch('touch');
  assert.deepEqual(events,['stop','start','touch']);
  owner=null;
  for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,0));global.gc();}
  assert.equal(ref.deref(),undefined);
  native.background();native.active();native.touch('late');
  assert.deepEqual(events,['stop','start','touch']);
 `],{encoding:'utf8'});
 assert.equal(result.status,0,result.stderr||result.stdout);
});

test('Apple Canvas patch is audited, repeatable and clears native blocks on teardown',()=>{
 const require=createRequire(import.meta.url);
 const file=require.resolve('@nativescript/canvas/Canvas/index.ios.js');
 const patched=patchAppleCanvasSource(readFileSync(file,'utf8'));
 assert.equal(patchAppleCanvasSource(patched),patched);
 assert.throws(()=>patchAppleCanvasSource(patched+'\n// unexpected edit'),/differs/);
 const body=patched.match(/    disposeNativeView\(\) \{([\s\S]*?)        super.disposeNativeView\(\);/)[1];
 const native={enterBackgroundListener(){},becomeActiveListener(){},touchEventListener(){},setListener(value){this.listener=value;}};
 const canvas={_canvas:native};
 new Function('ContextType',body).call(canvas,{None:0});
 assert.equal(native.enterBackgroundListener,null);
 assert.equal(native.becomeActiveListener,null);
 assert.equal(native.touchEventListener,null);
 assert.equal(native.listener,null);
 assert.equal(canvas._canvas,undefined);
});
