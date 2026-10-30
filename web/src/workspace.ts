import {SHADER_LANGUAGES,LANGUAGE_LABELS,type ShaderLanguage as SupportedShaderLanguage} from './model.js';
import { EditorPlatform, createEditorAutomationAPI } from '@haiyue/editor-platform';
import type { EditorDocumentAdapter, EditorJsonValue, EditorOperationSchema } from '@haiyue/editor-plugin-sdk';
import {  codeTabs, revealCodeTab, passOf, parseProject, validateProject, LIMITS, PASS_IDS, CUBE_FACES, type CubeFace, type CodeId, type ShaderLanguage, type RenderPassId, type Channel, type PreviewMode, type PreviewMesh, type ShaderProject, type ShaderDiagnostic } from './model.js';
import { BUILTIN_TEXTURES } from './builtinTextures.js';
import { uploadVideo, uploadImage, uploadCubemap, type FaceUpload } from './textureUpload.js';
import { projectTranslationOptions, refreshProjectGlsl } from './glslProject.js';
import { languageOf } from './sourceLanguage.js';
import { translateGlsl } from './glsl.js';
import { translateWgsl } from './wgsl.js';
import { translateHlsl } from './hlsl.js';
import { createSourceConverter } from './sourceConversion.js';
import { exportShadertoy, exportShadertoyPass, translateProjectWgsl } from './shadertoyExport.js';
import type { ShaderRuntime } from './runtime.js';

import { ShaderApplication } from '../../shared/dist/application/application.js';
import { preparedPreview } from '../../shared/dist/ports/preparedPreview.js';
import type { ShaderEnvironment } from '../../shared/dist/ports/services.js';

