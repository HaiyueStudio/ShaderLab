import {StackLayout,GridLayout,TextView,Label,type Page,type View} from '@nativescript/core';
import {hyShowNativeOverlay} from '@haiyue/native/ui';
import {HYNativeButton} from './presentation';
import {shaderTheme} from '../../../shared/dist/views/presentation.js';
import {t} from '../../../shared/dist/views/i18n.js';
import {sourceDiff} from '../../../shared/dist/domain/source-diff.js';
import {sourceOf,languageOf} from '../../../shared/dist/domain/sourceLanguage.js';
import {codeTabs,PASS_LABELS,type ShaderProject,type CodeId,type ShaderLanguage} from '../../../shared/dist/domain/model.js';
import type {ShaderApplication,LanguageConversion} from '../../../shared/dist/application/application.js';
import type {MobileProjects} from '../storage';
import {bindShaderHighlight} from '../highlight';

function body(){const view=new StackLayout();view.padding=16;return view;}
function text(value:string){const label=new Label();label.text=value;label.textWrap=true;label.marginBottom=10;return label;}
function action(title:string,run:()=>unknown,error:Label){const button=new HYNativeButton({text:t(title),variant:'secondary',size:'compact'},shaderTheme);button.on('tap',()=>{button.isEnabled=false;void Promise.resolve().then(run).catch(failure=>{error.text=String(failure instanceof Error?failure.message:failure);}).finally(()=>button.isEnabled=true);});return button;}
function overlay(page:Page,title:string,content:StackLayout,onClosed?:()=>void,footer?:View){const modal=hyShowNativeOverlay(page,{title:t(title),content,theme:shaderTheme,kind:'drawer',width:780,closeLabel:t('关闭'),...(onClosed?{onClosed}:{}),...(footer?{footer}:{})});const close=()=>modal.close();page.on('navigatingFrom',close);void modal.closed.finally(()=>page.off('navigatingFrom',close));return modal;}
function comparison(content:StackLayout,before:string,after:string,from:ShaderLanguage,to:ShaderLanguage){
  const diff=sourceDiff(before,after);content.addChild(text(`${from.toUpperCase()} → ${to.toUpperCase()} · +${diff.added} / −${diff.removed}`));const disposers:(()=>void)[]=[];
  for(const[label,source,language]of [[t('当前代码'),before,from],[t('预览代码'),after,to]] as const){content.addChild(text(label+' · '+language.toUpperCase()));const editor=new TextView();editor.text=source;editor.editable=false;editor.height=240;editor.className='editor-source';editor.padding=12;editor.fontFamily='monospace';editor.accessibilityLabel=label;const highlight=bindShaderHighlight(editor,()=>language);disposers.push(()=>highlight.dispose());content.addChild(editor);}
  content.addChild(text(t('逐行差异')+'\n'+diff.lines.filter(line=>line.kind!=='same').slice(0,400).map(line=>(line.kind==='added'?'+ ':'− ')+line.text).join('\n')));return()=>disposers.forEach(dispose=>dispose());
}
export async function showNativeDrafts(page:Page,projects:MobileProjects,open:(project:ShaderProject,pass:CodeId)=>void){
  await projects.ready();const content=body(),error=text(''),items=await projects.archive.drafts();content.addChild(error);if(!items.length)content.addChild(text(t('暂无可恢复草稿')));const modal=overlay(page,'恢复草稿',content);
  for(const item of items){content.addChild(text(item.name+' · '+new Date(item.modifiedAt).toLocaleString()+' · '+PASS_LABELS[item.pass]));const button=action('恢复到编辑器',async()=>{const draft=await projects.restoreDraft(item.id);if(!draft)throw Error(t('草稿不存在。'));modal.close();await modal.closed;open(draft.project,draft.pass);},error);button.accessibilityIdentifier='restore-draft-'+item.id;content.addChild(button);}
}
export async function showNativeTrash(page:Page,projects:MobileProjects,refresh:()=>Promise<void>){
  await projects.ready();const content=body(),error=text(''),items=await projects.archive.trash();content.addChild(error);if(!items.length)content.addChild(text(t('回收站为空')));overlay(page,'回收站',content);
  for(const item of items){const row=body();row.addChild(text(item.name+' · '+new Date(item.deletedAt).toLocaleString()));row.addChild(action('恢复作品',async()=>{await projects.archive.recover(item.id);content.removeChild(row);await refresh();},error));content.addChild(row);}
}
export async function reviewNativeConversion(page:Page,app:ShaderApplication,plan:LanguageConversion):Promise<boolean>{
  const content=body(),error=text(''),footer=new GridLayout();footer.columns='*,8,*';content.addChild(error);const dispose=comparison(content,plan.before,plan.after,plan.from,plan.to);content.addChild(text(t('应用前自动创建检查点，可使用撤销恢复原代码与语言。')));let applied=false;const modal=overlay(page,'预览语言转换',content,()=>{dispose();if(!applied)app.cancelLanguageConversion(plan);},footer);
  modal.page.accessibilityIdentifier='shader-conversion-preview';
  const apply=action('应用转换',async()=>{applied=await app.applyLanguageConversion(plan);if(applied)modal.close();else error.text=t('转换预览已失效，请重新转换。');},error);apply.id=apply.accessibilityIdentifier='conversion-apply';footer.addChild(apply);const cancel=action('取消',()=>modal.close(),error);GridLayout.setColumn(cancel,2);footer.addChild(cancel);await modal.closed;return applied;
}
export async function showNativeHistory(page:Page,projects:MobileProjects,app:ShaderApplication,changed:()=>void){
  await projects.ready();const owner={id:app.state.project.id,session:app.state.session},content=body(),error=text('');content.addChild(error);content.addChild(text(t('保留最近 30 个保存或检查点版本；恢复后需手动保存。')));const entries=await projects.archive.history(owner.id);if(!entries.length)content.addChild(text(t('保存作品或应用语言转换后，这里会出现版本。')));const modal=overlay(page,'版本历史',content);
  for(const entry of entries){const labels={saved:'手动保存','before-conversion':'转换前检查点','before-restore':'恢复前检查点','draft-checkpoint':'草稿接续检查点'};
    const choice=action(new Date(entry.createdAt).toLocaleString()+' · '+t(labels[entry.reason]),async()=>{
      const project=await projects.archive.loadVersion(owner.id,entry.id);if(!modal.page.isLoaded)return;if(app.state.session!==owner.session)throw Error(t('作品已切换，请重新打开版本历史。'));
      const preview=body(),failure=text(''),footer=new StackLayout();preview.addChild(failure);preview.addChild(text(t('恢复会还原此版本的全部代码、通道与素材。')));const pass=codeTabs(project).includes(app.state.activePass)?app.state.activePass:'image',dispose=comparison(preview,sourceOf(app.state.project,pass),sourceOf(project,pass),languageOf(app.state.project,pass),languageOf(project,pass));const detail=overlay(modal.page,'预览历史版本',preview,dispose,footer);detail.page.accessibilityIdentifier='shader-history-preview';
      const restore=action('恢复此版本',async()=>{const revision=app.state.revision;if(owner.session!==app.state.session)throw Error(t('作品已切换，请重新打开版本历史。'));await projects.checkpoint(app.snapshot(),'before-restore',app.state.activePass);if(owner.session!==app.state.session||revision!==app.state.revision)throw Error(t('作品已修改，请重新选择历史版本。'));project.updatedAt=new Date().toISOString();app.restoreSnapshot(project);if(!codeTabs(project).includes(app.state.activePass))app.dispatch({type:'pass.select',pass:'image'});await app.saveDraft();changed();detail.close();await detail.closed;modal.close();},failure);restore.id=restore.accessibilityIdentifier='history-restore';footer.addChild(restore);
    },error);choice.id=choice.accessibilityIdentifier='history-version-'+entry.id;content.addChild(choice);
  }
  return modal;
}
