import {parseProject,type ShaderProject} from './model.js';
// URL fragments stay on the client. Small, complete projects are self-contained;
// larger media projects use the existing .hyshader transfer instead.
const utf8=(text:string)=>Uint8Array.from(encodeURIComponent(text).replace(/%([0-9A-F]{2})/g,(_,h:string)=>String.fromCharCode(parseInt(h,16))),c=>c.charCodeAt(0));
const unutf8=(bytes:number[])=>decodeURIComponent(bytes.map(b=>'%'+b.toString(16).padStart(2,'0')).join(''));
const alphabet='ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
export const SHARE_LIMIT=48_000;
export function encodeShare(project:ShaderProject){const text=JSON.stringify(project);parseProject(text);const bytes=utf8(text);if(bytes.length>36_000)throw Error('作品超过分享链接大小限制，请导出 .hyshader 工程文件。');let out='';for(let i=0;i<bytes.length;i+=3){const n=(bytes[i]!<<16)|((bytes[i+1]??0)<<8)|(bytes[i+2]??0);out+=alphabet[n>>>18]!+alphabet[n>>>12&63]!+(i+1<bytes.length?alphabet[n>>>6&63]:'')+(i+2<bytes.length?alphabet[n&63]:'');}return out;}
export function decodeShare(payload:string){if(payload.length>SHARE_LIMIT||payload.length%4===1||!/^[A-Za-z0-9_-]+$/.test(payload))throw Error('分享链接无效或过大。');const bytes:number[]=[];let value=0,bits=0;for(const ch of payload){value=(value<<6)|alphabet.indexOf(ch);bits+=6;if(bits>=8){bits-=8;bytes.push(value>>>bits&255);}}return parseProject(unutf8(bytes));}
export const EXPORT_FORMATS={landscape:[640,360],portrait:[360,640],square:[512,512]} as const;
export type ExportShape=keyof typeof EXPORT_FORMATS;
export function exportSpec(shape:ExportShape,seconds:number,fps:number){if(!EXPORT_FORMATS[shape]||!Number.isInteger(seconds)||seconds<1||seconds>10||![15,30].includes(fps))throw Error('导出支持 1–10 秒、15/30 FPS。');return{width:EXPORT_FORMATS[shape][0],height:EXPORT_FORMATS[shape][1],frames:seconds*fps,fps};}
// A streaming store-only ZIP. Each frame is already PNG-compressed.
export class FrameArchive{
 private files:{name:Uint8Array;data:Uint8Array;crc:number}[]=[];private bytes=0;
 add(name:string,data:Uint8Array){if(this.files.length>=301||this.bytes+data.length>128*1024*1024)throw Error('序列帧超过 128 MB，请缩短时长。');const encoded=utf8(name);this.files.push({name:encoded,data,crc:crc32(data)});this.bytes+=data.length;}
 finish(){const parts:Uint8Array[]=[],central:Uint8Array[]=[];let offset=0,centralSize=0;
  for(const f of this.files){const local=new Uint8Array(30+f.name.length),v=new DataView(local.buffer);v.setUint32(0,0x04034b50,true);v.setUint16(4,20,true);v.setUint32(14,f.crc,true);v.setUint32(18,f.data.length,true);v.setUint32(22,f.data.length,true);v.setUint16(26,f.name.length,true);local.set(f.name,30);parts.push(local,f.data);
   const c=new Uint8Array(46+f.name.length),d=new DataView(c.buffer);d.setUint32(0,0x02014b50,true);d.setUint16(4,20,true);d.setUint16(6,20,true);d.setUint32(16,f.crc,true);d.setUint32(20,f.data.length,true);d.setUint32(24,f.data.length,true);d.setUint16(28,f.name.length,true);d.setUint32(42,offset,true);c.set(f.name,46);central.push(c);centralSize+=c.length;offset+=local.length+f.data.length;
  }
  const end=new Uint8Array(22),v=new DataView(end.buffer);v.setUint32(0,0x06054b50,true);v.setUint16(8,this.files.length,true);v.setUint16(10,this.files.length,true);v.setUint32(12,centralSize,true);v.setUint32(16,offset,true);const out=new Uint8Array(offset+centralSize+22);let at=0;for(const p of [...parts,...central,end]){out.set(p,at);at+=p.length;}return out;
 }
}
function crc32(bytes:Uint8Array){let crc=0xffffffff;for(const byte of bytes){crc^=byte;for(let n=0;n<8;n++)crc=(crc>>>1)^((crc&1)?0xedb88320:0);}return(crc^0xffffffff)>>>0;}
