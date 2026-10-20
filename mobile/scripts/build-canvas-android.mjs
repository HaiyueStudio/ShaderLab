import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import {mkdirSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gzipSync} from 'node:zlib';
const root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
const source=process.env.CANVAS_SOURCE;
if(!source)throw Error('Set CANVAS_SOURCE to a checkout of NativeScript/canvas tag 2.1.18.');
const upstream='1fd6ef470dfdfd43b3385fa7ef43feddd1debd06';
function run(command,args,options={}){const result=spawnSync(command,args,{cwd:source,encoding:'utf8',stdio:'inherit',...options});if(result.error)throw result.error;if(result.status!==0)throw Error(command+' failed');return result.stdout?.trim();}
if(run('git',['rev-parse','HEAD'],{stdio:'pipe'})!==upstream)throw Error('Canvas source revision differs from audited 2.1.18.');
const patch=resolve(root,'mobile/patches/canvas-2.1.18-resource-lifetime.patch');
const reversed=spawnSync('git',['apply','--reverse','--check',patch],{cwd:source,stdio:'pipe'});
if(reversed.status!==0)run('git',['apply',patch]);
if(run('git',['diff','--','crates/canvas-c/src/webgpu/gpu_canvas_context.rs','crates/canvas-c/src/webgpu/gpu_command_encoder.rs','crates/canvas-c/src/webgpu/gpu_shader_module.rs'],{stdio:'pipe'})!==readFileSync(patch,'utf8').trim())throw Error('Canvas source includes unaudited lifetime edits.');
writeFileSync(resolve(source,'Cargo.lock'),readFileSync(resolve(root,'mobile/patches/canvas-2.1.18-Cargo.lock')));
const ndk=process.env.ANDROID_NDK_HOME;
if(!ndk)throw Error('Set ANDROID_NDK_HOME (validated with NDK 27.2.12479018).');
const host=process.platform==='darwin'?'darwin-x86_64':process.platform==='win32'?'windows-x86_64':'linux-x86_64';
const bin=resolve(ndk,'toolchains/llvm/prebuilt',host,'bin'),suffix=process.platform==='win32'?'.cmd':'';
const env={...process.env,ANDROID_NDK:ndk,ANDROID_NDK_ROOT:ndk,CARGO_TARGET_AARCH64_LINUX_ANDROID_LINKER:resolve(bin,'aarch64-linux-android21-clang'+suffix),
 CC_aarch64_linux_android:resolve(bin,'aarch64-linux-android21-clang'+suffix),CXX_aarch64_linux_android:resolve(bin,'aarch64-linux-android21-clang++'+suffix),AR_aarch64_linux_android:resolve(bin,'llvm-ar'+(process.platform==='win32'?'.exe':'')),
 RUSTFLAGS:'-C link-arg=-Wl,-z,max-page-size=16384 -C target-feature=-outline-atomics'};
run(process.env.CARGO??'cargo',['build','--locked','--release','--target','aarch64-linux-android','-p','canvas-android'],{env});
const file=resolve(source,'target/aarch64-linux-android/release/libcanvasnative.so'),bytes=readFileSync(file);
const out=resolve(root,'artifacts/canvas-2.1.18-android-arm64');mkdirSync(out,{recursive:true});
writeFileSync(resolve(out,'libcanvasnative.so.gz'),gzipSync(bytes,{level:9}));
const sha=data=>createHash('sha256').update(data).digest('hex');
writeFileSync(resolve(out,'identity.json'),JSON.stringify({upstream,abi:'arm64-v8a',librarySha256:sha(bytes),patchSha256:sha(readFileSync(patch)),cargoLockSha256:sha(readFileSync(resolve(source,'Cargo.lock'))),rustc:run(process.env.RUSTC??'rustc',['--version'],{env,stdio:'pipe'}),ndk:readFileSync(resolve(ndk,'source.properties'),'utf8'),status:'built; requires device acceptance'},null,2)+'\n');
writeFileSync(resolve(out,'Cargo.lock'),readFileSync(resolve(source,'Cargo.lock')));
console.log(out);
