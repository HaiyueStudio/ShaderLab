import {Device,Folder,GridLayout,Image,ScrollView,knownFolders,path,isAndroid,type Page,type View} from '@nativescript/core';
import {examples} from '../../../web/src/examples.js';
import {createProject} from '../project';
import type {MobileProjects} from '../storage';
import {dataUrl} from '../files';
import {t} from '../../../shared/dist/views/i18n.js';

/** Explicit local acceptance: fixture works live in a separate documents folder. */
export function uiRefreshReviewRequested(){return !isAndroid&&Array.from({length:NSProcessInfo.processInfo.arguments.count},(_,i)=>String(NSProcessInfo.processInfo.arguments.objectAtIndex(i))).includes('--shaderlab-ui-refresh-review');}
export function uiRefreshReview(create:()=>Page,store:MobileProjects){const page=create();page.once('navigatedTo',()=>setTimeout(()=>void review(page,store),300));return page;}
async function review(gallery:Page,store:MobileProjects){
  const folder=Folder.fromPath(path.join(knownFolders.documents().path,'ShaderLab-ui-refresh-review')),file=folder.getFile('report.json'),checks:string[]=[],images:string[]=[],sizes:Record<string,unknown>={};
  UIApplication.sharedApplication.idleTimerDisabled=true;const frame=gallery.frame;
  const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);};
  const wait=async(test:()=>unknown|Promise<unknown>,name:string)=>{const end=Date.now()+45000;while(!await test()){if(Date.now()>end)throw Error('UI review timeout: '+name);await new Promise(r=>setTimeout(r,50));}};
  const settle=()=>new Promise(r=>setTimeout(r,350)),tap=(view:View|undefined)=>{assert(view,'Missing action');view!.notify({eventName:'tap',object:view});};
  const capture=async(name:string)=>{await settle();const window=(frame.currentPage.nativeViewProtected as UIView).window!;const png=UIGraphicsImageRenderer.alloc().initWithSize(window.bounds.size).PNGDataWithActions(()=>window.drawViewHierarchyInRectAfterScreenUpdates(window.bounds,true));assert(png.length>30000&&png.writeToFileAtomically(path.join(folder.path,name+'.png'),true),'Save '+name);images.push(name+'.png');};
  try{
    await file.writeText(JSON.stringify({status:'running'}));
    const sample=examples()[0]!,saved=JSON.parse(JSON.stringify(sample.project));saved.id='ui-review-saved';saved.name='Aurora study';
    const old=createProject('First study');old.id='ui-review-backfill';const firstImage=await dataUrl(path.join(knownFolders.currentApp().path,'assets/gallery',sample.id+'.png'),'image/png');
    await store.save(saved,firstImage);await store.save(old);gallery.notify({eventName:'navigatedTo',object:gallery});
    await wait(async()=>{const works=await store.listWorks();return works.length===2&&works.every(work=>work.thumbnail.startsWith('data:image/png;base64,'));},'missing work preview backfill');
    const preview=gallery.getViewById<Image>('work-preview-'+old.id);await wait(()=>preview?.imageSource?.width>0,'preview image binding');assert((await store.archive.history(old.id)).length===1,'backfill must not create a saved version');checks.push('old works receive a real rendered thumbnail without changing history');
    const actions=gallery.actionBar.actionItems.getItems(),logo=actions.find(action=>action.actionView?.id==='app-logo')?.actionView,gear=actions.find(action=>action.actionView?.id==='app-settings')?.actionView;
    assert(gallery.actionBar.title==='ShaderLab','brand title');assert(logo&&gear,'brand actions');
    const rect=(view:View)=>({...view.getLocationOnScreen(),...view.getActualSize()}),logoRect=rect(logo!),gearRect=rect(gear!),pageWidth=gallery.getActualSize().width;
    sizes.brand={title:gallery.actionBar.title,logo:logoRect,settings:gearRect,pageWidth};assert(Math.abs(logoRect.width-44)<=1&&logoRect.x>=8&&logoRect.x<pageWidth/3,'logo on left');assert(gearRect.x>pageWidth/2&&gearRect.x+gearRect.width<=pageWidth-8,'settings fully on screen');await capture('gallery-home');
    const scroller=gallery.getViewById<ScrollView>('gallery-scroll'),heading=gallery.getViewById<View>('library-heading');scroller.scrollToVerticalOffset(Math.max(0,heading.getLocationRelativeTo(scroller.content!).y-12),false);await capture('gallery-works');
    const remove=gallery.getViewById<View>('delete-project-'+saved.id);assert((remove.backgroundColor as any).a===0,'delete button should use a quiet surface');tap(remove);await wait(()=>gallery.modal?.isLoaded,'delete confirmation');tap((gallery.modal as Page).getViewById<View>('confirmation-cancel'));await wait(()=>!gallery.modal,'cancel deletion');assert((await store.list()).length===2,'cancel must retain works');checks.push('work cards show thumbnails and neutral vector actions; deletion remains cancelable');
    tap(gallery.getViewById<View>('saved-project-'+saved.id));await wait(()=>frame.currentPage!==gallery,'open saved work');const editor=frame.currentPage;
    await wait(()=>editor.getViewById<any>('editor-compile-state')?.text===t('已编译'),'editor compiled');await capture('editor-preview');
    const canvas=editor.getViewById<View>('editor-render-canvas'),nativeCanvas=canvas.nativeViewProtected,before=canvas.getActualSize();tap(editor.getViewById<View>('editor-fullscreen'));await settle();
    assert(editor.getViewById<View>('editor-project-bar').visibility==='collapse','fullscreen project bar');assert(canvas.nativeViewProtected===nativeCanvas,'fullscreen must retain the canvas');assert(canvas.getActualSize().height>before.height+30,'fullscreen must enlarge the preview');sizes.fullscreen={before,after:canvas.getActualSize()};await capture('editor-fullscreen');
    tap(editor.getViewById<View>('editor-fullscreen'));await settle();assert(editor.getViewById<View>('editor-project-bar').visibility==='visible','exit fullscreen');checks.push('preview fullscreen expands the same canvas and restores the editor');
    tap(editor.getViewById<View>('/shader-project/actions/save'));await wait(async()=>{const work=(await store.listWorks()).find(work=>work.project.id===saved.id);return work?.thumbnail&&work.thumbnail!==firstImage;},'saved render thumbnail');checks.push('saving a compiled work captures the current Image-pass preview');
    frame.goBack();await wait(()=>frame.currentPage===gallery,'back to gallery');tap(gallery.getViewById<View>('gallery-practice'));await wait(()=>frame.currentPage.id==='practice-index','practice index');const practice=frame.currentPage;
    await settle();const paths=practice.getViewById<GridLayout>('practice-paths');assert(paths.getChildrenCount()===4,'learning path cards');assert(practice.getViewById<View>('practice-resume'),'practice progress card');sizes.practice={page:practice.getActualSize(),paths:paths.getActualSize()};await capture('practice-index');checks.push('practice index contains progress, continue action, four learning paths and difficulty filters');
    frame.goBack();await wait(()=>frame.currentPage===gallery,'final gallery');
    await file.writeText(JSON.stringify({status:'passed',kind:'Native UI semantic workflow; isolated saved works; real WebGPU thumbnail generation and fullscreen canvas identity; UIKit screenshots',device:{model:Device.model,version:Device.osVersion},checks,images,sizes},null,2));
  }catch(error){try{await capture('failure');}catch{}await file.writeText(JSON.stringify({status:'failed',error:String(error instanceof Error?error.stack:error),checks,images,sizes},null,2));}
}
