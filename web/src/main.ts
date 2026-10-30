import {SHADER_LANGUAGES,LANGUAGE_LABELS,type ShaderLanguage as SupportedShaderLanguage} from './model.js';
import {createSourceConverter} from './sourceConversion.js';
import {normalizeExtendedSources} from './extendedSources.js';
import {receiveProject} from '../../shared/dist/domain/library.js';
import {installProductTools,installLibraryFilters,libraryCardActions} from './productTools.js';
import {installCreationTools} from './creationTools.js';
import {decodeShare} from '../../shared/dist/domain/sharing.js';
import {PracticePage} from './practicePage.js';
import {createRecoveryUI} from './recovery.js';
import { mountWebSharedEditor } from './platform/shared-editor.js';
import { preferences } from './preferences.js';
import { initializeSettings } from './settings.js';
import { t, onLocaleChange, getLocale } from '../../shared/dist/views/i18n.js';
import { preferredProject, preferredSource } from '../../shared/dist/domain/preferences.js';
import { shaderPreviewModes } from '../../shared/dist/views/presentation.js';
import { saveIndicator, saveMessage } from '../../shared/dist/views/editor-controller.js';
import type {} from '@haiyue/editor-app-kit';
import type { HYSelect, HYCheckbox, HYDropdown, HYDropdownSelectDetail, HYNotification } from '@haiyue/ui';
import { initializeUI } from './ui.js';
import { ShaderWorkspace } from './workspace.js';
import { ShaderRuntime } from './runtime.js';
import type { BufferPreview } from './bufferPreviews.js';
import { CodeEditor, GlslEditor, WgslPreview } from './codeEditor.js';
import { GalleryStore, type GalleryItem } from './storage.js';
import { examples } from './examples.js';
import { createProject, codeOf, codeTabs, passOf, parseProject, PASS_IDS, PASS_LABELS, PREVIEW_SCALES, LIMITS, CUBE_FACES, CUBE_FACE_LABELS, channelTypes, type CodeId, type ShaderLanguage, type PassId, type PreviewMode, type PreviewMesh, type PreviewScale, type ShaderProject } from './model.js';
import { BUILTIN_TEXTURES, builtinTexture, type BuiltinTextureId } from './builtinTextures.js';
import { TutorialPage } from './tutorialPage.js';
import { findTutorial } from './tutorialContent.js';
import { createCubeUploader } from './cubeUpload.js';
import { createChannelPicker, type ChannelTarget } from './channelPicker.js';
import { channelName } from '../../shared/dist/views/channel-catalog.js';
import { languageOf, sourceOf } from './sourceLanguage.js';
import { projectTranslationOptions } from './glslProject.js';
import { translateHlsl } from './hlsl.js';
import { projectHlslOptions } from './sourceProject.js';
import { translateGlsl } from './glsl.js';
import { translateWgsl } from './wgsl.js';
import { externalCommon, glslCommon } from './sourceCommon.js';
import { exportShadertoy, exportShadertoyPass } from './shadertoyExport.js';

const $ = <T extends HTMLElement = HTMLElement>(id: string) => document.getElementById(id) as T;
const disposeUI = initializeUI();
const notifications = document.createElement('hy-notification') as HYNotification;
document.body.append(notifications);
const sharedUIEnabled = new URLSearchParams(location.search).get('ui') !== 'legacy';
let sharedUI: ReturnType<typeof mountWebSharedEditor> | undefined;
let saveIndicatorOff = () => {};
$<HYSelect>('code-language').options = SHADER_LANGUAGES.map(value=>({value,label:LANGUAGE_LABELS[value]}));
$<HYCheckbox>('detect-language').checked = true;
$<HYSelect>('preview-scale').options = PREVIEW_SCALES.map(scale => ({ value: String(scale), label: scale * 100 + '%' }));
$<HYSelect>('sound-duration').options = [1, 4, 8, 16, 30, 60, 120].map(value => ({ value: String(value), label: `${value} 秒` }));
$<HYSelect>('sound-volume').options = [0, 0.1, 0.25, 0.5, 1].map(value => ({ value: String(value), label: `${value * 100}%` }));
$<HYSelect>('preview-mode').options = shaderPreviewModes.map(option=>({...option,label:t(option.label)}));
$<HYSelect>('mesh-select').options = [{ value: 'sphere', label: t('球体') }, { value: 'box', label: t('立方体') }, { value: 'torus', label: t('圆环') }];
const workspace = new ShaderWorkspace(), store = new GalleryStore(), samples = examples();
const app = workspace.application;
const createPreferred=()=>preferredProject(preferences().shaderLanguage,{ids:{next:()=>crypto.randomUUID()},clock:{nowISO:()=>new Date().toISOString()}});
const disposeSettings=initializeSettings(enabled=>workspace.runtime?.setMSAA(enabled));
const localeOff=onLocaleChange(()=>{controlSignature='';sharedHostState=undefined;sync();renderDiagnostics();renderGallery();channelPicker.localize();$('back-gallery').setAttribute('aria-label',t('返回 Gallery'));$<HYSelect>('preview-mode').options=shaderPreviewModes.map(option=>({...option,label:t(option.label)}));});
const uploadCube = createCubeUploader(workspace, async(pass,index)=>{const session=app.state.session;await compile();if(sharedUI&&session===app.state.session)channelPicker.open(pass,index);});
const tutorial = new TutorialPage(id => { setRoute('tutorial/' + id); $('tutorial-title').focus({ preventScroll: true }); $('tutorial-title').scrollIntoView({ block: 'start' }); }, project => { void run(() => open(project, true)); },id=>setRoute('practice/'+id));
const practice=new PracticePage(id=>setRoute(id?'practice/'+id:'practice'),project=>{void run(async()=>{await open(project);await save();});},id=>setRoute('tutorial/'+id));
const thumbnails = new Map<string, string>();
const thumbnailFailures = new Set<string>();
let exampleThumbnailJob: Promise<void> | undefined;
let saved: GalleryItem[] = [], opened = false, route = 'gallery', disposed = false;
let savedGalleryState:{items:GalleryItem[];query:string;locale:string;filter:string}|undefined;
let revision = 0, openedRevision = 0, openSequence = 0, autoTimer: ReturnType<typeof setTimeout> | undefined;
let runtimePromise: Promise<ShaderRuntime> | undefined, openPromise: Promise<void> = Promise.resolve();
let uploadTarget:ChannelTarget|undefined, translation: string | null = null;
let pendingImport: File | undefined;
let controlSignature = '', compileSequence = 0;
let editorReturnRoute = 'gallery';
let bufferPreviews: BufferPreview[] = [];
let drawerBufferPreviews:readonly BufferPreview[]=[];
const channelPicker=createChannelPicker({project:()=>workspace.document.state,session:()=>app.state.session,
  bind:async(target,channel)=>{assertChannelTarget(target);workspace.setChannel(target.pass,target.index,channel);await compile();},
  upload:beginChannelUpload,previews:previews=>{drawerBufferPreviews=previews;updateBufferPreviews();},
});
function assertChannelTarget(target:ChannelTarget){if(target.session!==app.state.session)throw Error('作品已切换，请重新选择通道。');}
function beginChannelUpload(target:ChannelTarget,kind:'image'|'video'|'cubemap'){
  assertChannelTarget(target);if(kind==='cubemap'){uploadCube(target.pass,target.index);return;}
  uploadTarget=target;$<HTMLInputElement>(kind==='video'?'video-input':'texture-input').click();
}
function updateBufferPreviews(){workspace.runtime?.setBufferPreviews(workspace.document.state.id,[...bufferPreviews,...drawerBufferPreviews]);}
const editor = new CodeEditor($('code-editor'), (pass, code, language,group) => { void run(() => app.setSource(pass,code,language,group)); }, () => { void run(compile); },{undo:()=>app.undoSource(),redo:()=>app.redoSource()});
let draftTimer:ReturnType<typeof setTimeout>|undefined;let draftSession='';
const recovery=createRecoveryUI({store,app,flush:()=>{if(opened)sharedUI?.controller.flushEdits();},open:async(project,pass)=>{await open(project);app.markModified();selectPass(pass);},openSaved:project=>open(project),refresh:async()=>{saved=await store.list();renderGallery();},changed:()=>{controlSignature='';sync();queueDraft();}});
function queueDraft(){if(!opened||disposed)return;const sameSession=draftSession===app.state.session;draftSession=app.state.session;if(!workspace.document.dirty&&!sameSession)return;if(draftTimer)clearTimeout(draftTimer);const session=app.state.session;draftTimer=setTimeout(()=>{draftTimer=undefined;if(session===app.state.session&&opened)void app.saveDraft().catch(error=>notice('草稿保存失败：'+String(error),true));},500);}
const generatedPreview = new WgslPreview($('generated-code'), '运行用 WGSL');
const shadertoyPreview = new WgslPreview($('shadertoy-code'), 'Shadertoy GLSL 导出预览', 'glsl');
let shadertoyBundle: Awaited<ReturnType<typeof exportShadertoy>> | undefined;
function renderShadertoyExport() {
  const result = shadertoyBundle?.passes.find(p => p.pass === $<HYSelect>('shadertoy-pass').value);
  shadertoyPreview.show(result?.code ?? '');
  $('shadertoy-message').textContent = !result ? '正在转换…' : result.code === null ? result.diagnostics.map(d => `${d.source === 'common' ? 'Common ' : ''}${d.line}:${d.column} ${d.message}`).join('\n') : result.warnings.join('\n');
  $('shadertoy-message').classList.toggle('error', result?.code === null);
  $('shadertoy-channels').replaceChildren();
  for (const channel of result?.channels ?? []) {
    const row = document.createElement('li'); row.textContent = `iChannel${channel.index} → ${channel.source}`; $('shadertoy-channels').append(row);
  }
  $<HTMLButtonElement>('copy-shadertoy').disabled = !result?.code;
  $<HTMLButtonElement>('download-shadertoy').disabled = !result?.code;
  $<HTMLButtonElement>('download-shadertoy-all').disabled = !shadertoyBundle || shadertoyBundle.passes.some(p => p.code === null);
  shadertoyPreview.view.requestMeasure();
}
async function showShadertoyExport() {
  const snapshot = workspace.document.serialize(), pass = app.state.activePass === 'common' ? 'image' : app.state.activePass;
  shadertoyBundle = undefined; renderShadertoyExport();
  $<HTMLDialogElement>('shadertoy-dialog').showModal();
  shadertoyBundle = await exportShadertoy(snapshot);
  if (!shadertoyBundle.passes.some(p => p.pass === pass)) shadertoyBundle.passes.push(await exportShadertoyPass(snapshot, pass));
  $<HYSelect>('shadertoy-pass').options = shadertoyBundle.passes.map(p => ({ value: p.pass, label: p.label + (p.code === null ? ' · 转换失败' : '') }));
  $<HYSelect>('shadertoy-pass').value = pass;
  renderShadertoyExport();
}
const wgslPreview = new WgslPreview($('glsl-result'));
const glslEditor = new GlslEditor($('glsl-source'), () => {
  translation = null; $<HTMLButtonElement>('apply-glsl').disabled = true;
  wgslPreview.show(''); $('glsl-messages').textContent = t('源码已修改，请重新翻译。');
  $('glsl-messages').classList.remove('error');
}, translateSource);

