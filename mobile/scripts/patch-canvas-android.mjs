import {createRequire} from 'node:module';
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {gunzipSync} from 'node:zlib';
import yauzl from 'yauzl';
import yazl from 'yazl';
const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
const upstream='1fd6ef470dfdfd43b3385fa7ef43feddd1debd06';
const originalSha='63802c462467ea0560910eef9c6847c701fb5b6ab6b7dba54401ed5735a85141';
const entryName='jni/arm64-v8a/libcanvasnative.so';
export function replaceArm64Library(original,library){
 return new Promise((resolve,reject)=>yauzl.fromBuffer(original,{lazyEntries:true},(error,input)=>{
  if(error){reject(error);return;}
  const output=new yazl.ZipFile(),chunks=[];let count=0;
  output.outputStream.on('data',chunk=>chunks.push(chunk));output.outputStream.on('error',reject);
  output.outputStream.on('end',()=>{if(count!==1)reject(Error('Expected exactly one arm64 Canvas library'));else resolve(Buffer.concat(chunks));});
  input.on('error',reject);
  input.on('entry',entry=>{
   const options={mtime:entry.getLastModDate(),mode:entry.externalFileAttributes>>>16||undefined};
   if(entry.fileName.endsWith('/')){output.addEmptyDirectory(entry.fileName,options);input.readEntry();return;}
   input.openReadStream(entry,(error,stream)=>{
    if(error){reject(error);return;}const bytes=[];stream.on('data',chunk=>bytes.push(chunk));stream.on('error',reject);
    stream.on('end',()=>{const replace=entry.fileName===entryName;if(replace)count++;output.addBuffer(replace?library:Buffer.concat(bytes),entry.fileName,options);input.readEntry();});
   });
  });
  input.on('end',()=>output.end());input.readEntry();
 }));
}
export async function patchCanvasAndroid(){
 const require=createRequire(import.meta.url),root=resolve(dirname(fileURLToPath(import.meta.url)),'../..');
 const vendor=resolve(root,'mobile/vendor/canvas-2.1.18-android-arm64');
 const identity=JSON.parse(readFileSync(resolve(vendor,'identity.json'),'utf8'));
 if(identity.upstream!==upstream||identity.abi!=='arm64-v8a'||identity.patchSha256!==sha(readFileSync(resolve(root,'mobile/patches/canvas-2.1.18-resource-lifetime.patch'))))throw Error('Canvas native patch identity differs from audited source.');
 const library=gunzipSync(readFileSync(resolve(vendor,'libcanvasnative.so.gz')));
 if(sha(library)!==identity.librarySha256)throw Error('Canvas native library checksum mismatch.');
 const packageRoot=dirname(require.resolve('@nativescript/canvas/package.json'));
 if(JSON.parse(readFileSync(resolve(packageRoot,'package.json'),'utf8')).version!=='2.1.18')throw Error('Re-audit Canvas native library for this package version.');
 const file=resolve(packageRoot,'platforms/android/canvas-release.aar'),backup=file+'.haiyue-original',record=file+'.haiyue-patch.json';
 const before=readFileSync(file),beforeSha=sha(before);
 if(!existsSync(backup)){if(beforeSha!==originalSha)throw Error('Canvas AAR differs from audited 2.1.18.');writeFileSync(backup,before);}
 const original=readFileSync(backup);if(sha(original)!==originalSha)throw Error('Canvas original AAR checksum mismatch.');
 const result=await replaceArm64Library(original,library),afterSha=sha(result);
 const previous=existsSync(record)?JSON.parse(readFileSync(record,'utf8')):null;
 if(![originalSha,afterSha,previous?.aarSha256].includes(beforeSha))throw Error('Canvas AAR contains unknown modifications.');
 if(beforeSha!==afterSha)writeFileSync(file,result);
 const manifest={originalSha256:originalSha,aarSha256:afterSha,librarySha256:identity.librarySha256,abi:'arm64-v8a',upstream};
 writeFileSync(record,JSON.stringify(manifest,null,2)+'\n');return manifest;
}
