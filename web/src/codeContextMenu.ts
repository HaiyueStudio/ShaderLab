import type {Extension} from '@codemirror/state';
import {ViewPlugin,EditorView} from '@codemirror/view';
import {isolateHistory} from '@codemirror/commands';
import type {HYContextMenu,HYContextMenuSelectDetail} from '@haiyue/ui';
import type {ShaderLanguage} from './model.js';
import {shaderFormatEdits} from '../../shared/dist/domain/shaderFormatting.js';
import {t,onLocaleChange} from '../../shared/dist/views/i18n.js';

export function shaderCodeMenu(language:()=>ShaderLanguage):Extension{
  const format=(view:EditorView)=>{
    if(view.state.readOnly)return false;
    const changes=shaderFormatEdits(view.state.doc.toString(),language());
    if(changes.length)view.dispatch({changes,annotations:isolateHistory.of('full'),userEvent:'input.format'});
    view.focus();return true;
  };
  const menu=ViewPlugin.fromClass(class {
    readonly element=document.createElement('hy-context-menu') as HYContextMenu;
    private abort:AbortController|undefined;
    private observer:MutationObserver;
    private off:()=>void;
    constructor(readonly view:EditorView){
      this.element.className='shader-code-menu';
      this.element.addEventListener('item-select',event=>{if((event as CustomEvent<HYContextMenuSelectDetail>).detail.value==='format')format(this.view);this.close();});
      this.observer=new MutationObserver(()=>{if(!this.element.hasAttribute('open'))this.abort?.abort();});
      this.observer.observe(this.element,{attributes:true,attributeFilter:['open']});
      this.off=onLocaleChange(()=>{if(this.element.hasAttribute('open'))this.items();});
    }
    private items(){this.element.items=[{value:'format',label:t('格式化代码'),disabled:this.view.state.readOnly||!this.view.state.doc.toString().trim()}];this.element.setAttribute('aria-label',t('代码操作'));}
    open(x:number,y:number){
      this.close();for(const other of document.querySelectorAll<HYContextMenu>('hy-context-menu.shader-code-menu[open]'))other.close();
      const layer=this.view.dom.closest('dialog[open]')??document.body;if(this.element.parentElement!==layer)layer.append(this.element);
      this.items();this.element.openAt(x,y);this.abort=new AbortController();const signal=this.abort.signal;
      for(const name of ['scroll','resize','hashchange'])window.addEventListener(name,()=>this.close(),{capture:true,signal});
      document.addEventListener('keydown',event=>{if(event.key==='Escape'){this.close();this.view.focus();}else if(event.key==='Tab')this.close();},{capture:true,signal});
    }
    close(){this.element.close();this.abort?.abort();this.abort=undefined;}
    destroy(){this.close();this.observer.disconnect();this.off();this.element.remove();}
  },{eventHandlers:{
    contextmenu(event){if(this.view.state.readOnly)return false;event.preventDefault();const bounds=this.view.dom.getBoundingClientRect();this.open(event.clientX||bounds.left+20,event.clientY||bounds.top+20);return true;},
    keydown(event){if(event.altKey&&event.shiftKey&&!event.ctrlKey&&!event.metaKey&&(event.code==='KeyF'||event.key.toLowerCase()==='f')){event.preventDefault();return format(this.view);}if(event.key!=='ContextMenu'&&!(event.shiftKey&&event.key==='F10'))return false;event.preventDefault();const cursor=this.view.coordsAtPos(this.view.state.selection.main.head),bounds=this.view.dom.getBoundingClientRect();this.open(cursor?.left??bounds.left+20,cursor?.bottom??bounds.top+20);return true;},
  }});
  return menu;
}
