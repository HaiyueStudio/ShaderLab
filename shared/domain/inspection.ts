import {usesCurrentFrame,type ShaderProject,type PassId} from './model.js';
export function passDependencies(project:Readonly<ShaderProject>){return project.passes.filter(p=>p.enabled).map(p=>({id:p.id,channels:p.channels.map((c,index)=>({index,kind:c.kind,source:c.kind==='buffer'?c.pass:c.kind==='image'||c.kind==='video'||c.kind==='cubemap'?c.assetId:c.kind==='builtin'?c.texture:c.kind==='camera'?c.facing:c.kind,timing:c.kind==='buffer'?(usesCurrentFrame(p.id,c.pass)?'current':'previous'):undefined}))}));}
export function inspectPixel(image:{width:number;height:number;pixels:Uint8Array},u:number,v:number){const x=Math.max(0,Math.min(image.width-1,Math.floor(u*image.width))),y=Math.max(0,Math.min(image.height-1,Math.floor(v*image.height))),at=(y*image.width+x)*4,rgba=Array.from(image.pixels.slice(at,at+4));return{x,y:image.height-1-y,uv:[(x+.5)/image.width,1-(y+.5)/image.height],rgba,hex:'#'+rgba.slice(0,3).map(v=>v.toString(16).padStart(2,'0')).join('')};}
export type PassTiming={pass:PassId;milliseconds:number;kind:'gpu'|'cpu'};
export function decodeReadback(mapped:Uint8Array,stride:number,width:number,height:number,format:'rgba8unorm'|'rgba16float'|'rgba32float'){
 const pixels=new Uint8Array(width*height*4),view=new DataView(mapped.buffer,mapped.byteOffset,mapped.byteLength),step=format==='rgba8unorm'?1:format==='rgba16float'?2:4;
 const half=(n:number)=>{const s=n&32768?-1:1,e=n>>10&31,m=n&1023;return s*(e===0?m*2**-24:e===31?m?NaN:Infinity:(1+m/1024)*2**(e-15));};
 for(let y=0;y<height;y++)for(let x=0;x<width*4;x++){const at=y*stride+x*step,value=step===1?mapped[at]!/255:step===2?half(view.getUint16(at,true)):view.getFloat32(at,true);pixels[y*width*4+x]=Math.round(Math.max(0,Math.min(1,Number.isFinite(value)?value:0))*255);}
 return{width,height,pixels};
}
