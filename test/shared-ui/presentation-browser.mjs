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
  assert.equal(metrics.length,5);for(const metric of metrics){assert.ok(metric.height>=44,JSON.stringify(metric));assert.equal(metric.radius,'8px');}
  await shot('editor');await click(node('/shader-project/actions/information'));
  await waitFor(()=>evaluate(`${node('/shader-project/information')}.open`),'settings');await shot('settings');
  await click(node('/shader-project/information/close'));await click(node('/shader-project/actions/information'));await shot('dialog-reopened');
  await cdp.call('Emulation.setDeviceMetricsOverride',{width:932,height:430,deviceScaleFactor:1,mobile:false});await shot('settings-landscape');
  await click(node('/shader-project/information/close'));
  assert.deepEqual(getBrowserErrors(),[]);
  return {palette,metrics,checks:['Nightfall shared palette','44px visible controls','8px control corners','settings close/reopen','landscape settings'],browserErrors:getBrowserErrors()};
 }});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