function translateSource() {
  const result = translateGlsl(glslEditor.value, projectTranslationOptions(workspace.document.state as ShaderProject, app.state.activePass)); translation = result.code; $<HTMLButtonElement>('apply-glsl').disabled = !translation;
  wgslPreview.show(result.code ?? '');
  $('glsl-messages').textContent = result.code ? result.warnings.join('\n') : result.diagnostics.map(d => `${d.source === 'common' ? 'Common ' : ''}${d.line}:${d.column} ${d.message}`).join('\n');
  $('glsl-messages').classList.toggle('error', !result.code);
}

function notice(message: string, error = false) { $('notice').hidden = false; $('notice').classList.toggle('error', error); $('notice-text').textContent = t(message); }
window.addEventListener('shaderlab-recovery-error',event=>notice((event as CustomEvent<string>).detail,true));
async function run(action: () => unknown | Promise<unknown>) { try { return await action(); } catch (error) { notice(error instanceof Error ? error.message : String(error), true); return undefined; } }
function button(label: string, action: () => unknown | Promise<unknown>, className = '') { const b = document.createElement('button'); b.textContent = t(label); b.className = className; b.onclick = () => { void run(action); }; return b; }
function bind(id: string, action: () => unknown | Promise<unknown>) { $(id).addEventListener('click', () => { void run(action); }); }
function download(bytes: BlobPart, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([bytes], { type })), a = document.createElement('a'); a.href = url; a.download = name; a.click(); setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
let readOnlyPayload='';const viewerSplits=new Map<HTMLElement,Record<string,string|null>>();
function clearReadOnly(){readOnlyPayload='';document.body.classList.remove('readonly-player');document.getElementById('viewer-copy')?.remove();const field=document.querySelector('[data-hy-key="/shader-project/name/field"]') as HTMLElement&{readOnly:boolean};if(field)field.readOnly=false;for(const[split,attributes]of viewerSplits)for(const[key,value]of Object.entries(attributes)){if(value===null)split.removeAttribute(key);else split.setAttribute(key,value);}viewerSplits.clear();}
function playerLayout(){for(const id of ['workspace-split','preview-split']){const split=$(id);viewerSplits.set(split,Object.fromEntries(['ratio','min-second','bar-size'].map(key=>[key,split.getAttribute(key)])));split.setAttribute('min-second','0');split.setAttribute('bar-size','0');split.setAttribute('ratio','1');}const field=document.querySelector('[data-hy-key="/shader-project/name/field"]') as HTMLElement&{readOnly:boolean};if(field)field.readOnly=true;}
const library=installLibraryFilters(()=>{savedGalleryState=undefined;renderGallery();});
const creationTools=installCreationTools({app,library:store.creations,selection:()=>{const r=editor.view.state.selection.main;return editor.view.state.sliceDoc(r.from,r.to);},runtime:()=>workspace.runtime,compile,flush:()=>sharedUI?.controller.flushEdits(),changed:()=>{queueDraft();sync();},download,open:project=>open(project)});
const productTools=installProductTools({app,runtime:()=>workspace.runtime,compile,flush:()=>sharedUI?.controller.flushEdits(),changed:()=>{queueDraft();sync();},download,open:project=>open(project),creations:()=>creationTools.show(),engineExport:()=>creationTools.engineExport()});
async function showReadOnly(payload:string){const project=decodeShare(payload);clearReadOnly();await open(project);readOnlyPayload=payload;document.body.classList.add('readonly-player');playerLayout();setRoute('editor');history.replaceState(null,'','#view/'+payload);const previous=document.getElementById('viewer-copy');previous?.remove();const copy=button('复制并创作',async()=>{clearReadOnly();await open(project,true);app.markModified();});copy.id='viewer-copy';document.querySelector('.project-bar')!.append(copy);}
function basename() { return workspace.document.state.name.replace(/[<>:"/\\|?*\x00-\x1f]/g, '-').trim() || 'shader'; }
function exportProject() { download(JSON.stringify(workspace.document.serialize(), null, 2), `${basename()}.hyshader`, 'application/json'); }
function setRoute(next: string) {
  if(readOnlyPayload&&next!=='editor')clearReadOnly();
  if (next === 'editor' && route !== 'editor') {
    editorReturnRoute = route === 'tutorial' ? 'tutorial/' + tutorial.currentId : route === 'practice' ? 'practice/'+practice.currentId : 'gallery';
  }
  const backLabel = editorReturnRoute.startsWith('practice') ? t('返回练习场') : editorReturnRoute.startsWith('tutorial/') ? t('返回教程 · {name}',{name:findTutorial(editorReturnRoute.slice(9)).title}) : '返回 Gallery';
  $('back-gallery').setAttribute('aria-label', t(backLabel)); $('back-gallery').title = t(backLabel);
  route = next.startsWith('tutorial') ? 'tutorial' : next.startsWith('practice') ? 'practice' : next;
  app.dispatch({ type: 'route.select', route: route === 'editor' ? 'editor' : 'gallery' });
  $('gallery').hidden = route !== 'gallery'; $('workspace').hidden = route !== 'editor'; $('tutorial').hidden = route !== 'tutorial'; $('practice').hidden=route!=='practice';practice.setVisible(route==='practice');
  sharedUI?.setVisible(route === 'editor');
  for (const page of ['gallery', 'editor', 'tutorial', 'practice']) {
    $('nav-' + page).classList.toggle('active', route === page);
    if (route === page) $('nav-' + page).setAttribute('aria-current', 'page'); else $('nav-' + page).removeAttribute('aria-current');
  }
  if (route === 'tutorial') { tutorial.show(next.split('/')[1] ?? tutorial.currentId); next = 'tutorial/' + tutorial.currentId; }
  if(route==='practice'){practice.show(next.split('/')[1]??'');next='practice'+(practice.currentId?'/'+practice.currentId:'');}
  workspace.runtime?.setVisible(route === 'editor'); history.replaceState(null, '',readOnlyPayload&&next==='editor'?'#view/'+readOnlyPayload:`#${next}`);
  window.scrollTo(0, 0);
  if (next === 'gallery') { renderGallery(); void generateExampleThumbnails(); }
}
async function ensureRuntime() {
  if (!runtimePromise) runtimePromise = (async () => {
    const runtime = new ShaderRuntime($<HTMLCanvasElement>('shader-canvas'));
    runtime.onError = message => { $('fps-label').textContent='0 FPS';$('gpu-message').textContent = message; $('gpu-overlay').hidden = false; $('gpu-overlay').classList.add('failed'); $('gpu-retry').hidden = false; };
    try { await runtime.initialize();runtime.setMSAA(preferences().msaa); }
    catch (error) { runtime.onError?.(`无法启动 WebGPU：${error instanceof Error ? error.message : String(error)}。仍可编辑、导入和保存代码。请使用支持 WebGPU 的浏览器或检查硬件加速。`); throw error; }
    workspace.runtime = runtime; runtime.onSoundError = message => notice(message, true); runtime.onCameraError = message => notice(message, true); runtime.onSoundProgress = fraction => { $('compile-state').textContent = t('正在合成音频… {percent}%',{percent:Math.round(fraction*100)}); }; updateBufferPreviews();
    runtime.onFrame = state => {
      const fpsText = state.playing && !state.fps ? '— FPS' : `${Math.round(state.fps)} FPS`;
      if ($('fps-label').textContent !== fpsText) $('fps-label').textContent = fpsText;
      $('time-label').textContent = `${state.time.toFixed(2)} s`;
      $('resolution-label').textContent = `${state.width} × ${state.height}`;
      if (!sharedUI) { $('play-pause').textContent = state.playing ? 'Ⅱ' : '▶'; $('play-pause').setAttribute('aria-label', t(state.playing ? '暂停' : '播放')); }
      $('gpu-overlay').hidden = true;
      $('sound-toggle').textContent = t(state.sound.audible ? '静音' : '开启声音');
      $('sound-toggle').setAttribute('aria-pressed', String(state.sound.audible));
    };
    runtime.setVisible(route === 'editor'); return runtime;
  })();
  return runtimePromise;
}
async function compile() {
  if (sharedUI) { await sharedUI.controller.compile(); return; }
  const sequence = ++compileSequence;
  $('compile-state').textContent = t('正在编译…'); $<HTMLButtonElement>('compile').disabled = true;
  try {
    await ensureRuntime(); const compiled = await workspace.compile();
    if (compiled && sequence === compileSequence) { controlSignature = ''; sync(); }
    if (!compiled && !workspace.diagnostics.length) $('compile-state').textContent = t('代码已变化，请重新运行');
  } finally { if (sequence === compileSequence) $<HTMLButtonElement>('compile').disabled = false; }
}
async function showGenerated(pass: CodeId, line = 1) {
  const project = structuredClone(workspace.document.state);
  const errors=await normalizeExtendedSources(project,translateWgsl,'common');if(errors.length)throw Error(errors.map(d=>d.message).join('\n'));
  const currentLanguage=languageOf(project,pass);
  const result = currentLanguage==='typescript'||currentLanguage==='slang'?{code:await createSourceConverter({wgsl:translateWgsl,hlsl:translateHlsl})(project,pass,'wgsl'),diagnostics:[],warnings:[]}:currentLanguage === 'hlsl' ? await translateHlsl(sourceOf(project, pass), await projectHlslOptions(project as ShaderProject, pass, translateWgsl)) : currentLanguage === 'glsl' ? translateGlsl(sourceOf(project, pass), { ...projectTranslationOptions(project as ShaderProject, pass), ...(externalCommon(sourceOf(project, pass)) ? {common: await glslCommon(project, pass, translateWgsl)} : {}) }) : null;
  generatedPreview.show(result ? result.code ?? '' : codeOf(project, pass));
  $('generated-message').textContent = result?.code === null ? result.diagnostics.map(d => `${d.line}:${d.column} ${d.message}`).join('\n') : t('只读预览 · {pass} · 可选择复制',{pass:PASS_LABELS[pass]});
  const notes = $<HTMLDetailsElement>('generated-notes');
  notes.hidden = !result?.warnings.length; notes.open = false;
  notes.querySelector('p')!.textContent = result?.warnings.join('\n') ?? '';
  $<HTMLDialogElement>('generated-dialog').showModal();
  const target = generatedPreview.view.state.doc.line(Math.max(1, Math.min(line, generatedPreview.view.state.doc.lines)));
  generatedPreview.view.dispatch({ selection: { anchor: target.from }, scrollIntoView: true }); generatedPreview.view.focus();
}
function renderDiagnostics() {
  const diagnostics = workspace.diagnostics, list = $('diagnostics'); list.replaceChildren();
  $('diagnostics-count').textContent = t('{errors} 个错误 · {warnings} 个警告',{errors:diagnostics.filter(d=>d.severity==='error').length,warnings:diagnostics.filter(d=>d.severity==='warning').length});
  if (!diagnostics.length) { const p = document.createElement('p'); p.className = 'diagnostics-empty'; p.textContent = t(workspace.compiledRevision ? '✓ 编译成功 · Haiyue WebGPU' : '点击运行，查看你的 Shader。'); list.append(p); }
  for (const diagnostic of diagnostics) list.append(button(`${PASS_LABELS[diagnostic.pass]}:${diagnostic.line}:${diagnostic.column} · ${(diagnostic.language ?? 'wgsl').toUpperCase()}  ${diagnostic.message}`, () => { if (languageOf(workspace.document.state, diagnostic.pass) !== 'wgsl' && diagnostic.language !== languageOf(workspace.document.state, diagnostic.pass)) showGenerated(diagnostic.pass, diagnostic.line); else { selectPass(diagnostic.pass); editor.focusLine(diagnostic.line); } }, `diagnostic ${diagnostic.severity}`));
  editor.diagnostics(diagnostics);
  $('compile-state').textContent = t(diagnostics.some(d => d.severity === 'error') ? '编译失败 · 保留上次预览' : workspace.compiledRevision === workspace.document.revision ? '● 已编译' : '● 代码已修改');
}
function selectPass(pass: CodeId) { app.dispatch({ type: 'pass.select', pass }); editor.show(pass, sourceOf(workspace.document.state, pass), languageOf(workspace.document.state, pass)); controlSignature = ''; sync(); renderDiagnostics(); }
let sharedHostState: { signature:string; source:string } | undefined;
function sync() {
  for(const control of document.querySelectorAll<HTMLElement>('[data-recovery-label]'))control.textContent=t(control.dataset.recoveryLabel!);
  for(const[id,label,enabled]of [['undo-source','撤销',app.canUndoSource()],['redo-source','重做',app.canRedoSource()]] as const){const button=document.getElementById(id) as HTMLButtonElement|null;if(button){button.disabled=!enabled;button.title=t(label);button.setAttribute('aria-label',button.title);}}
  const p = workspace.document.state, language = languageOf(p, app.state.activePass), source = sourceOf(p, app.state.activePass);
  const visibleTabs = codeTabs(p);
  const signature = JSON.stringify([app.state.activePass, language, visibleTabs, Boolean(workspace.runtime), p.sound.enabled, p.sound.channels, p.passes.map(item => [item.id, item.enabled, item.channels]), p.assets.map(a => [a.id, a.name])]);
  // The shared fragments own name/scale/playback/save. Only refresh the legacy
  // host controls when their inputs change; compiling a new scale does not
  // rewrite the language, sound selectors or CodeMirror contents.
  if(sharedUI){
    const hostSignature=JSON.stringify([signature,p.preview.mode,p.preview.mesh,p.sound.duration,p.sound.volume]);
    const same=sharedHostState?.signature===hostSignature&&sharedHostState.source===source&&controlSignature===signature;
    sharedHostState={signature:hostSignature,source};
    if(same){if(workspace.compiledRevision!==workspace.document.revision){const label=$('compile-state'),text=t('● 代码已修改 · Ctrl / ⌘ + Enter 运行');if(label.textContent!==text)label.textContent=text;}return;}
  }
  $<HYSelect>('code-language').value = language;
  $('view-wgsl').hidden = language === 'wgsl';
  if (!sharedUI && document.activeElement !== $('project-name')) $<HTMLInputElement>('project-name').value = p.name;
  if (editor.view.state.doc.toString() !== source || editor.language !== language) editor.show(app.state.activePass, source, language);
  if (!sharedUI) {
    $<HYSelect>('preview-scale').value = String(p.preview.scale);
    $<HYSelect>('mesh-select').value = p.preview.mesh;
    $('mode-canvas').setAttribute('aria-pressed', String(p.preview.mode === 'canvas'));
    $('mode-scene').setAttribute('aria-pressed', String(p.preview.mode === 'scene'));
  }
  const previewMode=p.preview.mode==='canvas'?'canvas':p.preview.mesh;
  if($<HYSelect>('preview-mode').value!==previewMode)$<HYSelect>('preview-mode').value=previewMode;
  $('scene-controls').hidden = p.preview.mode !== 'scene';
  $('sound-settings').hidden = app.state.activePass !== 'sound';
  $('sound-toggle').hidden = !p.sound.enabled;
  for (const [id, value, label] of [['sound-duration', p.sound.duration, t('{seconds} 秒',{seconds:p.sound.duration})], ['sound-volume', p.sound.volume, `${Math.round(p.sound.volume * 100)}%`]] as const) {
    const select = $<HYSelect>(id); if (!select.options.some(option => option.value === String(value))) select.options = [...select.options, { value: String(value), label }];
    select.value = String(value);
  }
  if (signature !== controlSignature) {
    controlSignature = signature; const tabs = $('pass-tabs'); tabs.replaceChildren();
    for (const id of visibleTabs) {
      const b = button(PASS_LABELS[id], () => selectPass(id), id === 'common' || passOf(p as ShaderProject, id).enabled ? 'enabled' : '');
      b.dataset.pass = id; b.setAttribute('role', 'tab'); b.setAttribute('aria-selected', String(id === app.state.activePass)); tabs.append(b);
      if(id===app.state.activePass){const indicator=document.createElement('span');indicator.className='tab-save-indicator';indicator.setAttribute('aria-hidden','true');b.append(indicator);}
    }
    refreshSaveState();
    const available = (['buffer-a', 'buffer-b', 'buffer-c', 'buffer-d', 'sound', 'common'] as CodeId[]).filter(id => !visibleTabs.includes(id));
    $<HYDropdown>('add-pass-menu').items = available.map(id => ({ value: id, label: PASS_LABELS[id], disabled: id === 'sound' && !workspace.runtime }));
    $<HYDropdown>('add-pass-menu').hidden = !available.length;
    $('pass-enable-label').hidden = app.state.activePass === 'image' || app.state.activePass === 'common';
    $<HYCheckbox>('pass-enabled').checked = app.state.activePass === 'common' || passOf(p as ShaderProject, app.state.activePass).enabled;
    $('common-help').hidden = app.state.activePass !== 'common';
    $('channel-pass-label').textContent = PASS_LABELS[app.state.activePass].toUpperCase();
    $('channel-kinds').textContent = t(app.state.activePass === 'sound' ? '静态图片 / 内置纹理 / Cubemap' : '图片 / 视频 / 键盘 / Buffer'); renderChannels();
  }
  if (workspace.compiledRevision !== workspace.document.revision) $('compile-state').textContent = t('● 代码已修改 · Ctrl / ⌘ + Enter 运行');
}
function renderChannels() {
  const p = workspace.document.state, container = $('channels'); container.replaceChildren();
  bufferPreviews = [];
  if (app.state.activePass === 'common') {
    const hint = document.createElement('p'); hint.className = 'muted common-channel-help'; hint.textContent = t('Common 没有独立纹理通道。公共函数中的 channel0–3 使用调用它的 Buffer / Image / Sound 的绑定。'); container.append(hint);
    updateBufferPreviews(); return;
  }
  const targetPass = app.state.activePass, pass = passOf(p as ShaderProject, targetPass);
  pass.channels.forEach((channel, index) => {
    const card = document.createElement('div'); card.className = 'channel-card'; card.dataset.channel = String(index);card.dataset.pass=targetPass;
    const top = document.createElement('div'); top.className = 'channel-top'; const label = document.createElement('span'); label.textContent = `iChannel${index}`;
    const clear = button('×', async () => { workspace.setChannel(targetPass, index, { kind: 'none' }); await compile(); }); clear.setAttribute('aria-label', t('清空 iChannel{index}',{index})); top.append(label, clear);
    const body = document.createElement('div'); body.className = 'channel-body';
    if (channel.kind === 'image' || channel.kind === 'cubemap') {
      const asset = p.assets.find(a => a.id === channel.assetId)!;
      if (asset.kind === 'cubemap') {
        body.classList.add('cubemap-preview');
        for (const face of CUBE_FACES) {
          const tile = document.createElement('span'), img = new Image(), label = document.createElement('small');
          img.src = asset.faces[face]; img.alt = asset.name + ' ' + CUBE_FACE_LABELS[face]; label.textContent = CUBE_FACE_LABELS[face].split(' ')[0]!;
          tile.append(img, label); body.append(tile);
        }
      } else { const img = new Image(); img.src = asset.dataUrl; img.alt = asset.name; body.append(img); }
    }
    else if (channel.kind === 'builtin') {
      const asset = builtinTexture(channel.texture), img = new Image(); img.src = asset.url; img.alt = asset.name; body.append(img);
    }
    else if (channel.kind === 'keyboard') { body.textContent = '⌨'; body.title = '点击预览后按键 · 256 × 3'; }
    else if (channel.kind === 'video') { body.textContent = '▶'; body.title = p.assets.find(a => a.id === channel.assetId)?.name ?? '视频'; }
    else if (channel.kind === 'camera') { body.textContent = '◉'; body.title = channel.facing === 'user' ? '前置相机 · 实时视频' : '后置相机 · 实时视频'; }
    else if (channel.kind === 'buffer') {
      const canvas = document.createElement('canvas'); canvas.className = 'buffer-preview'; canvas.width = 160; canvas.height = 90;
      canvas.dataset.buffer = channel.pass; canvas.dataset.previewState = 'waiting';
      canvas.setAttribute('role', 'img'); canvas.setAttribute('aria-label', `${PASS_LABELS[channel.pass]} 渲染预览`);
      body.title = `${PASS_LABELS[channel.pass]} · 最新渲染画面`;
      const state = document.createElement('span'); state.className = 'buffer-preview-state'; state.textContent = t('等待渲染');
      const badge = document.createElement('span'); badge.className = 'buffer-preview-badge'; badge.textContent = channel.pass.at(-1)!.toUpperCase();
      body.append(canvas, state, badge); bufferPreviews.push({ canvas, pass: channel.pass });
    }
    else body.textContent = '+';
    if (!sharedUI) {
    const select = document.createElement('hy-select') as HYSelect; select.setAttribute('aria-label', `iChannel${index} 来源`);
    select.options = [{ value: 'none', label: '无纹理' }, ...(targetPass === 'sound' ? [] : [{ value: 'keyboard', label: '⌨ 键盘 · 256 × 3' }, { value: 'camera:environment', label: '◉ 后置相机 · 实时视频' }, { value: 'camera:user', label: '◉ 前置相机 · 实时视频' }]),
      ...BUILTIN_TEXTURES.map(asset => ({ value: 'builtin:' + asset.id, label: '内置 · ' + asset.name })),
      ...PASS_IDS.filter(id => id !== 'image' && targetPass !== 'sound').map(id => ({ value: id, label: `${PASS_LABELS[id]}${id === app.state.activePass ? ' ↺' : ''}` })),
      ...p.assets.filter(asset => targetPass !== 'sound' || asset.kind !== 'video').map(asset => ({ value: `${asset.kind ?? 'image'}:${asset.id}`, label: `${asset.kind === 'cubemap' ? 'Cubemap · ' : asset.kind === 'video' ? '视频 · ' : ''}${asset.name}` }))];
    select.value = channel.kind === 'camera' ? 'camera:' + channel.facing : channel.kind === 'buffer' ? channel.pass : (channel.kind === 'image' || channel.kind === 'cubemap' || channel.kind === 'video') ? `${channel.kind}:${channel.assetId}` : channel.kind === 'builtin' ? 'builtin:' + channel.texture : channel.kind;
    select.addEventListener('value-change', () => { void run(async () => {
      const value = select.value; workspace.setChannel(targetPass, index, value === 'none' ? { kind: 'none' } : value.startsWith('camera:') ? { kind: 'camera', facing: value === 'camera:user' ? 'user' : 'environment' } : value === 'keyboard' ? { kind: 'keyboard' } : value.startsWith('builtin:') ? { kind: 'builtin', texture: value.slice(8) as BuiltinTextureId } : value.startsWith('video:') ? { kind: 'video', assetId: value.slice(6) } : value.startsWith('image:') ? { kind: 'image', assetId: value.slice(6) } : value.startsWith('cubemap:') ? { kind: 'cubemap', assetId: value.slice(8) } : { kind: 'buffer', pass: value as Exclude<PassId, 'image'> }); await compile();
    }); });
    const upload = button('↑ 上传图片', () => { beginChannelUpload({pass:targetPass,index,session:app.state.session},'image'); }, 'upload-channel');
    const cube = button('↑ 上传立方体贴图', () => uploadCube(targetPass, index), 'upload-cubemap');
    const video = button('↑ 上传视频', () => { beginChannelUpload({pass:targetPass,index,session:app.state.session},'video'); }, 'upload-video');
    video.hidden = targetPass === 'sound';
    card.append(top, body, select, upload, video, cube);
    } else {
      const choose=button((['image','video','cubemap'].includes(channel.kind)?channelName(p,channel):t(channelName(p,channel)))+'  ›',()=>channelPicker.open(targetPass,index),'choose-channel');choose.setAttribute('aria-label',t('选择 iChannel{index} 素材',{index}));
      const previewButton=button('',()=>channelPicker.open(targetPass,index),'channel-preview-target');previewButton.setAttribute('aria-label',t('预览并选择 iChannel{index} 素材',{index}));body.append(previewButton);card.append(top,body,choose);
    } container.append(card);
  });
  updateBufferPreviews();
}
function hasUnsavedChanges() { return opened && ((workspace.document.dirty && workspace.document.revision !== openedRevision) || (sharedUI !== undefined && sharedUI.controller.getSnapshot().name !== app.state.project.name)); }
function refreshSaveState() {
  const view=sharedUI?.controller.getSnapshot();
  const status=view?saveIndicator(view):workspace.document.dirty||app.state.save.status==='failed'?'modified':'saved';
  const feedback=t(app.state.save.status==='saving'?'正在保存…':app.state.save.status==='failed'?'保存失败：'+app.state.save.error:status==='modified'?'有未保存的修改':'已保存');
  const tab=document.querySelector<HTMLButtonElement>('#pass-tabs [aria-selected="true"]');
  if(tab){tab.dataset.saveState=status;tab.title=feedback;tab.setAttribute('aria-label',PASS_LABELS[app.state.activePass]+' · '+feedback);}
  window.haiyueEditorHost?.updateDocumentState({ dirty: hasUnsavedChanges(), name: workspace.document.state.name, locale: preferences().locale });
}
function changed() {
  sync();
  refreshSaveState();
  if (workspace.document.revision === revision) return;
  revision = workspace.document.revision;
  queueDraft();
  if (workspace.configuringSound) return;
  if (autoTimer) clearTimeout(autoTimer);
  if (opened && $<HYCheckbox>('auto-run').checked) autoTimer = setTimeout(() => { void run(compile); }, 650);
}
// Browser-specific persistence and thumbnail capture; sequencing/dirty state live in app.
app.connect({ projects: {
  async open(context) {
    const file = pendingImport; pendingImport = undefined;
    if (!file || context.signal.aborted) return null;
    if (file.size > LIMITS.projectBytes) throw new Error('工程不能超过 48 MB。');
    return receiveProject(parseProject(await file.text()),(await store.list()).map(v=>v.project),crypto.randomUUID(),new Date().toISOString());
  },
  saveDraft: async (snapshot,context) => {if(context.signal.aborted)return;if(context.session===app.state.session&&context.revision<=app.state.savedRevision){if(context.revision===app.state.revision){await store.ready();await store.archive.discardDraft(snapshot.id,context.session);}return;}if(opened||context.session!==app.state.session)await store.draft(snapshot as ShaderProject,context.activePass,context.session);},
  checkpoint:async(snapshot,context)=>{if(!context.signal.aborted)await store.checkpoint(snapshot as ShaderProject,'before-conversion',context.activePass);},
  async save(project, context) {
    if (context.signal.aborted) return 'cancelled';
    const fallback = saved.find(item => item.project.id === project.id)?.thumbnail ?? '';
    const runtime = workspace.runtime;
    // A queued save must never attach a later revision's image to an older snapshot.
    const canCapture = app.state.session === context.session && app.state.revision === context.revision
      && workspace.compiledRevision === context.revision && runtime?.status().ready && runtime.status().frame > 0;
    const thumbnail = canCapture ? await runtime!.readImage().then(result => imageDataUrl(result)).catch(() => fallback) : fallback;
    if (context.signal.aborted) return 'cancelled';
    await store.save(project as ShaderProject, thumbnail);
    if (!disposed) {
      saved = [{ project: project as ShaderProject, thumbnail, savedAt: new Date().toISOString() }, ...saved.filter(item => item.project.id !== project.id)];
      if (route === 'gallery') renderGallery();
    }
    return 'saved';
  },
} });
async function save() {
  if(readOnlyPayload)return false;
  if (!opened) return false;
  try { return await (sharedUI ? sharedUI.controller.save() : app.save()); }
  catch (error) { throw new Error(`本地保存失败：${String(error)}。请导出工程以保留作品。`); }
}
async function open(project: ShaderProject, fork = false) {if(opened&&workspace.document.dirty)await app.saveDraft();workspace.open(project, fork); await openPromise; }
function card(project: ShaderProject, image: string, category: string, click: () => Promise<void>, index = '', placeholder = '暂无预览') {
  const article = document.createElement('article'); article.className = 'shader-card';
  const open = button('', click, 'card-open'); open.setAttribute('aria-label', `打开 ${project.name}`); open.dataset.project = project.id;
  const art = document.createElement('div'); art.className = 'card-art';
  if (image) { const img = new Image(); img.src = image; img.alt = `${project.name} Shader 预览`; art.append(img); }
  else { const state = document.createElement('span'); state.className = 'thumbnail-placeholder'; state.textContent = t(placeholder); art.append(state); }
  const badge = document.createElement('span'); badge.className = 'card-tag'; badge.textContent = t(category);
  const number = document.createElement('span'); number.className = 'card-index'; number.textContent = index; art.append(badge, number);
  const info = document.createElement('div'); info.className = 'card-info'; const title = document.createElement('h3'); title.textContent = project.name;
  const meta = document.createElement('p'); const type = document.createElement('span'); type.textContent = `${project.passes.filter(p => p.enabled).length} PASS · WGSL`;
  const arrow = document.createElement('span'); arrow.textContent = t('打开 ↗'); meta.append(type, arrow); info.append(title, meta); open.append(art, info); article.append(open); return article;
}
function renderGallery() {
  const previewMessage = (id: string) => thumbnailFailures.has(id) ? '预览暂不可用' : '正在生成预览…';
  $('examples').replaceChildren(...samples.map(sample => card(sample.project, thumbnails.get(sample.id) ?? '', sample.category, () => open(sample.project, true), sample.label, previewMessage(sample.id))));
  $('examples').setAttribute('aria-busy', String(Boolean(exampleThumbnailJob)));
  $('retry-example-previews').hidden = !thumbnailFailures.size || Boolean(exampleThumbnailJob);
  const query = $<HTMLInputElement>('gallery-search').value.toLowerCase();
  $('project-count').textContent = String(saved.length);
  // Thumbnail completion must not replace a saved card between pointer-down
  // and click, or the user's attempt to open their work is silently lost.
  const locale=getLocale();
  const filter=JSON.stringify(library.filter);
  if(savedGalleryState?.items===saved&&savedGalleryState.query===query&&savedGalleryState.locale===locale&&savedGalleryState.filter===filter)return;
  savedGalleryState={items:saved,query,locale,filter};
  const items = library.select(saved,{...library.filter,query});
  $('saved-projects').replaceChildren(...items.map(item => {
    const element = card(item.project, item.thumbnail, 'LOCAL PROJECT', ()=>recovery.openWork(item.project));
    libraryCardActions(element,item.project,async project=>{await store.save(project,item.thumbnail);saved=await store.list();renderGallery();},async project=>{await store.save(project,item.thumbnail);saved=await store.list();renderGallery();});
    const remove = button('', async () => {
      if (!confirm(`将「${item.project.name}」移到回收站？之后可以恢复。`)) return;
      if (workspace.document.state.id === item.project.id) { opened = false; if (autoTimer) clearTimeout(autoTimer); refreshSaveState(); }
      await app.whenWritesSettled(); await store.delete(item.project.id); saved = saved.filter(p => p.project.id !== item.project.id); renderGallery();
    }, 'card-delete');
    remove.innerHTML = '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6"/></svg>';
    remove.setAttribute('aria-label', `删除 ${item.project.name}`); remove.title = `删除 ${item.project.name}`; element.append(remove); return element;
  }));
  $('empty-gallery').hidden = items.length !== 0;
  if (thumbnails.has('aurora')) { $<HTMLImageElement>('hero-thumbnail').src = thumbnails.get('aurora')!; $('hero-thumbnail').hidden = false; }
  $('hero-preview-state').hidden = thumbnails.has('aurora'); $('hero-preview-state').textContent = previewMessage('aurora');
}
function imageDataUrl(result: { width: number; height: number; pixels: Uint8Array }, maxWidth = 480) {
  const canvas = document.createElement('canvas'); canvas.width = result.width; canvas.height = result.height;
  canvas.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(result.pixels), result.width, result.height), 0, 0);
  const output = document.createElement('canvas'); output.width = Math.min(maxWidth, result.width); output.height = Math.max(1, Math.round(output.width * result.height / result.width));
  output.getContext('2d')!.drawImage(canvas, 0, 0, output.width, output.height); return output.toDataURL('image/png');
}
function generateExampleThumbnails(): Promise<void> {
  // Gallery can first appear after loading #editor. Keep one batch across route
  // changes, retain successful previews, and retry only missing examples.
  if (exampleThumbnailJob) return exampleThumbnailJob;
  const missing = samples.filter(sample => !thumbnails.has(sample.id));
  if (disposed || !missing.length) return Promise.resolve();
  missing.forEach(sample => thumbnailFailures.delete(sample.id));
  exampleThumbnailJob = (async () => {
    let canvas: HTMLCanvasElement | undefined, runtime: ShaderRuntime | undefined;
    try {
      if (!navigator.gpu) throw new Error('WebGPU unavailable');
      canvas = document.createElement('canvas'); canvas.className = 'thumb-render'; document.body.append(canvas);
      runtime = new ShaderRuntime(canvas);
      await runtime.initialize(); runtime.setVisible(false); runtime.setPlaying(false);
      for (const sample of missing) {
        if (disposed) break;
        try {
          const prepared = await runtime.prepare(sample.previewProject ?? sample.project); runtime.commit(prepared);
          for (let frame = 0; frame < (sample.id === 'feedback' ? 80 : 1); frame++) runtime.step();
          thumbnails.set(sample.id, imageDataUrl(await runtime.readImage()));
        } catch { thumbnailFailures.add(sample.id); }
        if (!disposed && route === 'gallery') renderGallery();
      }
    } catch { missing.forEach(sample => { if (!thumbnails.has(sample.id)) thumbnailFailures.add(sample.id); }); }
    finally { await runtime?.dispose().catch(() => {}); canvas?.remove(); }
  })().finally(() => {
    exampleThumbnailJob = undefined;
    if (!disposed && route === 'gallery') renderGallery();
  });
  if (route === 'gallery') renderGallery();
  return exampleThumbnailJob;
}

async function start() {
  await workspace.start();
  if (sharedUIEnabled) sharedUI = mountWebSharedEditor(app, {
    ensurePreview: async () => { if (autoTimer) clearTimeout(autoTimer); return ensureRuntime(); },
    flushEditor: () => { app.setSource(app.state.activePass, editor.view.state.doc.toString(), editor.language); },
    previewModeChanged: () => { workspace.runtime?.setMode(app.state.project.preview.mode); workspace.runtime?.setMesh(app.state.project.preview.mesh); },
    playbackChanged: () => {},
    compiled: () => { sync(); renderDiagnostics(); },
    exportProject: () => exportProject(),
  }, { canvas: $<HTMLCanvasElement>('shader-canvas'), editor: editor.view.dom,
    focusEditor: () => editor.view.focus(), measureEditor: () => editor.view.requestMeasure(),
    previewVisible: visible => workspace.runtime?.setVisible(visible && route === 'editor'),
  });
  if(sharedUI)saveIndicatorOff=sharedUI.controller.subscribe(state=>saveIndicator(state)+':'+saveMessage(state),()=>refreshSaveState());
  Object.defineProperty(window, 'haiyueEditor', { value: workspace.api, configurable: true });
  workspace.platform.rpc.connect(window.haiyueEditorIPC);
  workspace.onCompiled = renderDiagnostics;
  workspace.onOpen = () => {
    channelPicker.close();uploadTarget=undefined;
    editorReturnRoute = route === 'tutorial' ? 'tutorial/' + tutorial.currentId : route === 'practice' ? 'practice/'+practice.currentId : 'gallery';
    opened = true; openedRevision = workspace.document.revision; ++openSequence;
    const stored = saved.find(item => item.project.id === workspace.document.state.id);
    if (stored && JSON.stringify(stored.project) === JSON.stringify(workspace.document.state)) workspace.document.markSaved();
    editor.reset(); editor.show(app.state.activePass, sourceOf(workspace.document.state, app.state.activePass), languageOf(workspace.document.state, app.state.activePass));
    controlSignature = ''; revision = 0; setRoute('editor'); changed();
    openPromise = (async () => { await run(compile); })();
  };
  workspace.document.subscribe(changed);
  Object.defineProperty(window, 'shaderEditor', { value: Object.freeze({
    open: (project: ShaderProject) => open(project), create: () => open(createPreferred()), compile,
    translateGlsl, translateHlsl, translateWgsl, exportShadertoy: () => exportShadertoy(workspace.document.serialize()), getProject: () => workspace.document.serialize(), getStatus: () => workspace.runtime?.status() ?? null, getSharedUI: () => sharedUI?.diagnostics() ?? null, getApplicationState: () => app.state, save,
  }), configurable: true });
  bind('dismiss-notice', () => { $('notice').hidden = true; });
  bind('new-project', () => open(createPreferred())); bind('empty-new', () => open(createPreferred()));
  bind('hero-example', () => open(samples[0]!.project, true));
  bind('nav-practice',()=>setRoute('practice'));
  bind('nav-tutorial', () => setRoute('tutorial/' + tutorial.currentId));
  window.addEventListener('hashchange', () => { void run(async () => {
    const hash = location.hash.slice(1);
    if(hash.startsWith('view/')){await showReadOnly(hash.slice(5));return;}
    clearReadOnly();
    if (hash === 'practice' || hash.startsWith('practice/')) setRoute(hash);
    else if (hash === 'tutorial' || hash.startsWith('tutorial/')) setRoute(hash);
    else if (hash === 'editor') { if (!opened) await open(createPreferred()); else setRoute('editor'); }
    else setRoute('gallery');
  }); });
  bind('nav-gallery', () => setRoute('gallery')); bind('back-gallery', () => {
    setRoute(editorReturnRoute);
    if (route === 'tutorial') {
      $('tutorial-title').focus({ preventScroll: true });
      $('tutorial-title').scrollIntoView({ block: 'start' });
    }
  });
  bind('retry-example-previews', generateExampleThumbnails);
  document.querySelector<HTMLAnchorElement>('.brand')!.onclick = event => { event.preventDefault(); setRoute('gallery'); };
  bind('nav-editor', async () => { if (!opened) await open(createPreferred()); else { setRoute('editor'); await ensureRuntime(); } });
  bind('import-project', () => $<HTMLInputElement>('project-input').click());
  $<HTMLInputElement>('project-input').onchange = () => { void run(async () => {
    const input = $<HTMLInputElement>('project-input'), file = input.files?.[0]; input.value = ''; if (!file) return;
    pendingImport = file;
    if(opened&&workspace.document.dirty)await app.saveDraft();
    if (await app.pick(true)) { void workspace.runtime?.setSoundAudible(false); workspace.onOpen?.(); await openPromise; }
  }); };
  if (!sharedUI) bind('save-project', async () => { if (await save()) notice('作品已保存到此浏览器的 Gallery。'); });
  if (!sharedUI) bind('export-project', exportProject);
  // The explicit legacy rollback retains its historical conversion dialogs.
  if (!sharedUI) {
    const actions=document.querySelector('.project-actions')!;
    const glsl=button('GLSL → WGSL',()=>{
      const project=workspace.document.state,source=app.state.activePass==='common'?project.commonGlsl:passOf(project as ShaderProject,app.state.activePass).glsl;
      translation=null;$<HTMLButtonElement>('apply-glsl').disabled=true;wgslPreview.show('');
      if(source!==undefined)glslEditor.value=source;
      $('glsl-messages').classList.remove('error');
      $('glsl-messages').textContent=app.state.activePass==='common'?'Common 只需公共定义，无需 mainImage / mainSound；宏与函数会参与其他 Pass 的转换。':'转换时会自动加入已导入的 Common GLSL。';
      $<HTMLDialogElement>('glsl-dialog').showModal();glslEditor.focus();
    },'quiet');glsl.id='glsl-button';
    const shadertoy=button('导出 GLSL ↗',showShadertoyExport,'quiet');shadertoy.id='shadertoy-button';actions.prepend(glsl,shadertoy);
  }
  if (!sharedUI) $<HTMLInputElement>('project-name').onchange = () => { void run(() => app.dispatch({ type: 'project.rename', name: $<HTMLInputElement>('project-name').value.trim() || 'Untitled shader' })); };
  $('gallery-search').addEventListener('input', renderGallery);
  const recoveryActions=document.createElement('div');recoveryActions.className='recovery-actions';for(const[label,action]of [['恢复草稿',recovery.drafts],['回收站',recovery.trash]] as const){const control=button(label,action);control.dataset.recoveryLabel=label;recoveryActions.append(control);}document.querySelector('.my-work .section-heading')!.append(recoveryActions);
  const history=button('版本历史',recovery.history,'quiet');history.id='project-history';history.dataset.recoveryLabel='版本历史';document.querySelector('.project-bar')!.append(history);
  for(const[name,text,action]of [['undo-source','↶',()=>app.undoSource()],['redo-source','↷',()=>app.redoSource()]] as const){const control=button(text,action,'quiet');control.id=name;control.title=t(name==='undo-source'?'撤销':'重做');control.setAttribute('aria-label',control.title);$('builtin-variables-button').before(control);}
  $('add-pass-menu').addEventListener('item-select', event => {
    const pass = (event as CustomEvent<HYDropdownSelectDetail>).detail.value as CodeId;
    if (!['common', 'sound', ...PASS_IDS].includes(pass) || codeTabs(workspace.document.state).includes(pass)) return;
    // Begin AudioContext.resume synchronously in the menu's user gesture, before GPU work.
    const runtime = workspace.runtime, projectId = workspace.document.state.id, owner = openSequence;
    const audio = pass === 'sound' && runtime ? runtime.setSoundAudible(true).then(() => true, error => { notice(String(error), true); return false; }) : Promise.resolve(false);
    workspace.addPass(pass);app.setSource(pass,preferredSource(pass,preferences().shaderLanguage),preferences().shaderLanguage); selectPass(pass);
    document.querySelector<HTMLButtonElement>(`#pass-tabs [data-pass="${pass}"]`)?.focus();
    void run(async () => {
      const armed = await audio;
      if (workspace.document.state.id !== projectId || owner !== openSequence) return;
      if (autoTimer) clearTimeout(autoTimer);
      if (armed && workspace.document.state.sound.enabled) app.dispatch({ type: 'preview.play', value: true });
      await compile();
    });
  });
  $('add-pass').addEventListener('keydown', event => {
    if (event.key !== 'ArrowDown') return;
    event.preventDefault(); $<HYDropdown>('add-pass-menu').show();
    $<HYDropdown>('add-pass-menu').shadowRoot?.querySelector<HTMLButtonElement>('button:not(:disabled)')?.focus();
  });
  $('code-language').addEventListener('value-change', () => { void run(async () => {
    const select = $<HYSelect>('code-language');
    const language = select.value as ShaderLanguage;
    select.disabled = true;
    try {const plan=await app.prepareLanguageConversion(app.state.activePass,language);if(plan&&await recovery.review(plan))notifications.success({ key: 'source-conversion', message: t('已转换为 {language}',{language:LANGUAGE_LABELS[language]}), duration: 3,placement:'bottomRight' });}
    catch (error) { notifications.error({ key: 'source-conversion', message: '代码转换失败', description: error instanceof Error ? error.message : String(error) }); }
    finally { select.disabled = false; select.value = languageOf(workspace.document.state, app.state.activePass); sync(); renderDiagnostics(); }
  }); });
  $('detect-language').addEventListener('checked-change', () => { editor.autoDetect = $<HYCheckbox>('detect-language').checked; });
  bind('view-wgsl', () => showGenerated(app.state.activePass));
  $('shadertoy-pass').addEventListener('value-change', renderShadertoyExport);
  bind('copy-shadertoy', async () => {
    const result = shadertoyBundle?.passes.find(p => p.pass === $<HYSelect>('shadertoy-pass').value);
    if (!result?.code) return;
    try { await navigator.clipboard.writeText(result.code); notice(result.label + ' GLSL 已复制。'); }
    catch { shadertoyPreview.view.dispatch({ selection: { anchor: 0, head: shadertoyPreview.view.state.doc.length } }); shadertoyPreview.view.focus(); notice('请按 Ctrl / ⌘ + C 复制已选中的代码。'); }
  });
  bind('download-shadertoy', () => {
    const result = shadertoyBundle?.passes.find(p => p.pass === $<HYSelect>('shadertoy-pass').value);
    if (result?.code) download(result.code, `${basename()}-${result.pass}.glsl`, 'text/plain');
  });
  bind('download-shadertoy-all', () => { if (shadertoyBundle) download(JSON.stringify(shadertoyBundle, null, 2), `${basename()}-shadertoy.json`, 'application/json'); });
  if (!sharedUI) bind('compile', compile);
  $('auto-run').addEventListener('checked-change', () => { if ($<HYCheckbox>('auto-run').checked) void run(compile); else if (autoTimer) clearTimeout(autoTimer); });
  $('preview-mode').addEventListener('value-change', () => { void run(() => { const value=$<HYSelect>('preview-mode').value;workspace.preview(value==='canvas'?'canvas':'scene',value==='canvas'?workspace.document.state.preview.mesh:value as PreviewMesh); }); });
  const mode = (mode: PreviewMode) => { workspace.preview(mode, $<HYSelect>('mesh-select').value as PreviewMesh); };
  if (!sharedUI) {
  bind('mode-canvas', () => mode('canvas')); bind('mode-scene', () => mode('scene'));
  $('mesh-select').addEventListener('value-change', () => { void run(() => mode('scene')); });
  $('preview-scale').addEventListener('value-change', () => { void run(async () => { app.dispatch({ type: 'preview.scale', value: Number($<HYSelect>('preview-scale').value) as PreviewScale }); await compile(); }); });
  }
  $('pass-enabled').addEventListener('checked-change', () => { void run(async () => { if (app.state.activePass === 'common') return; workspace.setEnabled(app.state.activePass, $<HYCheckbox>('pass-enabled').checked); await compile(); }); });
  if (!sharedUI) { bind('play-pause', () => app.dispatch({ type: 'preview.play', value: !app.state.playing })); bind('reset-time', () => app.dispatch({ type: 'preview.reset' })); bind('step-frame', () => app.dispatch({ type: 'preview.step' })); }
  bind('reset-camera', () => workspace.runtime?.resetCamera());
  bind('fullscreen', () => document.fullscreenElement ? document.exitFullscreen() : $('viewport').requestFullscreen());
  bind('capture', async () => { const result = await (await ensureRuntime()).readImage(); const url = imageDataUrl(result, result.width); const a = document.createElement('a'); a.href = url; a.download = `${basename()}.png`; a.click(); });
  for (const kind of ['image', 'video'] as const) $<HTMLInputElement>(kind === 'video' ? 'video-input' : 'texture-input').onchange = () => { void run(async () => {
    const input = $<HTMLInputElement>(kind === 'video' ? 'video-input' : 'texture-input'), file = input.files?.[0],target=uploadTarget; input.value = '';uploadTarget=undefined;if (!file||!target) return;assertChannelTarget(target);
    if (kind === 'image' && (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type) || file.size > LIMITS.imageBytes)) throw new Error('请选择不超过 8 MB 的 PNG、JPEG 或 WebP 图片。');
    if (kind === 'video' && (!['video/mp4', 'video/webm'].includes(file.type) || file.size > LIMITS.videoBytes)) throw new Error('请选择不超过 24 MB 的 MP4 或 WebM 视频。');
    const pass = target.pass, index = target.index;
    const resource = workspace.api.putResource(new Uint8Array(await file.arrayBuffer()));
    try {
      const response = await workspace.api.execute({ apiVersion: '1', requestId: crypto.randomUUID(), operation: kind === 'video' ? 'shader.video.upload' : 'shader.texture.upload', documentId: workspace.document.identity.id, expectedRevision: workspace.document.revision, params: { resourceId: resource.resourceId, name: file.name.slice(0, 160), mimeType: file.type } });
      if (response.status !== 'completed') throw new Error(response.error.message);
      assertChannelTarget(target);workspace.setChannel(pass, index, { kind, assetId: (response.value as { assetId: string }).assetId });await compile();channelPicker.refresh();
    } catch(error){channelPicker.report(error instanceof Error?error.message:String(error));throw error;}finally { workspace.api.releaseResource(resource.resourceId); }
  }); };
  bind('sound-toggle', async () => {
    const runtime = workspace.runtime; if (!runtime) return;
    await runtime.setSoundAudible(!runtime.status().sound.audible);
    if (runtime.status().sound.audible) app.dispatch({ type: 'preview.play', value: true });
    $('sound-toggle').textContent = runtime.status().sound.audible ? '静音' : '开启声音';
    $('sound-toggle').setAttribute('aria-pressed', String(runtime.status().sound.audible));
  });
  $('sound-duration').addEventListener('value-change', () => { void run(() => workspace.configureSound({ duration: Number($<HYSelect>('sound-duration').value) })); });
  $('sound-volume').addEventListener('value-change', () => { void run(() => workspace.configureSound({ volume: Number($<HYSelect>('sound-volume').value) })); });
  bind('sound-export', async () => {
    const button = $<HTMLButtonElement>('sound-export'); button.disabled = true; button.textContent = t('正在导出…');
    try { const bytes = await workspace.runtime?.exportSound(workspace.document.state.sound.duration); if (!bytes) throw new Error('请先运行 Sound。'); download(bytes, `${basename()}.wav`, 'audio/wav'); }
    finally { button.disabled = false; button.textContent = t('导出 WAV'); }
  });
  bind('help-button', () => $<HTMLDialogElement>('help-dialog').showModal());
  bind('translate-glsl', translateSource);
  bind('apply-glsl', async () => { if (!translation) return; workspace.applyGlsl(app.state.activePass, glslEditor.value); editor.show(app.state.activePass, sourceOf(workspace.document.state, app.state.activePass), languageOf(workspace.document.state, app.state.activePass)); $<HTMLDialogElement>('glsl-dialog').close(); await compile(); });
  bind('gpu-retry', () => location.reload());
  window.addEventListener('keydown', event => { if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') { event.preventDefault(); if(route==='practice')return;void run(save); } });
  window.addEventListener('beforeunload', event => { if(opened&&workspace.document.dirty)void app.saveDraft().catch(()=>{});if (hasUnsavedChanges()) { event.preventDefault(); event.returnValue = ''; } });
  window.addEventListener('pagehide', () => { const closing=opened&&workspace.document.dirty?app.saveDraft():app.whenWritesSettled().then(()=>false);disposed = true;if(draftTimer)clearTimeout(draftTimer); if (autoTimer) clearTimeout(autoTimer); saveIndicatorOff();localeOff();productTools.dispose();library.dispose();disposeSettings();uploadCube.dispose(); channelPicker.dispose();sharedUI?.dispose(); notifications.remove(); disposeUI(); tutorial.dispose(); practice.dispose(); wgslPreview.destroy(); generatedPreview.destroy(); shadertoyPreview.destroy(); glslEditor.destroy(); editor.destroy();void closing.catch(()=>{}).finally(async()=>{await workspace.dispose();await store.close();}); }, { once: true });
  window.haiyueEditorHost?.onSaveAndClose(async () => { try { await save(); return !workspace.document.dirty; } catch { return false; } });
  try { saved = await store.list(); } catch (error) { notice(`无法读取 Gallery：${String(error)}。原有数据保留，可导入工程继续创作。`, true); }
  const recoveredDrafts=await store.archive.drafts().catch(()=>[]);if(recoveredDrafts.length)notice(t('发现 {count} 份恢复草稿，可继续之前的创作。',{count:recoveredDrafts.length}));
  const initialRoute = location.hash.slice(1); renderGallery(); $('app').setAttribute('aria-busy', 'false');
  if(initialRoute.startsWith('view/'))await showReadOnly(initialRoute.slice(5));
  else if (initialRoute === 'editor') {await open(saved[0]?.project ?? createPreferred());if(recoveredDrafts.length)void recovery.drafts();}
  else if (initialRoute === 'practice' || initialRoute.startsWith('practice/')) setRoute(initialRoute);
  else if (initialRoute === 'tutorial' || initialRoute.startsWith('tutorial/')) setRoute(initialRoute);
  else setRoute('gallery');
}
void run(start);
