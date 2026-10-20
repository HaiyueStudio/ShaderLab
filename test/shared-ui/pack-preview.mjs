// Local preview packaging only; never publishes or mutates repository versions.
import {cpSync,mkdirSync,mkdtempSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {resolve} from 'node:path';
import {execFileSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=resolve(import.meta.dirname,'../..'),ui=resolve(root,'../UI');
const stage=mkdtempSync(resolve(tmpdir(),'shaderlab-g07-pack-'));
const hash=path=>createHash('sha256').update(readFileSync(path)).digest('hex');
try {
 const target=resolve(stage,'ui');mkdirSync(target);
 const manifest=JSON.parse(readFileSync(resolve(ui,'package.json')));manifest.version='0.2.0-m24.3';delete manifest.scripts;
 writeFileSync(resolve(target,'package.json'),JSON.stringify(manifest,null,2)+'\n');
 for(const path of ['dist','themes','README.md','CHANGELOG.md','LICENSE'])cpSync(resolve(ui,path),resolve(target,path),{recursive:true});
 execFileSync('npm',['pack','--ignore-scripts','--pack-destination',resolve(root,'vendor')],{cwd:target,stdio:'pipe'});
 const native=resolve(stage,'native');mkdirSync(native);
 execFileSync('tar',['-xzf',resolve(root,'vendor/haiyue-native-0.1.4-m24.0.tgz'),'-C',native]);
 const nativeRoot=resolve(native,'package'),nativePackage=resolve(nativeRoot,'package.json');
 const nativeManifest=JSON.parse(readFileSync(nativePackage));nativeManifest.version='0.1.4-m24.3';nativeManifest.peerDependencies['@haiyue/ui']='0.2.0-m24.3';
 writeFileSync(nativePackage,JSON.stringify(nativeManifest,null,2)+'\n');
 execFileSync('npm',['pack','--ignore-scripts','--pack-destination',resolve(root,'vendor')],{cwd:nativeRoot,stdio:'pipe'});
 const output=resolve(root,'artifacts/m24-g07/optimization');mkdirSync(output,{recursive:true});
 writeFileSync(resolve(output,'packages.json'),JSON.stringify({capturedAt:new Date().toISOString(),scope:'local previews; Native bridge unchanged from m24.0, only package version and UI peer updated',packages:Object.fromEntries(['vendor/haiyue-ui-0.2.0-m24.3.tgz','vendor/haiyue-native-0.1.4-m24.3.tgz'].map(path=>[path,hash(resolve(root,path))])),uiSources:Object.fromEntries(['src/portable/page.ts','src/portable/tree.ts','src/core/data.ts','src/core/validation.ts','src/adapters/web/dom.ts','src/adapters/web/controls.ts','src/adapters/web/renderer.ts'].map(path=>[path,hash(resolve(ui,path))]))},null,2)+'\n');
}finally{rmSync(stage,{recursive:true,force:true});}
