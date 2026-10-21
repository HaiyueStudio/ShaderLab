import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
import {shaderAppearance} from '../../shared/dist/views/presentation.js';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/m24-g07/style-unification/web');mkdirSync(out,{recursive:true});
const fixture=JSON.parse(readFileSync(resolve(root,'review/m24-ui/g01/project.hyshader')));
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html?ui=shared',downloadDirectory:resolve(out,'downloads'),failureScreenshotPath:resolve(out,'failure.png'),timeoutMs:90000,
 readinessExpression:'document.getElementById("app")?.getAttribute("aria-busy")==="false"',
 scenario:async({evaluate,click,waitFor,cdp,nextPaint,getBrowserErrors})=>{
  const shot=async name=>{await nextPaint();const r=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(out,name+'.png'),Buffer.from(r.result.data,'base64'));};
  const node=key=>`document.querySelector('[data-hy-key="${key}"]')`;
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:430,height:932,deviceScaleFactor:1,mobile:false});
  await shot('gallery');
  const palette=await evaluate(`({surface:getComputedStyle(document.documentElement).getPropertyValue('--hy-surface-color').trim(),accent:getComputedStyle(document.documentElement).getPropertyValue('--hy-accent-color').trim()})`);
  assert.equal(palette.surface,shaderAppearance.color.surface);assert.equal(palette.accent,shaderAppearance.color.accent);
  await evaluate(`shaderEditor.open(${JSON.stringify(fixture)})`);
  await waitFor(()=>evaluate("shaderEditor.getApplicationState().compile.status==='ready'"),'compiled');
  const metrics=await evaluate(`Array.from(document.querySelectorAll('.shared-toolbar [data-hy-kind="Button"],.shared-toolbar [data-hy-kind="Select"]')).map(el=>{const inner=el.shadowRoot.querySelector('select')??el.shadowRoot.querySelector('button'),r=inner.getBoundingClientRect();return {key:el.dataset.hyKey,height:r.height,color:getComputedStyle(inner).color,radius:getComputedStyle(inner).borderRadius};})`);
  assert.equal(metrics.length,5);for(const metric of metrics){assert.ok(metric.height>=32,JSON.stringify(metric));assert.equal(metric.radius,'4px');}
  const layouts=[];
  for(const [width,height] of [[1440,1000],[430,932],[320,740],[932,430]]){
   await cdp.call('Emulation.setDeviceMetricsOverride',{width,height,deviceScaleFactor:1,mobile:false});await nextPaint();
   const layout=await evaluate(`(()=>{const r=key=>{const el=document.querySelector('[data-hy-key="'+key+'"]'),b=el.getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,height:b.height,width:b.width};};return {name:r('/shader-project/name/label'),input:r('/shader-project/name/field'),save:r('/shader-project/actions/save'),export:r('/shader-project/actions/export'),back:(()=>{const b=document.getElementById('back-gallery').getBoundingClientRect();return {left:b.left,right:b.right,top:b.top,height:b.height};})(),icons:[...document.querySelectorAll('.shared-project [data-hy-key^="/shader-project/actions/"],.shared-toolbar [data-hy-kind="Button"]')].map(el=>({label:el.getAttribute('aria-label'),mask:getComputedStyle(el.querySelector('[data-hy-button-label]'),'::before').maskImage,font:getComputedStyle(el.querySelector('[data-hy-button-label]')).fontSize}))};})()`);
   assert.ok(Math.abs(layout.name.top+layout.name.height/2-layout.input.top-layout.input.height/2)<2,'name stays inline');
   assert.ok(layout.input.width<=240&&layout.input.width>=80,JSON.stringify(layout));
   assert.ok(layout.save.left-layout.back.right<=8&&layout.save.left>=layout.back.right,JSON.stringify(layout));assert.ok(Math.abs(layout.back.top-layout.save.top)<2,JSON.stringify(layout));
   assert.ok(layout.export.left-layout.save.right<=8);assert.ok(layout.export.right<=width,JSON.stringify(layout));
   assert.equal(layout.icons.length,6);for(const icon of layout.icons){assert.ok(icon.label);assert.notEqual(icon.mask,'none');assert.equal(icon.font,'0px');}
   const preview=await evaluate(`(()=>{const a=document.getElementById('preview-mode').getBoundingClientRect(),b=document.getElementById('viewport').getBoundingClientRect(),fps=document.getElementById('fps-label').getBoundingClientRect();return {visible:a.width>0&&a.height>0,inside:a.left>=b.left&&a.right<=b.right,fpsRight:fps.right};})()`);assert.ok(preview.visible&&preview.inside&&preview.fpsRight<=width,JSON.stringify(preview));
   layouts.push({width,height,...layout});await shot('editor-'+width);
  }
  assert.deepEqual(getBrowserErrors(),[]);
  return {palette,metrics,layouts,checks:['Nightfall shared palette','32px inline playback controls','4px playback corners','six accessible SVG icons','inline compact name and adjacent save/export at 320–1440px'],browserErrors:getBrowserErrors()};
 }});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
