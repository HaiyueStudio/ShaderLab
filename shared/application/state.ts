import type { Channel, CodeId, PreviewMesh, PreviewMode, PreviewScale, RenderPassId, ShaderDiagnostic, ShaderLanguage, ShaderProject } from '../domain/model.js';
import { codeTabs } from '../domain/model.js';
import { languageOf, sourceOf } from '../domain/sourceLanguage.js';

export interface ShaderApplicationState {
  readonly project: Readonly<ShaderProject>;
  readonly session: string;
  readonly revision: number;
  readonly savedRevision: number;
  readonly activePass: CodeId;
  readonly route: 'gallery' | 'editor';
  readonly pane: 'preview' | 'code' | 'channels';
  readonly playing: boolean;
  readonly save: { readonly status: 'idle' | 'saving' | 'failed'; readonly request?: number; readonly error?: string };
  readonly draft:{readonly status:'idle'|'saving'|'saved'|'failed';readonly request?:number;readonly revision?:number;readonly error?:string};
  readonly compile: {
    readonly status: 'idle' | 'compiling' | 'ready' | 'failed'; readonly request?: number;
    readonly acceptedRevision?: number; readonly diagnostics: readonly ShaderDiagnostic[];
  };
}
export type ShaderAction =
  | { type: 'project.open'; project: ShaderProject; fork: boolean }
  | { type: 'project.rename'; name: string }
  | { type: 'source.edit'; pass: CodeId; source: string; language: ShaderLanguage }
  | { type: 'preview.scale'; value: PreviewScale }
  | { type: 'preview.mode'; mode: PreviewMode; mesh: PreviewMesh }
  | { type: 'preview.play'; value: boolean }
  | { type: 'preview.step' | 'preview.reset' | 'compile.request' | 'save.request' | 'draft.request' | 'project.pick' | 'session.dispose' }
  | { type: 'pass.select' | 'pass.add'; pass: CodeId }
  | { type: 'pass.enable'; pass: RenderPassId; enabled: boolean }
  | { type: 'channel.set'; pass: RenderPassId; index: number; channel: Channel }
  | { type: 'pane.select'; pane: ShaderApplicationState['pane'] }
  | { type: 'route.select'; route: ShaderApplicationState['route'] };

export const selectors = {
  dirty: (state: ShaderApplicationState) => state.revision !== state.savedRevision,
  source: (state: ShaderApplicationState) => sourceOf(state.project, state.activePass),
  language: (state: ShaderApplicationState) => languageOf(state.project, state.activePass),
  tabs: (state: ShaderApplicationState) => codeTabs(state.project),
  compiled: (state: ShaderApplicationState) => state.compile.acceptedRevision === state.revision,
};
