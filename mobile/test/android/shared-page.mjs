import assert from 'node:assert/strict';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {mkdirSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';
const run=promisify(execFile),adb=process.env.ADB??'adb',serial=process.env.ANDROID_SERIAL;
assert.ok(serial,'Set ANDROID_SERIAL');const out=resolve(process.env.SHADERLAB_ANDROID_EVIDENCE??'artifacts/m24-g07/android-ui');mkdirSync(out,{recursive:true});
const app='studio.haiyue.shaderlab',activity=app+'/com.tns.NativeScriptActivity',checks=[],report={status:'running',startedAt:new Date().toISOString(),checks};
const cmd=async(...args)=>(await run(adb,['-s',serial,...args],{encoding:'buffer',timeout:30000,maxBuffer:32*1024*1024})).stdout;
const shell=async(...args)=>(await cmd('shell',...args)).toString().trim();let count=0;
const decode=s=>s.replaceAll('&quot;','"').replaceAll('&amp;','&').replaceAll('&lt;','<').replaceAll('&gt;','>');
async function tree(){await shell('uiautomator','dump','/sdcard/shaderlab-g07-ui.xml');const xml=(await cmd('exec-out','cat','/sdcard/shaderlab-g07-ui.xml')).toString();writeFileSync(resolve(out,`${++count}.xml`),xml);return [...xml.matchAll(/<node\b([^>]*)>/g)].map(m=>Object.fromEntries([...m[1].matchAll(/([\w-]+)="([^"]*)"/g)].map(a=>[a[1],decode(a[2])])));}
const visible=n=>n&&/\[\d+,\d+\]\[\d+,\d+\]/.test(n.bounds);
const find=(ns,text)=>ns.find(n=>n.text===text&&/Button$/.test(n.class)&&visible(n));
async function wait(predicate,label){const end=Date.now()+30000;while(Date.now()<end){const ns=await tree();if(predicate(ns))return ns;await delay(200);}throw Error('Timed out: '+label);}
async function tap(n){assert.ok(n,'missing tap target');const [l,t,r,b]=n.bounds.match(/\d+/g).map(Number);await shell('input','tap',String(Math.round((l+r)/2)),String(Math.round((t+b)/2)));}
async function button(text){const ns=await wait(ns=>find(ns,text),text);await tap(find(ns,text));}
async function savedWork(text){for(let i=0;i<20;i++){const ns=await tree(),target=find(ns,text);if(target){await tap(target);return;}await shell('input','swipe','540','2050','540','500','300');}throw Error('Saved work not found: '+text);}
async function shot(name){writeFileSync(resolve(out,name+'.png'),await cmd('exec-out','screencap','-p'));}
const rotation=await shell('settings','get','system','user_rotation'),automatic=await shell('settings','get','system','accelerometer_rotation');
try{
 await shell('am','force-stop',app);await shell('am','start','-W','-n',activity,'--ez','shaderlab-ui-check','false');await button('＋ 新建');
 await wait(ns=>find(ns,'运行'),'editor');
 for(const scale of ['75%','50%','25%','100%','75%']){
  let ns=await tree(),selector=ns.find(n=>n['content-desc']?.startsWith('渲染分辨率')&&/Button$/.test(n.class));
  if(!selector){const bar=find(ns,'运行');const y=bar.bounds.match(/\d+/g).map(Number);await shell('input','swipe','950',String((y[1]+y[3])/2),'100',String((y[1]+y[3])/2),'300');ns=await tree();selector=ns.find(n=>n['content-desc']?.startsWith('渲染分辨率')&&/Button$/.test(n.class));}
  await tap(selector);await button(scale);await wait(ns=>ns.some(n=>n.text.startsWith('编译成功 ·')),'compile');
 }checks.push('five resolution choices via native picker, preview retained');await shot('preview-75');
 await button('工程设置');await wait(ns=>find(ns,'完成'),'settings');
 await shell('settings','put','system','accelerometer_rotation','0');await shell('settings','put','system','user_rotation','1');await delay(800);await shot('settings-landscape');
 await shell('input','keyevent','3');await shell('am','start','-W','-n',activity);await button('完成');await button('工程设置');await button('完成');checks.push('settings rotation, background/resume, close and reopen');
 await shell('settings','put','system','user_rotation','0');await delay(500);
 let ns=await tree();const field=ns.find(n=>n.class==='android.widget.EditText'&&n['content-desc']?.startsWith('作品名称'));await tap(field);await shell('input','keyevent','123');await shell('input','text','%sG07-'+Date.now());await delay(600);
 await shell('input','keyevent','4');ns=await tree();const name=ns.find(n=>n.class==='android.widget.EditText'&&n['content-desc']?.startsWith('作品名称')).text;report.name=name;
 await button('代码');ns=await tree();const editor=ns.filter(n=>n.class==='android.widget.EditText').find(n=>n!==field&&!n['content-desc']?.startsWith('作品名称'));assert.ok(editor);const source=editor.text;await tap(editor);await button('收起键盘');
 ns=await tree();assert.ok(ns.some(n=>n.class==='android.widget.EditText'&&n.text===source));
 for(let i=0;i<2;i++){
  await button('生成代码');await wait(ns=>ns.some(n=>n.text.includes('void mainImage')),'lazy native compiler GLSL result');
  await button('关闭');
 }
 checks.push('on-demand native converter generates GLSL twice and modal closes without changing source');
 await button('保存作品');await wait(ns=>ns.some(n=>n.text==='作品已保存'),'saved');
 await shell('input','keyevent','4');await savedWork(name);await button('代码');ns=await tree();assert.ok(ns.some(n=>n.class==='android.widget.EditText'&&n.text===source));assert.ok(ns.some(n=>n.text===name));checks.push('name input, keyboard dismissal preserving source, save and reopen');await shot('reopened');await button('预览');report.status='passed';
}catch(error){report.status='failed';report.error=String(error.stack??error);await shot('failure').catch(()=>{});process.exitCode=1;}
finally{for(const [key,value] of [['user_rotation',rotation],['accelerometer_rotation',automatic]])await shell('settings',value==='null'?'delete':'put','system',key,...(value==='null'?[]:[value]));report.rotationRestored={rotation:await shell('settings','get','system','user_rotation'),automatic:await shell('settings','get','system','accelerometer_rotation')};report.completedAt=new Date().toISOString();writeFileSync(resolve(out,'report.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));}
