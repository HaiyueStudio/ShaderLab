import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from 'node:fs';
import {join,dirname} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
import {patchImageDataSources} from '../scripts/patch-canvas-image-data.mjs';

const require=createRequire(import.meta.url),folder=join(dirname(require.resolve('@nativescript/canvas/package.json')),'platforms/ios/src/cpp/canvas2d');
const header=readFileSync(join(folder,'ImageDataImpl.h'),'utf8'),source=readFileSync(join(folder,'ImageDataImpl.cpp'),'utf8');
test('ImageData ownership patch is audited and repeatable',()=>{
 const patched=patchImageDataSources(header,source);
 assert.deepEqual(patchImageDataSources(patched.header,patched.source),patched);
 assert.throws(()=>patchImageDataSources(header+'\n// unknown edit',source),/differs/);
});
test('exported pixel buffers retain their image and release it exactly once in either GC order',{skip:process.platform!=='darwin'},()=>{
 const patched=patchImageDataSources(header,source),buffer=patched.source.match(/struct ImageDataBuffer \{[\s\S]*?\n\};/)[0];
 const folder=mkdtempSync(join(tmpdir(),'shaderlab-image-data-'));
 try{
  writeFileSync(join(folder,'test.cpp'),`#include <memory>
#include <utility>
#include <cassert>
#include <cstdint>
int images=0,slices=0;
struct ImageData { uint8_t pixels[4]={11,22,33,255}; };
struct U8Buffer { ImageData* image; };
U8Buffer* canvas_native_image_data_get_data(ImageData* image){++slices;return new U8Buffer{image};}
uint8_t* canvas_native_u8_buffer_get_bytes_mut(U8Buffer* slice){return slice->image->pixels;}
size_t canvas_native_u8_buffer_get_length(U8Buffer*){return 4;}
void canvas_native_u8_buffer_release(U8Buffer* slice){--slices;delete slice;}
void canvas_native_image_data_release(ImageData* image){assert(slices==0);--images;delete image;}
${buffer}
int main(){
 for(bool wrapperFirst:{false,true}){
  ++images;auto owner=std::shared_ptr<ImageData>(new ImageData,canvas_native_image_data_release);
  auto a=std::make_unique<ImageDataBuffer>(owner),b=std::make_unique<ImageDataBuffer>(owner);
  assert(a->size()==4 && a->data()[0]==11 && b->data()[3]==255);
  if(wrapperFirst){owner.reset();assert(images==1);a.reset();assert(images==1);assert(b->data()[1]==22);b.reset();}
  else {a.reset();b.reset();assert(images==1);assert(owner->pixels[2]==33);owner.reset();}
  assert(images==0 && slices==0);
 }
}`);
  const compile=spawnSync('clang++',['-std=c++17',join(folder,'test.cpp'),'-o',join(folder,'test')],{encoding:'utf8'});
  assert.equal(compile.status,0,compile.stderr);
  const result=spawnSync(join(folder,'test'),[],{encoding:'utf8'});assert.equal(result.status,0,JSON.stringify({error:result.error?.message,signal:result.signal,stderr:result.stderr}));
 }finally{rmSync(folder,{recursive:true,force:true});}
});
