import assert from 'node:assert/strict';
import {cpSync,existsSync,mkdirSync,mkdtempSync,readFileSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve,dirname} from 'node:path';
import {execFileSync,spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {build} from 'esbuild';
const root=resolve(import.meta.dirname,'../..'),temp=mkdtempSync(resolve(tmpdir(),'shaderlab-g07-clean-')),out=resolve(root,'artifacts/m24-g07/fresh');mkdirSync(out,{recursive:true});
const steps=[];
try{
 const files=execFileSync('git',['ls-files','-co','--exclude-standard','-z'],{cwd:root,encoding:'utf8'}).split('\0').filter(Boolean);
 for(const file of new Set(files)){
  if(file.startsWith('review/')&&file!=='review/m24-ui/g01/project.hyshader')continue;
  if(!existsSync(resolve(root,file)))continue;
  mkdirSync(dirname(resolve(temp,file)),{recursive:true});cpSync(resolve(root,file),resolve(temp,file));
 }
 assert.equal(existsSync(resolve(temp,'node_modules')),false);assert.equal(existsSync(resolve(temp,'shared/dist')),false);
 const run=(label,args)=>{const r=spawnSync('npm',args,{cwd:temp,encoding:'utf8',env:{...process.env,npm_config_audit:'false',npm_config_fund:'false'}});writeFileSync(resolve(out,label+'.log'),(r.stdout??'')+(r.stderr??''));steps.push({label,status:r.status});assert.equal(r.status,0,label+' failed: '+(r.stderr??'').slice(-1200));};
 run('install',['ci','--ignore-scripts','--legacy-peer-deps']);
 run('typecheck',['run','typecheck']);run('boundaries',['run','check:boundaries']);run('web',['run','build']);run('ios-bundle',['run','bundle:ios']);run('android-bundle',['run','bundle:android']);
 // Preserve the exact isolated Web build for UI/performance validation even
 // when another task rebuilds the working directory's app-dist concurrently.
 rmSync(resolve(out,'web-candidate'),{recursive:true,force:true});
 cpSync(resolve(temp,'web/app-dist'),resolve(out,'web-candidate'),{recursive:true});
 const graph={};for(const [platform,entry] of [['web','web/src/platform/shared-editor.ts'],['native','mobile/src/platform/shared-editor.ts']]){
  const result=await build({absWorkingDir:temp,entryPoints:[entry],bundle:true,platform:'neutral',packages:'external',write:false,metafile:true});
  graph[platform]=Object.keys(result.metafile.inputs);for(const module of ['shared/dist/views/editor-page.js','shared/dist/views/editor-controller.js','shared/dist/application/application.js'])assert.ok(graph[platform].includes(module),platform+' must consume '+module);
 }
 const hash=p=>createHash('sha256').update(readFileSync(resolve(root,p))).digest('hex');
 const sources=files.filter(p=>/^(shared\/(domain|application|ports|views)|web\/src|mobile\/src)\//.test(p)&&p.endsWith('.ts'));
 writeFileSync(resolve(out,'report.json'),JSON.stringify({status:'passed',scope:'new source-only directory; npm ci from lock and packed dependencies; Web assembly and both NativeScript JS bundles, not fresh SDK archives',sourceHashes:Object.fromEntries(sources.map(p=>[p,createHash('sha256').update(readFileSync(resolve(temp,p))).digest('hex')])),lockSha256:hash('package-lock.json'),packages:Object.fromEntries(['vendor/haiyue-native-0.1.4-m24.3.tgz','vendor/haiyue-ui-0.2.0-m24.3.tgz'].map(p=>[p,hash(p)])),steps,graph},null,2)+'\n');console.log(JSON.stringify({status:'passed',steps}));
}finally{rmSync(temp,{recursive:true,force:true});}
