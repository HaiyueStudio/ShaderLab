import { BUILTIN_TEXTURES } from '../domain/builtinTextures.js';
import { PASS_IDS, PASS_LABELS, type Channel, type RenderPassId, type ShaderProject, type CubeAsset } from '../domain/model.js';

export const channelCategories = [
  {value:'builtin',label:'内置纹理'}, {value:'image',label:'图片'}, {value:'video',label:'视频'},
  {value:'cubemap',label:'Cubemap'}, {value:'buffer',label:'Buffer'}, {value:'device',label:'设备'},
] as const;
export type ChannelCategory = typeof channelCategories[number]['value'];
export interface ChannelChoice {
  id:string; name:string; detail:string; channel:Channel;
  image?:string; video?:string; faces?:CubeAsset['faces']; symbol?:string;
}
export function categoriesFor(pass:RenderPassId) {
  return channelCategories.filter(tab=>pass!=='sound'||['builtin','image','cubemap'].includes(tab.value));
}
export function categoryOf(channel:Channel):ChannelCategory {
  return channel.kind==='camera'||channel.kind==='keyboard'?'device':channel.kind==='none'?'builtin':channel.kind;
}
export function channelChoices(project:Readonly<ShaderProject>,pass:RenderPassId,category:ChannelCategory):ChannelChoice[] {
  if(!categoriesFor(pass).some(tab=>tab.value===category))return [];
  if(category==='builtin')return BUILTIN_TEXTURES.map(asset=>({id:'builtin:'+asset.id,name:asset.name,detail:'内置纹理',channel:{kind:'builtin',texture:asset.id},image:'./assets/'+asset.file}));
  if(category==='buffer')return PASS_IDS.filter(id=>id!=='image').map(id=>({id,name:PASS_LABELS[id],detail:id===pass?'当前 Buffer · 上一帧反馈':project.passes.find(p=>p.id===id)?.enabled?'实时渲染输出':'绑定后启用此 Buffer',channel:{kind:'buffer',pass:id},symbol:id.at(-1)!.toUpperCase()}));
  if(category==='device')return [
    {id:'keyboard',name:'键盘',detail:'256 × 3 · 按下 / 持续 / 切换状态',channel:{kind:'keyboard'},symbol:'⌨'},
    {id:'camera:environment',name:'后置相机',detail:'绑定后请求相机权限并输入实时视频',channel:{kind:'camera',facing:'environment'},symbol:'◉'},
    {id:'camera:user',name:'前置相机',detail:'绑定后请求相机权限并输入实时视频',channel:{kind:'camera',facing:'user'},symbol:'◉'},
  ];
  return project.assets.flatMap((asset):ChannelChoice[]=>{
    if((asset.kind??'image')!==category)return [];
    if(asset.kind==='cubemap')return [{id:'cubemap:'+asset.id,name:asset.name,detail:'立方体贴图 · 六面预览',channel:{kind:'cubemap',assetId:asset.id},faces:asset.faces}];
    if(asset.kind==='video')return [{id:'video:'+asset.id,name:asset.name,detail:'视频素材',channel:{kind:'video',assetId:asset.id},video:asset.dataUrl}];
    return [{id:'image:'+asset.id,name:asset.name,detail:'图片素材',channel:{kind:'image',assetId:asset.id},image:asset.dataUrl}];
  });
}
export function channelName(project:Readonly<ShaderProject>,channel:Channel):string {
  if(channel.kind==='none')return '选择素材';
  if(channel.kind==='builtin')return BUILTIN_TEXTURES.find(asset=>asset.id===channel.texture)?.name??'内置纹理';
  if(channel.kind==='buffer')return PASS_LABELS[channel.pass];
  if(channel.kind==='keyboard')return '键盘';
  if(channel.kind==='camera')return channel.facing==='user'?'前置相机':'后置相机';
  return project.assets.find(asset=>asset.id===channel.assetId)?.name??'素材';
}
