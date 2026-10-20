import test from 'node:test';
import assert from 'node:assert/strict';
import { createProject, parseProject, validateProject, cameraFacing, channelTypes } from '../../shared/dist/domain/model.js';
import { LiveCamera } from '../../shared/dist/ports/liveCamera.js';
import { ShaderApplication } from '../../shared/dist/application/application.js';
const tick = () => new Promise(resolve => setImmediate(resolve));
const project = () => createProject('Camera', {ids:{next:()=> 'camera-test'},clock:{nowISO:()=> '2026-10-17T00:00:00Z'}});

test('camera channels round-trip without recording frames; one lens can feed multiple buffers', () => {
  const p=project();p.passes[0].enabled=true;p.passes[1].enabled=true;
  for(const pass of p.passes.slice(0,2))pass.channels[0]={kind:'camera',facing:'environment'};
  assert.equal(cameraFacing(p),'environment');assert.equal(channelTypes(p.passes[0].channels)[0],'2d');
  assert.deepEqual(parseProject(JSON.stringify(p)),validateProject(p));assert.deepEqual(p.assets,[]);
  p.passes[1].channels[0].facing='user';assert.throws(()=>validateProject(p),/同一方向/);
  p.passes[1].enabled=false;assert.doesNotThrow(()=>validateProject(p));
  p.sound.channels[0]={kind:'camera',facing:'user'};assert.throws(()=>validateProject(p),/Sound/);
});
test('camera capture is shared through recompiles and closes on pause, lens switch and disposal',async()=>{
  const opened=[],closed=[],errors=[];
  const camera=new LiveCamera(async facing=>{opened.push(facing);return {read:()=>facing,close:()=>closed.push(facing)};},()=>{},e=>errors.push(e));
  camera.configure(null,true);await tick();assert.equal(opened.length,0);
  camera.configure('environment',true);await tick();assert.equal(camera.read(),'environment');
  camera.configure('environment',true);await tick();assert.equal(opened.length,1,'recompile keeps the camera open');
  camera.configure('environment',false);assert.deepEqual(closed,['environment']);assert.equal(camera.read(),null);
  camera.configure('environment',true);await tick();camera.configure('user',true);await tick();assert.equal(camera.read(),'user');
  camera.dispose();assert.deepEqual(closed,['environment','environment','user']);assert.deepEqual(errors,[]);
});
test('selecting a new lens switches every bound camera channel atomically',()=>{
  const p=project();p.passes[0].enabled=true;p.passes[1].enabled=true;
  for(const pass of p.passes.slice(0,2))pass.channels[0]={kind:'camera',facing:'environment'};
  const app=new ShaderApplication({ids:{next:()=> 'camera-session'},clock:{nowISO:()=> '2026-10-17T00:00:00Z'}});app.replace(p);
  app.dispatch({type:'channel.set',pass:'buffer-a',index:0,channel:{kind:'camera',facing:'user'}});
  assert.equal(cameraFacing(app.snapshot()),'user');assert.equal(app.snapshot().passes[1].channels[0].facing,'user');app.dispose();
});
test('a late permission result closes its stream after capture is hidden or disposed',async()=>{
  for(const dispose of [false,true]){
    let resolve,closed=0,changed=0;
    const camera=new LiveCamera(()=>new Promise(r=>{resolve=r;}),()=>changed++,()=>assert.fail('stale error'));
    camera.configure('user',true);await tick();
    if(dispose)camera.dispose();else camera.configure('user',false);
    resolve({read:()=>1,close:()=>closed++});await tick();assert.equal(closed,1);assert.equal(changed,0);assert.equal(camera.read(),null);
  }
});
test('permission denial can be retried and a disconnected camera closes without crashing the render loop',async()=>{
  const errors=[];let attempt=0,closed=0;
  const camera=new LiveCamera(async()=>{if(!attempt++)throw Error('未获授权');return {read(){throw Error('已断开');},close(){closed++;}};},()=>{},e=>errors.push(e));
  camera.configure('user',true);await tick();assert.match(errors[0],/未获授权/);
  camera.configure('user',true);await tick();assert.equal(camera.read(),null);assert.equal(closed,1);assert.match(errors[1],/已断开/);
  camera.dispose();assert.equal(closed,1);
});
