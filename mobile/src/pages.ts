import {shaderPreviewModes} from '../../shared/dist/views/presentation.js';
import {shaderAppearance} from '../../shared/dist/views/presentation.js';
import {editorIcons} from '../../shared/dist/views/editor-icons.js';
import {shaderReference} from '../../shared/dist/views/shader-reference.js';
import {saveIndicator,saveMessage} from '../../shared/dist/views/editor-controller.js';
import {openNativeChannelDrawer} from './platform/channel-drawer';
import {guiComparisonRequested} from './experiments/gui-ui/flags';
import {configurePreviewExperiment, previewProfileSnapshot} from './experiments/gui-ui/preview-profile';
import {installFrameProbe,measureGuiComparison,type FrameProbe} from './experiments/gui-ui/sampling';
import { NativeSharedEditor, useSharedEditor } from './platform/shared-editor';
import { validateNativeEditor, nativePerformanceRequested, measureNativeEditor, nativeLifecycleRequested } from './platform/validation';
import { TrailingTask } from './platform/trailing-task';
import { observeEditorDocument } from './platform/editor-document';
import { validateNativeLifetimes } from './platform/lifecycle-validation';
import { preparedPreview } from '../../shared/dist/ports/preparedPreview.js';
import { Application, Page, Frame, GridLayout, StackLayout, ScrollView, Label, Button, TextView, TextField, FormattedString, Span, Switch, ActionBar, NavigationButton, Image, ImageSource, Color, Utils, knownFolders, path, File, Dialogs, isAndroid, type View, type TouchGestureEventData } from '@nativescript/core';
import { Canvas } from '@nativescript/canvas';
import { NativeRenderHost, NativeTouchInput, NativeCanvasTextures } from '@haiyue/native/engine';
import { NativeDesktopInput } from '@haiyue/native/input/desktop';
import { savePhoto } from '@haiyue/native/media';
import { createProject, parseProject, passOf, PASS_IDS, PASS_LABELS, PREVIEW_SCALES, CUBE_FACES, CUBE_FACE_LABELS, codeOf, type CodeId, type ShaderLanguage, type ShaderProject, type Channel, type BufferId, type PassId } from './project';
import { examples } from '../../web/src/examples.js';
import { BUILTIN_TEXTURES, builtinTexture } from '../../shared/dist/domain/builtinTextures.js';
import { TUTORIAL_CHAPTERS, TUTORIAL_STAGES, TUTORIAL_REFERENCES } from '../../web/src/tutorialContent.js';
import { tutorialProject } from '../../web/src/tutorialLabs.js';
import { translateGlsl } from '../../web/src/glsl.js';
import { createSourceConverter } from '../../web/src/sourceConversion.js';
import { externalCommon, glslCommon } from '../../web/src/sourceCommon.js';
import { projectHlslOptions } from '../../web/src/sourceProject.js';
import { projectTranslationOptions } from '../../web/src/glslProject.js';
import { encodeWave } from '../../web/src/sound.js';
import { MobileSession } from './session';
import { languageOf, sourceOf } from '../../shared/dist/domain/sourceLanguage.js';
import { MobileProjects } from './storage';
import { mobileLayout, type MobilePane } from './layout';
import { applyShaderHighlight } from './highlight';
import { NativeShaderRuntime, NativeCompileError } from './gpu-runtime';
import { NativeSoundStream } from './audio';
import { MobileCompiler } from './compiler';
import { pickFile, shareFile, dataUrl, writeBytes } from './files';
let projects = new MobileProjects();
function label(text: string, cls = '', wrap = true) { const v = new Label(); v.text = text; v.className = cls; v.textWrap = wrap; return v; }
function button(text: string, fn: () => void | Promise<void>, cls = '') { const b = new Button(); b.text = text; b.className = cls; b.accessibilityLabel = text; b.on('tap', () => void perform(fn)); return b; }
function iconButton(icon:string, name:string, fn:()=>void|Promise<void>, cls='') { const b=button(icon,fn,'editor-icon '+cls);b.accessibilityLabel=name;b.width=44;b.height=44;return b; }
async function perform(fn: () => unknown | Promise<unknown>) { try {
    await fn();
}
catch (error) {
    await Dialogs.alert({ title: 'ShaderLab', message: String(error instanceof Error ? error.message : error), okButtonText: '知道了' });
} }
function scroll(content: View, horizontal = false) { const v = new ScrollView(); v.orientation = horizontal ? 'horizontal' : 'vertical'; v.content = content; return v; }
function row(...children: View[]) { const v = new StackLayout(); v.orientation = 'horizontal'; for (const child of children)
    v.addChild(child); return v; }
