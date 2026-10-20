import {build} from 'esbuild';
import {writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {runEditorBrowserScenario} from '../../../scripts/editor-e2e/browserDriver.mjs';
const root=resolve(import.meta.dirname,'../../..'),out=resolve(import.meta.dirname,'results');mkdirSync(out,{recursive:true});
await build({entryPoints:[resolve(import.meta.dirname,'web-probe.mjs')],outfile:resolve(import.meta.dirname,'web-probe.bundle.js'),bundle:true,format:'esm',metafile:true}).then(r=>writeFileSync(resolve(out,'probe-bundle-inputs.json'),JSON.stringify(r.metafile.inputs,null,2)+'\n'));
const result=await runEditorBrowserScenario({root,route:'review/m24-ui/g01/probe.html',gpuTestFlags:false,
  downloadDirectory:resolve(out,'downloads'),readinessExpression:'Boolean(window.probeResult)',
  scenario:async driver=>{const result=await driver.evaluate('probeResult');if(result.status!=='passed')throw Error('Probe failed');return {...result,kind:'real-WebComponent-with-synthetic-input',browserErrors:driver.getBrowserErrors()};}});
if(result.browserErrors.length)throw Error(JSON.stringify(result.browserErrors));
writeFileSync(resolve(out,'web-probe.json'),JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify(result));