export class ShaderDocument implements EditorDocumentAdapter<ShaderProject> {
  readonly application: ShaderApplication;
  private readonly documentId: string;
  constructor(environment: ShaderEnvironment = { ids: { next: () => crypto.randomUUID() }, clock: { nowISO: () => new Date().toISOString() } }) {
    this.application = new ShaderApplication(environment); this.documentId = this.application.state.session;
  }
  get identity() { return { id: this.documentId, kind: 'haiyue.shader', name: this.state.name }; }
  get state() { return this.application.state.project; }
  get revision() { return this.application.state.revision; }
  get savedRevision() { return this.application.state.savedRevision; }
  get dirty() { return this.revision !== this.savedRevision; }
  serialize() { return this.application.snapshot(); }
  replace(project: ShaderProject) { this.application.replace(project); }
  change(change: (project: ShaderProject) => void) { this.application.change(change); }
  setCode(pass: CodeId, code: string) { this.application.setCode(pass, code); }
  setSource(pass: CodeId, code: string, language: ShaderLanguage) { this.application.setSource(pass, code, language); }
  markSaved(revision = this.revision) { this.application.markSaved(revision); }
  subscribe(listener: () => void) { return { dispose: this.application.subscribe(listener) }; }
  dispose() { this.application.dispose(); }
}
type Params = { readonly [key: string]: EditorJsonValue };
export class ShaderWorkspace {
  readonly platform = new EditorPlatform();
  readonly api = createEditorAutomationAPI(this.platform);
  readonly document = new ShaderDocument();
  runtime: ShaderRuntime | undefined;
  get application() { return this.document.application; }
  get diagnostics(): ShaderDiagnostic[] { return [...this.application.state.compile.diagnostics]; }
  get compiledRevision() { return this.application.state.compile.acceptedRevision ?? 0; }
  constructor() {
    this.application.connect({ convertSource: createSourceConverter({ wgsl: translateWgsl, hlsl: translateHlsl }), preview: preparedPreview(() => {
      const runtime = this.renderer();
      return { prepare: project => runtime.prepare(project), commit: value => runtime.commit(value), release: value => runtime.releasePrepared(value),
        play: value => runtime.setPlaying(value), step: () => runtime.step(), reset: () => runtime.reset() };
    }) });
  }
  onCompiled: (() => void) | undefined;
  onOpen: (() => void) | undefined;
  private lastRevision = 0;
  setLanguage(pass: CodeId, language: ShaderLanguage) { return this.application.switchLanguage(pass, language); }
  applyGlsl(pass: CodeId, source: string) {
    const next = this.document.serialize();
    const result = translateGlsl(source, projectTranslationOptions(next, pass));
    if (result.code === null) throw new Error(result.diagnostics.map(d => `${d.source === 'common' ? 'Common ' : ''}${d.line}:${d.column} ${d.message}`).join('\n'));
    revealCodeTab(next, pass); next.editorLanguages = { ...next.editorLanguages, [pass]: 'glsl' };
    if (pass === 'common') { next.commonGlsl = source; next.common = result.code; }
    else { const target = passOf(next, pass); target.glsl = source; target.code = result.code; }
    const diagnostics = refreshProjectGlsl(next);
    next.updatedAt = new Date().toISOString(); this.document.replace(next);
    return { ...result, diagnostics };
  }
  configuringSound = false;
  configureSound(settings: { duration?: number; volume?: number }) {
    const compiled = this.compiledRevision === this.document.revision;
    this.configuringSound = true;
    try { this.document.change(next => { if (settings.duration !== undefined) next.sound.duration = settings.duration; if (settings.volume !== undefined) next.sound.volume = settings.volume; }); }
    finally { this.configuringSound = false; }
    this.runtime?.setSoundVolume(this.document.state.sound.volume);
    this.runtime?.setSoundExportDuration(this.document.state.sound.duration);
    if (compiled) { this.application.acknowledgeCompiled(this.document.revision); this.onCompiled?.(); }
  }
  async start() {
    await this.platform.start({ schemaVersion: 1, id: 'haiyue.shader-editor', displayName: 'Haiyue Shader Editor', version: '0.1.0', requiredPlugins: [] });
    this.platform.documents.attach(this.document);
    this.document.subscribe(() => { if (this.lastRevision !== this.document.revision) { this.runtime?.invalidate(); this.lastRevision = this.document.revision; } });
    this.registerOperations();
  }
  open(project: ShaderProject, fork = false) { void this.runtime?.setSoundAudible(false); this.application.dispatch({ type: 'project.open', project, fork }); this.onOpen?.(); }
  private renderer() { if (!this.runtime) throw new Error('GPU 尚未就绪；请先打开编辑页。'); return this.runtime; }
  addPass(pass: CodeId) { this.application.dispatch({ type: 'pass.add', pass }); }
  setChannel(pass: RenderPassId, index: number, channel: Channel) { this.application.dispatch({ type: 'channel.set', pass, index, channel }); }
  setEnabled(pass: RenderPassId, enabled: boolean) {
    if (pass === 'sound' && !enabled) void this.runtime?.setSoundAudible(false);
    this.application.dispatch({ type: 'pass.enable', pass, enabled });
  }
  async compile() { const compiled = await this.application.compile(); this.onCompiled?.(); return compiled; }
  preview(mode: PreviewMode, mesh: PreviewMesh) {
    this.application.dispatch({ type: 'preview.mode', mode, mesh });
    this.runtime?.setMode(mode); this.runtime?.setMesh(mesh);
  }
  private registerOperations() {
    const empty = { type: 'object', properties: {} } as const;
    const pass = { type: 'string', enum: [...PASS_IDS, 'sound'] } as const;
    const short = { type: 'string', minLength: 1, maxLength: 160 } as const;
    const code = { type: 'string', maxLength: LIMITS.code } as const;
    const json = (value: unknown) => value as EditorJsonValue;
    const register = <T>(id: string, input: EditorOperationSchema, access: 'read' | 'write', prepare: (params: Params) => T | Promise<T>, commit: (value: T) => EditorJsonValue, rollback?: (value: T | undefined) => void) => {
      this.platform.operations.register({ ownerId: 'shader.core', descriptor: { id: `shader.${id}`, version: 1, title: id, target: 'document', documentKinds: ['haiyue.shader'], access, input, output: { type: 'json' } }, prepare, commit, rollback: value => rollback?.(value) });
    };
    register('query', empty, 'read', () => null, () => json({ project: { id: this.document.state.id, name: this.document.state.name }, revision: this.document.revision, compiledRevision: this.compiledRevision,
      tabs: codeTabs(this.document.state), editorLanguages: Object.fromEntries(['common', 'sound', ...PASS_IDS].map(id => [id, languageOf(this.document.state, id as CodeId)])), common: this.document.state.common, commonGlsl: this.document.state.commonGlsl ?? null, commonHlsl: this.document.state.commonHlsl ?? null, sound: this.document.state.sound, passes: this.document.state.passes, assets: this.document.state.assets.map(asset => ({ id: asset.id, name: asset.name, kind: asset.kind ?? 'image' })), preview: this.document.state.preview, diagnostics: this.diagnostics, runtime: this.runtime?.status() ?? null }));
    register('source.set', { type: 'object', properties: { pass: { type: 'string', enum: ['common', 'sound', ...PASS_IDS] }, code, language: { type: 'string', enum: [...SHADER_LANGUAGES] } }, required: ['pass', 'code', 'language'] }, 'write', p => p, p => { this.document.setSource(p.pass as CodeId, p.code as string, p.language as ShaderLanguage); return { revision: this.document.revision }; });
    register('code.set', { type: 'object', properties: { pass: { type: 'string', enum: ['common', 'sound', ...PASS_IDS] }, code }, required: ['pass', 'code'] }, 'write', p => p, p => { this.document.setCode(p.pass as CodeId, p.code as string); return { revision: this.document.revision }; });
    register('pass.add', { type: 'object', properties: { pass: { type: 'string', enum: ['common', 'sound', ...PASS_IDS.filter(id => id !== 'image')] } }, required: ['pass'] }, 'write', p => p, p => { this.addPass(p.pass as CodeId); return { revision: this.document.revision }; });
    register('pass.enable', { type: 'object', properties: { pass, enabled: { type: 'boolean' } }, required: ['pass', 'enabled'] }, 'write', p => p, p => { this.setEnabled(p.pass as RenderPassId, p.enabled as boolean); return { revision: this.document.revision }; });
    register('channel.set', { type: 'object', properties: { pass, index: { type: 'integer', minimum: 0, maximum: 3 }, channel: { type: 'json' } }, required: ['pass', 'index', 'channel'] }, 'write', p => p,
      p => { this.setChannel(p.pass as RenderPassId, p.index as number, p.channel as Channel); return { revision: this.document.revision }; });
    register('preview.set', { type: 'object', properties: { mode: { type: 'string', enum: ['canvas', 'scene'] }, mesh: { type: 'string', enum: ['sphere', 'box', 'torus'] } }, required: ['mode', 'mesh'] }, 'write', p => p,
      p => { this.preview(p.mode as PreviewMode, p.mesh as PreviewMesh); return { revision: this.document.revision }; });
    register('playback.set', { type: 'object', properties: { playing: { type: 'boolean' } }, required: ['playing'] }, 'write', p => p, p => { this.application.dispatch({ type: 'preview.play', value: p.playing as boolean }); return json(this.renderer().status()); });
    register('playback.reset', empty, 'write', () => null, () => { this.application.dispatch({ type: 'preview.reset' }); return json(this.renderer().status()); });
    register('playback.step', empty, 'write', () => null, () => { this.application.dispatch({ type: 'preview.step' }); return json(this.renderer().status()); });
    register('camera.reset', empty, 'write', () => null, () => { this.renderer().resetCamera(); return json(this.renderer().status()); });
    register('project.export', empty, 'read', () => new TextEncoder().encode(JSON.stringify(this.document.serialize(), null, 2)), bytes => json(this.platform.resources.put(bytes)));
    register('project.open', { type: 'object', properties: { resourceId: short }, required: ['resourceId'] }, 'write', p => parseProject(new TextDecoder('utf-8', { fatal: true }).decode(this.platform.resources.read(p.resourceId as string))), p => { this.open(p); return { projectId: p.id, revision: this.document.revision }; });
    const glslPass = { type: 'string', enum: ['common', 'sound', ...PASS_IDS] } as const;
    register('wgsl.translate', { type: 'object', properties: { code, pass: { type: 'string', enum: ['sound', ...PASS_IDS] } }, required: ['code'] }, 'read', p => {
      const project = this.document.serialize(), id = (p.pass ?? 'image') as RenderPassId;
      return translateProjectWgsl(project, p.code as string, id);
    }, result => json(result));
    register('shadertoy.export', { type: 'object', properties: { pass: { type: 'string', enum: ['sound', ...PASS_IDS] } } }, 'read', async p => {
      const project = this.document.serialize();
      return p.pass ? exportShadertoyPass(project, p.pass as RenderPassId) : exportShadertoy(project);
    }, result => json(result));
    register('glsl.translate', { type: 'object', properties: { code, pass: glslPass }, required: ['code'] }, 'read', p => translateGlsl(p.code as string,
      p.pass ? projectTranslationOptions(this.document.state as ShaderProject, p.pass as CodeId) : this.document.state.commonGlsl === undefined || languageOf(this.document.state, 'common') !== 'glsl' ? {} : { common: this.document.state.commonGlsl }), result => json(result));
    register('glsl.apply', { type: 'object', properties: { code, pass: glslPass }, required: ['code', 'pass'] }, 'write', p => p,
      p => json(this.applyGlsl(p.pass as CodeId, p.code as string)));
    register('texture.upload', { type: 'object', properties: { resourceId: short, name: short, mimeType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] } }, required: ['resourceId', 'name', 'mimeType'] }, 'write', async p => {
      const asset = await uploadImage(p.name as string, p.mimeType as string, this.platform.resources.read(p.resourceId as string));
      const next = this.document.serialize(); next.assets.push(asset); return { next: validateProject(next), id: asset.id };
    }, ({ next, id }) => { this.document.replace(next); return { assetId: id, revision: this.document.revision }; });
    register('textures.list', empty, 'read', () => null, () => json(BUILTIN_TEXTURES));
    register('video.upload', { type: 'object', properties: { resourceId: short, name: short, mimeType: { type: 'string', enum: ['video/mp4', 'video/webm'] } }, required: ['resourceId', 'name', 'mimeType'] }, 'write', async p => {
      const asset = await uploadVideo(p.name as string, p.mimeType as string, this.platform.resources.read(p.resourceId as string));
      const next = this.document.serialize(); next.assets.push(asset); return { next: validateProject(next), id: asset.id };
    }, ({ next, id }) => { this.document.replace(next); return { assetId: id, revision: this.document.revision }; });
    const face = { type: 'object', properties: { resourceId: short, mimeType: { type: 'string', enum: ['image/png', 'image/jpeg', 'image/webp'] } }, required: ['resourceId', 'mimeType'] } as const;
    register('cubemap.upload', { type: 'object', properties: { name: short, faces: { type: 'object', properties: Object.fromEntries(CUBE_FACES.map(key => [key, face])), required: CUBE_FACES } }, required: ['name', 'faces'] }, 'write', async p => {
      const asset = await uploadCubemap(p.name as string, p.faces as unknown as Record<CubeFace, FaceUpload>, id => this.platform.resources.read(id));
      const next = this.document.serialize(); next.assets.push(asset); return { next: validateProject(next), id: asset.id };
    }, ({ next, id }) => { this.document.replace(next); return { assetId: id, revision: this.document.revision }; });
    register('compile', empty, 'write', () => this.application.prepareCompilation(), prepared => {
      const compiled = prepared.commit(); this.onCompiled?.();
      return json({ compiled, revision: this.compiledRevision, diagnostics: this.diagnostics });
    }, prepared => prepared?.release());
    register('sound.configure', { type: 'object', properties: { duration: { type: 'number', minimum: 1, maximum: 120 }, volume: { type: 'number', minimum: 0, maximum: 1 } } }, 'write', p => p, p => {
      this.configureSound({ ...(typeof p.duration === 'number' ? { duration: p.duration } : {}), ...(typeof p.volume === 'number' ? { volume: p.volume } : {}) }); return json(this.document.state.sound);
    });
    register('sound.audible', { type: 'object', properties: { enabled: { type: 'boolean' } }, required: ['enabled'] }, 'write', p => p, p => {
      if (p.enabled) throw new Error('开启音频请点击编辑器“开启声音”；API 可设置音量、暂停和导出 WAV。');
      void this.renderer().setSoundAudible(false); return json(this.renderer().status().sound);
    });
    register('sound.export', empty, 'read', () => this.renderer().exportSound(this.document.state.sound.duration), bytes => json({ ...this.platform.resources.put(bytes), mimeType: 'audio/wav' }));
    register('image.read', empty, 'read', async () => this.renderer().readImage(), result => json({ ...this.platform.resources.put(result.pixels), width: result.width, height: result.height, format: 'rgba8unorm', origin: 'top-left' }));
  }
  async dispose() { this.application.dispose(); await this.platform.dispose(); await this.runtime?.dispose(); }
}