function page(title: string, back = true) { const p = new Page(); p.backgroundColor = new Color(shaderAppearance.color.canvas); p.actionBar = new ActionBar(); p.actionBar.title = title; if (back) {
    const nav = new NavigationButton();
    nav.text = '返回';
    if (isAndroid)
        nav.android.systemIcon = 'ic_menu_back';
    nav.on('tap', () => p.frame.goBack());
    p.actionBar.navigationButton = nav;
} return p; }
function navigate(create: () => Page) { Frame.topmost().navigate({ create }); }
async function imported() { const file = await pickFile('project'); return file ? parseProject(await File.fromPath(file).readText()) : null; }
export function galleryPage() {
    const p = page('haiyue / ShaderLab', false), content = new StackLayout();
    content.className = 'body';
    p.content = scroll(content);
    content.addChild(label('从灵感开始', 'title'));
    content.addChild(label('编写 GLSL / WGSL / HLSL，用原生 WebGPU 看见想法。', 'muted'));
    content.addChild(row(button('＋ 新建', () => navigate(() => editorPage(createProject())), 'primary'), button('导入', async () => { const value = await imported(); if (value)
        navigate(() => editorPage(value)); }), button('教程', () => navigate(tutorialIndex))));
    const draft = button('恢复上次草稿', async () => { const draft = await projects.restoreDraft(); if (draft)
        navigate(() => editorPage(draft.project, false, draft.pass as CodeId));
    else
        await Dialogs.alert('暂无可恢复草稿'); });
    content.addChild(draft);
    const samples = examples();
    content.addChild(label(`示例 · ${samples.length} 个 · 打开即可编辑`, 'section'));
    const cards = new GridLayout();
    content.addChild(cards);
    const sampleViews = samples.map(sample => {
        const card = new GridLayout();
        card.className = 'card';
        card.padding = 0;
        const body = new StackLayout();
        body.padding = 14;
        body.accessibilityHidden = true;
        const preview = new Image();
        preview.src = '~/assets/gallery/' + sample.id + '.png';
        preview.height = 140;
        preview.stretch = 'aspectFill';
        body.addChild(preview);
        body.addChild(label(sample.label + ' · ' + sample.category, 'muted'));
        body.addChild(label(sample.project.name, 'section'));
        body.addChild(label(sample.project.description, 'muted'));
        card.addChild(body);
        const open = button('', () => navigate(() => editorPage(sample.project, true)), 'example-card-target');
        open.accessibilityLabel = sample.project.name;
        open.accessibilityHint = sample.project.description;
        open.accessibilityIdentifier = 'example-' + sample.id;
        open.horizontalAlignment = 'stretch';
        open.verticalAlignment = 'stretch';
        card.addChild(open);
        cards.addChild(card);
        return card;
    });
    let columns = 0;
    const arrange = (count: number) => {
        if (count === columns)
            return;
        columns = count;
        cards.columns = Array(count).fill('*').join(',');
        cards.rows = Array(Math.ceil(sampleViews.length / count)).fill('auto').join(',');
        sampleViews.forEach((view, i) => { GridLayout.setColumn(view, i % count); GridLayout.setRow(view, Math.floor(i / count)); });
    };
    // Give every card a cell before the first measure. Resize after layout:
    // changing GridLayout specs during layout clears iOS's measured children.
    arrange(1);
    let arrangeTimer: ReturnType<typeof setTimeout> | undefined;
    cards.on('layoutChanged', () => {
        if (arrangeTimer)
            return;
        arrangeTimer = setTimeout(() => {
            arrangeTimer = undefined;
            const { width, height } = cards.getActualSize();
            if (width > 0)
                arrange(mobileLayout(width, height).galleryColumns);
        }, 0);
    });
    cards.on('unloaded', () => {
        if (arrangeTimer)
            clearTimeout(arrangeTimer);
        arrangeTimer = undefined;
    });
    content.addChild(label('我的作品', 'section'));
    const works = new StackLayout();
    content.addChild(works);
    const refresh = async () => { works.removeChildren(); const saved = await projects.list(); if (!saved.length)
        works.addChild(label('点击编辑器里的“保存”，作品才会出现在这里。', 'muted')); for (const project of saved) {
        const card = new GridLayout();
        card.className = 'card';
        card.columns = '*,auto';
        const open = button(project.name, () => navigate(() => editorPage(project)));
        card.addChild(open);
        const remove = button('🗑', async () => { if (await Dialogs.confirm({ title: '删除作品', message: project.name, okButtonText: '删除', cancelButtonText: '取消' })) {
            await projects.remove(project.id);
            await refresh();
        } }, 'danger');
        remove.accessibilityLabel = '删除 ' + project.name;
        GridLayout.setColumn(remove, 1);
        card.addChild(remove);
        works.addChild(card);
    } };
    p.on('navigatedTo', () => void perform(refresh));
    return p;
}
function tutorialIndex() { const p = page('教程'), body = new StackLayout(); body.className = 'body'; for (const [stage, group] of TUTORIAL_STAGES.entries()) {
    body.addChild(label(group.title, 'section'));
    body.addChild(label(group.description, 'muted'));
    for (const chapter of TUTORIAL_CHAPTERS.filter(c => c.stage === stage))
        body.addChild(button(chapter.title, () => navigate(() => tutorialChapter(chapter.id))));
} p.content = scroll(body); return p; }
function tutorialChapter(id: string) { const chapter = TUTORIAL_CHAPTERS.find(c => c.id === id)!; const p = page(chapter.title), body = new StackLayout(); body.className = 'body'; body.addChild(label(chapter.title, 'title')); body.addChild(label(chapter.goal, 'section')); for (const text of [chapter.intro, chapter.detail, chapter.formula])
    body.addChild(label(text)); body.addChild(label('本章新增', 'section')); body.addChild(label(chapter.change)); for (const step of chapter.steps) {
    body.addChild(label(step.title, 'section'));
    body.addChild(label(step.body));
} body.addChild(label('动手实验', 'section')); body.addChild(label([chapter.experiment.parameter, chapter.experiment.before + ' → ' + chapter.experiment.after, chapter.experiment.expected, chapter.exercise].join('\n\n'))); body.addChild(label('容易遇到的问题', 'section')); body.addChild(label(chapter.pitfall)); body.addChild(button('打开本章示例', () => navigate(() => editorPage(tutorialProject(id), true)), 'primary')); body.addChild(label('运行后应看到：' + chapter.expected, 'muted')); for (const ref of chapter.references) {
    const r = TUTORIAL_REFERENCES[ref];
    if (r)
        body.addChild(button(r.title + ' · ' + r.author, () => { Utils.openUrl(r.url); }));
} const index = TUTORIAL_CHAPTERS.indexOf(chapter); if (index + 1 < TUTORIAL_CHAPTERS.length)
    body.addChild(button('下一章 →', () => navigate(() => tutorialChapter(TUTORIAL_CHAPTERS[index + 1]!.id)))); p.content = scroll(body); return p; }
