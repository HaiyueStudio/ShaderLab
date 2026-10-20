import { hyNode, hyKey, type HYRenderer, type HYNode, type HYComponentKind, type HYComponentProps } from '@haiyue/ui/core';
import { HYPage, type HYBinding } from '@haiyue/ui/portable';
import { PREVIEW_SCALES } from '../domain/model.js';
import { ShaderEditorController, saveMessage, type ShaderEditorViewState } from './editor-controller.js';

export type ShaderEditorPart = 'project' | 'toolbar' | 'preview' | 'editor';
export { shaderTheme } from './presentation.js';
import { shaderControlLayout, shaderPreviewModes } from './presentation.js';
const scales = PREVIEW_SCALES.map(value => ({value:String(value),label: `${value*100}%`}));
const modes = shaderPreviewModes;
const controlLayout = shaderControlLayout;
/** Read primitive dependencies on each notification; allocate props only when they change. */
function derive<V,P>(read:(state:ShaderEditorViewState)=>V,create:(value:V)=>P):(state:ShaderEditorViewState)=>P {
  let initialized=false,last:V,result:P;
  return state=>{const value=read(state);if(!initialized||!Object.is(last,value)){initialized=true;last=value;result=create(value);}return result;};
}

/** The exact same fragments and selectors are mounted by Web and NativeScript. */
export function mountShaderEditorPart(renderer: HYRenderer, controller: ShaderEditorController, part: ShaderEditorPart): HYPage {
  const root = `shader-${part}`, bindings: HYBinding<ShaderEditorViewState>[] = [];
  const initial = controller.getSnapshot();
  function bind<K extends HYComponentKind>(kind:K,path:readonly string[],select:(s:ShaderEditorViewState)=>HYComponentProps[K],children?:readonly HYNode[],slots?:Readonly<Record<string,readonly HYNode[]>>):HYNode {
    bindings.push({key:hyKey(root,...path),kind,select} as HYBinding<ShaderEditorViewState>);
    return hyNode(kind,path.at(-1)??root,select(initial),{...(children?{children}:{}),...(slots?{slots}:{}),source:{file:'shared/views/editor-page.ts'}});
  }
  // Closed dialog controls consume their initial snapshot until opened. Changing
  // the toolbar must not rebuild an invisible settings form on every selection.
  const settings = (s:ShaderEditorViewState) => s.informationOpen?s:initial;
  const scale = (path:readonly string[]) => {
    // Preset choices have fixed props. Build their immutable protocol snapshots
    // once, retaining the shared options/layout across subsequent selections.
    const base=hyNode('Select','scale',{value:String(PREVIEW_SCALES[0]),options:scales,layout:{...controlLayout,width:96,minWidth:96,maxWidth:96},a11y:{label:'渲染分辨率'}}).props;
    const presets=new Map(PREVIEW_SCALES.map(value=>[String(value),hyNode('Select','scale',{...base,value:String(value)}).props]));
    return bind('Select',path,s=>presets.get(String((path[0]==='information'?settings(s):s).application.project.preview.scale))!);
  };
  const mode = (path:readonly string[]) => bind('Select',path,derive(s=>settings(s).application.project.preview.mode==='canvas'?'canvas':settings(s).application.project.preview.mesh,value=>({value,options:modes,layout:{...controlLayout,width:120},a11y:{label:'预览模式'}})));
  let tree: HYNode;
  if (part === 'project') {
    tree=hyNode('Column',root,{layout:{gap:4,padding:[4,8,4,8]}},{children:[
      hyNode('FormGroup','name',{label:'作品名称'},{children:[bind('TextInput',['name','field'],derive(s=>s.name,value=>({value,placeholder:'作品名称',layout:controlLayout,a11y:{label:'作品名称'}})))]}),
      hyNode('Row','actions',{layout:{gap:8}},{children:[
        bind('Button',['actions','save'],derive(s=>(s.application.save.status==='saving'?1:0)+(s.composing?2:0),flags=>({text:flags&1?'正在保存…':'保存作品',busy:!!(flags&1),disabled:!!(flags&2),layout:controlLayout}))),
        hyNode('Button','information',{text:'工程设置',layout:controlLayout}),
      ]}),
      bind('Text',['status'],derive(saveMessage,text=>({text,wrap:true}))),
      bind('Dialog',['information'],derive(s=>s.informationOpen,open=>({open,title:'工程设置',dismissible:true,layout:{gap:12}})),[
        bind('Text',['information','identity'],derive(s=>`${settings(s).application.project.name}\n工程 ${settings(s).application.project.id}`,text=>({text,wrap:true}))),
        hyNode('Row','scale-row',{layout:{gap:8,align:'stretch'}},{children:[hyNode('Text','label',{text:'渲染分辨率',layout:{grow:1,align:'center'}}),scale(['information','scale-row','scale'])]}),
        hyNode('Row','mode-row',{layout:{gap:8,align:'stretch'}},{children:[hyNode('Text','label',{text:'预览模式',layout:{grow:1,align:'center'}}),mode(['information','mode-row','mode'])]}),
      ],{footer:[hyNode('Button','close',{text:'完成',layout:{...controlLayout,align:'end'}})]}),
    ]});
  } else if (part === 'toolbar') {
    tree=hyNode('Scroll',root,{axis:'horizontal',layout:{height:56}},{children:[hyNode('Row','controls',{layout:{gap:6,padding:[4,8,4,8],align:'center'}},{children:[
      bind('Button',['controls','run'],derive(s=>(s.application.compile.status==='compiling'?1:0)+(s.composing?2:0),flags=>({text:flags&1?'编译中':'运行',busy:!!(flags&1),disabled:!!(flags&2),layout:{...controlLayout,width:80}}))),
      bind('Button',['controls','play'],derive(s=>s.application.playing,playing=>({text:playing?'暂停':'播放',layout:{...controlLayout,width:64}}))),scale(['controls','scale']),
      hyNode('Button','reset',{text:'重置',layout:{...controlLayout,width:64}}),hyNode('Button','step',{text:'单帧',layout:{...controlLayout,width:64}}),
    ]})]});
  } else {
    tree=bind('PlatformView',[],derive(s=>part==='preview'?s.application.session:`${s.application.session}:${s.application.activePass}`,resourceId=>({slot:part==='preview'?'gpu-preview':'code-editor',resourceId,layout:{grow:1,clip:true},a11y:{label:part==='preview'?'Shader 渲染画布':'代码编辑器'}})));
    // A standalone fragment's root has the same identity as the other fragments.
    tree={...tree,key:root};
  }
  const page=new HYPage(renderer,{onEvent:event=>controller.dispatch(event)});
  page.mount(tree);page.bind(controller,bindings);
  return page;
}
