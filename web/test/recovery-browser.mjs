import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {build} from 'esbuild';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/product-p0-2026-10-23/web');mkdirSync(out,{recursive:true});
await build({entryPoints:[resolve(root,'web/src/recovery.ts')],outfile:resolve(out,'recovery-test.js'),bundle:true,platform:'browser',format:'esm',target:'es2022'});
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html#editor',downloadDirectory:out,failureScreenshotPath:resolve(out,'failure.png'),timeoutMs:90000,
readinessExpression:'window.shaderEditor?.getStatus()?.ready && shaderEditor.getApplicationState().compile.status==="ready"',
scenario:async({evaluate,click:rawClick,waitFor,cdp,nextPaint,assertNoBrowserErrors})=>{
 const click=async expr=>{await waitFor(()=>evaluate(`(()=>{try{return Boolean(${expr});}catch{return false;}})()`),'click target');await evaluate(`(${expr}).scrollIntoView({block:'center',inline:'nearest'})`);await nextPaint();await rawClick(expr);};
 const call=async(operation,params={})=>{const r=await evaluate(`(async()=>{const d=haiyueEditor.listDocuments().documents[0];return haiyueEditor.execute({apiVersion:'1',requestId:crypto.randomUUID(),documentId:d.identity.id,expectedRevision:d.revision,operation:${JSON.stringify(operation)},params:${JSON.stringify(params)}});})()`);assert.equal(r.status,'completed',JSON.stringify(r));return r.value;};
 await evaluate(`(async()=>{window.p0Store=new (await import('/web/dist/storage.js')).GalleryStore();await p0Store.ready();})()`);
 const project=()=>evaluate('shaderEditor.getProject()');
 const source=()=>evaluate('shaderEditor.getProject().passes.find(p=>p.id==="image").code');
 const drafts=()=>evaluate('p0Store.archive.drafts()');
 const history=id=>evaluate(`p0Store.archive.history(${JSON.stringify(id)})`);
 const setSource=code=>call('shader.source.set',{pass:'image',language:'wgsl',code});
 const close=async()=>{await click('document.querySelector("dialog[open] header button")');await waitFor(()=>evaluate('!document.querySelector("dialog[open]") && !document.getElementById("code-language").disabled'),'dialog closed');};
 const codeA='fn mainImage(p:vec2f)->vec4f { return vec4f(0.2,0.4,0.6,1.0); }';
 const nameInput=`document.querySelector('[data-hy-key="/shader-project/name/field"]').shadowRoot.querySelector('input')`;
 await evaluate(`(()=>{const input=${nameInput};input.focus();input.select();})()`);
 for(const type of['keyDown','keyUp'])await cdp.call('Input.dispatchKeyEvent',{type,key:'Backspace',code:'Backspace',windowsVirtualKeyCode:8});
 assert.equal(await evaluate(`(${nameInput}).value`),'');
 await cdp.call('Input.insertText',{text:'  P0 recovery 🌙  '});await nextPaint();
 assert.equal((await project()).name,'P0 recovery 🌙');
 await setSource(codeA);assert.equal(await evaluate('shaderEditor.save()'),true);const saved=await project();
 assert.equal(await evaluate(`(${nameInput}).value`),'P0 recovery 🌙');
 await setSource(codeA+'\n// unsaved A 🌙');
 await waitFor(async()=> (await drafts()).some(d=>d.id===saved.id),'automatic recovery draft');
 assert.equal((await evaluate('p0Store.list()'))[0].project.passes.find(p=>p.id==='image').code,codeA);
 // Opening another work flushes its predecessor, and the two recovery records coexist.
 await evaluate('shaderEditor.create()');const b=await project();await setSource(codeA+'\n// unsaved B');
 await waitFor(async()=> (await drafts()).some(d=>d.id===b.id),'second independent draft');
 assert.equal((await drafts()).length,2);
 // Reload a real page/database, auto-accepting the existing unsaved-page browser prompt.
 cdp.on('Page.javascriptDialogOpening',()=>void cdp.call('Page.handleJavaScriptDialog',{accept:true}));
 await cdp.call('Page.reload',{ignoreCache:true});
 await waitFor(()=>evaluate('window.shaderEditor && document.getElementById("drafts-dialog")?.open'),'recovery after reload');
 await click(`Array.from(document.querySelectorAll('#drafts-dialog article')).find(x=>x.textContent.includes('Image') || x.textContent.includes('image')).querySelector('button')`);
 await waitFor(()=>evaluate('shaderEditor.getApplicationState().savedRevision===0'),'restored dirty draft');
 await evaluate(`(async()=>{window.p0Store=new (await import('/web/dist/storage.js')).GalleryStore();await p0Store.ready();})()`);
 assert.match(await source(),/unsaved [AB]/);
 // Reopen the first saved project and choose its draft via the actual gallery card.
 await evaluate('location.hash="gallery"');await waitFor(()=>evaluate('!document.getElementById("gallery").hidden'),'gallery route');
 await evaluate(`window.p0SavedCard=document.querySelector('#saved-projects [data-project="${saved.id}"]')`);
 await waitFor(()=>evaluate('document.getElementById("examples").getAttribute("aria-busy")==="false"'),'gallery preview completion');
 assert.equal(await evaluate(`window.p0SavedCard===document.querySelector('#saved-projects [data-project="${saved.id}"]')`),true,'preview generation preserves saved-card identity');
 assert.ok((await drafts()).some(d=>d.id===saved.id),'saved work retains its independent recovery draft');
 await click(`document.querySelector('#saved-projects [data-project="${saved.id}"]')`);
 await waitFor(()=>evaluate('Boolean(document.querySelector("dialog[open]"))'),'open recovery choice',10000);
 await click('document.querySelector("dialog[open] .recovery-body button")');
 await waitFor(async()=> (await source()).includes('unsaved A'),'specific draft restored');
 const recovered=await source();await setSource(recovered+'\n// temporary edit');await click('document.getElementById("undo-source")');assert.equal(await source(),recovered);assert.equal(await evaluate('shaderEditor.getApplicationState().savedRevision!==shaderEditor.getApplicationState().revision'),true,'recovered content still requires manual save');
 await setSource(codeA+'\n// second saved version');assert.equal(await evaluate('shaderEditor.save()'),true);
 let versions=await history(saved.id);assert.equal(versions.filter(v=>v.reason==='saved').length,2);
 // Preview cancellation is read-only; apply is checkpointed and one undo restores source + language.
 const choose=lang=>evaluate(`(()=>{const s=document.getElementById('code-language').shadowRoot.querySelector('select');s.value=${JSON.stringify(lang)};s.dispatchEvent(new Event('change',{bubbles:true}));})()`);
 const before=await project();await choose('hlsl');
 await waitFor(()=>evaluate('document.getElementById("conversion-dialog")?.open'),'conversion preview');
 assert.deepEqual(await project(),before);
 let shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'conversion-preview.png'),Buffer.from(shot.result.data,'base64'));
 await close();assert.deepEqual(await project(),before);
 await cdp.call('Emulation.setDeviceMetricsOverride',{width:720,height:1000,deviceScaleFactor:1,mobile:false});await nextPaint();
 await choose('hlsl');await waitFor(()=>evaluate('document.getElementById("conversion-dialog")?.open'),'second conversion preview');
 assert.equal(await evaluate('document.querySelector("#conversion-dialog").scrollWidth<=document.querySelector("#conversion-dialog").clientWidth'),true);
 shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'conversion-narrow.png'),Buffer.from(shot.result.data,'base64'));
 await click('document.getElementById("conversion-apply")');
 await waitFor(()=>evaluate('shaderEditor.getProject().editorLanguages.image==="hlsl"'),'converted');
 await cdp.call('Emulation.clearDeviceMetricsOverride');await nextPaint();
 assert.ok((await history(saved.id)).some(v=>v.reason==='before-conversion'));
 await click('document.getElementById("undo-source")');assert.equal((await project()).editorLanguages.image,'wgsl');assert.equal(await source(),before.passes[4].code);assert.equal((await project()).passes[4].hlsl,undefined);
 await click('document.getElementById("redo-source")');assert.equal((await project()).editorLanguages.image,'hlsl');
 await click('document.getElementById("undo-source")');
 await waitFor(async()=> !(await drafts()).some(d=>d.id===saved.id),'undo to saved clears stale draft');
 // Restore the first version, while preserving a durable checkpoint of the current work.
 await click('document.getElementById("project-history")');await waitFor(()=>evaluate('document.querySelectorAll("#history-dialog [data-version]").length>0'),'history');
 versions=await history(saved.id);const first=versions.filter(v=>v.reason==='saved').at(-1);
 await click(`document.querySelector('#history-dialog [data-version="${first.id}"]')`);
 await waitFor(()=>evaluate('Array.from(document.querySelectorAll("#history-dialog button")).some(b=>b.textContent==="恢复此版本")'),'history comparison');
 shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'history.png'),Buffer.from(shot.result.data,'base64'));
 await click(`Array.from(document.querySelectorAll('#history-dialog button')).find(b=>b.textContent==='恢复此版本')`);
 await waitFor(async()=> (await source())===codeA,'restored first version');
 assert.ok((await history(saved.id)).some(v=>v.reason==='before-restore'));
 assert.equal((await evaluate('p0Store.list()'))[0].project.passes[4].code,before.passes[4].code);
 // Delete through the gallery; restore via the trash retains both saved and unsaved work.
 await evaluate('location.hash="gallery"');await nextPaint();
 await click('document.querySelector("#saved-projects .card-delete")');
 await waitFor(()=>evaluate('document.querySelectorAll("#saved-projects .shader-card").length===0'),'soft deletion');
 await click(`Array.from(document.querySelectorAll('.recovery-actions button')).find(b=>b.textContent==='回收站')`);
 await waitFor(()=>evaluate('document.querySelectorAll("#trash-dialog article").length===1'),'trash');
 await click('document.querySelector("#trash-dialog article button")');await close();
 assert.equal((await evaluate('p0Store.list()')).length,1);assert.equal((await evaluate(`p0Store.archive.restoreDraft(${JSON.stringify(saved.id)})`)).project.passes[4].code,codeA);
 assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'),true);
 assert.equal(await evaluate(`(async()=>{const {createRecoveryUI}=await import('/artifacts/product-p0-2026-10-23/web/recovery-test.js');let release,opens=0;const pending=new Promise(r=>release=r),ui=createRecoveryUI({store:{archive:{restoreDraft:()=>pending}},app:{},openSaved:async()=>{opens++;}});const a=ui.openWork({id:'single-flight'}),b=ui.openWork({id:'single-flight'});release(null);await Promise.all([a,b]);return opens;})()`),1,'repeated gallery activation opens one editor');
 assertNoBrowserErrors();
 return{status:'passed',checks:['IndexedDB saves, per-project drafts and page-reload recovery','Gallery opens saved or recovered versions without replacing the other','Conversion preview/cancel, durable checkpoint, atomic language undo/redo','History comparison and whole-project restore preserve saved versions','Trash recovers saved work, drafts and version history']};
}});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
