import {ContentView,type TextView} from '@nativescript/core';
export type EditorCommand='undo'|'redo'|'find'|'replace'|'save'|'run';
export class EditorKeyboardHost extends ContentView {
  private listener:android.view.View.OnKeyListener|undefined;
  constructor(private readonly editor:TextView,readonly execute:(command:EditorCommand)=>void){super();editor.on('loaded',this.attach);editor.on('unloaded',this.detach);}
  private attach=()=>{const view=this.editor.android as android.widget.EditText|undefined;if(!view)return;
    this.listener=new android.view.View.OnKeyListener({onKey:(_view,key,event)=>{if(event.getAction()!==android.view.KeyEvent.ACTION_DOWN||!(event.isCtrlPressed()||event.isMetaPressed()))return false;const K=android.view.KeyEvent;let command:EditorCommand|undefined;if(key===K.KEYCODE_Z)command=event.isShiftPressed()?'redo':'undo';else if(key===K.KEYCODE_Y)command='redo';else if(key===K.KEYCODE_F)command='find';else if(key===K.KEYCODE_H)command='replace';else if(key===K.KEYCODE_S)command='save';else if(key===K.KEYCODE_ENTER)command='run';if(!command)return false;if(!event.getRepeatCount()||command==='undo'||command==='redo')this.execute(command);return true;}});view.setOnKeyListener(this.listener);
  };
  private detach=()=>{(this.editor.android as android.widget.EditText|undefined)?.setOnKeyListener(null as unknown as android.view.View.OnKeyListener);this.listener=undefined;};
  disposeNativeView(){this.detach();this.editor.off('loaded',this.attach);this.editor.off('unloaded',this.detach);super.disposeNativeView();}
}
