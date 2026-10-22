import {createRequire} from 'node:module';
import {readFileSync,writeFileSync} from 'node:fs';
import {dirname,join} from 'node:path';
import {sha} from './canvas-ios-files.mjs';

const identities={
 header:'7cf2afbca85660a567dd750082861c4aa1097475db1edde005420b6b7cb41d0f',
 source:'10c2e47de0dbdf0ea4857833b73dcbd4dce29425b7cb76b93599320ac977bf4b',
};
function transform(header,source){
 header=header.replace('#include <vector>','#include <vector>\n#include <memory>')
  .replace(/    ~ImageDataImpl\(\)\{[\s\S]*?\n    \}/,'    ~ImageDataImpl() = default;')
  .replace('return this->imageData_;','return this->imageData_.get();')
  .replace('private:\n    ImageData* imageData_;','    std::shared_ptr<ImageData> ShareImageData() { return imageData_; }\n\nprivate:\n    std::shared_ptr<ImageData> imageData_;');
 source=source.replace('explicit ImageDataBuffer(ImageData *imageData) : imageData_(imageData)', 'explicit ImageDataBuffer(std::shared_ptr<ImageData> imageData) : imageData_(std::move(imageData))')
  .replace('canvas_native_image_data_get_data(imageData_)','canvas_native_image_data_get_data(imageData_.get())')
  .replace('        canvas_native_image_data_release(imageData_);\n        imageData_ = nullptr;','        // The wrapper and every exported ArrayBuffer share one native owner.')
  .replace('    ImageData *imageData_;','    std::shared_ptr<ImageData> imageData_;')
  .replace('imageData_(imageData) {}','imageData_(imageData, canvas_native_image_data_release) {}')
  .replace('new ImageDataBuffer(ptr->GetImageData())','new ImageDataBuffer(ptr->ShareImageData())');
 return {header,source};
}
export function patchImageDataSources(header,source){
 // Reconstruct the audited upstream input to validate both fresh and already patched sources.
 const originalHeader=header.replace('#include <vector>\n#include <memory>','#include <vector>')
  .replace('    ~ImageDataImpl() = default;','    ~ImageDataImpl(){\n        canvas_native_image_data_release(this->GetImageData());\n        this->imageData_ = nullptr;\n    }')
  .replace('return this->imageData_.get();','return this->imageData_;')
  .replace('    std::shared_ptr<ImageData> ShareImageData() { return imageData_; }\n\nprivate:\n    std::shared_ptr<ImageData> imageData_;','private:\n    ImageData* imageData_;');
 const originalSource=source.replace('explicit ImageDataBuffer(std::shared_ptr<ImageData> imageData) : imageData_(std::move(imageData))','explicit ImageDataBuffer(ImageData *imageData) : imageData_(imageData)')
  .replace('canvas_native_image_data_get_data(imageData_.get())','canvas_native_image_data_get_data(imageData_)')
  .replace('        // The wrapper and every exported ArrayBuffer share one native owner.','        canvas_native_image_data_release(imageData_);\n        imageData_ = nullptr;')
  .replace('    std::shared_ptr<ImageData> imageData_;','    ImageData *imageData_;')
  .replace('imageData_(imageData, canvas_native_image_data_release) {}','imageData_(imageData) {}')
  .replace('new ImageDataBuffer(ptr->ShareImageData())','new ImageDataBuffer(ptr->GetImageData())');
 if(sha(originalHeader)!==identities.header||sha(originalSource)!==identities.source)throw Error('Canvas ImageData source differs from audited 2.1.18.');
 const patched=transform(originalHeader,originalSource);
 if(![originalHeader,patched.header].includes(header)||![originalSource,patched.source].includes(source))throw Error('Canvas ImageData source contains partial changes.');
 return patched;
}
export function patchCanvasImageData(){
 const require=createRequire(import.meta.url),root=dirname(require.resolve('@nativescript/canvas/package.json'));
 if(JSON.parse(readFileSync(join(root,'package.json'))).version!=='2.1.18')throw Error('Re-audit Canvas ImageData for this package version.');
 const folder=join(root,'platforms/ios/src/cpp/canvas2d'),headerPath=join(folder,'ImageDataImpl.h'),sourcePath=join(folder,'ImageDataImpl.cpp');
 const header=readFileSync(headerPath,'utf8'),source=readFileSync(sourcePath,'utf8'),patched=patchImageDataSources(header,source);
 if(header!==patched.header)writeFileSync(headerPath,patched.header);
 if(source!==patched.source)writeFileSync(sourcePath,patched.source);
 return {headerSha256:sha(patched.header),sourceSha256:sha(patched.source)};
}
