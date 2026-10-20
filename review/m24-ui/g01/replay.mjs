import assert from 'node:assert/strict';
import {readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {MobileSession} from '../../../mobile/src/session.ts';
import {parseProject,PREVIEW_SCALES} from '../../../web/dist/model.js';
// This is an extracted npm-pack artifact, not a relative import from the UI repository.
import {HYSelectionController} from './vendor/contract/selection.mjs';
const root=resolve(import.meta.dirname,'../../..'),out=resolve(import.meta.dirname,'results');
mkdirSync(out,{recursive:true});
const project=JSON.parse(readFileSync(resolve(import.meta.dirname,'project.hyshader'),'utf8'));
const options=PREVIEW_SCALES.map(value=>({value:String(value),label:`${value*100}%`}));
const session=new MobileSession();session.open(project);
let commits=0,listener;const events=[],writes=[];
const props=()=>({value:String(session.project.preview.scale),options});
const controller=new HYSelectionController('preview-scale',props(),event=>{
  events.push(event);
  if(event.type==='commit') {commits++;session.project.preview.scale=Number(event.value);session.changed();controller.update(props());}
});
const view={apply:p=>{writes.push(p.value);listener?.(p.value);},listen:fn=>{listener=fn;return()=>{listener=null;};}};
controller.update({...props(),value:'1'});assert.equal(writes.length,0);controller.attach(view);
for(const scale of [.75,.5,.25,1,.75]) controller.choose(String(scale));
assert.equal(commits,5);assert.equal(session.project.preview.scale,.75);
assert.equal(writes.at(-1),'0.75');assert.deepEqual(parseProject(JSON.stringify(session.project)),session.project);
assert.equal(await controller.pick(async()=>null),false);assert.equal(commits,5);
let answer;const pending=controller.pick(()=>new Promise(resolve=>answer=resolve));
controller.dispose();answer('0.25');assert.equal(await pending,false);assert.equal(listener,null);assert.equal(commits,5);
// Existing mobile business path in Node: measures CPU only, not native rendering or a phone.
const timings=[];
for(let run=0;run<3;run++) {
  const samples=[];for(let i=0;i<1200;i++) {
    const start=performance.now();session.project.preview.scale=PREVIEW_SCALES[i%4];session.changed();parseProject(JSON.stringify(session.project));
    if(i>=200)samples.push(performance.now()-start);
  }
  timings.push(samples);
}
const hash=path=>createHash('sha256').update(readFileSync(resolve(root,path))).digest('hex');
const files=['mobile/src/session.ts','web/src/model.ts','web/dist/model.js','package-lock.json','review/m24-ui/g01/project.hyshader','review/m24-ui/g01/vendor/contract/selection.mjs'];
writeFileSync(resolve(out,'replay.json'),JSON.stringify({status:'passed',kind:'node-business-replay-and-simulated-native-view',node:process.version,
  head:execFileSync('git',['rev-parse','HEAD'],{cwd:root,encoding:'utf8'}).trim(),hashes:Object.fromEntries(files.map(p=>[p,hash(p)])),
  checks:['pre-mount props','one commit per selection','setter callback suppression','cancel unchanged','dispose ignores pending picker','portable project roundtrip'],commits,events,writes,timings},null,2)+'\n');
console.log('Shared contract + existing MobileSession replay passed (no native-device claim).');
