import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/m24-g07/profile');mkdirSync(out,{recursive:true});
const buildPath=process.env.SHADERLAB_TEST_BUILD??'web/app-dist';
const fixture=JSON.parse(readFileSync(resolve(root,'review/m24-ui/g01/project.hyshader')));
const hash=()=>createHash('sha256').update(readFileSync(resolve(root,buildPath,'web/main.js'))).digest('hex'),bundleSha256=hash(),runs=[];
// Separate diagnostic sampling run: never mix profiler overhead into p95 gates.
for(const mode of ['legacy','shared'])runs.push(await runEditorBrowserScenario({root,route:buildPath+'/index.html?ui='+mode,downloadDirectory:resolve(out,'downloads'),timeoutMs:90000,
 readinessExpression:'document.getElementById("app")?.getAttribute("aria-busy")==="false"',scenario:async({evaluate,waitFor,cdp})=>{
  await evaluate(`(()=>{Object.assign(document.getElementById('viewport').style,{width:'640px',height:'360px',border:'0',minHeight:'0',maxHeight:'360px',flex:'none'});return shaderEditor.open(${JSON.stringify(fixture)});})()`);
  await waitFor(()=>evaluate('shaderEditor.getStatus()?.frame>30'),'warmup');
  await cdp.call('Profiler.enable');await cdp.call('Profiler.setSamplingInterval',{interval:100});await cdp.call('Profiler.start');
  for(const scale of Array.from({length:20},()=>[.75,.5,.25,1,.75]).flat())await evaluate(`(async()=>{const select=${mode==='shared'?`document.querySelector('[data-hy-key="/shader-toolbar/controls/scale"]')`:`document.getElementById('preview-scale')`}.shadowRoot.querySelector('select');select.value='${scale}';select.dispatchEvent(new Event('change',{bubbles:true}));for(let i=0;i<300;i++){await new Promise(requestAnimationFrame);if(shaderEditor.getApplicationState().compile.status==='ready'&&shaderEditor.getStatus().frame>2)return;}throw Error('compile timeout');})()`);
  const {result:{profile}}=await cdp.call('Profiler.stop');await cdp.call('Profiler.disable');
  writeFileSync(resolve(out,mode+'.cpuprofile'),JSON.stringify(profile));
  const self=new Map();for(let i=0;i<(profile.samples?.length??0);i++)self.set(profile.samples[i],(self.get(profile.samples[i])??0)+(profile.timeDeltas[i]??0));
  const frames=profile.nodes.filter(n=>self.has(n.id)).map(n=>({function:n.callFrame.functionName||'(anonymous)',source:n.callFrame.url?.includes('/web/main.js')?'web/main.js':n.callFrame.url?'test/browser':'runtime',line:n.callFrame.lineNumber+1,selfMs:self.get(n.id)/1000})).sort((a,b)=>b.selfMs-a.selfMs);
  return {mode,durationMs:(profile.endTime-profile.startTime)/1000,samples:profile.samples?.length??0,topSelf:frames.slice(0,30),diagnostics:await evaluate('shaderEditor.getSharedUI()')};
 }}));
assert.equal(hash(),bundleSha256);
writeFileSync(resolve(out,'report.json'),JSON.stringify({capturedAt:new Date().toISOString(),bundleSha256,kind:'CPU sampling diagnostic only; 100 us requested interval; includes compilation/render waiting; not a p95 gate or GPU timestamp',runs},null,2)+'\n');
console.log('CPU diagnostic profiles recorded for legacy and shared UI');
