import {GridLayout} from '@nativescript/core';
import {Canvas} from '@nativescript/canvas';
import {NativeRenderHost,NativeTouchInput,NativeCanvasTextures} from '@haiyue/native/engine';
import {MobileCompiler} from '../compiler';
import {NativeShaderRuntime} from '../gpu-runtime';
import type {ShaderProject} from '../project';
import type {MobileProjects} from '../storage';

/** Small previews use real Image-pass pixels and never start a gallery camera. */
export async function projectThumbnail(runtime:NativeShaderRuntime):Promise<string>{
  const image=await runtime.readImage(),scale=Math.min(1,320/Math.max(image.width,image.height));
  const width=Math.max(1,Math.round(image.width*scale)),height=Math.max(1,Math.round(image.height*scale));
  const raster=new NativeCanvasTextures(runtime.engine.device);
  try{const canvas=raster.createCanvas2D(width,height),ctx=canvas.getContext('2d');if(!ctx)throw Error('Preview encoding unavailable');const data=ctx.createImageData(width,height);
    for(let y=0;y<height;y++)for(let x=0;x<width;x++){const src=(Math.min(image.height-1,Math.floor((y+.5)/scale))*image.width+Math.min(image.width-1,Math.floor((x+.5)/scale)))*4;data.data.set(image.pixels.subarray(src,src+4),(y*width+x)*4);}
    ctx.putImageData(data,0,0);return canvas.toDataURL('image/png');
  }finally{raster.dispose();}
}

/** One short-lived GPU host serializes missing previews; leaving the page cancels it. */
export class NativeGalleryPreviews {
  private compiler=new MobileCompiler();private canvas=new Canvas();private host?:NativeRenderHost;private touch?:NativeTouchInput;private runtime?:NativeShaderRuntime;
  private pending=new Map<string,{project:ShaderProject;done:(url:string)=>void;failed:()=>void}>();private running=false;closed=false;
  private ready:Promise<NativeShaderRuntime>;private rejectReady:(error:Error)=>void=()=>{};private cancel:Promise<never>;private rejectCancel:(error:Error)=>void=()=>{};
  private timeout:ReturnType<typeof setTimeout>;
  constructor(private root:GridLayout,private store:MobileProjects){
    this.cancel=new Promise((_,reject)=>{this.rejectCancel=reject;});void this.cancel.catch(()=>{});
    this.ready=new Promise((resolve,reject)=>{this.rejectReady=reject;this.canvas.once('loaded',()=>{
      if(this.closed)return;
      try{this.touch=new NativeTouchInput(this.canvas,()=>{});this.host=new NativeRenderHost(this.canvas,()=>{}, {diagnosticName:'shaderlab-gallery-previews',canvasInput:this.touch.target as unknown as HTMLCanvasElement,needsAnimationFrame:()=>!!this.runtime?.hasPendingGpuWork,
        prepareScene:async engine=>{const runtime=this.runtime=new NativeShaderRuntime(engine,()=>this.host?.requestFrame(),this.touch!.target as unknown as HTMLCanvasElement,(code,options)=>this.compiler.hlsl(code,options),{size:()=>({width:256,height:160}),output:()=>{}},(code,options)=>this.compiler.translate(code,options));await runtime.initialize();runtime.setPlaying(false);runtime.setCaptureVisible(false);clearTimeout(this.timeout);resolve(runtime);return {product:'ShaderLab gallery previews'};},disposeScene:()=>this.runtime?.dispose()});
      }catch(error){reject(error);}
    });});void this.ready.catch(()=>{});
    this.timeout=setTimeout(()=>this.rejectReady(Error('Preview initialization timed out')),25000);
    this.canvas.height=1;this.canvas.opacity=.01;this.canvas.isUserInteractionEnabled=false;this.canvas.ignoreTouchEvents=true;
    GridLayout.setRow(this.canvas,1);GridLayout.setRow(this.compiler.view,2);this.root.addChild(this.compiler.view);this.root.addChild(this.canvas);
  }
  enqueue(project:ShaderProject,done:(url:string)=>void,failed:()=>void){if(this.closed)return;this.pending.set(project.id,{project:JSON.parse(JSON.stringify(project)),done,failed});void this.pump();}
  private async pump(){
    if(this.running||this.closed)return;this.running=true;
    try{const runtime=await Promise.race([this.ready,this.cancel]);runtime.setExportSize({width:256,height:160});
      while(this.pending.size&&!this.closed){const [id,job]=this.pending.entries().next().value!;this.pending.delete(id);
        try{const url=await Promise.race([(async()=>{await runtime.compile(job.project);if(this.closed)throw Error('Preview closed');for(let i=0;i<12;i++){runtime.renderExportFrame(i,60);if(i%3===2)await new Promise(r=>setTimeout(r,0));if(this.closed)throw Error('Preview closed');}return projectThumbnail(runtime);})(),this.cancel]);
          if(!this.closed){const accepted=await this.store.updateThumbnail(job.project,url);if(!this.closed){if(accepted)job.done(url);else job.failed();}}
        }catch{if(!this.closed)job.failed();}
      }
    }catch{for(const job of this.pending.values())job.failed();}
    finally{this.running=false;this.dispose();}
  }
  dispose(){if(this.closed)return;this.closed=true;clearTimeout(this.timeout);this.pending.clear();this.rejectCancel(Error('Preview closed'));this.rejectReady(Error('Preview closed'));this.host?.dispose();this.touch?.dispose();this.compiler.dispose();for(const view of [this.canvas,this.compiler.view])if(view.parent===this.root)this.root.removeChild(view);}
}
