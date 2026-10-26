import type { HYStore, HYUIEvent } from '@haiyue/ui/core';
import { ShaderApplication, selectors } from '../application/application.js';
import type { ShaderApplicationState } from '../application/state.js';
import { PREVIEW_SCALES, type PreviewScale } from '../domain/model.js';
import { getLocale, onLocaleChange, type Locale } from './i18n.js';

/** Host mechanisms only. Document commands and their ordering live here. */
export interface ShaderEditorPorts {
  ensurePreview(): Promise<unknown>;
  flushEditor(): void;
  previewModeChanged(): void;
  playbackChanged(action:'play'|'step'|'reset'): void;
  compiled(): void;
  exportProject(): void | Promise<unknown>;
}
export interface ShaderEditorViewState {
  readonly locale:Locale;
  readonly application: ShaderApplicationState;
  readonly name: string;
  readonly composing: boolean;
  readonly informationOpen: boolean;
  readonly message: string;
}

/** One controller per editor session, shared by every page fragment/backend. */
export class ShaderEditorController implements HYStore<ShaderEditorViewState, HYUIEvent> {
  private current: ShaderEditorViewState;
  private readonly listeners = new Set<() => void>();
  private readonly unlisten: () => void;
  private readonly unlistenLocale:()=>void;
  private depth = 0;
  private pending = false;
  private dead = false;
  private liveName=false;
  constructor(readonly application: ShaderApplication, private readonly ports: ShaderEditorPorts) {
    this.current = { locale:getLocale(),application: application.state, name: application.state.project.name, composing: false, informationOpen: false, message: '' };
    this.unlistenLocale=onLocaleChange(()=>{this.current={...this.current,locale:getLocale()};this.notify();});
    this.unlisten = application.subscribe(() => {
      const previous = this.current.application, next = application.state;
      const opened = previous.session !== next.session;
      this.current = { ...this.current, application: next,
        ...(previous.revision !== next.revision ? { message: '' } : {}),
        ...(opened || !this.liveName&&previous.project.name !== next.project.name ? { name: next.project.name } : {}),
        ...(opened ? { composing: false, informationOpen: false, message: '' } : {}) };
      this.notify();
    });
  }
  getSnapshot() { return this.current; }
  get diagnostics() { return { subscriptions: this.listeners.size, disposed: this.dead }; }
  subscribe<T>(select: (state: ShaderEditorViewState) => T, notify: (value: T) => void, equal: (a:T,b:T)=>boolean = Object.is) {
    let value = select(this.current);
    const changed = () => { const next = select(this.current); if (!equal(value, next)) { value = next; notify(next); } };
    this.listeners.add(changed); return () => { this.listeners.delete(changed); };
  }
  private notify() {
    if (this.dead) return;
    if (this.depth) { this.pending = true; return; }
    for (const listener of [...this.listeners]) if (this.listeners.has(listener)) listener();
  }
  transaction(run: () => void) {
    if (this.dead) return;
    this.depth++;
    try { run(); } finally { if (!--this.depth && this.pending) { this.pending = false; this.notify(); } }
  }
  private update(patch: Partial<ShaderEditorViewState>) { if (!this.dead) { this.current = { ...this.current, ...patch }; this.notify(); } }
  report(message: string) { this.update({ message }); }
  private persistLiveName(){this.liveName=true;try{this.application.dispatch({type:'project.rename',name:this.current.name.trim()||'Untitled shader'});}finally{this.liveName=false;}}
  private flush() {
    if (this.dead) throw Error('编辑页面已关闭。');
    if (this.current.composing) throw Error('请先确认输入法候选，再保存或运行。');
    this.transaction(() => {
      const name=this.current.name.trim() || 'Untitled shader';
      this.update({name});
      this.application.dispatch({ type: 'project.rename', name });
      this.ports.flushEditor();
    });
  }
  flushEdits(){this.flush();}
  async compile(): Promise<boolean> {
    this.flush();
    return this.compileFlushed();
  }
  private async compileFlushed(): Promise<boolean> {
    const { session, revision } = this.application.state;
    await this.ports.ensurePreview();
    // Initialization may complete after another project/edit or after this page exits.
    if (this.dead || session !== this.application.state.session || revision !== this.application.state.revision) return false;
    const accepted = await this.application.compile();
    if (!this.dead && session === this.application.state.session) this.ports.compiled();
    return accepted;
  }
  async save(): Promise<boolean> {
    this.flush(); const session = this.application.state.session;
    const saved = await this.application.save();
    if (!this.dead && session === this.application.state.session) this.report(saved
      ? (selectors.dirty(this.application.state) ? '已保存；仍有新的修改' : '作品已保存') : '已取消保存');
    return saved;
  }
  async exportProject(): Promise<void> { this.flush(); await this.ports.exportProject(); }
  async scale(value: string): Promise<boolean> {
    const scale = Number(value);
    if (!PREVIEW_SCALES.includes(scale as PreviewScale)) throw Error('不支持的预览比例。');
    this.flush(); this.application.dispatch({ type: 'preview.scale', value: scale as PreviewScale });
    return this.compileFlushed();
  }
  private mode(value: string) {
    if (!['canvas','sphere','box','torus'].includes(value)) throw Error('不支持的预览模式。');
    this.application.dispatch({ type:'preview.mode', mode:value==='canvas'?'canvas':'scene', mesh:value==='canvas'?this.application.state.project.preview.mesh:value as 'sphere'|'box'|'torus' });
    this.ports.previewModeChanged();
  }
  /** All backend events use the same author keys and command rules. */
  dispatch(event: HYUIEvent): void {
    if (this.dead) return;
    const session = this.application.state.session;
    const execute = async () => {
      const name = event.key === '/shader-project/name/field';
      if (name) {
        if (event.type === 'compositionStart') this.update({ composing: true });
        else if (event.type === 'compositionEnd') {this.update({ composing: false });this.persistLiveName();}
        else if (event.type === 'valueChange') {this.update({ name: String(event.value), message: '' });if(!this.current.composing)this.persistLiveName();}
        else if (event.type === 'commit') { this.update({ name: String(event.value) }); this.flush(); }
        return;
      }
      if (event.type === 'cancel' && event.key === '/shader-project/information') { this.update({ informationOpen: false }); return; }
      if (event.type === 'commit' && event.key.endsWith('/scale')) { await this.scale(String(event.value)); return; }
      if (event.type === 'commit' && event.key.endsWith('/mode')) { this.mode(String(event.value)); return; }
      if (event.type !== 'activate') return;
      const key = event.key.split('/').at(-1);
      if (key === 'information') this.update({ informationOpen: true });
      else if (key === 'close') this.update({ informationOpen: false });
      else if (key === 'save') await this.save();
      else if (key === 'export') await this.exportProject();
      else if (key === 'run') await this.compile();
      else if (key === 'play') { this.application.dispatch({ type:'preview.play',value:!this.application.state.playing }); this.ports.playbackChanged('play'); }
      else if (key === 'step' || key === 'reset') { this.application.dispatch({ type:key==='step'?'preview.step':'preview.reset' }); this.ports.playbackChanged(key); }
    };
    void execute().catch(error => { if (!this.dead && session === this.application.state.session) this.report(error instanceof Error ? error.message : String(error)); });
  }
  dispose() { if (this.dead) return; this.dead = true; this.unlisten();this.unlistenLocale(); this.listeners.clear(); }
}

export function saveMessage(state: ShaderEditorViewState): string {
  const app = state.application;
  if (app.save.status === 'saving') return '正在保存…';
  if (app.save.status === 'failed') return '保存失败：' + app.save.error;
  if (state.message) return state.message;
  return selectors.dirty(app) || state.name !== app.project.name ? '有未保存的修改' : '无未保存修改';
}

export function saveIndicator(state: ShaderEditorViewState): 'modified' | 'saved' {
  return selectors.dirty(state.application) || state.name !== state.application.project.name || state.application.save.status === 'failed' ? 'modified' : 'saved';
}

/** Routine persistence state lives on the active code tab; keep actionable feedback visible. */
export function saveFeedback(state: ShaderEditorViewState): string {
  if (state.application.save.status === 'saving' || state.application.save.status === 'failed') return saveMessage(state);
  if(state.application.draft.status==='failed')return'草稿保存失败：'+state.application.draft.error;
  return ['作品已保存','已保存；仍有新的修改'].includes(state.message) ? '' : state.message;
}
