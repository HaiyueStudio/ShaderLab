import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {cpus,platform,release,arch} from 'node:os';
import {runEditorBrowserScenario} from '../../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../../..'), out=resolve(import.meta.dirname,'results');
mkdirSync(out,{recursive:true});
const project=JSON.parse(readFileSync(resolve(import.meta.dirname,'project.hyshader'),'utf8'));
const runs=[];
for(let index=0;index<3;index++) {
  const report=await runEditorBrowserScenario({root,route:'web/app-dist/index.html',
    downloadDirectory:resolve(out,'downloads'),failureScreenshotPath:resolve(out,`failure-${index}.png`),
    timeoutMs:180000,readinessExpression:'document.querySelector("#app")?.getAttribute("aria-busy") === "false"',
    scenario:async driver=>{
      const {evaluate,cdp,nextPaint}=driver;
      await evaluate(`shaderEditor.open(${JSON.stringify(project)})`);
      await driver.waitFor(()=>evaluate('shaderEditor.getStatus()?.ready && shaderEditor.getStatus()?.frame > 3'),'initial GPU frames');
      const start=await evaluate(`(()=>{window.__m24={events:0,canvas:document.getElementById('shader-canvas'),select:document.getElementById('preview-scale')};__m24.select.addEventListener('value-change',()=>__m24.events++);return {status:shaderEditor.getStatus(),ui:__m24.select.value,agent:navigator.userAgent};})()`);
      assert.equal(start.ui,'1');
      const transitions=[];
      for(const scale of Array.from({length:20},()=>[.75,.5,.25,1,.75]).flat()) {
        const result=await evaluate(`(async()=>{
          const host=__m24.select,select=host.shadowRoot.querySelector('select');
          const before=__m24.events,start=performance.now();select.value=${JSON.stringify(String(scale))};
          select.dispatchEvent(new Event('change',{bubbles:true}));
          const syncMs=performance.now()-start;
          for(let i=0;i<900;i++) {
            await new Promise(requestAnimationFrame);
            const s=shaderEditor.getStatus(),canvas=document.getElementById('shader-canvas');
            const w=Math.max(1,canvas.width*${scale}),h=Math.max(1,canvas.height*${scale});
            const cap=Math.min(1,2048/Math.max(w,h),Math.sqrt(1048576/(w*h)));
            if(!document.getElementById('compile').disabled && s?.ready && s.frame>2 && s.width===Math.max(1,Math.floor(w*cap)) && s.height===Math.max(1,Math.floor(h*cap))) {
              return {scale:shaderEditor.getProject().preview.scale,selected:host.value,events:__m24.events-before,syncMs,settledMs:performance.now()-start,status:s,hash:location.hash,sameCanvas:canvas===__m24.canvas,sameSelect:host===document.getElementById('preview-scale')};
            }
          }
          throw Error('Preview scale did not settle: '+${scale});
        })()`);
        assert.equal(result.scale,scale);assert.equal(result.selected,String(scale));assert.equal(result.events,1);
        assert.equal(result.hash,'#editor');assert.equal(result.sameCanvas,true);assert.equal(result.sameSelect,true);
        transitions.push(result);
      }
      const programmatic=await evaluate(`(()=>{const n=__m24.events;__m24.select.value='0.5';__m24.select.value='0.75';return __m24.events-n})()`);
      assert.equal(programmatic,0);
      const frameIntervals=await evaluate(`(async()=>{let last;const samples=[];for(let i=0;i<150;i++){const t=await new Promise(requestAnimationFrame);if(i>=30)samples.push(t-last);last=t;}return samples;})()`);
      const metrics=await cdp.call('Performance.getMetrics');
      await nextPaint();
      const screenshot=await cdp.call('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
      writeFileSync(resolve(out,`web-ui-0.2-${index}.png`),Buffer.from(screenshot.result.data,'base64'));
      assert.deepEqual(driver.getBrowserErrors(),[]);
      return {start,transitions,programmaticEvents:programmatic,frameIntervals,metrics:metrics.result.metrics,
        browserErrors:driver.getBrowserErrors(),angleBackend:driver.angleBackend,headless:driver.headless};
    }});
  runs.push(report);console.log(`Web baseline run ${index+1}/3 passed`);
}
const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
const percentile=(values,p)=>[...values].sort((a,b)=>a-b)[Math.ceil(values.length*p)-1];
const files=['package-lock.json','web/package.json','web/src/main.ts','web/src/model.ts','review/m24-ui/g01/project.hyshader','vendor/haiyue-ui-0.2.0.tgz','web/app-dist/web/main.js'];
const report={status:'passed',capturedAt:new Date().toISOString(),kind:'real-browser-with-synthetic-select-input',
  note:'requestAnimationFrame intervals are frame pacing, not GPU timestamps. Existing ShaderLab path, before shared UI migration.',
  host:{platform:platform(),os:release(),arch:arch(),cpu:cpus()[0].model,node:process.version},
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),
  dirty:execFileSync('git',['status','--short'],{cwd:root,encoding:'utf8'}),
  hashes:Object.fromEntries(files.map(p=>[p,hash(p)])),
  summary:runs.map(r=>({syncP95Ms:percentile(r.transitions.map(t=>t.syncMs),.95),settledP95Ms:percentile(r.transitions.map(t=>t.settledMs),.95),rafP95Ms:percentile(r.frameIntervals,.95)})),runs};
report.quality={purpose:'Frozen pre-migration workload and captured reference, not a performance improvement verdict',comparison:'candidate absent',
  handlerP95SpreadRatio:Math.max(...report.summary.map(r=>r.syncP95Ms))/Math.min(...report.summary.map(r=>r.syncP95Ms)),
  settledP95SpreadRatio:Math.max(...report.summary.map(r=>r.settledP95Ms))/Math.min(...report.summary.map(r=>r.settledP95Ms)),
  requiredBeforePerformanceVerdict:'G07 must rerun old and new paths on the same idle device; inconclusive samples cannot pass the 1.10 gate.'};
writeFileSync(resolve(out,'web-baseline.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));
