import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';
const run=promisify(execFile),root=resolve(import.meta.dirname,'../..'),platform=process.argv[2],device=process.env.DEVICE;
assert.ok(['ios','android'].includes(platform)&&device,'Use ios|android and DEVICE');
const out=resolve(root,'artifacts/m24-g07/native-lifecycle',process.env.DEVICE_LABEL??platform);mkdirSync(out,{recursive:true});
const artifact=resolve(root,process.env.ARTIFACT??(platform==='ios'?'mobile/platforms/ios/build/Debug-iphoneos/ShaderLab.ipa':'mobile/platforms/android/app/build/outputs/apk/debug/app-debug.apk'));
const hash=()=>createHash('sha256').update(readFileSync(artifact)).digest('hex'),artifactSha256=hash(),adb=process.env.ADB??'adb';
const invoke=(command,args)=>run(command,args,{cwd:root,timeout:25000,maxBuffer:8*1024*1024}),start=Date.now(),file=resolve(out,'device.json');
if(platform==='ios')await invoke('xcrun',['devicectl','device','process','launch','--timeout','15','--device',device,'--terminate-existing','studio.haiyue.shaderlab','--shaderlab-ui-lifecycle',...(process.env.WEAK_PROBES==='0'?['--shaderlab-no-weak-probes']:[])]);
else {await invoke(adb,['-s',device,'shell','am','force-stop','studio.haiyue.shaderlab']);await invoke(adb,['-s',device,'shell','am','start','-n','studio.haiyue.shaderlab/com.tns.NativeScriptActivity','--ez','shaderlab-ui-lifecycle','true']);}
let report,last=-1,latest;
while(Date.now()-start<600000){
 await new Promise(r=>setTimeout(r,5000));
 if(platform==='android'){
  try{await invoke(adb,['-s',device,'shell','pidof','studio.haiyue.shaderlab']);}
  catch(error){
   if(error.code===1&&!String(error.stderr??'').trim()){
    report={...(latest??{startedAt:new Date(start).toISOString(),cycles:[]}),status:'failed',error:'Application process exited during lifecycle acceptance; inspect logcat for the termination reason.'};break;
   }
  }
 }
 try{
  if(platform==='ios')await invoke('xcrun',['devicectl','device','copy','from','--timeout','15','--device',device,'--domain-type','appDataContainer','--domain-identifier','studio.haiyue.shaderlab','--source','Documents/shaderlab-g07-lifecycle.json','--destination',file]);
  else {const {stdout}=await invoke(adb,['-s',device,'shell','run-as','studio.haiyue.shaderlab','cat','files/shaderlab-g07-lifecycle.json']);writeFileSync(file,stdout);}
  const value=JSON.parse(readFileSync(file));if(Date.parse(value.startedAt)<start-2000)continue;latest=value;
  if(value.cycles.length!==last){last=value.cycles.length;console.log('completed host cycles',last);}
  if(value.status==='running')continue;report=value;break;
 }catch(error){console.log('collection retry',error.code??error.message);}
}
assert.ok(report,'Timed out collecting fresh lifecycle result');assert.equal(hash(),artifactSha256,'Artifact changed during test');
writeFileSync(resolve(out,'report.json'),JSON.stringify({...report,artifactSha256},null,2)+'\n');
assert.equal(report.status,'passed',report.error);assert.equal(report.cycles.length,50);
if(platform==='ios'&&report.weakReferenceProbes){
 assert.equal(report.settled?.retained.length,50,'Missing post-autorelease liveness observation');
 const retained=report.settled.retained.flatMap((group,index)=>Object.entries(group).filter(([,live])=>live).map(([name])=>`${index+1}:${name}`));
 assert.deepEqual(retained,[],'Retired Apple page/GPU wrappers remain live');
}
console.log(report.status);
