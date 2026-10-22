import { Application, GridLayout, LayoutBase, isIOS, type View } from '@nativescript/core';
import { HYNativeScriptRenderer } from '@haiyue/native/ui';
import type { HYPlatformView } from '@haiyue/ui/core';
import { ShaderEditorController, type ShaderEditorPorts } from '../../../shared/dist/views/editor-controller.js';
import { mountShaderEditorPart, shaderTheme, type ShaderEditorPart } from '../../../shared/dist/views/editor-page.js';
import type { ShaderApplication } from '../../../shared/dist/application/application.js';

/** Explicit rollback/measurement switch. Never changes project or command semantics. */
export function useSharedEditor():boolean {
  if(isIOS) return !Array.from({length:NSProcessInfo.processInfo.arguments.count},(_,i)=>String(NSProcessInfo.processInfo.arguments.objectAtIndex(i))).includes('--shaderlab-ui=legacy');
  return Application.android.startActivity?.getIntent()?.getStringExtra('shaderlab-ui')!=='legacy';
}
export class NativeSharedEditor {
  readonly controller:ShaderEditorController;
  private readonly owned:{renderer:HYNativeScriptRenderer;page:ReturnType<typeof mountShaderEditorPart>}[]=[];
  private readonly mounts={preview:0,editor:0};
  constructor(application:ShaderApplication,ports:ShaderEditorPorts) { this.controller=new ShaderEditorController(application,ports); }
  mount(part:ShaderEditorPart,host:GridLayout,view?:View,onVisible?:(value:boolean)=>void):void {
    const factory=(parent:LayoutBase):HYPlatformView=>({
      mount:()=>{if(!view)throw Error('Missing ShaderLab PlatformView');if(view.parent instanceof LayoutBase)view.parent.removeChild(view);parent.addChild(view);if(part==='preview'||part==='editor')this.mounts[part]++;},
      update:()=>{},layout:()=>{},visible:value=>onVisible?.(value),focus:()=>{view?.focus();},
      dispose:()=>{if(view?.parent instanceof LayoutBase)view.parent.removeChild(view);},
    });
    const renderer=new HYNativeScriptRenderer(host,{safeArea:'host',keyboardDismissLabel:'完成',selectionCancelLabel:'取消',environment:{theme:shaderTheme},platformViews:{'gpu-preview':factory,'code-editor':factory},onError:error=>this.controller.report(error.message)});
    const page=mountShaderEditorPart(renderer,this.controller,part);this.owned.push({renderer,page});

  }
  suspend(){for(const {page} of this.owned)page.suspend();}
  resume(){for(const {page} of this.owned)page.resume();}
  diagnostics(){return {...this.mounts,controller:this.controller.diagnostics,parts:this.owned.map(({renderer,page})=>({status:page.status,...renderer.diagnostics}))};}
  dispose(){for(const {page} of this.owned)page.dispose();this.controller.dispose();}
}
