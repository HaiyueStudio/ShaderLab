import {ContentView,type TextView} from '@nativescript/core';
export type EditorCommand='undo'|'redo'|'find'|'replace'|'save'|'run';
const bindings:[string,UIKeyModifierFlags,EditorCommand][]=[];
@NativeClass()
class ShaderEditorKeyView extends UIView {
  static ObjCExposedMethods={shaderCommand:{returns:interop.types.void,params:[UIKeyCommand]}};
  owner:EditorKeyboardHost|null=null;
  // @ts-expect-error NativeScript maps Objective-C readonly properties to getters.
  get keyCommands():NSArray<UIKeyCommand>{return this.owner?.commands??NSArray.arrayWithArray([]);}
  shaderCommand(command:UIKeyCommand){if(this.owner){const index=this.owner.commands.indexOfObject(command);const binding=bindings[index];if(binding)this.owner.execute(binding[2]);}}
}
/** The parent is in UITextView's responder chain. Preserve the text view and its
 * NativeScript delegate; physical shortcuts and toolbar use the same commands. */
export class EditorKeyboardHost extends ContentView {
  readonly commands:NSArray<UIKeyCommand>;
  constructor(_editor:TextView,readonly execute:(command:EditorCommand)=>void){
    super();if(!bindings.length)for(const modifier of[UIKeyModifierFlags.Command,UIKeyModifierFlags.Control])bindings.push(['z',modifier,'undo'],['z',modifier|UIKeyModifierFlags.Shift,'redo'],['y',modifier,'redo'],['f',modifier,'find'],['s',modifier,'save'],['\r',modifier,'run']);
    if(!bindings.some(b=>b[2]==='replace'))bindings.push(['f',UIKeyModifierFlags.Command|UIKeyModifierFlags.Alternate,'replace'],['h',UIKeyModifierFlags.Control,'replace']);
    this.commands=NSArray.arrayWithArray(bindings.map(([key,flags])=>{const c=UIKeyCommand.keyCommandWithInputModifierFlagsAction(key,flags,'shaderCommand');c.wantsPriorityOverSystemBehavior=true;return c;}));
  }
  createNativeView(){return ShaderEditorKeyView.new();}
  initNativeView(){super.initNativeView();(this.nativeViewProtected as ShaderEditorKeyView).owner=this;}
  disposeNativeView(){(this.nativeViewProtected as ShaderEditorKeyView).owner=null;super.disposeNativeView();}
}
