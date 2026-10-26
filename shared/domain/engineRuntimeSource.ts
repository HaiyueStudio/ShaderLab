/** Standalone ESM distributed in the export ZIP. No ShaderLab runtime dependency. */
export const ENGINE_RUNTIME_SOURCE=String.raw`
import {Component,ComponentLifecycleFlags} from '@haiyue/engine/ecs';

/** Offscreen effect component. onUpdate receives Haiyue milliseconds; render takes seconds. */
export class ShaderEffect extends Component {
 static Lifecycle=ComponentLifecycleFlags.Update;
 static async create(engine,options={}) {
  const effect=new ShaderEffect(engine,options);
  try {await effect.initialize();return effect;}catch(error){effect.destroy();throw error;}
 }
 constructor(engine,options={}) {
  super(effectManifest.name);this.engine=engine;this.device=engine.device;this.options=options;
  this.time=0;this.frame=0;this.current=0;this.playing=true;this.mouse=[0,0,0,0];this.resources=new Set();this.passes=[];this.images=new Map();
  this.parameters=JSON.parse(JSON.stringify(effectManifest.parameters));this.ready=false;
 }
 async initialize() {
  const d=this.device;this.sampler=d.createSampler({magFilter:'linear',minFilter:'linear',addressModeU:'repeat',addressModeV:'repeat'});
  this.frameLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,buffer:{type:'uniform',minBindingSize:272}}]});
  this.emptyLayout=d.createBindGroupLayout({entries:[]});this.emptyGroup=d.createBindGroup({layout:this.emptyLayout,entries:[]});
  this.fallback=this.makeTexture(1,1,'rgba8unorm');d.queue.writeTexture({texture:this.fallback.texture},new Uint8Array(4),{bytesPerRow:4},[1,1]);
  this.fallbackCube=this.makeTexture(1,1,'rgba8unorm',6);for(let face=0;face<6;face++)d.queue.writeTexture({texture:this.fallbackCube.texture,origin:[0,0,face]},new Uint8Array(4),{bytesPerRow:4},[1,1]);
  for(const asset of effectManifest.assets) {
   if(this.destroyed)throw Error('Effect destroyed');
   const image=await (this.options.loadTexture||loadBrowserTexture)(d,asset);
   if(!image||!image.texture||!(image.width>0&&image.height>0)||!!image.cube!==(asset.kind==='cubemap')){if(image?.owned!==false)image?.texture?.destroy();throw Error('Invalid texture: '+asset.id);}
   if(this.destroyed){if(image.owned!==false)image.texture.destroy();throw Error('Effect destroyed');}
   if(image.owned!==false)this.resources.add(image.texture);
   this.images.set(asset.id,{...image,view:image.texture.createView({dimension:image.cube?'cube':'2d'})});
  }
  for(const spec of effectManifest.passes) {
   const channelLayout=d.createBindGroupLayout({entries:[{binding:0,visibility:GPUShaderStage.FRAGMENT,sampler:{type:'filtering'}},...spec.dimensions.map((dimension,i)=>({binding:i+1,visibility:GPUShaderStage.FRAGMENT,texture:{sampleType:'float',viewDimension:dimension}}))]});
   const module=d.createShaderModule({label:effectManifest.name+'.'+spec.id,code:spec.wgsl});
   const info=await module.getCompilationInfo();const errors=info.messages.filter(v=>v.type==='error');if(errors.length)throw Error(spec.id+': '+errors.map(v=>v.message).join('\n'));
   const pipeline=await d.createRenderPipelineAsync({layout:d.createPipelineLayout({bindGroupLayouts:[this.frameLayout,this.emptyLayout,channelLayout]}),vertex:{module,entryPoint:'hy_vertex'},fragment:{module,entryPoint:'hy_fragment',targets:[{format:spec.id==='image'?'rgba8unorm':'rgba16float'}]},primitive:{topology:'triangle-list'}});
   if(this.destroyed)throw Error('Effect destroyed');
   const uniform=d.createBuffer({size:272,usage:GPUBufferUsage.UNIFORM|GPUBufferUsage.COPY_DST});this.resources.add(uniform);
   this.passes.push({...spec,pipeline,uniform,channelLayout,group:d.createBindGroup({layout:this.frameLayout,entries:[{binding:0,resource:{buffer:uniform}}]})});
  }
  this.resize(this.options.width??this.engine.width,this.options.height??this.engine.height);this.ready=true;this.render(0);
 }
 makeTexture(width,height,format,layers=1) {
  const texture=this.device.createTexture({size:[width,height,layers],format,usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.RENDER_ATTACHMENT|GPUTextureUsage.COPY_SRC|GPUTextureUsage.COPY_DST});this.resources.add(texture);
  return {texture,view:texture.createView({dimension:layers===6?'cube':'2d'}),width,height};
 }
 resize(width,height) {
  if(this.destroyed)throw Error('Effect destroyed');
  const limit=Math.min(4096,this.device.limits.maxTextureDimension2D);if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>limit||height>limit)throw Error('Invalid effect size (1-'+limit+')');
  if(this.width===width&&this.height===height)return;
  for(const pass of this.passes)for(const target of pass.targets||[]){target.texture.destroy();this.resources.delete(target.texture);}
  this.width=width;this.height=height;
  for(const pass of this.passes)pass.targets=[this.makeTexture(width,height,pass.id==='image'?'rgba8unorm':'rgba16float'),this.makeTexture(width,height,pass.id==='image'?'rgba8unorm':'rgba16float')];
  this.reset();
 }
 get texture(){return this.passes.find(v=>v.id==='image')?.targets[this.current].texture;}
 setParameter(slot,value) {
  const p=this.parameters.find(v=>v.slot===slot);if(!p)throw Error('Unknown parameter slot');
  if(p.kind==='float'?typeof value!=='number'||!Number.isFinite(value)||value<p.min||value>p.max:p.kind==='bool'?typeof value!=='boolean':typeof value!=='string'||!/^#[0-9a-f]{6}$/i.test(value))throw Error('Invalid parameter value');
  p.value=value;
 }
 applyPreset(name){const preset=effectManifest.presets.find(v=>v.name===name);if(!preset)throw Error('Unknown preset');for(const [slot,value]of Object.entries(preset.values))this.setParameter(Number(slot),value);}
 setMouse(x,y,clickX=0,clickY=0){if(![x,y,clickX,clickY].every(Number.isFinite))throw Error('Invalid mouse coordinates');this.mouse=[x,y,clickX,clickY];}
 reset() {
  this.time=0;this.frame=0;this.current=0;
  const encoder=this.device.createCommandEncoder();for(const p of this.passes)for(const target of p.targets||[]){const pass=encoder.beginRenderPass({colorAttachments:[{view:target.view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});pass.end();}this.device.queue.submit([encoder.finish()]);
 }
 onUpdate(_entity,_time,delta){if(!this.disabled&&this.playing&&!this.destroyed)this.render(Math.max(0,delta)/1000);}
 render(deltaSeconds=0) {
  if(this.destroyed)throw Error('Effect destroyed');if(!this.ready)return;
  if(this.engine.device!==this.device)throw Error('GPU device changed. Recreate ShaderEffect.');
  if(!Number.isFinite(deltaSeconds)||deltaSeconds<0)throw Error('Invalid deltaSeconds');
  const delta=Math.min(deltaSeconds,.1);if(this.frame>0)this.time+=delta;
  const next=1-this.current,d=this.device,encoder=d.createCommandEncoder(),params=new Float32Array(32),date=new Date();
  for(const p of this.parameters){const at=p.slot*4;if(p.kind==='color'){const color=parseInt(p.value.slice(1),16);params.set([(color>>16&255)/255,(color>>8&255)/255,(color&255)/255,1],at);}else params[at]=Number(p.value);}
  for(let index=0;index<this.passes.length;index++) {
   const p=this.passes[index],data=new Float32Array(68);data.set([this.width,this.height,1,this.time,delta,this.frame,delta>0?1/delta:0,44100]);data.set(this.mouse,8);data.set([date.getFullYear(),date.getMonth()+1,date.getDate(),date.getHours()*3600+date.getMinutes()*60+date.getSeconds()+date.getMilliseconds()/1000],12);data.set(params,36);
   const inputs=p.channels.map((c,i)=>{
    if(c.kind==='buffer'){const source=this.passes.find(v=>v.id===c.pass),current=this.passes.indexOf(source)<index;data[32+i]=current?this.time:Math.max(0,this.time-delta);return source.targets[current?next:this.current];}
    return c.kind==='image'||c.kind==='cubemap'?this.images.get(c.assetId):p.dimensions[i]==='cube'?this.fallbackCube:this.fallback;
   });
   inputs.forEach((image,i)=>{if(p.channels[i].kind!=='none')data.set([image.width,image.height,1,0],16+i*4);});d.queue.writeBuffer(p.uniform,0,data);
   const channels=d.createBindGroup({layout:p.channelLayout,entries:[{binding:0,resource:this.sampler},...inputs.map((image,i)=>({binding:i+1,resource:image.view}))]});
   const pass=encoder.beginRenderPass({label:p.id,colorAttachments:[{view:p.targets[next].view,loadOp:'clear',storeOp:'store',clearValue:[0,0,0,0]}]});pass.setPipeline(p.pipeline);pass.setBindGroup(0,p.group);pass.setBindGroup(1,this.emptyGroup);pass.setBindGroup(2,channels);pass.draw(3);pass.end();
  }
  d.queue.submit([encoder.finish()]);this.current=next;this.frame++;
  this.options.onTexture?.(this.texture,this);
 }
 destroy(){if(this.destroyed)return;this.ready=false;for(const resource of this.resources)resource.destroy();this.resources.clear();this.images.clear();this.passes.length=0;super.destroy();}
}
/** Browser default. Native hosts inject loadTexture(device, asset), returning an owned GPUTexture. */
export async function loadBrowserTexture(device,asset) {
 if(typeof createImageBitmap!=='function')throw Error('Provide loadTexture for this host');
 const faces=asset.kind==='cubemap'?['px','nx','py','ny','pz','nz'].map(k=>asset.faces[k]):[asset.dataUrl];const images=[];let texture;
 try{
  for(const url of faces){const response=await fetch(url);if(!response.ok)throw Error('Texture read failed');images.push(await createImageBitmap(await response.blob(),{premultiplyAlpha:'none',colorSpaceConversion:'none'}));}
  const {width,height}=images[0];if(width>4096||height>4096||images.some(v=>v.width!==width||v.height!==height)||faces.length===6&&width!==height)throw Error('Invalid texture dimensions');
  texture=device.createTexture({size:[width,height,images.length],format:'rgba8unorm',usage:GPUTextureUsage.TEXTURE_BINDING|GPUTextureUsage.COPY_DST|GPUTextureUsage.RENDER_ATTACHMENT});images.forEach((image,i)=>device.queue.copyExternalImageToTexture({source:image},{texture,origin:[0,0,i]},[width,height]));return{texture,width,height,cube:faces.length===6};
 }catch(error){texture?.destroy();throw error;}finally{images.forEach(v=>v.close());}
}
`;
