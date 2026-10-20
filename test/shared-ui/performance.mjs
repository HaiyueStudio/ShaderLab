import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {cpus,platform,release,arch} from 'node:os';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/m24-g07/performance');mkdirSync(out,{recursive:true});
const buildPath=process.env.SHADERLAB_TEST_BUILD??'web/app-dist';
const bundleHash=()=>createHash('sha256').update(readFileSync(resolve(root,buildPath,'web/main.js'))).digest('hex');
const bundleSha256=bundleHash();
const fixture=JSON.parse(readFileSync(resolve(root,'review/m24-ui/g01/project.hyshader'))),runs=[];
const p95=a=>[...a].sort((a,b)=>a-b)[Math.ceil(a.length*.95)-1];
// Alternating order, fixed 640 × 360 backing canvas, one fixture and one built bundle.
for(let round=0;round<3;round++)for(const mode of round%2?['shared','legacy']:['legacy','shared']){
 const run=await runEditorBrowserScenario({root,route:buildPath+'/index.html?ui='+mode,downloadDirectory:resolve(out,'downloads'),timeoutMs:90000,
 readinessExpression:'document.getElementById("app")?.getAttribute("aria-busy")==="false"',scenario:async({evaluate,waitFor,getBrowserErrors})=>{
  await evaluate(`(()=>{const v=document.getElementById('viewport');Object.assign(v.style,{width:'640px',height:'360px',border:'0',padding:'0',minHeight:'0',maxHeight:'360px',aspectRatio:'auto',flex:'none'});return shaderEditor.open(${JSON.stringify(fixture)});})()`);
  await waitFor(()=>evaluate('shaderEditor.getStatus()?.frame>30'),'warmup frames');
  const dimensions=await evaluate(`(()=>{const c=document.getElementById('shader-canvas');return [c.width,c.height]})()`);assert.deepEqual(dimensions,[640,360]);
  await evaluate(`window.__perf={canvas:document.getElementById('shader-canvas'),control:${mode==='shared'?`document.querySelector('[data-hy-key="/shader-toolbar/controls/scale"]')`:`document.getElementById('preview-scale')`}}`);
  const samples=[];
  for(const scale of Array.from({length:20},()=>[.75,.5,.25,1,.75]).flat())samples.push(await evaluate(`(async()=>{
   const select=__perf.control.shadowRoot.querySelector('select'),start=performance.now();select.value='${scale}';select.dispatchEvent(new Event('change',{bubbles:true}));const handler=performance.now()-start;
   for(let i=0;i<600;i++){await new Promise(requestAnimationFrame);const s=shaderEditor.getStatus();if(shaderEditor.getApplicationState().compile.status==='ready'&&s.frame>2&&s.width===${Math.floor(640*scale)}&&s.height===${Math.floor(360*scale)})return {handler,settled:performance.now()-start};}
   throw Error('scale did not settle');})()`));
  const intervals=await evaluate(`(async()=>{let last;const a=[];for(let i=0;i<150;i++){const now=await new Promise(requestAnimationFrame);if(i>=30)a.push(now-last);last=now;}return a;})()`);
  assert.equal(await evaluate('__perf.canvas===document.getElementById("shader-canvas")'),true);assert.deepEqual(getBrowserErrors(),[]);
  return {mode,round,dimensions,samples,intervals,p95:{handler:p95(samples.map(s=>s.handler)),settled:p95(samples.map(s=>s.settled)),raf:p95(intervals)},diagnostics:await evaluate('shaderEditor.getSharedUI()')};
 }});runs.push(run);console.log(mode,round,run.p95);
}
const summary={};for(const metric of ['handler','settled','raf']){
 const old=runs.filter(r=>r.mode==='legacy').map(r=>r.p95[metric]),candidate=runs.filter(r=>r.mode==='shared').map(r=>r.p95[metric]);
 const spread=a=>Math.max(...a)/Math.min(...a),median=a=>[...a].sort((a,b)=>a-b)[1],ratio=median(candidate)/median(old);
 summary[metric]={legacyMs:old,sharedMs:candidate,medianRatio:ratio,legacySpread:spread(old),sharedSpread:spread(candidate),verdict:spread(old)>1.1||spread(candidate)>1.1?'inconclusive':ratio<=1.1?'passed':'regression'};
}
assert.equal(bundleHash(),bundleSha256,'Built bundle changed during measurement');
writeFileSync(resolve(out,'report.json'),JSON.stringify({status:Object.values(summary).every(s=>s.verdict==='passed')?'passed':Object.values(summary).some(s=>s.verdict==='regression')?'regression':'inconclusive',capturedAt:new Date().toISOString(),kind:'synthetic select input; rAF pacing is not GPU timestamp',host:{platform:platform(),release:release(),arch:arch(),cpu:cpus()[0].model},fixtureSha256:createHash('sha256').update(JSON.stringify(fixture)).digest('hex'),bundleSha256,summary,runs},null,2)+'\n');
console.log(JSON.stringify(summary,null,2));
