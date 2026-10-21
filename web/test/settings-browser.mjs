import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/settings-2026-10-21');mkdirSync(out,{recursive:true});
const fixture=JSON.parse(readFileSync(resolve(root,'review/m24-ui/g01/project.hyshader')));
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html?ui=shared',downloadDirectory:resolve(out,'downloads'),failureScreenshotPath:resolve(out,'failure.png'),timeoutMs:120000,
 readinessExpression:'document.getElementById("app")?.getAttribute("aria-busy")==="false"',
 scenario:async({evaluate,click:rawClick,waitFor,cdp,nextPaint,getBrowserErrors})=>{
  const click=async expression=>{await evaluate(`(${expression}).scrollIntoView({block:'center'})`);await nextPaint();await rawClick(expression);};
  const select=async(id,value)=>{await evaluate(`(()=>{const s=document.getElementById('${id}').shadowRoot.querySelector('select');s.value='${value}';s.dispatchEvent(new Event('change',{bubbles:true}));})()`);await nextPaint();};
  const shot=async name=>{await nextPaint();const r=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});writeFileSync(resolve(out,name+'.png'),Buffer.from(r.result.data,'base64'));};
  const ready=()=>waitFor(()=>evaluate("shaderEditor.getApplicationState().compile.status==='ready'&&shaderEditor.getStatus()?.ready&&shaderEditor.getStatus().frame>2"),'compiled GPU frame');
  await evaluate(`shaderEditor.open(${JSON.stringify({...fixture,name:'作品名称 · user content'})})`);await ready();
  const original=await evaluate('JSON.stringify(shaderEditor.getProject())');
  await evaluate('window.__settingsCanvas=document.getElementById("shader-canvas");window.__settingsEditor=document.querySelector(".cm-editor");');
  await click('document.getElementById("settings-button")');await select('settings-locale','en');
  assert.equal(await evaluate('document.documentElement.lang'),'en');assert.equal(await evaluate('document.getElementById("settings-title").textContent'),'Settings');
  await select('settings-shader-language','glsl');await click('document.getElementById("settings-msaa").shadowRoot.querySelector("input")');
  assert.equal(await evaluate('shaderEditor.getStatus().msaaSamples'),4);assert.equal(await evaluate('JSON.stringify(shaderEditor.getProject())'),original);
  assert.equal(await evaluate('window.__settingsCanvas===document.getElementById("shader-canvas")&&window.__settingsEditor===document.querySelector(".cm-editor")'),true);
  await shot('english-settings');await click('document.getElementById("settings-close")');
  assert.equal(await evaluate('document.querySelector("[data-hy-key=\\"/shader-project/actions/save\\"]").getAttribute("aria-label")'),'Save project');
  assert.equal(await evaluate('document.getElementById("detect-language").getAttribute("label")'),'Detect language on paste');
  assert.equal(await evaluate('document.querySelector(".cm-content").getAttribute("aria-label")'),'WGSL code editor');
  for(const value of ['sphere','box','torus','canvas']){const before=await evaluate('shaderEditor.getStatus().frame');await select('preview-mode',value);await waitFor(()=>evaluate(`shaderEditor.getStatus().ready&&shaderEditor.getStatus().frame>${before}`),'MSAA '+value);}
  await click('document.querySelector("#channels [data-channel=\\"0\\"] .choose-channel")');await waitFor(()=>evaluate('document.getElementById("channel-drawer").open'),'drawer');
  assert.deepEqual(await evaluate('document.getElementById("channel-source-tabs").options.map(t=>t.label)'),['Built-in textures','Images','Video','Cubemap','Buffer','Devices']);
  await click('document.getElementById("channel-picker-close")');
  await evaluate('shaderEditor.create()');await ready();assert.equal(await evaluate('document.getElementById("code-language").value'),'glsl');assert.ok(await evaluate('shaderEditor.getProject().passes.find(p=>p.id==="image").glsl.includes("void mainImage")'));
  for(const width of [1440,320]){await cdp.call('Emulation.setDeviceMetricsOverride',{width,height:1000,deviceScaleFactor:1,mobile:false});await nextPaint();
   const layout=await evaluate('(()=>{const b=document.getElementById("settings-button").getBoundingClientRect(),detect=document.getElementById("detect-language").getBoundingClientRect();return {left:b.left,right:b.right,width:innerWidth,detect:detect.right};})()');assert.ok(layout.left>=0&&layout.right<=width&&layout.detect<=width,JSON.stringify(layout));
   await shot('english-editor-'+width);await click('document.getElementById("settings-button")');await shot('english-settings-'+width);await click('document.getElementById("settings-close")');}
  await cdp.call('Page.reload');await waitFor(()=>evaluate('typeof shaderEditor!=="undefined"&&document.getElementById("app")?.getAttribute("aria-busy")==="false"'),'reload');await ready();
  assert.equal(await evaluate('document.documentElement.lang'),'en');assert.equal(await evaluate('document.getElementById("code-language").value'),'glsl');assert.equal(await evaluate('shaderEditor.getStatus().msaaSamples'),4);
  await click('document.getElementById("settings-button")');assert.equal(await evaluate('document.getElementById("settings-msaa").checked'),true);await select('settings-shader-language','hlsl');await select('settings-locale','zh-CN');await click('document.getElementById("settings-msaa").shadowRoot.querySelector("input")');await click('document.getElementById("settings-close")');
  assert.equal(await evaluate('document.getElementById("nav-editor").textContent'),'编辑器');assert.equal(await evaluate('shaderEditor.getStatus().msaaSamples'),1);
  await evaluate('shaderEditor.create()');await ready();assert.equal(await evaluate('document.getElementById("code-language").value'),'hlsl');
  await evaluate('document.getElementById("add-pass-menu").dispatchEvent(new CustomEvent("item-select",{detail:{value:"buffer-a"},bubbles:true}))');await ready();
  assert.equal(await evaluate('document.getElementById("code-language").value'),'hlsl');assert.ok(await evaluate('shaderEditor.getProject().passes.find(p=>p.id==="buffer-a").hlsl.includes("float4 mainImage")'));
  await click('document.getElementById("settings-button")');await select('settings-shader-language','wgsl');await shot('chinese-settings');await click('document.getElementById("settings-close")');
  await evaluate('shaderEditor.create()');await ready();assert.equal(await evaluate('document.getElementById("code-language").value'),'wgsl');
  assert.deepEqual(getBrowserErrors(),[]);
  return {status:'passed',checks:['live Chinese/English UI without changing project content, shader or editor/canvas identity','4× engine MSAA renders all four preview modes; disabling returns to 1×','preferences survive reload; GLSL, HLSL and WGSL new projects compile and render; new Buffer uses preferred language','settings remain visible and usable at 320px and 1440px'],browserErrors:getBrowserErrors()};
 }});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
