import type {CodeId,ShaderLanguage} from '../domain/model.js';
export interface SourceState {source:string;language:ShaderLanguage;variants?:Partial<Record<ShaderLanguage,string>>}
type Source=SourceState;
interface History {undo:Source[];redo:Source[];at:number;grouped:boolean}
/** One bounded history per Pass, including atomic language changes. */
export class SourceHistory {
  private records=new Map<CodeId,History>();
  private record(pass:CodeId){let value=this.records.get(pass);if(!value){value={undo:[],redo:[],at:0,grouped:false};this.records.set(pass,value);}return value;}
  push(pass:CodeId,before:Source,group:boolean,at:number){
    const h=this.record(pass);if(!(group&&h.grouped&&at-h.at<750&&h.undo.at(-1)?.language===before.language))h.undo.push(before);
    h.redo=[];h.at=at;h.grouped=group;while(h.undo.length>80||h.undo.reduce((n,s)=>n+s.source.length,0)>2_000_000)h.undo.shift();
  }
  canUndo(pass:CodeId){return!!this.record(pass).undo.length;}canRedo(pass:CodeId){return!!this.record(pass).redo.length;}
  undo(pass:CodeId,current:Source){const h=this.record(pass),old=h.undo.pop();if(old){h.redo.push(current);h.grouped=false;}return old;}
  redo(pass:CodeId,current:Source){const h=this.record(pass),next=h.redo.pop();if(next){h.undo.push(current);h.grouped=false;}return next;}
  clear(){this.records.clear();}
}
