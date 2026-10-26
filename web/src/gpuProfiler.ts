import type {PassId} from './model.js';
import type {PassTiming} from '../../shared/dist/domain/inspection.js';
/** Opt-in, bounded asynchronous timestamp readback. No per-frame CPU/GPU fence. */
export class PassProfiler{
 enabled=false;timings:PassTiming[]=[];error='';private queries?:GPUQuerySet;private resolve?:GPUBuffer;private read?:GPUBuffer;private busy=false;private dead=false;private sample=false;private ids:PassId[]=[];private frames=0;private readonly empty={};private cpu:PassTiming[]=[];private started=0;
 constructor(private device:GPUDevice,private timestamps=true){}
 get supported(){return this.timestamps&&this.device.features.has('timestamp-query');}
 private now(){return globalThis.performance?.now?.()??Date.now();}
 begin(){if(!this.enabled){this.sample=false;return;}this.ids.length=0;this.cpu.length=0;this.sample=!this.busy&&this.frames++%15===0;if(this.sample&&this.supported&&!this.queries){this.queries=this.device.createQuerySet({type:'timestamp',count:10});this.resolve=this.device.createBuffer({size:256,usage:GPUBufferUsage.QUERY_RESOLVE|GPUBufferUsage.COPY_SRC});this.read=this.device.createBuffer({size:256,usage:GPUBufferUsage.COPY_DST|GPUBufferUsage.MAP_READ});}}
 pass(id:PassId):Pick<GPURenderPassDescriptor,'timestampWrites'>{if(!this.sample)return this.empty;const index=this.ids.push(id)-1;this.started=this.now();return this.supported?{timestampWrites:{querySet:this.queries!,beginningOfPassWriteIndex:index*2,endOfPassWriteIndex:index*2+1}}:this.empty;}
 endPass(id:PassId){if(this.sample&&!this.supported)this.cpu.push({pass:id,milliseconds:Math.max(0,this.now()-this.started),kind:'cpu'});}
 resolveInto(encoder:GPUCommandEncoder){if(!this.sample||!this.ids.length)return;if(!this.supported){this.timings=this.cpu.slice();this.sample=false;return;}encoder.resolveQuerySet(this.queries!,0,this.ids.length*2,this.resolve!,0);encoder.copyBufferToBuffer(this.resolve!,0,this.read!,0,this.ids.length*16);this.busy=true;}
 submitted(){if(!this.sample||!this.busy)return;this.sample=false;const ids=this.ids.slice(),read=this.read!;void read.mapAsync(GPUMapMode.READ).then(()=>{if(this.dead)return;const values=new BigUint64Array(read.getMappedRange());this.timings=ids.map((pass,i)=>({pass,milliseconds:Number(values[i*2+1]!-values[i*2]!)/1e6,kind:'gpu'}));read.unmap();}).catch(error=>{if(!this.dead){this.error=String(error);this.enabled=false;}}).finally(()=>{this.busy=false;});}
 dispose(){this.dead=true;this.queries?.destroy?.();this.resolve?.destroy();this.read?.destroy();}
}
