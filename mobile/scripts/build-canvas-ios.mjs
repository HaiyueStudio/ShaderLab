import {spawnSync} from 'node:child_process';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {sha,fingerprint} from './canvas-ios-files.mjs';
const root=resolve(import.meta.dirname,'../..'),source=process.env.CANVAS_SOURCE;
if(process.platform!=='darwin'||!source)throw Error('Use macOS with CANVAS_SOURCE set to the audited Canvas checkout.');
const upstream='1fd6ef470dfdfd43b3385fa7ef43feddd1debd06';
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:source,encoding:'utf8',stdio:'inherit',...options});if(result.error)throw result.error;if(result.status!==0)throw Error(command+' failed');return result.stdout?.trim();}
if(run('git',['rev-parse','HEAD'],{stdio:'pipe'})!==upstream)throw Error('Canvas revision differs from audited 2.1.18.');
const patch=resolve(root,'mobile/patches/canvas-2.1.18-resource-lifetime.patch');
if(spawnSync('git',['apply','--reverse','--check',patch],{cwd:source,stdio:'pipe'}).status!==0)run('git',['apply',patch]);
if(run('git',['diff','--','crates'],{stdio:'pipe'})!==readFileSync(patch,'utf8').trim())throw Error('Canvas crates include unaudited edits.');
const applePatch=resolve(root,'mobile/patches/canvas-2.1.18-apple-lifetime.patch');
if(spawnSync('git',['apply','--reverse','--check',applePatch],{cwd:source,stdio:'pipe'}).status!==0)run('git',['apply',applePatch]);
if(run('git',['diff','--','packages/canvas/src-native/canvas-ios'],{stdio:'pipe'})!==readFileSync(applePatch,'utf8').trim())throw Error('Canvas Apple wrapper includes unaudited edits.');
writeFileSync(resolve(source,'Cargo.lock'),readFileSync(resolve(root,'mobile/patches/canvas-2.1.18-Cargo.lock')));
const env={...process.env,IPHONEOS_DEPLOYMENT_TARGET:'13.0'};
run(process.env.CARGO??'cargo',['build','--locked','--release','--target','aarch64-apple-ios','-p','canvas-ios'],{env});
const out=resolve(root,'artifacts/canvas-2.1.18-ios-arm64');mkdirSync(out,{recursive:true});
// Upstream's Xcode prebuild sources the author's shell profile and rebuilds
// with an unpinned nightly. We already built the locked library above. Keep
// audited headers and bypass only this build hook, restoring it even on error.
const apple=resolve(source,'packages/canvas/src-native/canvas-ios');
const prebuild=resolve(apple,'pre-build.sh'),originalPrebuild=readFileSync(prebuild);
try{
 writeFileSync(prebuild,'#!/bin/sh\nset -e\ntest -f "$SRCROOT/../../../../target/aarch64-apple-ios/release/libcanvasnative.a"\n');
 run('xcodebuild',['-project','CanvasNative.xcodeproj','-scheme','CanvasNative','-sdk','iphoneos','-destination','generic/platform=iOS','-configuration','Release','-quiet','build',
  'BUILD_DIR='+resolve(out,'build'),'CODE_SIGNING_ALLOWED=NO','SKIP_INSTALL=NO','BUILD_LIBRARY_FOR_DISTRIBUTION=YES','IPHONEOS_DEPLOYMENT_TARGET=13.0'],{cwd:apple,env});
}finally{writeFileSync(prebuild,originalPrebuild);}
const framework=resolve(out,'build/Release-iphoneos/CanvasNative.framework');
const archive=resolve(out,'CanvasNative.framework.zip');
run('ditto',['-c','-k','--keepParent',framework,archive]);
const identity={upstream,abi:'ios-arm64',minimumOS:'13.0',patchSha256:sha(readFileSync(patch)),applePatchSha256:sha(readFileSync(applePatch)),cargoLockSha256:sha(readFileSync(resolve(source,'Cargo.lock'))),
 archiveSha256:sha(readFileSync(archive)),framework:fingerprint(framework),librarySha256:sha(readFileSync(resolve(framework,'CanvasNative'))),
 rustc:run(process.env.RUSTC??'rustc',['--version'],{stdio:'pipe'}),xcode:run('xcodebuild',['-version'],{stdio:'pipe'}),status:'built; requires device acceptance'};
writeFileSync(resolve(out,'identity.json'),JSON.stringify(identity,null,2)+'\n');console.log(out);
