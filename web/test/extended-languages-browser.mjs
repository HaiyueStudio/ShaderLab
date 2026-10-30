import assert from 'node:assert/strict';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/languages-2026-10-28/web');mkdirSync(out,{recursive:true});
const languages=['wgsl','glsl','hlsl','typescript','slang'],labels={wgsl:'WGSL',glsl:'GLSL',hlsl:'HLSL',typescript:'TypeScript',slang:'Slang'};
const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html#editor',downloadDirectory:out,timeoutMs:180000,failureScreenshotPath:resolve(out,'failure.png'),readinessExpression:'shaderEditor.getStatus()?.ready && shaderEditor.getApplicationState().compile.status==="ready"',scenario:async({evaluate,click,waitFor,nextPaint,cdp,assertNoBrowserErrors})=>{
  const call=async(operation,params={})=>{const r=await evaluate('(async()=>{const d=haiyueEditor.listDocuments().documents[0];return haiyueEditor.execute({apiVersion:"1",requestId:crypto.randomUUID(),documentId:d.identity.id,expectedRevision:d.revision,operation:'+JSON.stringify(operation)+',params:'+JSON.stringify(params)+'});})()');assert.equal(r.status,'completed',JSON.stringify(r));return r.value;};
  const choose=async(language)=>{
    await evaluate('(()=>{const s=document.getElementById("code-language").shadowRoot.querySelector("select");s.value='+JSON.stringify(language)+';s.dispatchEvent(new Event("change",{bubbles:true}));})()');
    await waitFor(()=>evaluate('Boolean(document.getElementById("conversion-dialog")?.open)||!document.getElementById("code-language").disabled'),'language preview');
    if(await evaluate('Boolean(document.getElementById("conversion-dialog")?.open)')){await nextPaint();await click('document.getElementById("conversion-apply")');}
    await waitFor(()=>evaluate('!document.getElementById("code-language").disabled&&shaderEditor.getProject().editorLanguages?.image==='+JSON.stringify(language)),'convert to '+language);
    assert.equal(await evaluate('document.querySelector("#code-editor .cm-content").getAttribute("aria-label")'),labels[language]+' 代码编辑器');
    assert.ok(await evaluate('document.getElementById("code-language").getBoundingClientRect().width>=110'),'complete language label fits');
  };
  const render=async()=>{const r=await call('shader.compile');assert.equal(r.compiled,true,JSON.stringify(r));await nextPaint();};
  const pixels=async()=>{const r=await call('shader.image.read');return evaluate('(()=>{const b=haiyueEditor.readResource('+JSON.stringify(r.resourceId)+'),out=[];for(const y of [.2,.5,.8])for(const x of [.2,.5,.8]){const at=(Math.floor('+r.height+'*y)*'+r.width+'+Math.floor('+r.width+'*x))*4;out.push(...b.slice(at,at+4));}haiyueEditor.releaseResource('+JSON.stringify(r.resourceId)+');return out;})()');};
  const screenshot=async(name)=>{const r=await cdp.call('Page.captureScreenshot',{format:'png'});writeFileSync(resolve(out,name+'.png'),Buffer.from(r.result.data,'base64'));};
  const original='// five-language GPU parity\nfn mainImage(p:vec2f)->vec4f{var c=vec3f(p/iResolution.xy,0.012);for(var i=0;i<3;i++){if(i==1){continue;}c.z+=0.01;}return vec4f(c,1.0);}';
  const sources={};let baseline;
  for(const language of languages){await call('shader.source.set',{pass:'image',code:original,language:'wgsl'});if(language!=='wgsl')await choose(language);await render();const p=await pixels();if(!baseline)baseline=p;else p.forEach((v,i)=>assert.ok(Math.abs(v-baseline[i])<=2,language+' baseline'));sources[language]=await evaluate('(()=>{const p=shaderEditor.getProject().passes.find(p=>p.id==="image");return p['+JSON.stringify(language==='wgsl'?'code':language)+'];})()');}
  const conversions=[];
  for(const from of languages)for(const to of languages.filter(v=>v!==from)){
    await call('shader.source.set',{pass:'image',code:sources[from]+'\n// latest '+from,language:from});await choose(to);await render();const actual=await pixels(),error=Math.max(...actual.map((v,i)=>Math.abs(v-baseline[i])));assert.ok(error<=2,from+' → '+to+' pixel error '+error);conversions.push({from,to,maxChannelError:error});
    if(from==='wgsl'&&(to==='typescript'||to==='slang'))await screenshot(to+'-editor');
  }
  await call('shader.source.set',{pass:'image',code:'export function mainImage(',language:'typescript'});const before=await evaluate('JSON.stringify(shaderEditor.getProject())');
  await evaluate('(()=>{const s=document.getElementById("code-language").shadowRoot.querySelector("select");s.value="wgsl";s.dispatchEvent(new Event("change",{bubbles:true}));})()');await waitFor(()=>evaluate('!document.getElementById("code-language").disabled'),'invalid conversion completes');assert.equal(await evaluate('JSON.stringify(shaderEditor.getProject())'),before);
  assertNoBrowserErrors();return {status:'passed',conversions,invalidSourcePreserved:true,editorLabels:labels};
}});
writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report));
