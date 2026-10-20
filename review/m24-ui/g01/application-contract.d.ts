/** G01 product-owned contract, implemented by G02; not a Native/UI package API. */
import type {ShaderProject, CodeId, ShaderDiagnostic} from '../../../web/dist/model.js';
export interface ShaderCancelSignal {readonly aborted: boolean; onAbort(callback:()=>void):()=>void;}
export interface ShaderRequest {readonly session:string; readonly revision:number; readonly request:number; readonly signal:ShaderCancelSignal;}
export interface ShaderApplicationState {
  readonly project: Readonly<ShaderProject>;
  readonly session: string; readonly revision: number; readonly savedRevision: number;
  readonly activePass: CodeId; readonly route:'gallery'|'editor'; readonly pane:'preview'|'code'|'channels';
  readonly playing:boolean;
  readonly save: {readonly status:'idle'|'saving'|'failed';readonly request?:number;readonly error?:string};
  readonly compile: {readonly status:'idle'|'compiling'|'ready'|'failed';readonly request?:number;readonly acceptedRevision?:number;readonly diagnostics:readonly ShaderDiagnostic[]};
}
export type ShaderAction =
  | {readonly type:'project.open';readonly project:ShaderProject;readonly fork:boolean}
  | {readonly type:'project.rename';readonly name:string}
  | {readonly type:'source.edit';readonly pass:CodeId;readonly source:string;readonly language:'wgsl'|'glsl'}
  | {readonly type:'preview.scale';readonly value:1|0.75|0.5|0.25}
  | {readonly type:'preview.mode';readonly mode:'canvas'|'scene';readonly mesh:'sphere'|'box'|'torus'}
  | {readonly type:'preview.play';readonly value:boolean}
  | {readonly type:'preview.step'|'preview.reset'|'compile.request'|'save.request'|'session.dispose'}
  | {readonly type:'pass.select';readonly pass:CodeId}
  | {readonly type:'pane.select';readonly pane:ShaderApplicationState['pane']};
// Async result actions are internal and carry ShaderRequest identity; UI cannot forge them.
export interface ShaderServices {
  readonly ids: {next():string}; readonly clock:{nowISO():string};
  readonly projects: {
    open(context:ShaderRequest):Promise<ShaderProject|null>;
    save(snapshot:Readonly<ShaderProject>,context:ShaderRequest):Promise<'saved'|'cancelled'>;
    saveDraft(snapshot:Readonly<ShaderProject>,context:ShaderRequest):Promise<void>;
  };
  readonly preview: {
    prepare(snapshot:Readonly<ShaderProject>,context:ShaderRequest):Promise<{readonly handle:string;readonly diagnostics:readonly ShaderDiagnostic[]}>;
    commit(handle:string,context:ShaderRequest):Promise<void>;
    release(handle:string):void;
    play(value:boolean):void;step():void;reset():void;
  };
}
