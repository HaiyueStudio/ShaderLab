import {File} from '@nativescript/core';
function dict(value:Record<string,unknown>):NSDictionary<string,any>{return NSDictionary.dictionaryWithObjectsForKeys(Object.values(value),Object.keys(value));}
export interface VideoExportSpec{width:number;height:number;frames:number;fps:number}
export async function encodeVideo(file:string,spec:VideoExportSpec,frame:(index:number)=>Promise<Uint8Array>,cancelled:()=>boolean){
 if(File.exists(file))await File.fromPath(file).remove();
 const writer=AVAssetWriter.alloc().initWithURLFileTypeError(NSURL.fileURLWithPath(file),AVFileTypeMPEG4),settings=dict({[AVVideoCodecKey]:AVVideoCodecTypeH264,[AVVideoWidthKey]:spec.width,[AVVideoHeightKey]:spec.height}),input=AVAssetWriterInput.assetWriterInputWithMediaTypeOutputSettings(AVMediaTypeVideo,settings);
 input.expectsMediaDataInRealTime=false;
 const attributes=dict({[kCVPixelBufferPixelFormatTypeKey]:kCVPixelFormatType_32BGRA,[kCVPixelBufferWidthKey]:spec.width,[kCVPixelBufferHeightKey]:spec.height,[kCVPixelBufferIOSurfacePropertiesKey]:NSDictionary.new()}),adaptor=AVAssetWriterInputPixelBufferAdaptor.assetWriterInputPixelBufferAdaptorWithAssetWriterInputSourcePixelBufferAttributes(input,attributes);
 if(!writer.canAddInput(input))throw Error('H.264 encoder unavailable');writer.addInput(input);if(!writer.startWriting())throw Error(writer.error?.localizedDescription??'Video writer failed');writer.startSessionAtSourceTime(CMTimeMake(0,spec.fps));
 try{
  for(let i=0;i<spec.frames;i++){
   if(cancelled())throw Error('Export cancelled');const rgba=await frame(i);if(rgba.length!==spec.width*spec.height*4)throw Error('Unexpected video frame size');const deadline=Date.now()+15000;
   while(!input.readyForMoreMediaData){if(cancelled()||writer.status!==AVAssetWriterStatus.Writing||Date.now()>deadline)throw Error(writer.error?.localizedDescription??'Video encoder timeout');await new Promise(resolve=>setTimeout(resolve,10));}
   const ref=new interop.Reference<any>();if(CVPixelBufferPoolCreatePixelBuffer(null,adaptor.pixelBufferPool,ref)!==0)throw Error('Pixel buffer allocation failed');const pixel=ref.value;
   try{if(CVPixelBufferLockBaseAddress(pixel,0 as CVPixelBufferLockFlags)!==0)throw Error('Pixel buffer lock failed');try{const stride=CVPixelBufferGetBytesPerRow(pixel),memory=NSData.dataWithBytesNoCopyLengthFreeWhenDone(CVPixelBufferGetBaseAddress(pixel),stride*spec.height,false),target=new Uint8Array(interop.bufferFromData(memory));for(let y=0;y<spec.height;y++)for(let x=0;x<spec.width;x++){const a=(y*spec.width+x)*4,b=y*stride+x*4;target[b]=rgba[a+2];target[b+1]=rgba[a+1];target[b+2]=rgba[a];target[b+3]=255;}}finally{CVPixelBufferUnlockBaseAddress(pixel,0 as CVPixelBufferLockFlags);}if(!adaptor.appendPixelBufferWithPresentationTime(pixel,CMTimeMake(i,spec.fps)))throw Error(writer.error?.localizedDescription??'Video frame append failed');}finally{CVPixelBufferRelease(pixel);}
  }
  input.markAsFinished();await new Promise<void>((resolve,reject)=>writer.finishWritingWithCompletionHandler(()=>writer.status===AVAssetWriterStatus.Completed?resolve():reject(Error(writer.error?.localizedDescription??'Video finalization failed'))));
 }catch(error){writer.cancelWriting();if(File.exists(file))await File.fromPath(file).remove();throw error;}
 return file;
}
