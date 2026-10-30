import {ApplicationSettings,Button,Device,Folder,GridLayout,knownFolders,path,type Page,type View} from '@nativescript/core';
import {APP_LOCALES,localeLabel,t} from '../../../shared/dist/views/i18n.js';
import {preferencesKey} from '../../../shared/dist/domain/preferences.js';
import {preferences,savePreferences} from '../preferences';

@NativeClass()
class SettingsDisplayProbe extends NSObject {
  static ObjCExposedMethods={sampleFrame:{returns:interop.types.void,params:[CADisplayLink]}};
  callback:(()=>void)|undefined;
  ticks=0;
  sampleFrame(_link:CADisplayLink){this.ticks++;this.callback?.();}
}
let started=false;
/** Only the explicit flag activates sampling or writes local screenshots. */
export function installSettingsReview(owner:Page,gear:View,settings:()=>Page|undefined):void {
  if(started||!Array.from({length:NSProcessInfo.processInfo.arguments.count},(_,i)=>String(NSProcessInfo.processInfo.arguments.objectAtIndex(i))).includes('--shaderlab-settings-review'))return;
  started=true;owner.once('navigatedTo',()=>setTimeout(()=>void review(owner,gear,settings),300));
}
async function review(owner:Page,gear:View,settings:()=>Page|undefined){
  const folder=Folder.fromPath(path.join(knownFolders.documents().path,'ShaderLab-settings-review')),file=folder.getFile('report.json');
  const runs:{name:string;frames:FrameSample[];stable:boolean;anchored?:boolean}[]=[],screenshots:string[]=[];
  const originalLocale=preferences().locale,locales:Record<string,unknown>[]=[];
  const app=UIApplication.sharedApplication;app.idleTimerDisabled=true;
  const probe=SettingsDisplayProbe.new() as SettingsDisplayProbe,link=CADisplayLink.displayLinkWithTargetSelector(probe,'sampleFrame');
  probe.ticks=0;
  type FrameSample={visible:boolean;valid:boolean;x:number;y:number;width:number;height:number};
  const tap=(v:View)=>v.notify({eventName:'tap',object:v});
  const wait=async(test:()=>unknown,label:string)=>{const end=Date.now()+10000;while(!test()){if(Date.now()>end)throw Error('Settings review timeout: '+label);await new Promise(r=>setTimeout(r,20));}};
  const capture=(page:Page,name:string)=>{const window=(page.nativeViewProtected as UIView).window!;const image=UIGraphicsImageRenderer.alloc().initWithSize(window.bounds.size).PNGDataWithActions(()=>window.drawViewHierarchyInRectAfterScreenUpdates(window.bounds,true));if(!image.writeToFileAtomically(path.join(folder.path,name+'.png'),true))throw Error('Screenshot '+name);screenshots.push(name+'.png');};
  const walk=(view:View,visit:(view:View)=>void)=>{visit(view);view.eachChildView(child=>{walk(child,visit);return true;});};
  const texts=(page:Page)=>{
    const values=new Set<string>();if(page.content)walk(page.content,view=>{const value=(view as View&{text?:string}).text;if(typeof value==='string'&&value)values.add(value);});
    const native=(view:UIView)=>{if(view.isKindOfClass(UILabel.class())){const text=(view as UILabel).text;if(text)values.add(text);}if(view.isKindOfClass(UIButton.class())){const text=(view as UIButton).currentTitle;if(text)values.add(text);}for(let i=0;i<view.subviews.count;i++)native(view.subviews.objectAtIndex(i));};
    native(page.nativeViewProtected as UIView);return [...values];
  };
  const settle=()=>new Promise(resolve=>setTimeout(resolve,250));
  const observe=async(name:string,activate:()=>void,current:()=>Page|undefined,anchor?:View)=>{
    const frames:FrameSample[]=[];
    probe.callback=()=>{
      const page=current(),card=(page?.content as GridLayout|undefined)?.getChildAt(0);if(!card?.isLoaded)return;
      const view=card.nativeViewProtected as UIView;if(!view?.window)return;
      const origin=card.getLocationInWindow(),size=card.getActualSize();if(!origin)return;
      frames.push({visible:view.alpha>.99&&!view.hidden,valid:card.isLayoutValid&&(card as any).content.isLayoutValid,x:origin.x,y:origin.y,width:size.width,height:size.height});
    };
    activate();await wait(()=>current()?.isLoaded,name+' loaded');await new Promise(r=>setTimeout(r,650));probe.callback=undefined;
    const visible=frames.filter(frame=>frame.visible),last=visible.at(-1);
    const stable=!!last&&visible.length>=2&&visible.every(frame=>frame.valid&&['x','y','width','height'].every(key=>Math.abs(frame[key as 'x']-last[key as 'x'])<=1));
    const opener=anchor?.getLocationInWindow(),anchorBottom=opener?opener.y+anchor!.getActualSize().height:0;
    const belowRoom=((current()!.nativeViewProtected as UIView).window?.bounds.size.height??0)-anchorBottom-16;
    const below=!!last&&last.y>=anchorBottom+4&&last.y<=anchorBottom+12;
    const anchored=!anchor||!!last&&!!opener&&(below||belowRoom<112&&last.y+last.height<=opener.y-4);
    runs.push({name,frames,stable:stable&&anchored,...(anchor?{anchored}:{})});capture(current()!,name);
  };
  link.addToRunLoopForMode(NSRunLoop.mainRunLoop,NSDefaultRunLoopMode);link.addToRunLoopForMode(NSRunLoop.mainRunLoop,UITrackingRunLoopMode);
  try{
    await file.writeText(JSON.stringify({status:'running'}));
    await observe('settings',()=>tap(gear),settings);
    const page=settings()!;
    for(const name of ['locale','shader'])for(let iteration=0;iteration<3;iteration++){
      const anchor=page.getViewById<View>('settings-'+name);if(!anchor)throw Error('Missing '+name);
      await observe(name+'-'+iteration,()=>tap(anchor),()=>page.modal as Page|undefined,anchor);
      const picker=page.modal as Page;if(iteration===1){const card=(picker.content as GridLayout).getChildAt(0) as any;const panel=card.content as GridLayout;const selected:View[]=[];panel.eachChildView(view=>{if(view.accessibilityState==='selected')selected.push(view);return true;});if(!selected.length)throw Error('Missing selected '+name);tap(selected[0]);}else picker.closeModal();
      await wait(()=>!page.modal,name+' dismissed');await new Promise(r=>setTimeout(r,120));
    }
    page.closeModal();await wait(()=>!settings(),'settings dismissed');
    for(const locale of APP_LOCALES){
      tap(gear);await wait(()=>settings()?.isLoaded,'localized settings');const panel=settings()!,anchor=panel.getViewById<View>('settings-locale');if(!anchor)throw Error('Missing locale anchor');
      tap(anchor);await wait(()=>panel.modal?.isLoaded,'locale choices');const picker=panel.modal! as Page,options:Button[]=[];
      walk(picker.content,view=>{if(view instanceof Button&&(view.text===localeLabel(locale)||view.accessibilityLabel===localeLabel(locale)))options.push(view);});
      if(!options.length)throw Error('Missing locale option '+locale);tap(options[0]);await wait(()=>!panel.modal&&preferences().locale===locale,'applied '+locale);await settle();
      const settingsTexts=texts(panel),stored=JSON.parse(ApplicationSettings.getString(preferencesKey,'{}')).locale;
      if(!settingsTexts.includes(t('界面语言'))||gear.accessibilityLabel!==t('设置')||stored!==locale)throw Error('Native localization mismatch '+locale+' '+JSON.stringify({settingsTexts,gear:gear.accessibilityLabel,stored,expectedField:t('界面语言'),expectedGear:t('设置')}));
      capture(panel,'settings-'+locale);panel.closeModal();await wait(()=>!settings(),'settings closed');await settle();capture(owner,'gallery-'+locale);
      const result:Record<string,unknown>={locale,stored,settings:settingsTexts,gear:gear.accessibilityLabel};
      const frame=owner.frame;
      for(const [id,title]of [['gallery-practice','用代码画出答案'],['gallery-tutorial','从一个像素，到一件作品']] as const){
        const entry=owner.getViewById<View>(id);if(!entry)throw Error('Missing '+id);tap(entry);await wait(()=>frame.currentPage!==owner&&frame.currentPage?.isLoaded,id+' opened');await settle();
        const current=frame.currentPage,values=texts(current);if(!values.includes(t(title)))throw Error('Page heading not localized '+id+' '+locale);capture(current,id+'-'+locale);result[id]=values.slice(0,35);
        const next=current.getViewById<View>(id==='gallery-practice'?'practice-continue':'tutorial-continue');if(!next)throw Error('Missing continue '+id);tap(next);await wait(()=>frame.currentPage!==current&&frame.currentPage?.isLoaded,'detail opened');await settle();
        const detail=frame.currentPage,detailTexts=texts(detail);
        if(locale!=='zh-CN'&&detailTexts.some(value=>/^原生 WebGPU 已呈现/.test(value)))throw Error('Untranslated native rendering status '+locale);
        if(!detailTexts.includes(t(id==='gallery-practice'?'评测规则':'本文语言：简体中文')))throw Error('Detail page not localized '+id+' '+locale+' '+JSON.stringify(detailTexts.slice(0,20)));
        capture(detail,id+'-detail-'+locale);result[id+'-detail']=detailTexts.slice(0,20);
        frame.goBack();await wait(()=>frame.currentPage===current,'detail returned');frame.goBack();await wait(()=>frame.currentPage===owner,'index returned');await settle();
      }
      locales.push(result);
    }
    await file.writeText(JSON.stringify({status:runs.every(run=>run.stable)&&locales.length===3?'passed':'failed',kind:'Native modal frame samples and real settings/practice/tutorial controls; persisted preferences and screenshots',device:{model:Device.model,os:Device.osVersion},displayTicks:probe.ticks,runs,locales,screenshots},null,2));
  }catch(error){await file.writeText(JSON.stringify({status:'failed',error:String(error instanceof Error?error.stack:error),displayTicks:probe.ticks,runs,screenshots},null,2));}
  finally{savePreferences({locale:originalLocale});probe.callback=undefined;link.invalidate();/* A normal relaunch exits review mode and restores the idle timer. */}
}
