import {hyShowNativeOverlay,HYNativeCardGrid,type HYNativeOverlayHandle} from '@haiyue/native/ui';
import {nativeAction,nativeCardTarget,nativeTab} from './presentation';
import {t} from '../../../shared/dist/views/i18n.js';
import { Page, GridLayout, StackLayout, LayoutBase, ScrollView, Button, Label, Image, ImageSource, WebView, Color, isIOS, type View } from '@nativescript/core';
import { categoriesFor, categoryOf, channelChoices, channelName, type ChannelCategory } from '../../../shared/dist/views/channel-catalog.js';
import { shaderAppearance,shaderTheme } from '../../../shared/dist/views/presentation.js';
import { CUBE_FACES, PASS_LABELS, passOf, type Channel, type RenderPassId, type ShaderProject, type BufferId } from '../project';

/** Native counterpart of the material drawer, using the same catalog and restrictions. */
export function openNativeChannelDrawer(owner:Page,ports:{
  project():Readonly<ShaderProject>; session():string; pass:RenderPassId; index:number;
  bind(channel:Channel):Promise<unknown>;
  upload(kind:'image'|'video'|'cubemap'):Promise<Channel|undefined>;
  bufferPreview(pass:BufferId):Promise<ImageSource|undefined>;
}) {
  const session=ports.session(),panel=new GridLayout(),tabs=new StackLayout(),content=new StackLayout(),feedback=new Label();
  const c=shaderAppearance.color;let closed=false,busy=false,epoch=0,player:WebView|undefined;
  let overlay:HYNativeOverlayHandle;
  panel.rows='auto,*';panel.backgroundColor=new Color(c.surface);panel.padding=12;
  const text=(value:string,small=false)=>{const label=new Label();label.text=t(value);label.textWrap=true;label.className=small?'muted':'';return label;};
  const cards:{card:GridLayout;channel:Channel;button:Button;name:string}[]=[];
  const stopVideo=()=>{if(player){player.src='about:blank';if(player.parent instanceof LayoutBase)player.parent.removeChild(player);player=undefined;}};
  const release=()=>{closed=true;epoch++;stopVideo();};
  const close=()=>{if(closed)return;overlay.close();};
  const valid=()=>!closed&&session===ports.session();
  const activate=(action:()=>void|Promise<void>)=>()=>{if(action===close){close();return;}if(!valid()||busy)return;void Promise.resolve().then(action).catch(error=>{if(valid())feedback.text=error instanceof Error?error.message:String(error);});};
  const button=(name:string,action:()=>void|Promise<void>,primary=false)=>{const b=nativeAction(t(name),primary);b.accessibilityLabel=t(name);b.className=primary?'primary':'';b.on('tap',activate(action));return b;};
  const syncSelection=()=>{const current=passOf(ports.project() as ShaderProject,ports.pass).channels[ports.index]!;description.text=t('当前输入：{name}',{name:current.kind==='none'?t('未绑定'):channelName(ports.project(),current)});for(const entry of cards){const selected=JSON.stringify(entry.channel)===JSON.stringify(current);entry.card.borderColor=new Color(selected?c.accent:c.border);entry.button.accessibilityLabel='使用 '+entry.name+(selected?'，已选':'');}};
  const select=async(channel:Channel)=>{if(!valid()||busy)return;busy=true;feedback.text='';try{await ports.bind(channel);if(valid())syncSelection();}finally{busy=false;}};
  tabs.orientation='horizontal';const tabScroll=new ScrollView();tabScroll.orientation='horizontal';tabScroll.content=tabs;GridLayout.setRow(tabScroll,0);panel.addChild(tabScroll);
  const body=new StackLayout(),scroller=new ScrollView(),description=text('',true);scroller.content=body;body.addChild(description);body.addChild(content);feedback.className='error';feedback.textWrap=true;body.addChild(feedback);GridLayout.setRow(scroller,1);panel.addChild(scroller);
  const footer=new StackLayout();footer.orientation='horizontal';footer.addChild(button('清空通道',()=>select({kind:'none'})));footer.addChild(button('完成',close,true));
  const options=categoriesFor(ports.pass);let category=categoryOf(passOf(ports.project() as ShaderProject,ports.pass).channels[ports.index]!);
  const render=()=>{
    stopVideo();const version=++epoch;cards.length=0;content.removeChildren();tabs.removeChildren();feedback.text='';
    for(const tab of options){const item=nativeAction(t(tab.label));item.on('tap',()=>{category=tab.value;render();});nativeTab(item,tab.value===category);item.on('loaded',()=>nativeTab(item,tab.value===category));tabs.addChild(item);}
    if(['image','video','cubemap'].includes(category)){
      const kind=category as 'image'|'video'|'cubemap';content.addChild(button(kind==='image'?'＋ 上传图片':kind==='video'?'＋ 上传视频':'＋ 上传立方体六面',async()=>{busy=true;try{const value=await ports.upload(kind);if(!valid())return;busy=false;if(value){render();await select(value);}}finally{busy=false;}},true));
    }
    const choices=channelChoices(ports.project(),ports.pass,category),grid=new HYNativeCardGrid({minCardWidth:190,maxColumns:2,gap:12});const materialCards:View[]=[];content.addChild(grid);
    if(!choices.length)content.addChild(text('暂无素材，上传后即可预览并绑定。',true));
    choices.forEach((choice,index)=>{
      const card=new GridLayout(),contents=new StackLayout();card.className='card';card.borderWidth=1;contents.padding=8;card.addChild(contents);materialCards.push(card);
      const choose=nativeCardTarget();choose.on('tap',activate(()=>select(choice.channel)));
      cards.push({card,channel:choice.channel,button:choose,name:choice.name});
      const image=(src:string,height=110)=>{const view=new Image();view.height=height;view.stretch='aspectFit';view.accessibilityLabel=choice.name+' 预览';view.src=src.startsWith('./assets/')?'~/assets/'+src.slice(9):src.startsWith('data:')?ImageSource.fromBase64Sync(src.slice(src.indexOf(',')+1)):src;return view;};
      if(choice.image)contents.addChild(image(choice.image));
      else if(choice.faces){const faces=new GridLayout();faces.columns='*,*,*';faces.rows='auto,auto';CUBE_FACES.forEach((face,i)=>{const tile=image(choice.faces![face],48);GridLayout.setColumn(tile,i%3);GridLayout.setRow(tile,Math.floor(i/3));faces.addChild(tile);});contents.addChild(faces);}
      else if(choice.video){const space=new Label();space.height=140;contents.addChild(space);const play=button('▶ 预览视频',()=>{stopVideo();player=new WebView();player.height=140;player.verticalAlignment='top';player.src='<html><meta name="viewport" content="width=device-width"><body style="margin:0;background:#080b21"><video controls playsinline preload="metadata" style="width:100%;height:100%" src="'+choice.video!.replace(/"/g,'&quot;')+'"></video></body></html>';card.addChild(player);});play.verticalAlignment='top';card.addChild(play);}
      else if(choice.channel.kind==='buffer'){
        const preview=new Image();preview.height=110;preview.stretch='aspectFit';preview.accessibilityLabel=choice.name+' 预览';contents.addChild(preview);
        void ports.bufferPreview(choice.channel.pass).then(source=>{if(valid()&&epoch===version&&source)preview.imageSource=source;}).catch(()=>{});
      }else{const symbol=text(choice.symbol??'');symbol.fontSize=32;symbol.textAlignment='center';symbol.height=80;contents.addChild(symbol);}
      const nameLabel=new Label();nameLabel.text=['image','video','cubemap'].includes(choice.channel.kind)?choice.name:t(choice.name);contents.addChild(nameLabel);contents.addChild(text(choice.detail,true));card.insertChild(choose,1);
    });
    grid.setItems(materialCards);syncSelection();
  };
  render();overlay=hyShowNativeOverlay(owner,{title:PASS_LABELS[ports.pass]+' · iChannel'+ports.index,content:panel,footer,scrollable:false,kind:'drawer',theme:shaderTheme,closeLabel:t('关闭'),onClosed:release});
  return {close,closed:overlay.closed};
}
