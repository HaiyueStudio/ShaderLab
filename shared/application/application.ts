import { codeOf, codeTabs, createProject, LIMITS, PASS_IDS, PREVIEW_SCALES, passOf, revealCodeTab, validateProject, type CodeId, type ShaderLanguage, type ShaderProject, type ShaderDiagnostic } from '../domain/model.js';
import { cloneValue } from '../domain/values.js';
import { languageOf, sourceOf, defaultGlsl, defaultHlsl } from '../domain/sourceLanguage.js';
import type { ShaderEnvironment, ShaderRequest, ShaderServices } from '../ports/services.js';
import { Cancellation } from './cancellation.js';
import { selectors, type ShaderAction, type ShaderApplicationState } from './state.js';

/** One state owner for the existing editors and the future portable views. */
export class ShaderApplication {
  private current: ShaderApplicationState;
  private listeners = new Set<() => void>();
  private requests = new Set<Cancellation>();
  private compileRequest: Cancellation | undefined;
  private openRequest: Cancellation | undefined;
  private sequence = 0;
  private languageSequence = 0;
  private dead = false;
  private writes: Promise<unknown> = Promise.resolve();
  private services: Partial<Pick<ShaderServices, 'projects' | 'preview' | 'convertSource'>> = {};

  constructor(readonly environment: ShaderEnvironment, project = createProject('Untitled shader', environment)) {
    this.current = { project: validateProject(project), session: environment.ids.next(), revision: 1, savedRevision: 0,
      activePass: 'image', route: 'gallery', pane: 'preview', playing: true,
      save: { status: 'idle' }, compile: { status: 'idle', diagnostics: [] } };
  }
  get state(): ShaderApplicationState { return this.current; }
  get disposed() { return this.dead; }
  connect(services: Partial<Pick<ShaderServices, 'projects' | 'preview' | 'convertSource'>>) { this.assertLive(); this.services = { ...this.services, ...services }; }
  subscribe(listener: () => void) {
    this.assertLive(); this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }
  select<T>(selector: (state: ShaderApplicationState) => T, listener: (value: T) => void, equal = Object.is) {
    let value = selector(this.current);
    return this.subscribe(() => { const next = selector(this.current); if (!equal(value, next)) { value = next; listener(next); } });
  }
  snapshot(): ShaderProject { return cloneValue(this.current.project); }
  private assertLive() { if (this.dead) throw new Error('编辑会话已关闭。'); }
  private update(patch: Partial<ShaderApplicationState>) {
    this.current = { ...this.current, ...patch };
    for (const listener of [...this.listeners]) { if (this.dead) break; if (this.listeners.has(listener)) listener(); }
  }
  private edit(project: ShaderProject) {
    this.assertLive(); this.compileRequest?.abort(); this.openRequest?.abort();
    this.update({ project, revision: this.current.revision + 1,
      compile: { ...this.current.compile, status: 'idle' } });
  }
  replace(project: ShaderProject) { this.edit(validateProject(project)); }
  change(change: (project: ShaderProject) => void) {
    this.assertLive(); const next = this.snapshot(); change(next);
    next.updatedAt = this.environment.clock.nowISO(); this.replace(next);
  }
  markSaved(revision = this.current.revision, session = this.current.session) {
    if (this.dead || session !== this.current.session) return;
    this.update({ savedRevision: Math.max(this.current.savedRevision, Math.min(revision, this.current.revision)) });
  }
  /** Metadata-only runtime changes (sound volume/duration) preserve a valid graph. */
  acknowledgeCompiled(revision: number) {
    if (!this.dead && revision === this.current.revision)
      this.update({ compile: { ...this.current.compile, status: 'ready', acceptedRevision: revision } });
  }
  setSource(pass: CodeId, source: string, language: ShaderLanguage) {
    this.assertLive();
    if (!['common', 'sound', ...PASS_IDS].includes(pass)) throw new Error('Pass 不存在。');
    if (typeof source !== 'string' || source.length > LIMITS.code) throw new Error('单个 Pass 代码不能超过 100 KB。');
    if (!['wgsl', 'glsl', 'hlsl'].includes(language)) throw new Error('不支持的代码语言。');
    const previous = this.current.project;
    if (sourceOf(previous, pass) === source && languageOf(previous, pass) === language) return;
    // Preserve immutable asset identities: typing must not copy 48 MB projects.
    const next = { ...previous, editorLanguages: { ...previous.editorLanguages, [pass]: language }, updatedAt: this.environment.clock.nowISO() };
    revealCodeTab(next, pass);
    if (pass === 'common') { if (language === 'glsl') next.commonGlsl = source; else if (language === 'hlsl') next.commonHlsl = source; else next.common = source; }
    else {
      const target = { ...passOf(next, pass), [language === 'wgsl' ? 'code' : language]: source };
      if (target.id === 'sound') next.sound = target;
      else next.passes = next.passes.map(item => item.id === pass ? target : item);
    }
    this.edit(next);
  }
  /** Legacy automation code.set deliberately removes alternate authoring sources. */
  setCode(pass: CodeId, code: string) {
    if (codeOf(this.current.project, pass) === code) return;
    if (typeof code !== 'string' || code.length > LIMITS.code) throw new Error('单个 Pass 代码不能超过 100 KB。');
    this.change(project => {
      project.editorLanguages = { ...project.editorLanguages, [pass]: 'wgsl' }; revealCodeTab(project, pass);
      if (pass === 'common') { project.common = code; delete project.commonGlsl; delete project.commonHlsl; }
      else { const target = passOf(project, pass); target.code = code; delete target.glsl; delete target.hlsl; }
    });
  }
  /** Explicit recovery of an older draft; UI language selection uses conversion. */
  restoreLanguageDraft(pass: CodeId, language: ShaderLanguage) {
    if (languageOf(this.current.project, pass) === language) return;
    const project = this.current.project;
    const source = language === 'wgsl' ? codeOf(project, pass) : language === 'hlsl'
      ? (pass === 'common' ? project.commonHlsl ?? '' : passOf(project as ShaderProject, pass).hlsl ?? defaultHlsl(pass))
      : (pass === 'common' ? project.commonGlsl ?? '' : passOf(project as ShaderProject, pass).glsl ?? defaultGlsl(pass));
    this.setSource(pass, source, language);
  }
  /** Convert the captured revision, then commit source and language together. */
  async switchLanguage(pass: CodeId, language: ShaderLanguage): Promise<boolean> {
    this.assertLive();
    if (!['wgsl', 'glsl', 'hlsl'].includes(language)) throw new Error('不支持的代码语言。');
    const sequence = ++this.languageSequence;
    if (languageOf(this.current.project, pass) === language) return false;
    if (!this.services.convertSource) throw new Error('代码转换服务尚未就绪。');
    const { session, revision } = this.current;
    const code = await this.services.convertSource(this.snapshot(), pass, language);
    if (this.dead || sequence !== this.languageSequence || session !== this.current.session) return false;
    if (revision !== this.current.revision) throw new Error('转换期间代码或工程已更改，请重新选择语言。');
    this.setSource(pass, code, language);
    return true;
  }
  dispatch(action: ShaderAction): void | Promise<boolean> {
    if (action.type === 'session.dispose') { this.dispose(); return; }
    this.assertLive();
    switch (action.type) {
      case 'project.open': {
        const project = validateProject(action.project);
        if (action.fork) { project.id = this.environment.ids.next(); project.updatedAt = this.environment.clock.nowISO(); }
        const session = this.environment.ids.next();
        this.cancelRequests();
        this.update({ project, session, revision: this.current.revision + 1, savedRevision: this.current.revision + 1,
          activePass: 'image', route: 'editor', pane: 'preview', save: { status: 'idle' }, compile: { status: 'idle', diagnostics: [] } });
        return;
      }
      case 'project.rename': if (action.name !== this.current.project.name) this.change(p => { p.name = action.name; }); return;
      case 'source.edit': this.setSource(action.pass, action.source, action.language); return;
      case 'preview.scale': {
        if (action.value === this.current.project.preview.scale) return;
        if (!(PREVIEW_SCALES as readonly number[]).includes(action.value)) throw new Error('预览设置无效。');
        const updatedAt = this.environment.clock.nowISO();
        if (typeof updatedAt !== 'string' || !Number.isFinite(Date.parse(updatedAt))) throw new Error('保存日期无效。');
        // The owned project is already valid. Scaling cannot alter its asset or
        // pass graph; keep those immutable branches instead of cloning and
        // revalidating all shader sources/textures on every picker operation.
        const previous = this.current.project;
        this.edit({ ...previous, preview: { ...previous.preview, scale: action.value }, updatedAt });
        return;
      }
      case 'preview.mode': if (action.mode !== this.current.project.preview.mode || action.mesh !== this.current.project.preview.mesh) this.change(p => { p.preview.mode = action.mode; p.preview.mesh = action.mesh; }); return;
      case 'pass.select':
        if (!codeTabs(this.current.project).includes(action.pass)) throw new Error('页签尚未添加。');
        if (action.pass !== this.current.activePass) this.update({ activePass: action.pass }); return;
      case 'pass.add':
        if (!codeTabs(this.current.project).includes(action.pass) || (action.pass !== 'common' && !passOf(this.current.project as ShaderProject, action.pass).enabled))
          this.change(p => { revealCodeTab(p, action.pass); if (action.pass !== 'common') passOf(p, action.pass).enabled = true; });
        this.dispatch({ type: 'pass.select', pass: action.pass }); return;
      case 'pass.enable': this.change(p => {
        if (action.pass === 'image' && !action.enabled) throw new Error('Image 必须启用。');
        revealCodeTab(p, action.pass); passOf(p, action.pass).enabled = action.enabled;
        if (!action.enabled) for (const pass of p.passes) pass.channels = pass.channels.map(c => c.kind === 'buffer' && c.pass === action.pass ? { kind: 'none' } : c);
      }); return;
      case 'channel.set':
        if (!Number.isInteger(action.index) || action.index < 0 || action.index > 3) throw new Error('通道索引必须为 0–3。');
        this.change(p => {
          revealCodeTab(p, action.pass);
          if (action.channel.kind === 'buffer') { revealCodeTab(p, action.channel.pass); passOf(p, action.channel.pass).enabled = true; }
          if (action.channel.kind === 'camera') {
            const facing = action.channel.facing;
            for (const pass of p.passes) for (const channel of pass.channels) if (channel.kind === 'camera') channel.facing = facing;
          }
          passOf(p, action.pass).channels[action.index] = cloneValue(action.channel);
        }); return;
      case 'preview.play': this.preview().play(action.value); this.update({ playing: action.value }); return;
      case 'preview.step': this.preview().step(); this.update({ playing: false }); return;
      case 'preview.reset': this.preview().reset(); return;
      case 'pane.select': if (action.pane !== this.current.pane) this.update({ pane: action.pane }); return;
      case 'route.select': if (action.route !== this.current.route) this.update({ route: action.route }); return;
      case 'compile.request': return this.compile();
      case 'save.request': return this.save();
      case 'draft.request': return this.saveDraft();
      case 'project.pick': return this.pick();
    }
  }
  private preview() { if (!this.services.preview) throw new Error('GPU 尚未就绪；请先打开编辑页。'); return this.services.preview; }
  private projects() { if (!this.services.projects) throw new Error('工程存储尚未连接。'); return this.services.projects; }
  private request() {
    const signal = new Cancellation(); this.requests.add(signal);
    const context: ShaderRequest = { session: this.current.session, revision: this.current.revision,
      activePass: this.current.activePass, request: ++this.sequence, signal };
    return { signal, context };
  }
  private owns(context: ShaderRequest, revision = false) {
    return !this.dead && !context.signal.aborted && context.session === this.current.session && (!revision || context.revision === this.current.revision);
  }
  async compile(): Promise<boolean> { return (await this.prepareCompilation()).commit(); }
  /** Two phases also serve EditorPlatform's synchronous transaction commit/rollback. */
  async prepareCompilation(): Promise<{ commit(): boolean; release(): void }> {
    this.assertLive(); const preview = this.preview();
    this.compileRequest?.abort(); const { context, signal } = this.request(); this.compileRequest = signal;
    const snapshot = this.snapshot();
    this.update({ compile: { ...this.current.compile, status: 'compiling', request: context.request } });
    let unsubscribe = () => {};
    let handle: string | undefined, diagnostics: readonly ShaderDiagnostic[] = [], finished = false;
    const release = () => {
      if (finished) return; finished = true; unsubscribe();
      if (handle !== undefined) preview.release(handle);
      this.requests.delete(signal); if (this.compileRequest === signal) this.compileRequest = undefined;
    };
    try {
      const result = await preview.prepare(snapshot, context); handle = result.handle; diagnostics = result.diagnostics;
    } catch (error) { diagnostics = diagnosticErrors(error, context.activePass); }
    unsubscribe = signal.onAbort(release);
    return {
      release: () => {
        if (!finished && this.owns(context, true) && this.current.compile.request === context.request)
          this.update({ compile: { ...this.current.compile, status: 'idle' } });
        signal.abort(); release();
      },
      commit: () => {
        if (finished) return false;
        try {
          if (!this.owns(context, true)) return false;
          if (handle === undefined || diagnostics.some(d => d.severity === 'error')) {
            this.update({ compile: { ...this.current.compile, status: 'failed', diagnostics } }); return false;
          }
          preview.commit(handle, context); handle = undefined;
          preview.play(this.current.playing);
          this.update({ compile: { status: 'ready', request: context.request, acceptedRevision: context.revision, diagnostics } });
          return true;
        } catch (error) {
          if (this.owns(context, true)) this.update({ compile: { ...this.current.compile, status: 'failed', diagnostics: diagnosticErrors(error, context.activePass) } });
          return false;
        } finally { release(); }
      },
    };
  }
  private enqueue<T>(operation: () => Promise<T>) {
    const job = this.writes.then(operation, operation); this.writes = job.catch(() => {}); return job;
  }
  whenWritesSettled() { return this.writes; }
  async save(): Promise<boolean> {
    this.assertLive(); const projects = this.projects(), snapshot = this.snapshot(), { context, signal } = this.request();
    this.update({ save: { status: 'saving', request: context.request } });
    try {
      const saved = await this.enqueue(() => this.owns(context) ? projects.save(snapshot, context) : Promise.resolve('cancelled' as const));
      if (!this.owns(context)) return false;
      if (saved === 'saved') this.markSaved(context.revision, context.session);
      if (this.current.save.request === context.request) this.update({ save: { status: 'idle' } });
      return saved === 'saved';
    } catch (error) {
      if (!this.owns(context)) return false;
      if (this.current.save.request === context.request) this.update({ save: { status: 'failed', request: context.request, error: String(error) } });
      throw error;
    } finally { this.requests.delete(signal); }
  }
  async saveDraft(): Promise<boolean> {
    this.assertLive(); const projects = this.projects(), snapshot = this.snapshot(), { context, signal } = this.request();
    try {
      return await this.enqueue(async () => { if (!this.owns(context)) return false; await projects.saveDraft(snapshot, context); return this.owns(context); });
    } catch (error) { if (!this.owns(context)) return false; throw error; }
    finally { this.requests.delete(signal); }
  }
  async pick(fork = false): Promise<boolean> {
    this.assertLive(); const projects = this.projects(); this.openRequest?.abort();
    const { context, signal } = this.request(); this.openRequest = signal;
    try {
      const project = await projects.open(context);
      if (!project || !this.owns(context, true)) return false;
      this.dispatch({ type: 'project.open', project, fork }); return true;
    } catch (error) { if (!this.owns(context, true)) return false; throw error; }
    finally { this.requests.delete(signal); if (this.openRequest === signal) this.openRequest = undefined; }
  }
  private cancelRequests() { for (const signal of this.requests) signal.abort(); this.requests.clear(); }
  dispose() { if (this.dead) return; this.dead = true; this.cancelRequests(); this.listeners.clear(); }
}

function diagnosticErrors(error: unknown, pass: CodeId): readonly ShaderDiagnostic[] {
  if (error && typeof error === 'object' && 'diagnostics' in error && Array.isArray(error.diagnostics)) return error.diagnostics;
  return [{ pass, severity: 'error', message: String(error), line: 1, column: 1 }];
}
export { selectors };
