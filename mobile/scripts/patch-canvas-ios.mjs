import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,existsSync,mkdtempSync,cpSync,rmSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {execFileSync} from 'node:child_process';
import {sha,fingerprint} from './canvas-ios-files.mjs';
const originalSha='0d72b8720c338cdde1f93abf15252603621585f05711a377b7664357ce0920ef';
export function patchCanvasIOS(){
 if(process.platform!=='darwin')throw Error('iOS framework substitution requires macOS.');
 const root=resolve(import.meta.dirname,'../..'),require=createRequire(import.meta.url);
 const vendor=resolve(root,'mobile/vendor/canvas-2.1.18-ios-arm64');
 const identity=JSON.parse(readFileSync(resolve(vendor,'identity.json'),'utf8'));
 if(identity.upstream!=='1fd6ef470dfdfd43b3385fa7ef43feddd1debd06'||identity.abi!=='ios-arm64'||identity.patchSha256!==sha(readFileSync(resolve(root,'mobile/patches/canvas-2.1.18-resource-lifetime.patch'))))throw Error('Canvas iOS patch identity differs from audited source.');
 if(identity.applePatchSha256!==sha(readFileSync(resolve(root,'mobile/patches/canvas-2.1.18-apple-lifetime.patch'))))throw Error('Canvas Apple lifetime patch checksum mismatch.');
 const archive=resolve(vendor,'CanvasNative.framework.zip');
 if(sha(readFileSync(archive))!==identity.archiveSha256)throw Error('Canvas iOS archive checksum mismatch.');
 const packageRoot=dirname(require.resolve('@nativescript/canvas/package.json'));
 if(JSON.parse(readFileSync(resolve(packageRoot,'package.json'),'utf8')).version!=='2.1.18')throw Error('Re-audit Canvas iOS for this package version.');
 const parent=resolve(packageRoot,'platforms/ios'),framework=resolve(parent,'CanvasNative.xcframework/ios-arm64/CanvasNative.framework');
 const backup=resolve(parent,'CanvasNative.ios-arm64.haiyue-original'),record=resolve(parent,'CanvasNative.ios-arm64.haiyue-patch.json');
 const before=fingerprint(framework).sha256;
 if(!existsSync(backup)){if(before!==originalSha)throw Error('Canvas iOS framework differs from audited 2.1.18.');cpSync(framework,backup,{recursive:true});}
 if(fingerprint(backup).sha256!==originalSha)throw Error('Original Canvas iOS framework checksum mismatch.');
 const previous=existsSync(record)?JSON.parse(readFileSync(record,'utf8')):null;
 if(![originalSha,identity.framework.sha256,previous?.frameworkSha256].includes(before))throw Error('Canvas iOS framework contains unknown modifications.');
 const stage=mkdtempSync(resolve(tmpdir(),'shaderlab-canvas-ios-'));
 try{
  execFileSync('ditto',['-x','-k',archive,stage]);
  const candidate=resolve(stage,'CanvasNative.framework');
  if(fingerprint(candidate).sha256!==identity.framework.sha256)throw Error('Extracted Canvas framework checksum mismatch.');
  if(before!==identity.framework.sha256){rmSync(framework,{recursive:true});cpSync(candidate,framework,{recursive:true});}
 }finally{rmSync(stage,{recursive:true,force:true});}
 const manifest={originalSha256:originalSha,frameworkSha256:identity.framework.sha256,librarySha256:identity.librarySha256,abi:'ios-arm64',upstream:identity.upstream};
 writeFileSync(record,JSON.stringify(manifest,null,2)+'\n');return manifest;
}
