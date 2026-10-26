import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'web/artifacts/source-language');mkdirSync(out,{recursive:true});
const glsl='// editable GLSL\nvoid mainImage(out vec4 c, in vec2 p) {\n  c = vec4(0.2, 0.4, 0.6, 1.0);\n}';
const wgsl='// Author palette note\nfn mainImage(p: vec2f) -> vec4f {\n  return vec4f(0.8, 0.1, 0.3, 1.0);\n}';
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html#editor',downloadDirectory:out,failureScreenshotPath:resolve(out,'failure.png'),timeoutMs:60000,
readinessExpression:'shaderEditor.getStatus()?.ready && shaderEditor.getApplicationState().compile.status==="ready"',
scenario:async({evaluate,click:rawClick,waitFor,cdp,nextPaint})=>{
 const runButton=process.env.SHADERLAB_TEST_UI==='legacy'?'document.getElementById("compile")':`document.querySelector('[data-hy-key="/shader-toolbar/controls/run"]')`;
 const click=async expression=>{await evaluate(`(${expression}).scrollIntoView({block:"center",inline:"nearest"})`);await nextPaint();await rawClick(expression);};
 const call=async(operation,params={})=>{
  const r=await evaluate('(async()=>{const d=haiyueEditor.listDocuments().documents[0];return haiyueEditor.execute({apiVersion:"1",requestId:crypto.randomUUID(),documentId:d.identity.id,expectedRevision:d.revision,operation:'+JSON.stringify(operation)+',params:'+JSON.stringify(params)+'});})()');
  assert.equal(r.status,'completed',JSON.stringify(r));return r.value;
 };
 const language=()=>evaluate('document.getElementById("code-language").value');
 const code=()=>evaluate('document.querySelector("#code-editor .cm-content").textContent');
 const mod=process.platform==='darwin'?4:2;
 const key=async(key,code,windowsVirtualKeyCode,modifiers=0)=>{
  for(const type of ['keyDown','keyUp'])await cdp.call('Input.dispatchKeyEvent',{type,key,code,windowsVirtualKeyCode,modifiers});
 };
 const choose=async lang=>{
  const previousNotice=await evaluate('({hidden:document.getElementById("notice").hidden,text:document.getElementById("notice-text").textContent})');
  await evaluate('(()=>{const s=document.getElementById("code-language").shadowRoot.querySelector("select");s.value='+JSON.stringify(lang)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()');
  await waitFor(()=>evaluate('document.getElementById("conversion-dialog")?.open || !document.getElementById("code-language").disabled'),'conversion preview');
  if(await evaluate('Boolean(document.getElementById("conversion-dialog")?.open)'))await click('document.getElementById("conversion-apply")');
  await waitFor(()=>evaluate('!document.getElementById("code-language").disabled'),'conversion complete');
  assert.equal(await language(),lang);
  assert.deepEqual(await evaluate('({hidden:document.getElementById("notice").hidden,text:document.getElementById("notice-text").textContent})'),previousNotice);
  assert.ok(await evaluate('document.querySelector("hy-notification").shadowRoot.textContent.includes('+JSON.stringify('已转换为 '+lang.toUpperCase())+')'));
 };
 const paste=async source=>{
  await click('document.querySelector("#code-editor .cm-content")');await key('a','KeyA',65,mod);
  await evaluate('(()=>{const data=new DataTransfer();data.setData("text/plain",'+JSON.stringify(source)+');document.querySelector("#code-editor .cm-content").dispatchEvent(new ClipboardEvent("paste",{clipboardData:data,bubbles:true,cancelable:true}));})()');
  await nextPaint();
 };
 const render=async()=>{
  await click(runButton);
  await waitFor(()=>evaluate('shaderEditor.getApplicationState().compile.status==="ready"'),'compile finished');await nextPaint();
  assert.deepEqual((await call('shader.query')).diagnostics.filter(d=>d.severity==='error'),[]);
 };
 const pixel=async()=>{
  await waitFor(()=>evaluate('shaderEditor.getStatus()?.frame>1'),'readable shader frame');
  const r=await call('shader.image.read');
  return evaluate('(()=>{const b=haiyueEditor.readResource('+JSON.stringify(r.resourceId)+');const i=('+r.width+'*Math.floor('+r.height+'/2)+Math.floor('+r.width+'/2))*4;const p=Array.from(b.slice(i,i+4));haiyueEditor.releaseResource('+JSON.stringify(r.resourceId)+');return p;})()');
 };
 const near=(actual,expected)=>actual.forEach((v,i)=>assert.ok(Math.abs(v-expected[i])<3,JSON.stringify(actual)));
 const highlight=async lang=>{
  assert.equal(await evaluate('document.querySelector("#code-editor .cm-content").getAttribute("aria-label")'),lang.toUpperCase()+' 代码编辑器');
  assert.ok(await evaluate('document.querySelectorAll("#code-editor .cm-line span").length>3'));
  assert.equal(await evaluate('getComputedStyle(document.querySelector("#code-editor .cm-scroller")).display'),'flex');
 };
 assert.equal(await language(),'wgsl');
 const original=(await call('shader.query')).passes.find(p=>p.id==='image').code;
 await paste(glsl);assert.equal(await language(),'glsl');await highlight('glsl');
 assert.equal((await call('shader.query')).passes.find(p=>p.id==='image').glsl,glsl);
 await key('z','KeyZ',90,mod);assert.equal(await language(),'wgsl');assert.ok((await code()).includes('fn mainImage'));
 await key('z','KeyZ',90,mod|8);assert.equal(await language(),'glsl');await highlight('glsl');
 await render();near(await pixel(),[51,102,153,255]);assert.equal(await language(),'glsl');
 const before=await call('shader.query');
 await click('document.getElementById("view-wgsl")');
 assert.equal(await evaluate('document.getElementById("generated-dialog").open'),true);
 assert.ok(await evaluate('document.querySelector("#generated-code .cm-content").textContent.includes("fn mainImage")'));
 assert.ok(await evaluate('document.querySelectorAll("#generated-code .cm-line span").length>3'));
 assert.equal(await evaluate('document.querySelector("#generated-code .cm-content").getAttribute("contenteditable")'),'false');
 await nextPaint();let shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'wgsl-preview.png'),Buffer.from(shot.result.data,'base64'));
 await click('document.querySelector("#generated-dialog button")');assert.equal((await call('shader.query')).revision,before.revision);
 await choose('wgsl');assert.ok((await code()).includes('// editable GLSL'));assert.notEqual((await call('shader.query')).passes.find(p=>p.id==='image').code,original);await render();near(await pixel(),[51,102,153,255]);
 await paste(wgsl);await render();near(await pixel(),[204,26,77,255]);await highlight('wgsl');
 await choose('glsl');assert.ok((await code()).includes('Author palette note'));assert.ok(!(await code()).includes('Shadertoy GLSL ES'));assert.notEqual((await call('shader.query')).passes.find(p=>p.id==='image').glsl,glsl);await render();near(await pixel(),[204,26,77,255]);
 await paste('// invalid\nvoid mainImage(out vec4 c, in vec2 p) {\n c=vec4(missingValue);\n}');
 await click(runButton);
 await waitFor(()=>evaluate('shaderEditor.getApplicationState().compile.status==="failed" && document.querySelector("#diagnostics .diagnostic")'),'GLSL error');
 await evaluate('(()=>{const s=document.getElementById("code-language").shadowRoot.querySelector("select");s.value="wgsl";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await waitFor(()=>evaluate('!document.getElementById("code-language").disabled'),'failed conversion settled');
 assert.equal(await language(),'glsl');assert.ok((await code()).includes('missingValue'));
 assert.ok(await evaluate('document.querySelector("hy-notification").shadowRoot.textContent.includes("代码转换失败")'));
 let q=await call('shader.query');assert.ok(q.diagnostics.some(d=>d.language==='glsl'&&d.line===3));
 near(await pixel(),[204,26,77,255]);
 await click('document.querySelector("#diagnostics .diagnostic")');assert.equal(await evaluate('document.getElementById("generated-dialog").open'),false);
 await waitFor(()=>evaluate('document.querySelector("#code-editor .cm-activeLine")?.textContent.includes("missingValue")'),"diagnostic source focus");
 await paste('void mainImage(out vec4 c,in vec2 p){c=vec4(1.0/0.0);}');
 await click(runButton);
 await waitFor(()=>evaluate('shaderEditor.getApplicationState().compile.status==="failed" && document.querySelector("#diagnostics .diagnostic")'),'generated WGSL error');
 q=await call('shader.query');assert.ok(q.diagnostics.some(d=>d.severity==='error'&&d.language!=='glsl'));
 await click('document.querySelector("#diagnostics .diagnostic")');
 assert.equal(await evaluate('document.getElementById("generated-dialog").open'),true);
 await waitFor(()=>evaluate('document.querySelector("#generated-code .cm-activeLine")?.textContent.includes("1.0 / 0.0")'),"generated diagnostic focus");
 await click('document.querySelector("#generated-dialog button")');
 await paste(wgsl);assert.equal(await language(),'wgsl');
 // Disabled auto-detection leaves the explicit choice intact even for recognized input.
 await click('document.getElementById("detect-language").shadowRoot.querySelector("label")');
 await paste(glsl);assert.equal(await language(),'wgsl');
 await key('z','KeyZ',90,mod);assert.ok((await code()).includes('0.8'));
 await click('document.getElementById("detect-language").shadowRoot.querySelector("label")');
 await paste(glsl);assert.equal(await language(),'glsl');
 await paste(wgsl);assert.equal(await language(),'wgsl');
 // Common, Buffer and Sound all retain independent language selections via API and UI.
 await call('shader.source.set',{pass:'common',language:'glsl',code:'float gain(float x) { return x * .5; }'});
 await call('shader.source.set',{pass:'image',language:'glsl',code:'void mainImage(out vec4 c,in vec2 p) { c=vec4(vec3(gain(.8)),1.0); }'});
 await call('shader.source.set',{pass:'buffer-a',language:'glsl',code:glsl});
 await call('shader.pass.enable',{pass:'buffer-a',enabled:true});
 await call('shader.source.set',{pass:'sound',language:'glsl',code:'vec2 mainSound(int s,float t) { return vec2(gain(sin(t))); }'});
 await render();near(await pixel(),[102,102,102,255]);
 for(const pass of ['common','buffer-a','sound','image']) {
  await click('document.querySelector("#pass-tabs [data-pass=\\"'+pass+'\\"]")');assert.equal(await language(),'glsl');await highlight('glsl');
 }
 // Switching the active Image must not bake Common into its GLSL source.
 const commonBefore=(await call('shader.query')).commonGlsl;
 await choose('wgsl');await choose('glsl');await render();near(await pixel(),[102,102,102,255]);
 const separate=(await call('shader.query')).passes.find(p=>p.id==='image').glsl;
 assert.match(separate,/gain\(/);assert.doesNotMatch(separate,/float slCommonX/);
 assert.equal((await call('shader.query')).commonGlsl,commonBefore);
 await call('shader.source.set',{pass:'common',language:'glsl',code:'float gain(float x) { return x * .75; }'});
 await render();near(await pixel(),[153,153,153,255]);
 assert.equal((await call('shader.query')).passes.find(p=>p.id==='image').glsl,separate);
 const saved=await call('shader.project.export');
 await call('shader.project.open',{resourceId:saved.resourceId});
 await waitFor(()=>evaluate('shaderEditor.getApplicationState().compile.status==="ready"'),'reopen');
 q=await call('shader.query');assert.equal(q.editorLanguages.image,'glsl');assert.equal(q.editorLanguages.common,'glsl');
 assert.equal(await language(),'glsl');await highlight('glsl');
 await cdp.call('Emulation.setDeviceMetricsOverride',{width:720,height:1000,deviceScaleFactor:1,mobile:false});await nextPaint();
 assert.equal(await evaluate('document.documentElement.scrollWidth<=document.documentElement.clientWidth'),true);
 await cdp.call('Emulation.clearDeviceMetricsOverride');await nextPaint();
 shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'editor.png'),Buffer.from(shot.result.data,'base64'));
 return {status:'passed',checks:['Automatic paste detection, syntax colors and undo/redo restore the matching language','Manual choices convert current source; GPU pixels survive forward/reverse conversion','Both languages render expected GPU colors; GLSL diagnostics target original lines and preserve last good image','Readonly generated WGSL has highlighting and leaves the document unchanged','Independent Common stays editable and updates GPU pixels without reconverting Passes','Common/Buffer/Sound/Image language metadata survives API, export and reopen; narrow layout fits']};
}});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));

