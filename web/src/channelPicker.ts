import { defineDrawerComponents, type HYDrawer } from '@haiyue/ui/drawer';
import { defineTabsComponents, type HYTabs } from '@haiyue/ui/tabs';
import { categoriesFor, categoryOf, channelChoices, channelName, type ChannelCategory } from '../../shared/dist/views/channel-catalog.js';
import { CUBE_FACES, CUBE_FACE_LABELS, PASS_LABELS, passOf, type Channel, type RenderPassId, type ShaderProject } from './model.js';
import type { BufferPreview } from './bufferPreviews.js';
import { t } from '../../shared/dist/views/i18n.js';

export interface ChannelTarget {pass:RenderPassId; index:number; session:string}
export function createChannelPicker(ports:{
  project():Readonly<ShaderProject>; session():string;
  bind(target:ChannelTarget,channel:Channel):Promise<unknown>;
  upload(target:ChannelTarget,kind:'image'|'video'|'cubemap'):void;
  previews(previews:readonly BufferPreview[]):void;
}) {
  defineDrawerComponents();defineTabsComponents();
  const drawer=document.createElement('hy-drawer') as HYDrawer;drawer.id='channel-drawer';drawer.placement='right';
  drawer.innerHTML='<p class="channel-picker-description"></p><hy-tabs id="channel-source-tabs" aria-label="素材类型"></hy-tabs><div class="channel-picker-content"><div class="channel-picker-actions"></div><div class="channel-picker-grid"></div><p class="channel-picker-error" role="alert"></p></div><button slot="footer" class="secondary" id="channel-clear">清空通道</button><button slot="footer" class="primary" id="channel-picker-close">完成</button>';
  const tabs=drawer.querySelector<HYTabs>('hy-tabs')!,grid=drawer.querySelector<HTMLElement>('.channel-picker-grid')!,actions=drawer.querySelector<HTMLElement>('.channel-picker-actions')!,error=drawer.querySelector<HTMLElement>('.channel-picker-error')!;
  let target:ChannelTarget|undefined,busy=false;
  const videos=()=>drawer.querySelectorAll('video');
  const release=()=>{videos().forEach(video=>{video.pause();video.removeAttribute('src');video.load();});ports.previews([]);};
  const valid=(owner:ChannelTarget)=>owner===target&&owner.session===ports.session();
  const syncSelection=()=>{
    const owner=target;if(!owner||!valid(owner))return;
    const project=ports.project(),current=passOf(project as ShaderProject,owner.pass).channels[owner.index]!;
    drawer.querySelector('.channel-picker-description')!.textContent=t('当前输入：{name}',{name:current.kind==='none'?t('未绑定'):channelName(project,current)});
    for(const card of grid.querySelectorAll<HTMLElement>('[data-channel-value]')){const selected=card.dataset.channelValue===JSON.stringify(current);card.classList.toggle('selected',selected);card.querySelector('button')!.setAttribute('aria-pressed',String(selected));}
  };
  const select=async(channel:Channel)=>{
    const owner=target;if(!owner||!valid(owner)||busy)return;
    busy=true;error.textContent='';drawer.setAttribute('aria-busy','true');
    try{await ports.bind(owner,channel);if(valid(owner))syncSelection();}
    catch(cause){if(valid(owner))error.textContent=cause instanceof Error?cause.message:String(cause);}
    finally{busy=false;drawer.removeAttribute('aria-busy');}
  };
  const button=(text:string,action:()=>void,className='')=>{const b=document.createElement('button');b.type='button';b.textContent=t(text);b.className=className;b.addEventListener('click',action);return b;};
  const render=()=>{
    release();grid.replaceChildren();actions.replaceChildren();error.textContent='';
    const owner=target;if(!owner||!valid(owner))return;
    const category=tabs.value as ChannelCategory,project=ports.project(),current=passOf(project as ShaderProject,owner.pass).channels[owner.index],previews:BufferPreview[]=[];
    if(['image','video','cubemap'].includes(category)){
      const kind=category as 'image'|'video'|'cubemap';
      const upload=button(kind==='image'?'＋ 上传图片':kind==='video'?'＋ 上传视频':'＋ 上传立方体六面',()=>{if(busy||!valid(owner))return;if(kind==='cubemap')drawer.close();ports.upload(owner,kind);},'primary channel-picker-upload');
      upload.dataset.upload=kind;actions.append(upload);
      const hint=document.createElement('span');hint.textContent=t(kind==='image'?'PNG / JPEG / WebP · 8 MB 以内':kind==='video'?'MP4 / WebM · 24 MB 以内':'六张尺寸相同的正方形图片');actions.append(hint);
    }
    for(const choice of channelChoices(project,owner.pass,category)){
      const card=document.createElement('article');card.className='channel-source-card';card.dataset.source=choice.id;card.dataset.channelValue=JSON.stringify(choice.channel);
      if(JSON.stringify(choice.channel)===JSON.stringify(current))card.classList.add('selected');
      const preview=document.createElement('div');preview.className='channel-source-preview';
      if(choice.image){const image=new Image();image.src=choice.image;image.alt=choice.name;preview.append(image);}
      else if(choice.video){const video=document.createElement('video');video.src=choice.video;video.controls=true;video.muted=true;video.playsInline=true;video.preload='metadata';video.setAttribute('aria-label',choice.name+' 预览');preview.append(video);}
      else if(choice.faces){preview.classList.add('channel-cube-faces');for(const face of CUBE_FACES){const image=new Image();image.src=choice.faces[face];image.alt=CUBE_FACE_LABELS[face];preview.append(image);}}
      else if(choice.channel.kind==='buffer'){
        const canvas=document.createElement('canvas');canvas.width=240;canvas.height=135;canvas.className='buffer-preview';canvas.dataset.previewState='waiting';canvas.setAttribute('aria-label',choice.name+' 实时预览');
        const label=document.createElement('span');label.className='channel-buffer-placeholder';label.textContent=choice.name;preview.append(canvas,label);previews.push({canvas,pass:choice.channel.pass});
      }else{preview.textContent=choice.symbol??'';preview.classList.add('channel-source-symbol');}
      const name=document.createElement('span');name.className='channel-source-name';name.textContent=['image','video','cubemap'].includes(choice.channel.kind)?choice.name:t(choice.name);
      const choose=button('',()=>void select(choice.channel),'channel-source-select');choose.setAttribute('aria-label',t('使用 {name}',{name:choice.name}));choose.setAttribute('aria-pressed',String(card.classList.contains('selected')));
      const detail=document.createElement('p');detail.textContent=t(choice.detail);card.append(preview,name,detail,choose);grid.append(card);
    }
    if(!grid.children.length){const empty=document.createElement('p');empty.className='channel-picker-empty';empty.textContent=t('暂无素材，上传后即可预览并绑定到此通道。');grid.append(empty);}
    ports.previews(previews);
  };
  tabs.addEventListener('tab-change',render);
  drawer.querySelector('#channel-clear')!.addEventListener('click',()=>void select({kind:'none'}));
  drawer.querySelector('#channel-picker-close')!.addEventListener('click',()=>drawer.close());
  drawer.addEventListener('drawer-close',()=>{const owner=target;release();target=undefined;if(owner&&owner.session===ports.session())queueMicrotask(()=>document.querySelector<HTMLButtonElement>(`#channels [data-pass="${owner.pass}"][data-channel="${owner.index}"] .choose-channel`)?.focus());});
  drawer.querySelector('#channel-clear')!.textContent=t('清空通道');drawer.querySelector('#channel-picker-close')!.textContent=t('完成');
  document.body.append(drawer);
  return {
    open(pass:RenderPassId,index:number){if(busy)return;target={pass,index,session:ports.session()};const project=ports.project(),current=passOf(project as ShaderProject,pass).channels[index]!;drawer.heading=PASS_LABELS[pass]+' · iChannel'+index;
      drawer.querySelector('.channel-picker-description')!.textContent=t('当前输入：{name}',{name:current.kind==='none'?t('未绑定'):channelName(project,current)});
      tabs.options=categoriesFor(pass).map(tab=>({...tab,label:t(tab.label)}));tabs.value=categoryOf(current);drawer.show();render();
    },
    close(){drawer.close();},
    refresh(){if(drawer.open){render();syncSelection();}},
    localize(){tabs.options=tabs.options.map(tab=>({...tab,label:t(categoriesFor(target?.pass??'image').find(item=>item.value===tab.value)?.label??tab.label)}));drawer.querySelector('#channel-clear')!.textContent=t('清空通道');drawer.querySelector('#channel-picker-close')!.textContent=t('完成');if(drawer.open){render();syncSelection();}},
    report(message:string){if(drawer.open)error.textContent=message;},
    dispose(){release();drawer.remove();},
  };
}
