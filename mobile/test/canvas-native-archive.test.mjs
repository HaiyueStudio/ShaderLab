import {test} from 'node:test';
import assert from 'node:assert/strict';
import yazl from 'yazl';
import yauzl from 'yauzl';
import {replaceArm64Library} from '../scripts/patch-canvas-android.mjs';
function zip(entries){return new Promise(resolve=>{const file=new yazl.ZipFile(),chunks=[];file.outputStream.on('data',chunk=>chunks.push(chunk));file.outputStream.on('end',()=>resolve(Buffer.concat(chunks)));for(const [name,value]of Object.entries(entries))file.addBuffer(Buffer.from(value),name);file.end();});}
function unzip(bytes){return new Promise((resolve,reject)=>yauzl.fromBuffer(bytes,{lazyEntries:true},(error,file)=>{if(error)return reject(error);const values={};file.on('error',reject);file.on('entry',entry=>file.openReadStream(entry,(error,stream)=>{if(error)return reject(error);const chunks=[];stream.on('data',chunk=>chunks.push(chunk));stream.on('end',()=>{values[entry.fileName]=Buffer.concat(chunks).toString();file.readEntry();});}));file.on('end',()=>resolve(values));file.readEntry();}));}
test('AAR replacement changes only the requested arm64 Rust library',async()=>{
 const entries={'classes.jar':'java-bytecode','AndroidManifest.xml':'manifest','jni/arm64-v8a/libcanvasnative.so':'old-rust','jni/arm64-v8a/libcanvasnativev8.so':'v8-bindings','jni/x86_64/libcanvasnative.so':'other-abi'};
 const output=await replaceArm64Library(await zip(entries),Buffer.from('new-rust'));
 assert.deepEqual(await unzip(output),{...entries,'jni/arm64-v8a/libcanvasnative.so':'new-rust'});
});
test('AAR replacement refuses an archive without the expected native library',async()=>{
 await assert.rejects(replaceArm64Library(await zip({'classes.jar':'java-bytecode'}),Buffer.from('new-rust')),/exactly one/);
});
