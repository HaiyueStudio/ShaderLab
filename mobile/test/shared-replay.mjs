import assert from 'node:assert/strict';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {promisify} from 'node:util';
import {execFile} from 'node:child_process';
import {createHash} from 'node:crypto';

const run=promisify(execFile),root=resolve(import.meta.dirname,'../..');
const platform=process.argv[2],device=process.env.DEVICE,adb=process.env.ADB??'adb';
assert.ok(['ios','android'].includes(platform)&&device,'Use ios|android and DEVICE');
const out=resolve(root,'artifacts/m24-g07/native-replay',process.env.DEVICE_LABEL??platform);
mkdirSync(out,{recursive:true});
const artifact=resolve(root,process.env.ARTIFACT??(platform==='ios'?'mobile/platforms/ios/build/Debug-iphoneos/ShaderLab.ipa':'mobile/platforms/android/app/build/outputs/apk/debug/app-debug.apk'));
const hash=()=>createHash('sha256').update(readFileSync(artifact)).digest('hex');
const artifactSha256=hash(),start=Date.now(),file=resolve(out,'device.json');
const invoke=(command,args)=>run(command,args,{cwd:root,timeout:25000,maxBuffer:8*1024*1024});
if(platform==='ios')await invoke('xcrun',['devicectl','device','process','launch','--timeout','15','--device',device,'--terminate-existing','studio.haiyue.shaderlab','--shaderlab-ui-check']);
else {
  await invoke(adb,['-s',device,'shell','am','force-stop','studio.haiyue.shaderlab']);
  await invoke(adb,['-s',device,'shell','am','start','-n','studio.haiyue.shaderlab/com.tns.NativeScriptActivity','--ez','shaderlab-ui-check','true']);
}
let report;
while(Date.now()-start<180000){
  await new Promise(resolve=>setTimeout(resolve,3000));
  try {
    if(platform==='ios')await invoke('xcrun',['devicectl','device','copy','from','--timeout','15','--device',device,'--domain-type','appDataContainer','--domain-identifier','studio.haiyue.shaderlab','--source','Documents/shaderlab-g07.json','--destination',file]);
    else {
      const {stdout}=await invoke(adb,['-s',device,'shell','run-as','studio.haiyue.shaderlab','cat','files/shaderlab-g07.json']);
      writeFileSync(file,stdout);
    }
    const value=JSON.parse(readFileSync(file));
    if(Date.parse(value.startedAt)<start-2000||value.status==='running')continue;
    report=value;break;
  }catch(error){console.log('collection retry',error.code??error.message);}
}
assert.ok(report,'Timed out collecting fresh GPU/storage replay');
assert.equal(hash(),artifactSha256,'Artifact changed during replay');
writeFileSync(resolve(out,'report.json'),JSON.stringify({...report,artifactSha256},null,2)+'\n');
assert.equal(report.status,'passed',report.error);
assert.ok(report.runId);
assert.deepEqual(report.checks.map(check=>check.scale),[.75,.5,.25,1,.75]);
assert.equal(report.readback.nonzero,true);
assert.deepEqual(report.application,{pane:'preview',compile:'ready',save:'idle'});
const web=JSON.parse(readFileSync(resolve(root,process.env.WEB_REPORT??'review/m24-ui/g07/optimization/web-functional.json')));
const normalize=project=>({...project,updatedAt:'<runtime>'});
assert.deepEqual(normalize(report.persisted),normalize(web.persisted),'Web/native business data differ beyond updatedAt');
writeFileSync(resolve(out,'comparison.json'),JSON.stringify({status:'passed',artifactSha256,runId:report.runId,normalization:['updatedAt'],reference:process.env.WEB_REPORT??'review/m24-ui/g07/optimization/web-functional.json'},null,2)+'\n');
console.log('passed: GPU/storage replay and Web/native persisted project equality');
