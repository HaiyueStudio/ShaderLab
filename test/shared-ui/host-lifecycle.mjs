import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
import {runEditorBrowserScenario} from '../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../..'),out=resolve(root,'artifacts/m24-g07/host-lifecycle');mkdirSync(out,{recursive:true});
await build({absWorkingDir:root,entryPoints:['test/shared-ui/host-lifecycle.js'],bundle:true,format:'esm',outdir:out,loader:{'.wgsl':'text','.wasm':'file'}});
writeFileSync(resolve(out,'index.html'),'<html><body><div id="root"></div><script type="module" src="host-lifecycle.js"></script></body></html>');
const fixture=JSON.parse(readFileSync(resolve(root,'review/m24-ui/g01/project.hyshader')));
const report=await runEditorBrowserScenario({root,route:'artifacts/m24-g07/host-lifecycle/index.html',downloadDirectory:resolve(out,'downloads'),timeoutMs:120000,readinessExpression:'Boolean(window.hostLifecycle)',scenario:async({evaluate,cdp,getBrowserErrors})=>{
 const before=await evaluate('hostLifecycle.snapshot()'),cycles=[],heap=[];
 for(let i=0;i<50;i++){
  const result=await evaluate(`hostLifecycle.cycle(${JSON.stringify(fixture)})`);
  assert.deepEqual(result.released,before,'host resources must return to baseline at cycle '+i);
  assert.equal(result.shared.controller.subscriptions,0);assert.equal(result.shared.controller.disposed,true);
  for(const part of result.shared.parts){assert.equal(part.activeNodes,0);assert.equal(part.activeResources,0);assert.equal(part.activeListeners,0);}
  cycles.push(result);if(i%5===4){await cdp.call('HeapProfiler.collectGarbage');const {result:{metrics}}=await cdp.call('Performance.getMetrics');const sample={cycle:i+1,...Object.fromEntries(metrics.filter(m=>['JSHeapUsedSize','Nodes','Documents'].includes(m.name)).map(m=>[m.name,m.value]))};
   if(heap.length){assert.equal(sample.Nodes,heap[0].Nodes,'Detached DOM nodes retained after collection');assert.equal(sample.Documents,heap[0].Documents,'Documents retained after collection');}heap.push(sample);}
  console.log('host lifecycle',i+1);
 }
 assert.deepEqual(getBrowserErrors(),[]);return {before,cycles,heap};
}});
writeFileSync(resolve(out,'report.json'),JSON.stringify({status:'passed',capturedAt:new Date().toISOString(),kind:'50 real G07 Web host lifetimes with CodeMirror + ShaderRuntime; not NativeScript or native GPU memory acceptance',bundleSha256:createHash('sha256').update(readFileSync(resolve(out,'host-lifecycle.js'))).digest('hex'),...report},null,2)+'\n');