export function editorPage(project: ShaderProject, fork = false, initial: CodeId = 'image') {
    return new MobileEditor(project, fork, initial).page;
}
export function validationPage() {
    // Isolated works and draft folder: never replace the user's current draft.
    projects = new MobileProjects('ShaderLab-G07');
    const fixture=File.fromPath(path.join(knownFolders.currentApp().path,'assets/g07/project.hyshader')).readTextSync();
    if(nativeLifecycleRequested()){
        const coordinator=page('G07 宿主生命周期验收');coordinator.content=label('正在执行 50 次编辑器进入与退出…');
        let started=false;coordinator.on('navigatedTo',()=>{if(started)return;started=true;setTimeout(()=>void validateNativeLifetimes(()=>{
            const editor=new MobileEditor(parseProject(fixture),false,'image',true),frame=Frame.topmost();
            frame.navigate({create:()=>editor.page,animated:false});
            return {snapshot:()=>editor.lifecycleProbe(),references:()=>editor.lifecycleReferences(),leave:()=>{if(!editor.lifecycleProbe().disposed)frame.goBack();}};
        }),0);});return coordinator;
    }
    return new MobileEditor(parseProject(fixture),false,'image',true).page;
}
class MobileEditor {
    readonly page = page('编辑器');
    private session = new MobileSession();
    private shared?: NativeSharedEditor;
    private root = new GridLayout();
    private panes = new GridLayout();
    private preview = new GridLayout();
    private code = new GridLayout();
    private channels = new StackLayout();
    private channelScroll = scroll(this.channels);
    private canvas = new Canvas();
    private editor = new TextView();
    private tabs = new StackLayout();
    private tabSaveLamp?: Span;
    private activeCodeTab?: Button;
    private language!: Button;
    private title = new TextField();
    private status = label('正在初始化…', 'status');
    private diagnostics = label('点击运行，编译全部启用的通道。', 'muted');
    private fps = label('— FPS','muted',false);
    private compileState = label('准备编辑','muted',false);
    private channelDrawer?:{close():void};
    private compiler = new MobileCompiler();
    private wgslCompiler: MobileCompiler['translate'] = (code, options) => this.compiler.translate(code, options);
    private get pane(): MobilePane { return this.session.application.state.pane; }
    private host?: NativeRenderHost;
    private touch?: NativeTouchInput;
    private desktop?: NativeDesktopInput;
    private runtime?: NativeShaderRuntime;
    private guiFrameProbe?:FrameProbe;
    private audio?: NativeSoundStream;
    private hiddenRelease?: () => void;
    private changing = false;
    private disposed = false;
    private compileSequence = 0;
    private editTimer?: ReturnType<typeof setTimeout>;
    private readonly draftTask = new TrailingTask(500, () => void this.session.application.saveDraft().catch(error => this.message(String(error))));
    private layoutTimer?: ReturnType<typeof setTimeout>;
    private previewVisible = true;
    private foreground = true;
    private playingButton!: Button;
    private unlisten = () => { };
    constructor(project: ShaderProject, fork: boolean, initial: CodeId, private readonly validate = false) {
        this.session.application.connect({
            projects: {
                open: async context => { const file = await pickFile('project'); return file && !context.signal.aborted ? parseProject(await File.fromPath(file).readText()) : null; },
                save: async (snapshot, context) => { if (context.signal.aborted) return 'cancelled'; await projects.save(snapshot as ShaderProject); return 'saved'; },
                saveDraft: async (snapshot, context) => { if (!context.signal.aborted) await projects.draft(snapshot as ShaderProject, context.activePass); },
            },
            preview: preparedPreview(() => {
                const runtime = this.runtime;
                if (!runtime) throw Error('等待原生 WebGPU 初始化');
                return { prepare: project => runtime.prepareOwnedSnapshot(project), commit: value => runtime.commit(value), release: value => runtime.releasePrepared(value),
                    play: value => runtime.setPlaying(value), step: () => runtime.step(), reset: () => runtime.reset() };
            }),
        });
        this.session.open(project, fork);
        if (this.session.tabs.includes(initial))
            this.session.pass = initial;
        if (useSharedEditor()) this.shared = new NativeSharedEditor(this.session.application, {
            ensurePreview: async () => { if (!this.runtime) throw Error('等待原生 WebGPU 初始化'); this.audio?.reset(); },
            flushEditor: () => { if (!this.changing && this.editor.text !== this.session.source) this.session.setSource(this.editor.text ?? ''); },
            previewModeChanged: () => this.runtime?.setMode(this.session.project.preview.mode, this.session.project.preview.mesh),
            playbackChanged: action => { if (action === 'reset') this.audio?.reset(); if (this.session.application.state.playing) this.startSound(); else this.audio?.pause(); },
            compiled: () => this.presentCompileResult(),
            exportProject: async () => { await shareFile(await projects.export(this.session.project)); },
        });
        this.page.actionBar.title = project.name;
        this.root.rows = 'auto,auto,*,auto,1';
        this.root.iosOverflowSafeArea = false;
        this.root.iosOverflowSafeAreaEnabled = false;
        this.page.content = this.root;
        if (this.shared) {
            const top = new GridLayout(), sharedHost = new GridLayout(); top.columns = '*,auto'; top.addChild(sharedHost);
            const tools = button('⋯', () => this.tools()); tools.accessibilityLabel = '更多操作'; tools.width=44;tools.height=44;tools.verticalAlignment='top';GridLayout.setColumn(tools,1); top.addChild(tools);
            this.root.addChild(top); this.shared.mount('project',sharedHost);
        } else {
        const top = new GridLayout();
        top.columns = 'auto,*,auto,auto,auto';
        const nameLabel=label('作品名称','',false);nameLabel.marginLeft=8;nameLabel.verticalAlignment='middle';top.addChild(nameLabel);
        this.title.text = this.session.project.name;
        this.title.hint = '作品名称';
        this.title.returnKeyType = 'done';
        this.title.maxWidth=240;GridLayout.setColumn(this.title,1);
        top.addChild(this.title);
        const save = iconButton(editorIcons.save, '保存作品', () => this.save(), 'primary');
        GridLayout.setColumn(save, 2);
        top.addChild(save);
        const exportButton=iconButton(editorIcons.export,'导出工程',async()=>{await shareFile(await projects.export(this.session.project));});
        GridLayout.setColumn(exportButton,3);top.addChild(exportButton);
        const tools = button('⋯', () => this.tools());
        tools.accessibilityLabel = '更多操作';
        GridLayout.setColumn(tools, 4);
        top.addChild(tools);
        this.root.addChild(top);
        this.title.on('textChange', () => { if (this.title.text !== this.session.project.name) {
            this.session.application.dispatch({ type: 'project.rename', name: this.title.text || 'Untitled shader' });
            this.draft();
        } });
        }
        const nav = row(button('预览', () => this.select('preview')), button('代码', () => this.select('code')), button('通道', () => this.select('channels')));
        nav.className = 'toolbar';
        GridLayout.setRow(nav, 1);
        this.root.addChild(nav);
        GridLayout.setRow(this.panes, 2);
        this.root.addChild(this.panes);
        GridLayout.setRow(this.status, 3);
        this.root.addChild(this.status);
        GridLayout.setRow(this.compiler.view, 4);
        this.root.addChild(this.compiler.view);
        this.createPreview();
        if(this.validate&&(nativePerformanceRequested()||guiComparisonRequested())){
            // Canvas.width/height address the backing buffer; constrain its native
            // layout instead so both UI variants render the same pixel workload.
            this.canvas.style.width=256;this.canvas.style.height=144;this.canvas.horizontalAlignment='left';this.canvas.verticalAlignment='top';
        }
        this.createCode();
        this.panes.addChild(this.preview);
        this.panes.addChild(this.code);
        this.panes.addChild(this.channelScroll);
        this.showSource();
        this.renderChannels();
        this.root.on('layoutChanged', () => this.scheduleLayout());
        this.canvas.ignoreTouchEvents = true;
        this.canvas.on('loaded', () => this.attach());
        this.page.on('navigatingFrom', event => { if ((event as {
            isBackNavigation?: boolean;
        }).isBackNavigation)
            this.dispose(); });
        const suspend = () => { this.shared?.suspend(); this.foreground = false; this.audio?.pause(); this.runtime?.releaseInput(); this.runtime?.setCaptureVisible(false); };
        Application.on(Application.suspendEvent, suspend);
        const resume = () => { this.foreground = true; this.shared?.resume(); this.runtime?.setCaptureVisible(this.previewVisible); };
        Application.on(Application.resumeEvent, resume);
        const stateOff = this.shared ? observeEditorDocument(this.session, {
            showSource: () => {this.channelDrawer?.close();this.showSource();}, renderChannels: () => this.renderChannels(),
            syncSource: source => { if (!this.changing && this.editor.text !== source) { this.changing = true; this.editor.text = source; this.changing = false; this.highlight(); } },
            title: name => { this.page.actionBar.title = name; }, draft: () => this.draft(),
        }) : () => {};
        const saveOff=this.shared?this.shared.controller.subscribe(state=>saveIndicator(state)+':'+saveMessage(state),()=>this.syncTabSaveState()):this.session.application.subscribe(()=>this.syncTabSaveState());
        const compileOff=this.session.application.select(state=>state.compile.status,status=>{this.compileState.text=status==='ready'?'已编译':status==='compiling'?'正在编译…':status==='failed'?'编译失败':'代码已修改';});
        this.unlisten = () => { compileOff();saveOff();stateOff(); Application.off(Application.suspendEvent, suspend); Application.off(Application.resumeEvent, resume); };
        this.layout();
    }
    private createPreview() {
        if (!this.shared) { this.createLegacyPreview(); return; }
        this.preview.rows = '*,auto,auto';
        const toolbar = new GridLayout(); GridLayout.setRow(toolbar,1); this.preview.addChild(toolbar); this.shared.mount('toolbar',toolbar);
        const surface = new GridLayout(); this.preview.addChild(surface);
        this.shared.mount('preview',surface,this.canvas,value => { if (!value) this.runtime?.releaseInput(); this.runtime?.setCaptureVisible(value && this.foreground && this.previewVisible); });
        const extras = row(button('渲染方式',async()=>{
            const choice=await Dialogs.action({title:'渲染方式',cancelButtonText:'取消',actions:shaderPreviewModes.map(option=>option.label)});
            const selected=shaderPreviewModes.find(option=>option.label===choice);if(!selected||this.disposed)return;
            const mesh=selected.value==='canvas'?this.session.project.preview.mesh:selected.value as typeof this.session.project.preview.mesh;
            this.session.application.dispatch({type:'preview.mode',mode:selected.value==='canvas'?'canvas':'scene',mesh});this.runtime?.setMode(this.session.project.preview.mode,mesh);this.draft();
        }),this.fps,button('查看通道',async () => {
            const ids=this.session.project.passes.filter(p=>p.enabled).map(p=>p.id);
            const choice=await Dialogs.action({title:'预览输出',cancelButtonText:'取消',actions:ids.map(id=>PASS_LABELS[id])});
            const id=ids.find(id=>PASS_LABELS[id]===choice);if(id&&this.runtime){this.runtime.viewed=id;this.host?.requestFrame();}
        }),button('键盘',()=>this.keyboard()));
        const extrasScroll=scroll(extras,true);GridLayout.setRow(extrasScroll,2);this.preview.addChild(extrasScroll);
    }
    private createLegacyPreview() {
        this.preview.rows = 'auto,*,auto,auto';
        const bar = row(iconButton(editorIcons.run, '运行', () => this.compile(), 'primary'));
        this.playingButton = iconButton(editorIcons.pause, '暂停', () => { if (!this.runtime)
            return; const play = !this.runtime.playing; this.session.application.dispatch({ type: 'preview.play', value: play }); this.playingButton.text = play ? editorIcons.pause : editorIcons.play; this.playingButton.accessibilityLabel = play ? '暂停' : '播放'; if (play)
            this.startSound();
        else
            this.audio?.pause(); });
        bar.addChild(this.playingButton);
        bar.addChild(iconButton(editorIcons.reset, '重置', () => { this.session.application.dispatch({ type: 'preview.reset' }); this.audio?.reset(); this.startSound(); }));
        bar.addChild(iconButton(editorIcons.step, '单帧', () => { this.session.application.dispatch({ type: 'preview.step' }); this.audio?.pause(); this.playingButton.text = editorIcons.play; this.playingButton.accessibilityLabel = '播放'; }));
        this.preview.addChild(scroll(bar, true));
        GridLayout.setRow(this.canvas, 1);
        this.preview.addChild(this.canvas);
        const options = row(button('Canvas / 3D', async () => { const value = await Dialogs.action({ title: '渲染方式', cancelButtonText: '取消', actions: ['Canvas', '球体', '立方体', '圆环'] }); if (value === '取消')
            return; this.session.application.dispatch({ type: 'preview.mode', mode: value === 'Canvas' ? 'canvas' : 'scene', mesh: value === '立方体' ? 'box' : value === '圆环' ? 'torus' : 'sphere' }); this.runtime?.setMode(this.session.project.preview.mode, this.session.project.preview.mesh); this.draft(); }), button('查看通道', async () => { const ids = this.session.project.passes.filter(p => p.enabled).map(p => p.id); const choice = await Dialogs.action({ title: '预览输出', cancelButtonText: '取消', actions: ids.map(id => PASS_LABELS[id]) }); const id = ids.find(id => PASS_LABELS[id] === choice); if (id && this.runtime) {
            this.runtime.viewed = id;
            this.host?.requestFrame();
        } }), button('分辨率', async () => { const choice = await Dialogs.action({ title: '渲染比例', cancelButtonText: '取消', actions: PREVIEW_SCALES.map(s => s * 100 + '%') }); const scale = PREVIEW_SCALES.find(s => s * 100 + '%' === choice); if (scale) {
            await this.legacyScale(scale);
        } }), button('键盘', () => this.keyboard()));
        const optionsScroll = scroll(options, true);
        GridLayout.setRow(optionsScroll, 2);
        this.preview.addChild(optionsScroll);
        const help = label('触摸：iMouse · 3D：拖动旋转、双指缩放', 'muted');
        help.margin = 8;
        GridLayout.setRow(help, 3);
        this.preview.addChild(help);
    }
    private createCode() {
        this.code.rows = 'auto,auto,*,auto,auto';
        this.tabs.orientation = 'horizontal';
        this.tabs.className = 'toolbar';
        const tabBar=new GridLayout();tabBar.columns='*,auto';tabBar.addChild(scroll(this.tabs,true));
        const reference=button('内置变量',()=>{
            const modal=page('内置变量',false),body=new StackLayout();body.padding=16;
            body.addChild(button('关闭',()=>modal.closeModal()));
            for(const [name,description] of shaderReference){body.addChild(label(name));const detail=label(description,'muted');detail.marginBottom=12;body.addChild(detail);}
            modal.content=scroll(body);this.page.showModal(modal,{fullscreen:false,closeCallback:()=>{}});
        });GridLayout.setColumn(reference,1);tabBar.addChild(reference);this.code.addChild(tabBar);
        this.session.application.connect({ convertSource: createSourceConverter({
            wgsl: this.wgslCompiler,
            hlsl: (code, options) => this.compiler.hlsl(code, options),
        }) });
        this.language = button('WGSL', async () => {
            const choice = await Dialogs.action({ title: '转换代码语言', cancelButtonText: '取消', actions: ['WGSL', 'GLSL', 'HLSL'] });
            if (this.disposed || !['WGSL', 'GLSL', 'HLSL'].includes(choice) || choice.toLowerCase() === this.session.language) return;
            this.language.isEnabled = false;
            this.message('正在转换代码…');
            try {
                if (await this.session.switchLanguage(choice.toLowerCase() as ShaderLanguage)) {
                    this.showSource(); this.draft(); this.message('已转换为 ' + choice);
                }
            } finally { if (!this.disposed) { this.language.isEnabled = true; this.showSource(); } }
        });
        this.language.accessibilityIdentifier = 'shader-language';
        const detect=new Switch();detect.checked=this.session.autoDetect;detect.accessibilityLabel='粘贴时自动识别语言';detect.on('checkedChange',()=>{this.session.autoDetect=detect.checked;});
        const actions = row(this.language, detect, label('粘贴时自动识别语言','muted',false), button('收起键盘', () => this.editor.dismissSoftInput()), button('粘贴', async () => { this.session.paste(await readClipboard()); this.showSource(); this.draft(); }), button('生成代码', () => this.generated()), button('声音', () => { if (this.audio?.playing)
            this.audio.pause();
        else
            this.startSound(); }), iconButton(editorIcons.run, '运行', () => this.compile(), 'primary'));
        const actionsScroll = scroll(actions, true);
        GridLayout.setRow(actionsScroll, 1);
        this.code.addChild(actionsScroll);
        this.editor.autocorrect = false;
        this.editor.autocapitalizationType = 'none';
        this.editor.hint = '';
        if (this.shared) { const host=new GridLayout(); GridLayout.setRow(host,2); this.code.addChild(host); this.shared.mount('editor',host,this.editor); }
        else { GridLayout.setRow(this.editor, 2); this.code.addChild(this.editor); }
        this.editor.on('loaded', () => { if (isAndroid) {
            const view = this.editor.android as android.widget.EditText;
            view.setInputType(android.text.InputType.TYPE_CLASS_TEXT | android.text.InputType.TYPE_TEXT_FLAG_MULTI_LINE | android.text.InputType.TYPE_TEXT_FLAG_NO_SUGGESTIONS);
            view.setTypeface(android.graphics.Typeface.MONOSPACE);
            view.setGravity(android.view.Gravity.TOP | android.view.Gravity.LEFT);
        }
        else {
            const view = this.editor.ios as UITextView;
            view.font = UIFont.monospacedSystemFontOfSizeWeight(13, UIFontWeightRegular);
            view.spellCheckingType = UITextSpellCheckingType.No;
            view.smartQuotesType = UITextSmartQuotesType.No;
            view.smartDashesType = UITextSmartDashesType.No;
        } this.highlight(); });
        this.editor.on('textChange', () => { if (this.changing)
            return; try {
            this.session.setSource(this.editor.text);
            this.draft();
            if (this.editTimer)
                clearTimeout(this.editTimer);
            this.editTimer = setTimeout(() => this.highlight(), 180);
        }
        catch (error) {
            this.message(String(error));
        } });
        const log = scroll(this.diagnostics);
        log.maxHeight = 110;
        const outputHeading=row(label('编译输出','muted',false),this.compileState);outputHeading.className='toolbar';GridLayout.setRow(outputHeading,3);this.code.addChild(outputHeading);
        GridLayout.setRow(log, 4);
        this.code.addChild(log);
    }
    private showSource() { this.changing = true; this.editor.text = this.session.source; this.language.text = this.session.language.toUpperCase(); this.language.accessibilityLabel = this.language.text; this.tabs.removeChildren();this.tabSaveLamp=undefined;this.activeCodeTab=undefined;
        for (const id of this.session.tabs) {
            const tab=button(PASS_LABELS[id], () => { this.session.pass = id; this.showSource(); this.renderChannels(); }, id === this.session.pass ? 'primary' : '');
            if(id===this.session.pass){const text=new FormattedString(),name=new Span(),lamp=new Span();name.text=PASS_LABELS[id]+'  ';lamp.text='●';lamp.fontSize=10;text.spans.push(name,lamp);tab.formattedText=text;this.tabSaveLamp=lamp;this.activeCodeTab=tab;}
            this.tabs.addChild(tab);
        }
        this.syncTabSaveState();this.tabs.addChild(button('＋', () => this.addPass())); this.changing = false; setTimeout(() => this.highlight(), 0); }
    private syncTabSaveState() {
        if(!this.tabSaveLamp||!this.activeCodeTab)return;
        const view=this.shared?.controller.getSnapshot(),modified=view?saveIndicator(view)==='modified':this.session.dirty||this.session.application.state.save.status==='failed';
        this.tabSaveLamp.color=new Color(modified?shaderAppearance.color.unsaved:shaderAppearance.color.saved);
        const save=this.session.application.state.save,description=save.status==='saving'?'正在保存…':save.status==='failed'?'保存失败：'+save.error:modified?'有未保存的修改':'已保存';
        this.activeCodeTab.accessibilityLabel=PASS_LABELS[this.session.pass]+' · '+description;
    }
    private highlight() { if (!this.disposed)
        applyShaderHighlight(this.editor, this.session.language); }
    private draft() { if (!this.shared) this.status.text = '有未保存的修改'; this.draftTask.request(); }
    private async save() { if(this.shared){await this.shared.controller.save();await this.session.application.saveDraft();return;} if (!await this.session.application.save() || this.disposed) return; this.status.text = this.session.dirty ? '已保存；仍有新的修改' : '已保存到我的作品'; await this.session.application.saveDraft(); }
    private select(pane: MobilePane) { this.session.application.dispatch({ type: 'pane.select', pane }); if (pane !== 'code')
        this.editor.dismissSoftInput(); this.layout(); }
    private scheduleLayout() {
        if (this.disposed || this.layoutTimer)
            return;
        this.layoutTimer = setTimeout(() => {
            this.layoutTimer = undefined;
            if (!this.disposed)
                this.layout();
        }, 0);
    }
    // NativeScript parses column sizes as integer pixels or integer star weights,
    // so percentages (43%) and fractional stars (0.43*) cannot express this split.
    private layout() { const bounds = this.panes.getActualSize(), layout = mobileLayout(bounds.width, bounds.height, this.pane); this.panes.columns = layout.split && this.pane !== 'channels' ? Math.round(layout.previewFraction * 100) + '*,' + Math.round((1 - layout.previewFraction) * 100) + '*' : '*'; this.preview.visibility = layout.preview && this.pane !== 'channels' ? 'visible' : 'collapse'; this.code.visibility = layout.code && this.pane !== 'channels' ? 'visible' : 'collapse'; this.channelScroll.visibility = this.pane === 'channels' ? 'visible' : 'collapse'; GridLayout.setColumn(this.code, layout.split && this.pane !== 'channels' ? 1 : 0); const visible = this.preview.visibility === 'visible'; if (this.previewVisible !== visible) {
        this.previewVisible = visible;
        this.runtime?.setCaptureVisible(visible && this.foreground);
        if (!visible) {
            this.hiddenRelease = this.host?.pausePresentation();
        }
        else {
            this.hiddenRelease?.();
            this.hiddenRelease = undefined;
            this.host?.requestFrame();
        }
    } }
    private attach() {
        if (this.host || this.disposed)
            return;
        this.touch = new NativeTouchInput(this.canvas, event => { if (!['down', 'move', 'up', 'cancel'].includes(event.action)) {
            this.runtime?.releaseInput();
            return;
        } const size = this.canvas.getActualSize(); for (const point of event.points)
            this.runtime?.touch(event.action, point.id, point.x, point.y, size.width, size.height); }, { pinchZoom: true });
        this.host = new NativeRenderHost(this.canvas, text => this.message(text), { diagnosticName: 'shaderlab', diagnosticIntervalFrames: 0, canvasInput: this.touch.target as unknown as HTMLCanvasElement, needsAnimationFrame: () => this.previewVisible && (this.runtime?.playing ?? false), prepareScene: async (engine) => { if(guiComparisonRequested())this.guiFrameProbe=installFrameProbe(engine); this.runtime = new NativeShaderRuntime(engine, () => this.host?.requestFrame(), (this.touch!.orbitTarget ?? this.touch!.target) as unknown as HTMLCanvasElement, (code, options) => this.compiler.hlsl(code, options), undefined, this.wgslCompiler); this.runtime.onCameraError = message => { this.message(message); this.shared?.controller.report(message); }; this.runtime.setCaptureVisible(this.foreground && this.previewVisible); configurePreviewExperiment(this.runtime, engine); await this.runtime.initialize(); this.runtime.onFrame=()=>{const state=this.runtime!.status(),text=state.playing&&!state.fps?'— FPS':`${Math.round(state.fps)} FPS`;if(this.fps.text!==text)this.fps.text=text;}; this.audio = new NativeSoundStream((start, count) => this.runtime!.sound(start, count), message => this.message(message)); try {
                await this.compile();
            }
            catch (error) {
                this.message(String(error));
            } return { product: 'ShaderLab', passes: this.session.tabs }; }, bindInput: () => ({ suspend: () => { this.touch?.suspend(); this.desktop?.suspend(); this.runtime?.releaseInput(); }, resume: () => { this.touch?.resume(); this.desktop?.resume(); }, dispose: () => { this.touch?.dispose(); this.desktop?.dispose(); }, snapshot: () => this.touch?.snapshot() }), disposeScene: () => { this.guiFrameProbe?.dispose(); this.audio?.dispose(); this.runtime?.dispose(); } });
        const names = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', ' ', ...'abcdefghijklmnopqrstuvwxyz', ...'0123456789'];
        this.desktop = new NativeDesktopInput(this.canvas, { bindings: names.map(key => ({ key })), enabled: () => this.previewVisible && !this.disposed, onKey: event => { const code = keyCode(event.key); this.pulse(code); return true; } });
        this.canvas.on('tap', () => this.desktop?.focus());
        if(this.validate&&guiComparisonRequested()){
            const run=async()=>{while(!this.runtime||!this.guiFrameProbe){if(this.disposed)return;await new Promise(r=>setTimeout(r,50));}
                await measureGuiComparison({frameWorkOptimized:()=>this.runtime!.optimizeFrameWork,previewProfile:()=>previewProfileSnapshot(this.runtime!),mode:'shared',application:this.session.application,engine:this.runtime.engine,probe:this.guiFrameProbe,disposed:()=>this.disposed,
                    scale:value=>this.shared!.controller.dispatch({key:'/shader-toolbar/controls/scale',type:'commit',value:String(value),reason:'keyboard',transaction:1}),
                    status:()=>this.runtime!.status(),surfaceSize:()=>({width:this.runtime!.engine.width,height:this.runtime!.engine.height}),diagnostics:()=>this.shared!.diagnostics(),readPixels:()=>this.runtime!.readImage()});};void run();
        }
        else if(this.validate&&nativePerformanceRequested())void measureNativeEditor({
            mode:this.shared?'shared':'legacy',application:this.session.application,disposed:()=>this.disposed,
            scale:value=>{if(this.shared)this.shared.controller.dispatch({key:'/shader-toolbar/controls/scale',type:'commit',value:String(value),reason:'keyboard',transaction:1});else void this.legacyScale(value as typeof PREVIEW_SCALES[number]);},
            frame:()=>new Promise((resolve,reject)=>{const engine=this.runtime?.engine;if(!engine){reject(Error('GPU unavailable'));return;}const finish=()=>{clearTimeout(timeout);engine.off('after-update',finish);resolve();};const timeout=setTimeout(()=>{engine.off('after-update',finish);reject(Error('No presented frame for 10 seconds'));},10000);engine.on('after-update',finish);}),
            status:()=>this.runtime?.status()??{frame:0,width:0,height:0,ready:false},
            surfaceSize:()=>({width:this.runtime!.engine.width,height:this.runtime!.engine.height}),
            diagnostics:()=>this.shared?.diagnostics()??this.host?.renderingSnapshot(),
        });
        else if (this.validate && this.shared && !nativeLifecycleRequested()) void validateNativeEditor({
            application:this.session.application,shared:this.shared,disposed:()=>this.disposed,
            status:()=>this.runtime?.status()??{frame:0,width:0,height:0,ready:false},
            surfaceSize:()=>({width:this.runtime!.engine.width,height:this.runtime!.engine.height}),
            setSource:source=>{this.editor.text=source;this.session.setSource(source);},
            saved:()=>projects.list(),pixels:()=>this.runtime!.readImage(),
        });
        this.layout();
    }
    private message(text: string) { if (this.disposed)
        return; this.status.text = text;this.status.visibility='visible'; }
    private startSound() { if (this.foreground && this.runtime?.playing && this.session.project.sound.enabled)
        this.audio?.start(this.session.project.sound.volume); }
    private async legacyScale(scale:typeof PREVIEW_SCALES[number]) {
        this.session.application.dispatch({type:'preview.scale',value:scale});this.draft();await this.compile();
    }
    private async compile() { if(this.shared){await this.shared.controller.compile();return;} if (!this.runtime) {
        this.message('等待原生 WebGPU 初始化');
        return;
    } const sequence = ++this.compileSequence; this.audio?.reset();this.status.visibility='collapse'; try {
        const compiled = await this.session.application.compile();
        if (this.disposed || sequence !== this.compileSequence || this.session.application.state.compile.status === 'idle') return;
        const result = this.session.application.state.compile;
        if (!compiled) throw new NativeCompileError([...result.diagnostics]);
        this.diagnostics.text = result.diagnostics.length ? result.diagnostics.map(d => PASS_LABELS[d.pass] + ':' + d.line + ':' + d.column + ' ' + d.message).join('\n') : '编译成功';
        this.diagnostics.className = result.diagnostics.length ? 'error' : 'muted';
        this.status.visibility='collapse';
        this.startSound();
    }
    catch (error) {
        if (this.disposed || sequence !== this.compileSequence) return;
        this.diagnostics.text = error instanceof NativeCompileError ? error.diagnostics.map(d => PASS_LABELS[d.pass] + ':' + d.line + ':' + d.column + ' ' + d.message).join('\n') : String(error);
        this.diagnostics.className = 'error';
        this.message('编译失败，请查看代码区诊断');
        this.select('code');
    }
 }
    private presentCompileResult() {
        if(this.disposed)return;
        const result=this.session.application.state.compile;
        if(result.status!=='ready'&&result.status!=='failed')return;
        this.diagnostics.text=result.diagnostics.length?result.diagnostics.map(d=>PASS_LABELS[d.pass]+':'+d.line+':'+d.column+' '+d.message).join('\n'):'编译成功';
        this.diagnostics.className=result.status==='failed'?'error':'muted';
        if(result.status==='failed')this.message('编译失败；保留当前页面与上次预览');else this.status.visibility='collapse';
        if(result.status==='ready')this.startSound();
    }
    private async addPass() { const ids: CodeId[] = ['common', 'buffer-a', 'buffer-b', 'buffer-c', 'buffer-d', 'sound']; const available = ids.filter(id => !this.session.tabs.includes(id)); if (!available.length)
        return; const choice = await Dialogs.action({ title: '添加页签', cancelButtonText: '取消', actions: available.map(id => PASS_LABELS[id]) }), id = available.find(id => PASS_LABELS[id] === choice); if (!id)
        return; this.session.add(id); this.showSource(); this.renderChannels(); this.draft(); if (id === 'sound')
        await this.compile(); }
    private renderChannels() { this.channels.removeChildren(); this.channels.className = 'body'; this.channels.addChild(label(PASS_LABELS[this.session.pass] + ' · 通道', 'title')); if (this.session.pass === 'common') {
        this.channels.addChild(label('Common 的函数和常量可供所有 Buffer、Image 和 Sound 共用；通道在各个渲染页签里绑定。'));
        return;
    } const pass = passOf(this.session.project, this.session.pass); for (let i = 0; i < 4; i++) {
        const card = new StackLayout();
        card.className = 'card';
        const channel = pass.channels[i]!;
        card.addChild(label('iChannel' + i, 'section'));
        card.addChild(label(channelLabel(channel, this.session.project)));
        if (channel.kind === 'builtin') {
            const image = new Image();
            image.src = '~/assets/' + builtinTexture(channel.texture).file;
            image.height = 100;
            image.stretch = 'aspectFit';
            card.addChild(image);
        }
        card.addChild(button('选择输入', () => this.chooseChannel(i)));
        if (channel.kind === 'buffer')
            card.addChild(button('查看 ' + PASS_LABELS[channel.pass] + ' 画面', () => { if (this.runtime) {
                this.runtime.viewed = channel.pass;
                this.select('preview');
                this.host?.requestFrame();
            } }));
        this.channels.addChild(card);
    } if (this.session.pass !== 'image')
        this.channels.addChild(button(pass.enabled ? '停用此页签' : '启用此页签', () => { if (this.session.pass === 'common')
            return; this.session.enable(this.session.pass, !pass.enabled); this.renderChannels(); this.draft(); })); }
    private async chooseChannel(index: number) {
        if(this.session.pass==='common')return;
        const pass=this.session.pass,session=this.session.application.state.session;
        this.channelDrawer?.close();
        this.channelDrawer=openNativeChannelDrawer(this.page,{project:()=>this.session.project,session:()=>this.session.application.state.session,pass,index,
            bind:async value=>{if(this.disposed||session!==this.session.application.state.session)throw Error('作品已切换，请重新选择通道。');this.session.application.dispatch({type:'channel.set',pass,index,channel:value});this.showSource();this.renderChannels();this.draft();await this.compile();},
            upload:kind=>this.upload(kind==='image'?'上传图片':kind==='video'?'上传视频':'上传立方体六面',session),
            bufferPreview:async id=>{
                if(!this.runtime)return;
                const image=await this.runtime.readImage(id),raster=new NativeCanvasTextures(this.runtime.engine.device);
                try{const canvas=raster.createCanvas2D(image.width,image.height),ctx=canvas.getContext('2d');if(!ctx)return;const pixels=ctx.createImageData(image.width,image.height);pixels.data.set(image.pixels);ctx.putImageData(pixels,0,0);const url=canvas.toDataURL('image/png');return ImageSource.fromBase64Sync(url.slice(url.indexOf(',')+1));}finally{raster.dispose();}
            },
        });
    }
    private async upload(choice: string,ownerSession=this.session.application.state.session): Promise<Channel | undefined> { if (this.session.project.assets.length >= 16)
        throw Error('每个作品最多 16 个资源'); if (choice === '上传立方体六面') {
        const faces = {} as Record<typeof CUBE_FACES[number], string>;
        for (const face of CUBE_FACES) {
            await Dialogs.alert('请选择 ' + CUBE_FACE_LABELS[face]);
            const file = await pickFile('image');
            if(this.disposed||ownerSession!==this.session.application.state.session)throw Error('作品已切换，请重新上传素材。');
            if (!file)
                return;
            faces[face] = imageDataUrl(file);
        }
        const id = crypto.randomUUID();
        this.session.application.change(p => { p.assets.push({ id, name: 'Cubemap ' + (p.assets.length + 1), kind: 'cubemap', faces }); });
        return { kind: 'cubemap', assetId: id };
    } const video = choice === '上传视频', file = await pickFile(video ? 'video' : 'image');if(this.disposed||ownerSession!==this.session.application.state.session)throw Error('作品已切换，请重新上传素材。'); if (!file)
        return; const id = crypto.randomUUID(), kind = video ? 'video' as const : 'image' as const, url = video ? dataUrl(file, 'video/mp4') : imageDataUrl(file); if (url.length > (video ? 24 : 8) * 1024 * 1024 * 1.34)
        throw Error('资源过大，请压缩后导入'); this.session.application.change(p => { p.assets.push({ id, name: File.fromPath(file).name, kind, dataUrl: url }); }); return { kind, assetId: id }; }
    private async generated() {
        const id = this.session.pass, snapshot = this.session.application.snapshot();
        const authored = sourceOf(snapshot, id), sourceLanguage = languageOf(snapshot, id);
        let code: string, language: 'wgsl' | 'glsl', notes: string;
        if (sourceLanguage !== 'wgsl') {
            const result = sourceLanguage === 'hlsl' ? await this.compiler.hlsl(authored, await projectHlslOptions(snapshot, id, this.wgslCompiler)) : translateGlsl(authored, { ...projectTranslationOptions(snapshot, id), ...(externalCommon(authored) ? { common: await glslCommon(snapshot, id, this.wgslCompiler) } : {}) });
            if (result.code === null)
                throw Error(result.diagnostics.map(d => d.line + ':' + d.column + ' ' + d.message).join('\n'));
            code = result.code;
            language = 'wgsl';
            notes = result.warnings.join('\n');
        }
        else {
            if (id === 'common')
                throw Error('请在使用 Common 的 Image / Buffer / Sound 页签导出完整 GLSL。');
            if (languageOf(snapshot, 'common') === 'hlsl' && sourceOf(snapshot, 'common').trim())
                throw Error('HLSL Common 暂不支持生成 Shadertoy GLSL，请导出作品或在 HLSL 页签查看 WGSL。');
            this.message('正在生成 GLSL…');
            code = await createSourceConverter({ wgsl: this.wgslCompiler, hlsl: (source, options) => this.compiler.hlsl(source, options) })(structuredClone(snapshot), id, 'glsl');
            language = 'glsl';
            notes = '生成结果只读。Common 保持独立；导出单文件时会链接 Common。';
        }
        if (this.disposed) return;
        const modal = page('生成的 ' + language.toUpperCase(), false), body = new GridLayout();
        body.rows = 'auto,auto,*';
        const close = () => modal.closeModal(), bar = row(button('关闭', close), button('复制', async () => { await Utils.copyToClipboard(code); this.message('已复制生成代码'); }), button('导出', async () => { const file = path.join(knownFolders.temp().path, 'ShaderLab.' + language); const exported = language === 'glsl' && externalCommon(code) ? (await glslCommon(snapshot, id, this.wgslCompiler)) + '\n' + code : code; await File.fromPath(file).writeText(exported); await shareFile(file); }));
        body.addChild(scroll(bar, true));
        const note = label(notes || '生成结果只读。', 'muted');
        GridLayout.setRow(note, 1);
        body.addChild(note);
        const source = new TextView();
        source.text = code;
        source.editable = false;
        source.on('loaded', () => applyShaderHighlight(source, language));
        GridLayout.setRow(source, 2);
        body.addChild(source);
        modal.content = body;
        const release = this.host?.pausePresentation();
        this.audio?.pause();
        this.page.showModal(modal, { fullscreen: true, closeCallback: () => { release?.(); this.startSound(); } });
    }
    private pulse(code: number) { if (!code || !this.runtime)
        return; this.runtime.keyboard.down(code); this.host?.requestFrame(); setTimeout(() => { this.runtime?.keyboard.up(code); this.host?.requestFrame(); }, 90); }
    private async keyboard() { const modal = page('Shader 键盘', false), body = new StackLayout(); body.className = 'body'; body.addChild(label('按住虚拟按键，写入 256 × 3 键盘纹理。', 'muted')); for (const keys of [['↑', '←', '↓', '→'], ['W', 'A', 'S', 'D', 'R', 'F'], ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.match(/.{1,6}/g)!.map(s => s.split('')), ['Space']]) {
        const line = row();
        for (const key of keys) {
            const code = keyCode(key), b = new Button();
            b.text = key;
            b.minWidth = 40;
            b.padding = 5;
            b.on('touch', event => { const action = (event as TouchGestureEventData).action; if (action === 'down')
                this.runtime?.keyboard.down(code);
            else if (action === 'up' || action === 'cancel')
                this.runtime?.keyboard.up(code); this.host?.requestFrame(); });
            line.addChild(b);
        }
        body.addChild(line);
    } body.addChild(button('关闭', () => modal.closeModal())); modal.content = scroll(body); this.page.showModal(modal, { fullscreen: false, closeCallback: () => { this.runtime?.releaseInput(); this.host?.requestFrame(); } }); }
    private async tools() { const choice = await Dialogs.action({ title: '作品操作', cancelButtonText: '取消', actions: ['重命名', '导出作品', '导入作品', '保存截图到照片', '分享截图', '导出 Sound WAV'] }); if (choice === '重命名') {
        const result = await Dialogs.prompt({ title: '作品名称', defaultText: this.session.project.name, okButtonText: '确定', cancelButtonText: '取消' });
        if (result.result) { this.session.application.dispatch({type:'project.rename',name:result.text.trim()||'Untitled shader'}); if(!this.shared)this.title.text=result.text; }
    }
    else if (choice === '导出作品')
        await shareFile(await projects.export(this.session.project));
    else if (choice === '导入作品') {
        if (await this.session.application.pick()) {
            this.title.text = this.session.project.name; this.showSource(); this.renderChannels();
            this.select('preview'); await this.compile();
        }
    }
    else if (choice === '保存截图到照片' || choice === '分享截图')
        await this.screenshot(choice === '分享截图');
    else if (choice === '导出 Sound WAV') {
        if (!this.runtime)
            throw Error('预览尚未就绪');
        const result = await Dialogs.prompt({ title: 'WAV 导出时长（秒）', defaultText: String(this.session.project.sound.duration), okButtonText: '导出', cancelButtonText: '取消' });
        if (!result.result)
            return;
        const seconds = Number(result.text);
        if (!Number.isFinite(seconds) || seconds < 1 || seconds > 120)
            throw Error('导出范围为 1–120 秒；实时播放没有时长上限。');
        const audio = await this.runtime.sound(0, Math.round(seconds * 44100)), file = path.join(knownFolders.temp().path, 'ShaderLab.wav');
        writeBytes(file, encodeWave(audio));
        await shareFile(file);
    }
    }
    private async screenshot(share: boolean) { if (!this.runtime)
        throw Error('预览尚未就绪'); const image = await this.runtime.readImage(), raster = new NativeCanvasTextures(this.runtime.engine.device); try {
        const canvas = raster.createCanvas2D(image.width, image.height), ctx = canvas.getContext('2d');
        if (!ctx)
            throw Error('截图编码失败');
        const pixels = ctx.createImageData(image.width, image.height);
        pixels.data.set(image.pixels);
        ctx.putImageData(pixels, 0, 0);
        if (share) {
            const url = canvas.toDataURL('image/png'), file = path.join(knownFolders.temp().path, 'ShaderLab.png');
            const source = isAndroid ? android.util.Base64.decode(url.slice(url.indexOf(',') + 1), android.util.Base64.DEFAULT) : NSData.alloc().initWithBase64EncodedStringOptions(url.slice(url.indexOf(',') + 1), 0 as NSDataBase64DecodingOptions);
            File.fromPath(file).writeSync(source);
            await shareFile(file);
        }
        else {
            await savePhoto(canvas, 'ShaderLab-' + Date.now() + '.png');
            this.message('截图已保存到照片');
        }
    }
    finally {
        raster.dispose();
    } }
    lifecycleReferences(){const device=this.runtime?.engine.device as any,context=(this.canvas as any)._gpuContext;return Object.fromEntries(Object.entries({editor:this,page:this.page,canvas:this.canvas,host:this.host,runtime:this.runtime,engine:this.runtime?.engine,device,nativeDevice:device?.native,queue:device?.queue,nativeQueue:device?.queue?.native,context,nativeContext:context?.native}).filter(([,value])=>!!value).map(([key,value])=>[key,new WeakRef(value!)]));}
    lifecycleProbe(){return {disposed:this.disposed,pageLoaded:this.page.isLoaded,pageNative:!!this.page.nativeViewProtected,canvasNative:!!this.canvas.nativeViewProtected,engineState:this.runtime?.engine.state,frame:this.runtime?.status().frame??0,shared:this.shared?.diagnostics(),scheduledCallbacks:this.host?.renderingSnapshot().scheduledCallbacks};}
    private dispose() { if (this.disposed)
        return; this.disposed = true; if (this.editTimer)
        clearTimeout(this.editTimer); if (this.layoutTimer)
        clearTimeout(this.layoutTimer);this.channelDrawer?.close(); this.draftTask.dispose(); void projects.draft(this.session.application.snapshot(), this.session.pass).catch(() => { });
        // Finish frame/device cleanup before PlatformView
        // removal tears down the native Canvas context.
        this.host?.dispose(); this.shared?.dispose(); this.session.application.dispose(); this.unlisten(); this.compiler.dispose(); this.audio?.dispose(); this.touch?.dispose(); this.desktop?.dispose(); }
}
function keyCode(key: string) { const special: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, '←': 37, '↑': 38, '→': 39, '↓': 40, ' ': 32, Space: 32 }; return special[key] ?? key.toUpperCase().charCodeAt(0); }
function channelLabel(channel: Channel, project: ShaderProject) { switch (channel.kind) {
    case 'none': return '无纹理';
    case 'buffer': return PASS_LABELS[channel.pass];
    case 'keyboard': return '键盘 · held / pressed / toggle';
    case 'camera': return channel.facing === 'user' ? '前置相机 · 实时视频' : '后置相机 · 实时视频';
    case 'builtin': return builtinTexture(channel.texture).name;
    default: return project.assets.find(a => a.id === channel.assetId)?.name ?? '资源缺失';
} }
function readClipboard() { if (!isAndroid)
    return UIPasteboard.generalPasteboard.string ?? ''; const manager = Utils.android.getApplicationContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager; return manager.hasPrimaryClip() ? String(manager.getPrimaryClip().getItemAt(0).coerceToText(Utils.android.getApplicationContext())) : ''; }
function imageDataUrl(file: string) { const image = ImageSource.fromFileSync(file); if (!image || !image.width || !image.height || Math.max(image.width, image.height) > 4096)
    throw Error('图片需为可解码格式，最大 4096 × 4096 像素'); const value = 'data:image/png;base64,' + image.toBase64String('png'); if (value.length > 8 * 1024 * 1024 * 1.34)
    throw Error('PNG 图片超过 8 MB，请压缩尺寸'); return value; }
