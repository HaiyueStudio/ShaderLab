import { HYWebRenderer, definePortableWebComponents } from '@haiyue/ui/adapters/web';
import type { HYPlatformView } from '@haiyue/ui/core';
import { ShaderEditorController, type ShaderEditorPorts } from '../../../shared/dist/views/editor-controller.js';
import { mountShaderEditorPart, shaderTheme, type ShaderEditorPart } from '../../../shared/dist/views/editor-page.js';
import type { ShaderApplication } from '../../../shared/dist/application/application.js';

export function mountWebSharedEditor(application: ShaderApplication, ports: ShaderEditorPorts, special: {
  canvas: HTMLCanvasElement; editor: HTMLElement; focusEditor():void; measureEditor():void; previewVisible(value:boolean):void;
}) {
  definePortableWebComponents();
  const controller = new ShaderEditorController(application,ports);
  const owned: {renderer:HYWebRenderer;page:ReturnType<typeof mountShaderEditorPart>;host:HTMLElement}[]=[];
  let surfaceMounts=0,editorMounts=0;
  const mount = (part:ShaderEditorPart,host:HTMLElement) => {
    const slot = (element:HTMLElement,kind:'preview'|'editor'):HYPlatformView => ({
      mount() { element.append(kind==='preview'?special.canvas:special.editor); if(kind==='preview')surfaceMounts++;else editorMounts++; },
      update() {}, layout() { if(kind==='editor')special.measureEditor(); },
      visible(value) { if(kind==='preview')special.previewVisible(value); },
      focus() { if(kind==='editor')special.focusEditor();else special.canvas.focus(); },
      dispose() { (kind==='preview'?special.canvas:special.editor).remove(); },
    });
    const renderer=new HYWebRenderer(host,{environment:{theme:shaderTheme},platformViews:{'gpu-preview':element=>slot(element,'preview'),'code-editor':element=>slot(element,'editor')},onError:error=>controller.report(error.message)});
    const page=mountShaderEditorPart(renderer,controller,part);owned.push({renderer,page,host});
  };
  const project=document.createElement('div');project.className='shared-project';
  document.querySelector('.project-bar')!.prepend(project);mount('project',project);
  const back=document.getElementById('back-gallery');if(back)project.querySelector('[data-hy-key="/shader-project/actions"]')!.prepend(back);
  const toolbar=document.createElement('div');toolbar.className='shared-toolbar';
  document.getElementById('time-label')!.before(toolbar);mount('toolbar',toolbar);
  for(const control of toolbar.querySelectorAll<HTMLElement>('[data-hy-kind="Button"], [data-hy-kind="Select"]'))control.shadowRoot?.querySelector('button,select')?.setAttribute('part','playback-control');
  const preview=document.createElement('div');preview.className='shared-preview-slot';
  special.canvas.before(preview);mount('preview',preview);
  const editor=document.getElementById('code-editor')!;mount('editor',editor);
  for(const id of ['project-name','project-name-label','save-state','save-project','export-project','compile','play-pause','reset-time','step-frame','preview-scale','mode-canvas','mode-scene','mesh-select'])document.getElementById(id)!.hidden=true;
  for(const host of [project,toolbar])for(const button of host.querySelectorAll<HTMLElement>('[data-hy-kind="Button"]'))button.title=button.dataset.hyKey?.endsWith('/play')?'暂停 / 播放':button.getAttribute('aria-label')??'';
  document.getElementById('workspace')!.classList.add('shared-editor');
  let visible=true;
  const visibility=()=>{ for(const {page} of owned) document.hidden||!visible?page.suspend():page.resume(); };
  document.addEventListener('visibilitychange',visibility);
  return {controller,
    setVisible(value:boolean){visible=value;visibility();},
    diagnostics:()=>({surfaceMounts,editorMounts,controller:controller.diagnostics,parts:owned.map(({renderer,page})=>({status:page.status,...renderer.diagnostics}))}),
    dispose(){document.removeEventListener('visibilitychange',visibility);for(const {page} of owned)page.dispose();controller.dispose();},
  };
}
