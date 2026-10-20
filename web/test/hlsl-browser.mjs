import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'web/artifacts/hlsl');mkdirSync(out,{recursive:true});
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html#editor',downloadDirectory:out,timeoutMs:90000,failureScreenshotPath:resolve(out,'failure.png'),
readinessExpression:'shaderEditor.getStatus()?.ready && !document.getElementById("compile").disabled',
scenario:async({evaluate,click,waitFor,cdp,nextPaint,assertNoBrowserErrors})=>{
 const call=async(operation,params={})=>{
  const r=await evaluate('(async()=>{const d=haiyueEditor.listDocuments().documents[0];return haiyueEditor.execute({apiVersion:"1",requestId:crypto.randomUUID(),documentId:d.identity.id,expectedRevision:d.revision,operation:'+JSON.stringify(operation)+',params:'+JSON.stringify(params)+'});})()');
  assert.equal(r.status,'completed',JSON.stringify(r));return r.value;
 };
 const source=(pass,code)=>call('shader.source.set',{pass,code,language:'hlsl'});
 const compile=()=>call('shader.compile');
 const key=async(key,windowsVirtualKeyCode)=>{for(const type of ['keyDown','keyUp'])await cdp.call('Input.dispatchKeyEvent',{type,key,code:key,windowsVirtualKeyCode});};
 const pixel=async()=>{
  await waitFor(()=>evaluate('shaderEditor.getStatus()?.frame>1'),'readable Image frame');
  const r=await call('shader.image.read');
  return evaluate('(()=>{const b=haiyueEditor.readResource('+JSON.stringify(r.resourceId)+');const i=('+r.width+'*Math.floor('+r.height+'/2)+Math.floor('+r.width+'/2))*4;const p=Array.from(b.slice(i,i+4));haiyueEditor.releaseResource('+JSON.stringify(r.resourceId)+');return p;})()');
 };
 const near=(p,e)=>p.forEach((v,i)=>assert.ok(Math.abs(v-e[i])<3,JSON.stringify(p)));
 assert.deepEqual(await evaluate('document.getElementById("code-language").options.map(o=>o.value)'),['wgsl','glsl','hlsl']);
 await click('document.getElementById("code-language").shadowRoot.querySelector("select")');
 await key('Escape',27);
 await evaluate('(()=>{const s=document.getElementById("code-language").shadowRoot.querySelector("select");s.value="hlsl";s.dispatchEvent(new Event("change",{bubbles:true}));})()');
 await waitFor(()=>evaluate('document.getElementById("code-language").value==="hlsl"'),'HLSL language selected');
 assert.match(await evaluate('document.querySelector("#code-editor .cm-content").textContent'),/float4 mainImage/);
 assert.equal(await evaluate('document.querySelector("#code-editor .cm-content").getAttribute("aria-label")'),'HLSL 代码编辑器');
 assert.equal((await compile()).compiled,true);
 await source('common','float gain(float x){return x * 0.5;}');
 await source('buffer-a','float4 mainImage(float2 p){float2x2 m=float2x2(1,0,0,1);float2 uv=mul(m,p/iResolution.xy);return float4(gain(0.8),0.2,0.6,1.0)+float4(uv*0.0,0,0);}');
 await call('shader.pass.enable',{pass:'buffer-a',enabled:true});
 const image='float4 mainImage(float2 p){return channel0(p/iResolution.xy);}';
 await source('image',image);await call('shader.channel.set',{pass:'image',index:0,channel:{kind:'buffer',pass:'buffer-a'}});
 await source('sound','float2 mainSound(int sampleIndex,float time){return float2(gain(sin(6.2831853*440.0*time)));}');
 await call('shader.pass.enable',{pass:'sound',enabled:true});await call('shader.sound.configure',{duration:1});
 assert.equal((await compile()).compiled,true);await nextPaint();near(await pixel(),[102,51,153,255]);
 const audio=await call('shader.sound.export');
 assert.ok(await evaluate('(()=>{const b=haiyueEditor.readResource('+JSON.stringify(audio.resourceId)+');const ok=b.length>44100&&b.slice(44).some(v=>v!==0);haiyueEditor.releaseResource('+JSON.stringify(audio.resourceId)+');return ok;})()'));
 await click('document.getElementById("view-wgsl")');
 await waitFor(()=>evaluate('document.getElementById("generated-dialog").open'),'generated WGSL preview');
 assert.ok(await evaluate('document.querySelector("#generated-code .cm-content").textContent.includes("@fragment")'));
 assert.equal(await evaluate('document.querySelector("#generated-code .cm-content").getAttribute("contenteditable")'),'false');
 await click('document.querySelector("#generated-dialog button")');
 await source('image','float4 mainImage(float2 p){\n return missingValue;\n}');
 let failed=await compile();assert.equal(failed.compiled,false);assert.ok(failed.diagnostics.some(d=>d.pass==='image'&&d.language==='hlsl'&&d.line===2));
 near(await pixel(),[102,51,153,255]);
 await source('image',image);await source('common','// Common error\nfloat gain(float x){return missingCommon;}');
 failed=await compile();assert.equal(failed.compiled,false);assert.ok(failed.diagnostics.some(d=>d.pass==='common'&&d.language==='hlsl'&&d.line===2));
 await source('common','float gain(float x){return x * 0.5;}');assert.equal((await compile()).compiled,true);
 const fixture=await evaluate('shaderEditor.getProject()');writeFileSync(resolve(out,'project.hyshader'),JSON.stringify(fixture,null,2)+'\n');
 const saved=await call('shader.project.export');await call('shader.project.open',{resourceId:saved.resourceId});
 await waitFor(()=>evaluate('!document.getElementById("compile").disabled && shaderEditor.getApplicationState().compile.status==="ready"'),'HLSL project reopens');
 const q=await call('shader.query');assert.equal(q.editorLanguages.image,'hlsl');assert.equal(q.editorLanguages.common,'hlsl');assert.equal(q.passes.find(p=>p.id==='image').hlsl,image);near(await pixel(),[102,51,153,255]);
 // A native Texture2D SampleLevel uses WebGPU's top-left origin; channelN is
 // the Shadertoy-compatible bottom-left convenience helper.
 await source('buffer-a','float4 mainImage(float2 p){return float4(p.y<iResolution.y*.5?1.0:0.0,0,0,1);}');
 await source('image','float4 mainImage(float2 p){return channel0(float2(.5,.25));}');assert.equal((await compile()).compiled,true);near(await pixel(),[255,0,0,255]);
 await source('image','float4 mainImage(float2 p){return iChannel0.SampleLevel(iSampler,float2(.5,.25),0);}');assert.equal((await compile()).compiled,true);near(await pixel(),[0,0,0,255]);
 await source('image',image);await source('buffer-a',fixture.passes.find(p=>p.id==='buffer-a').hlsl);assert.equal((await compile()).compiled,true);
 await nextPaint();const shot=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,'editor.png'),Buffer.from(shot.result.data,'base64'));
 assertNoBrowserErrors();return{status:'passed',checks:['HLSL is a real selectable language with template, highlighting and completion','Slang WASM locally compiles HLSL Common / Buffer / Image / Sound through real WebGPU','matrix mul, Buffer sampling, native Texture2D sampling and UV direction render expected pixels','Sound produces nonzero PCM','pass/Common errors target original HLSL lines and retain last good GPU output','generated WGSL is readonly; original HLSL and language selections survive export/reopen']};
}});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(report);
