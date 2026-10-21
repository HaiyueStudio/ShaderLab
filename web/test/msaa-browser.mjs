import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {PNG} from 'pngjs';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/msaa-fix-2026-10-21');mkdirSync(out,{recursive:true});
const baseline=process.argv.includes('--baseline'),prefix=baseline?'before':'after';
const fixture=JSON.parse(readFileSync(resolve(root,'review/m24-ui/g01/project.hyshader')));
fixture.name='MSAA silhouette regression';fixture.preview={mode:'scene',mesh:'box',scale:1};fixture.passes.find(p=>p.id==='image').code='fn mainImage(fragCoord:vec2f)->vec4f{return vec4f(1.0);}';
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html?ui=shared',downloadDirectory:resolve(out,'downloads'),failureScreenshotPath:resolve(out,prefix+'-failure.png'),timeoutMs:90000,
 readinessExpression:'document.getElementById("app")?.getAttribute("aria-busy")==="false"',
 scenario:async({evaluate,click:rawClick,waitFor,cdp,nextPaint,getBrowserErrors})=>{
  const click=async expression=>{await evaluate(`(${expression}).scrollIntoView({block:'center'})`);await nextPaint();await rawClick(expression);};
  const at=async(x,y)=>{await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x,y,button:'left',clickCount:1});await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x,y,button:'left',clickCount:1});await nextPaint();};
  const open=()=>click('document.getElementById("settings-button")');
  const toggle=()=>click('document.getElementById("settings-msaa").shadowRoot.querySelector("input")');
  const ready=()=>waitFor(()=>evaluate('shaderEditor.getStatus()?.ready&&shaderEditor.getStatus().frame>2'),'GPU frame');
  await evaluate(`shaderEditor.open(${JSON.stringify(fixture)})`);await ready();
  await evaluate(`(()=>{const v=document.getElementById('viewport');Object.assign(v.style,{flex:'none',width:'512px',height:'384px',aspectRatio:'auto',border:'0',borderRadius:'0'});for(const id of ['scene-controls','preview-mode'])document.getElementById(id).style.visibility='hidden';})()`);
  await nextPaint();await ready();await click('document.querySelector(\'[data-hy-key="/shader-toolbar/controls/play"]\')');
  assert.equal(await evaluate('shaderEditor.getStatus().playing'),false);
  const snapshot=await evaluate('JSON.stringify(shaderEditor.getProject())');
  const capture=async name=>{await nextPaint();await nextPaint();const clip=await evaluate('(()=>{const r=document.getElementById("shader-canvas").getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:1};})()');
    assert.equal(clip.width,512);assert.equal(clip.height,384);
    const r=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false,clip}),bytes=Buffer.from(r.result.data,'base64');writeFileSync(resolve(out,prefix+'-'+name+'.png'),bytes);
    const png=PNG.sync.read(bytes);let partial=0,white=0,background=0;
    for(let i=0;i<png.data.length;i+=4){const red=png.data[i],green=png.data[i+1],blue=png.data[i+2];if(red>=250&&green>=250&&blue>=250)white++;else if(red>25&&red<245&&Math.max(red,green,blue)-Math.min(red,green,blue)<12)partial++;else background++;}
    return {partial,white,background,pixels:png.data};
  };
  const off=await capture('msaa-off');await open();await toggle();await click('document.getElementById("settings-close")');
  const on=await capture('msaa-on');let changed=0;for(let i=0;i<off.pixels.length;i+=4)if(Math.max(Math.abs(off.pixels[i]-on.pixels[i]),Math.abs(off.pixels[i+1]-on.pixels[i+1]),Math.abs(off.pixels[i+2]-on.pixels[i+2]))>8)changed++;
  const metrics={off:{partial:off.partial,white:off.white},on:{partial:on.partial,white:on.white},changed};
  if(baseline)return {status:'baseline',...metrics};
  assert.ok(changed>150,'MSAA must change actual rasterized pixels: '+JSON.stringify(metrics));
  assert.ok(on.partial>off.partial+150,'4× resolve must add partial coverage at the cube silhouette: '+JSON.stringify(metrics));
  await open();await toggle();await click('document.getElementById("settings-close")');const again=await capture('msaa-off-again');assert.deepEqual(again.pixels,off.pixels,'disabling restores the exact single-sample image');
  assert.equal(await evaluate('JSON.stringify(shaderEditor.getProject())'),snapshot);assert.equal(await evaluate('shaderEditor.getStatus().playing'),false);
  await open();let bounds=await evaluate('(()=>{const r=document.getElementById("settings-dialog").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()');
  await at(bounds.left+6,bounds.top+6);assert.equal(await evaluate('document.getElementById("settings-dialog").open'),true,'dialog padding must not dismiss it');
  await cdp.call('Input.dispatchMouseEvent',{type:'mousePressed',x:bounds.left+6,y:bounds.top+6,button:'left',clickCount:1});await cdp.call('Input.dispatchMouseEvent',{type:'mouseReleased',x:bounds.left-10,y:bounds.top-10,button:'left',clickCount:1});await nextPaint();assert.equal(await evaluate('document.getElementById("settings-dialog").open'),true,'dragging from the dialog onto the mask must not dismiss it');
  await at(bounds.left-10,bounds.top-10);assert.equal(await evaluate('document.getElementById("settings-dialog").open'),false,'backdrop click closes settings');
  const gear=await evaluate('(()=>{const svg=document.querySelector("#settings-button svg"),b=svg.getBBox(),r=svg.getBoundingClientRect();return {x:b.x,y:b.y,width:b.width,height:b.height,paintWidth:r.width,paintHeight:r.height};})()');
  assert.ok(Math.abs(gear.width-gear.height)<0.01,JSON.stringify(gear));assert.ok(Math.abs(gear.y+gear.height/2-12)<0.01,JSON.stringify(gear));assert.equal(gear.paintWidth,gear.paintHeight);
  const gearClip=await evaluate('(()=>{const r=document.getElementById("settings-button").getBoundingClientRect();return {x:r.x+scrollX,y:r.y+scrollY,width:r.width,height:r.height,scale:6};})()');const icon=await cdp.call('Page.captureScreenshot',{format:'png',clip:gearClip});writeFileSync(resolve(out,'gear.png'),Buffer.from(icon.result.data,'base64'));
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:320,height:900,deviceScaleFactor:1,mobile:false});await nextPaint();await open();bounds=await evaluate('(()=>{const r=document.getElementById("settings-dialog").getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom};})()');assert.ok(bounds.left>=0&&bounds.right<=320);await at(2,2);assert.equal(await evaluate('document.getElementById("settings-dialog").open'),false,'mobile backdrop click');
  assert.deepEqual(getBrowserErrors(),[]);
  return {status:'passed',...metrics,gear,checks:['paused cube edges gain partial coverage with MSAA; disabling restores identical pixels','settings close on backdrop click at desktop and mobile widths; inside clicks and drags stay open','gear geometry is square, centered and rendered without vertical compression'],browserErrors:getBrowserErrors()};
 }});
writeFileSync(resolve(out,prefix+'-report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
