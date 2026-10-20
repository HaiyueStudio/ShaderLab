import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
const run=promisify(execFile),root=resolve(import.meta.dirname,'../..');
const platform=process.argv[2],device=process.env.DEVICE;
assert.ok(['ios','android'].includes(platform)&&device,'Use ios|android and DEVICE (CoreDevice ID or ADB serial)');
const out=resolve(root,'artifacts/m24-g07/native-performance',process.env.DEVICE_LABEL??platform);mkdirSync(out,{recursive:true});
const artifact=resolve(root,process.env.ARTIFACT??(platform==='ios'?'mobile/platforms/ios/build/Debug-iphoneos/ShaderLab.ipa':'mobile/platforms/android/app/build/outputs/apk/debug/app-debug.apk'));
const hash=()=>createHash('sha256').update(readFileSync(artifact)).digest('hex'),artifactSha256=hash();
const adb=process.env.ADB??'adb',pause=ms=>new Promise(r=>setTimeout(r,ms));
const invoke=(command,args)=>{
 if(command==='xcrun'){const at=args.indexOf('--device');args=[...args.slice(0,at),'--timeout','15',...args.slice(at)];}
 return run(command,args,{cwd:root,timeout:25000,maxBuffer:4*1024*1024});
};
const runs=[];
for(let round=0;round<3;round++)for(const mode of round%2?['shared','legacy']:['legacy','shared']){
 const start=Date.now(),file=resolve(out,`${round}-${mode}.json`);
 if(platform==='ios')await invoke('xcrun',['devicectl','device','process','launch','--device',device,'--terminate-existing','studio.haiyue.shaderlab','--shaderlab-ui-performance',`--shaderlab-ui=${mode}`]);
 else {
  await invoke(adb,['-s',device,'shell','input','keyevent','KEYCODE_WAKEUP']);
  await invoke(adb,['-s',device,'shell','wm','dismiss-keyguard']);
  await invoke(adb,['-s',device,'shell','am','force-stop','studio.haiyue.shaderlab']);
  await invoke(adb,['-s',device,'shell','am','start','-n','studio.haiyue.shaderlab/com.tns.NativeScriptActivity','--ez','shaderlab-ui-performance','true','--es','shaderlab-ui',mode]);
 }
 let report;
 while(Date.now()-start<180000){
  await pause(3000);
  try{
   if(platform==='ios')await invoke('xcrun',['devicectl','device','copy','from','--device',device,'--domain-type','appDataContainer','--domain-identifier','studio.haiyue.shaderlab','--source','Documents/shaderlab-g07-performance.json','--destination',file]);
   else {const {stdout}=await invoke(adb,['-s',device,'shell','run-as','studio.haiyue.shaderlab','cat','files/shaderlab-g07-performance.json']);writeFileSync(file,stdout);}
   const value=JSON.parse(readFileSync(file));
   if(Date.parse(value.startedAt)<start-2000||value.mode!==mode)continue;
   if(value.status==='running')continue;
   assert.equal(value.status,'passed',value.error);report=value;break;
  }catch(error){if(error.code==='ERR_ASSERTION')throw error;}
 }
 assert.ok(report,'Timed out collecting fresh performance report');assert.equal(report.samples.length,100);
 if(runs.length)assert.deepEqual(report.surface,runs[0].surface,'same-device canvas size changed');
 runs.push({...report,round});console.log(mode,round,report.p95);
 writeFileSync(resolve(out,'partial.json'),JSON.stringify({artifactSha256,runs},null,2)+'\n');
}
const summary={};
for(const metric of ['handler','settled','cadence']){
 const old=runs.filter(r=>r.mode==='legacy').map(r=>r.p95[metric]),next=runs.filter(r=>r.mode==='shared').map(r=>r.p95[metric]);
 const spread=a=>Math.max(...a)/Math.min(...a),median=a=>[...a].sort((a,b)=>a-b)[1],ratio=median(next)/median(old);
 summary[metric]={legacyMs:old,sharedMs:next,medianRatio:ratio,legacySpread:spread(old),sharedSpread:spread(next),verdict:!old.every(v=>v>0)||!next.every(v=>v>0)||spread(old)>1.1||spread(next)>1.1?'inconclusive':ratio<=1.1?'passed':'regression'};
}
assert.equal(hash(),artifactSha256,'Artifact changed during comparison');
const status=Object.values(summary).every(s=>s.verdict==='passed')?'passed':Object.values(summary).some(s=>s.verdict==='regression')?'regression':'inconclusive';
writeFileSync(resolve(out,'report.json'),JSON.stringify({status,capturedAt:new Date().toISOString(),artifactSha256,device:runs[0].device,surface:runs[0].surface,kind:'same-device semantic command; picker animations excluded; cadence is not GPU timestamp',summary,runs},null,2)+'\n');console.log(status,summary);
