import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createProject, passOf } from '../dist/model.js';
import { runEditorBrowserScenario } from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'web/artifacts/camera');mkdirSync(out,{recursive:true});
const project=createProject('Camera buffer test'),buffer=passOf(project,'buffer-a'),image=passOf(project,'image');
buffer.enabled=true;buffer.channels[0]={kind:'camera',facing:'environment'};
const second=passOf(project,'buffer-b');second.enabled=true;second.channels[0]={kind:'camera',facing:'environment'};
second.code='fn mainImage(p:vec2f)->vec4f{return channel0(p/iResolution.xy);}';
buffer.code='fn mainImage(p:vec2f)->vec4f {if(p.x<2.0){return vec4f(iChannelResolution[0].xy/4096.0,fract(iChannelTime[0]),1.0);}return channel0(p/iResolution.xy);}';
image.channels[0]={kind:'buffer',pass:'buffer-a'};image.code='fn mainImage(p:vec2f)->vec4f{return channel0(p/iResolution.xy);}';
writeFileSync(resolve(out,'camera.hyshader'),JSON.stringify(project,null,2));
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html?ui=legacy#editor',downloadDirectory:out,failureScreenshotPath:resolve(out,'failure.png'),
 chromeFlags:['--use-fake-device-for-media-stream','--use-fake-ui-for-media-stream'],timeoutMs:45000,
 readinessExpression:'window.shaderEditor?.getStatus()?.ready && !document.getElementById("compile").disabled',
 scenario:async({evaluate,waitFor,assertNoBrowserErrors})=>{
  const call=async(operation,params={})=>{const r=await evaluate(`(async()=>{const d=haiyueEditor.listDocuments().documents[0];return haiyueEditor.execute({apiVersion:'1',requestId:crypto.randomUUID(),documentId:d.identity.id,expectedRevision:d.revision,operation:${JSON.stringify(operation)},params:${JSON.stringify(params)}});})()`);assert.equal(r.status,'completed',JSON.stringify(r));return r.value;};
  await evaluate(`(()=>{window.cameraStreams=[];window.cameraCalls=[];const get=navigator.mediaDevices.getUserMedia.bind(navigator.mediaDevices);navigator.mediaDevices.getUserMedia=async options=>{cameraCalls.push(options);if(window.denyCamera)throw new DOMException('denied','NotAllowedError');const stream=await get(options);cameraStreams.push(stream);return stream;};})()`);
  assert.equal(await evaluate('cameraCalls.length'),0,'no camera request for unrelated projects');
  const open=async p=>{const resource=await evaluate('haiyueEditor.putResource(new TextEncoder().encode('+JSON.stringify(JSON.stringify(p))+'))');await call('shader.project.open',{resourceId:resource.resourceId});await evaluate('haiyueEditor.releaseResource('+JSON.stringify(resource.resourceId)+')');await waitFor(()=>evaluate('!document.getElementById("compile").disabled'),'camera project compiles');};
  const sample=async()=>{const r=await call('shader.image.read');return evaluate(`(()=>{const b=haiyueEditor.readResource(${JSON.stringify(r.resourceId)}),w=${r.width},h=${r.height},colors=new Set();let hash=0;for(let i=12;i<b.length;i+=16){colors.add(b[i]+','+b[i+1]+','+b[i+2]);hash=(hash+b[i]*(i+1)+b[i+1])%1000000007;}const metadata=Array.from(b.slice(Math.floor(h/2)*w*4,Math.floor(h/2)*w*4+4));haiyueEditor.releaseResource(${JSON.stringify(r.resourceId)});return {hash,colors:colors.size,metadata};})()`);};
  await open(project);await call('shader.playback.set',{playing:true});
  await waitFor(()=>evaluate('cameraStreams.length===1 && cameraStreams[0].getVideoTracks()[0].readyState==="live"'),'camera stream opens');
  await waitFor(async()=>{const s=await sample();return s.metadata[0]>4&&s.metadata[1]>4&&s.colors>16;},'camera flows through Buffer A into Image');
  const first=await sample();await waitFor(async()=>(await sample()).hash!==first.hash,'camera frames advance');
  assert.equal(await evaluate('cameraCalls[0].audio'),false,'camera input never captures microphone');
  await call('shader.compile');assert.equal(await evaluate('cameraCalls.length'),1,'same-lens recompile shares capture');
  await call('shader.playback.set',{playing:false});await waitFor(()=>evaluate('cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'),'pause closes camera');
  const paused=await sample();await new Promise(r=>setTimeout(r,300));assert.equal((await sample()).hash,paused.hash,'pause keeps the last frame');
  await call('shader.playback.set',{playing:true});await waitFor(()=>evaluate('cameraStreams.length===2'),'resume reacquires camera');
  await evaluate('location.hash="#gallery"');await waitFor(()=>evaluate('cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'),'gallery releases camera');
  await evaluate('location.hash="#editor"');await waitFor(()=>evaluate('cameraStreams.length===3'),'editor resumes camera');
  await evaluate('window.denyCamera=true');await call('shader.channel.set',{pass:'buffer-a',index:0,channel:{kind:'camera',facing:'user'}});await call('shader.compile');
  await waitFor(()=>evaluate('document.getElementById("notice-text").textContent.includes("未获授权")'),'permission denial is visible');
  assert.equal(await evaluate('shaderEditor.getStatus().ready'),true,'permission denial does not kill WebGPU');
  await call('shader.channel.set',{pass:'buffer-a',index:0,channel:{kind:'none'}});await call('shader.channel.set',{pass:'buffer-b',index:0,channel:{kind:'none'}});await call('shader.compile');
  assert.equal(await evaluate('cameraStreams.every(s=>s.getTracks().every(t=>t.readyState==="ended"))'),true,'removing camera input releases capture');
  assertNoBrowserErrors();return {status:'passed',source:'Chrome simulated video device, real getUserMedia and WebGPU',firstFrame:first,checks:['camera → Buffer A → Image with dimensions and channel time','video frames change','no microphone request','same-lens recompilation reuses capture','pause/resume and gallery navigation close/reopen streams','permission denial keeps renderer alive','removing camera stops capture']};
 }});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
