import { Application, Page, Frame, GridLayout, StackLayout, ScrollView, Label, Button, TextView, TextField, ActionBar, NavigationButton, Image, ImageSource, Color, Utils, knownFolders, path, File, Dialogs, isAndroid, type View, type TouchGestureEventData } from '@nativescript/core';
import { Canvas } from '@nativescript/canvas';
import { NativeRenderHost, NativeTouchInput, NativeCanvasTextures } from '@haiyue/native/engine';
import { NativeDesktopInput } from '@haiyue/native/input/desktop';
import { savePhoto } from '@haiyue/native/media';
import { createProject, parseProject, passOf, PASS_IDS, PASS_LABELS, PREVIEW_SCALES, CUBE_FACES, CUBE_FACE_LABELS, codeOf, type CodeId, type ShaderProject, type Channel, type BufferId, type PassId } from '../../web/dist/model.js';
import { examples } from '../../web/dist/examples.js';
import { BUILTIN_TEXTURES, builtinTexture } from '../../web/dist/builtinTextures.js';
import { TUTORIAL_CHAPTERS, TUTORIAL_STAGES, TUTORIAL_REFERENCES } from '../../web/dist/tutorialContent.js';
import { tutorialProject } from '../../web/dist/tutorialLabs.js';
import { translateGlsl } from '../../web/dist/glsl.js';
import { projectTranslationOptions, refreshProjectGlsl } from '../../web/dist/glslProject.js';
import { encodeWave } from '../../web/dist/sound.js';
import { MobileSession } from './session';
import { MobileProjects } from './storage';
import { mobileLayout, type MobilePane } from './layout';
import { applyShaderHighlight } from './highlight';
import { NativeShaderRuntime, NativeCompileError } from './gpu-runtime';
import { NativeSoundStream } from './audio';
import { MobileCompiler } from './compiler';
import { pickFile, shareFile, dataUrl, writeBytes } from './files';
const projects = new MobileProjects();
function label(text: string, cls = '', wrap = true) { const v = new Label(); v.text = text; v.className = cls; v.textWrap = wrap; return v; }
function button(text: string, fn: () => void | Promise<void>, cls = '') { const b = new Button(); b.text = text; b.className = cls; b.accessibilityLabel = text; b.on('tap', () => void perform(fn)); return b; }
async function perform(fn: () => unknown | Promise<unknown>) { try {
    await fn();
}
catch (error) {
    await Dialogs.alert({ title: 'ShaderLab', message: String(error instanceof Error ? error.message : error), okButtonText: '知道了' });
} }
function scroll(content: View, horizontal = false) { const v = new ScrollView(); v.orientation = horizontal ? 'horizontal' : 'vertical'; v.content = content; return v; }
function row(...children: View[]) { const v = new StackLayout(); v.orientation = 'horizontal'; for (const child of children)
    v.addChild(child); return v; }
function page(title: string, back = true) { const p = new Page(); p.backgroundColor = new Color('#101318'); p.actionBar = new ActionBar(); p.actionBar.title = title; if (back) {
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
    content.addChild(label('编写 GLSL / WGSL，用原生 WebGPU 看见想法。', 'muted'));
    content.addChild(row(button('＋ 新建', () => navigate(() => editorPage(createProject())), 'primary'), button('导入', async () => { const value = await imported(); if (value)
        navigate(() => editorPage(value)); }), button('教程', () => navigate(tutorialIndex))));
    const draft = button('恢复上次草稿', async () => { const draft = await projects.restoreDraft(); if (draft)
        navigate(() => editorPage(draft.project, false, draft.pass as CodeId));
    else
        await Dialogs.alert('暂无可恢复草稿'); });
    content.addChild(draft);
    content.addChild(label('示例 · 打开即可编辑', 'section'));
    const cards = new GridLayout();
    content.addChild(cards);
    const samples = examples(), sampleViews = samples.map(sample => { const card = new StackLayout(); card.className = 'card'; const preview = new Image(); preview.src = '~/assets/gallery/' + sample.id + '.png'; preview.height = 140; preview.stretch = 'aspectFill'; card.addChild(preview); card.addChild(label(sample.category, 'muted')); card.addChild(label(sample.label, 'section')); card.addChild(label(sample.project.description, 'muted')); card.addChild(button('打开 ↗', () => navigate(() => editorPage(sample.project, true)))); cards.addChild(card); return card; });
    let columns = 0;
    p.on('layoutChanged', () => { const count = mobileLayout(p.getActualSize().width, p.getActualSize().height).galleryColumns; if (count === columns)
        return; columns = count; cards.columns = Array(count).fill('*').join(','); cards.rows = Array(Math.ceil(sampleViews.length / count)).fill('auto').join(','); sampleViews.forEach((view, i) => { GridLayout.setColumn(view, i % count); GridLayout.setRow(view, Math.floor(i / count)); }); });
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
class MobileEditor {
    readonly page = page('编辑器');
    private session = new MobileSession();
    private root = new GridLayout();
    private panes = new GridLayout();
    private preview = new GridLayout();
    private code = new GridLayout();
    private channels = new StackLayout();
    private channelScroll = scroll(this.channels);
    private canvas = new Canvas();
    private editor = new TextView();
    private tabs = new StackLayout();
    private language!: Button;
    private title = new TextField();
    private status = label('正在初始化…', 'status');
    private diagnostics = label('点击运行，编译全部启用的通道。', 'muted');
    private compiler = new MobileCompiler();
    private pane: MobilePane = 'preview';
    private host?: NativeRenderHost;
    private touch?: NativeTouchInput;
    private desktop?: NativeDesktopInput;
    private runtime?: NativeShaderRuntime;
    private audio?: NativeSoundStream;
    private hiddenRelease?: () => void;
    private changing = false;
    private disposed = false;
    private compiling = false;
    private editTimer?: ReturnType<typeof setTimeout>;
    private draftTimer?: ReturnType<typeof setTimeout>;
    private previewVisible = true;
    private foreground = true;
    private playingButton!: Button;
    private unlisten = () => { };
    constructor(project: ShaderProject, fork: boolean, initial: CodeId) {
        this.session.open(project, fork);
        if (this.session.tabs.includes(initial))
            this.session.pass = initial;
        this.page.actionBar.title = project.name;
        this.root.rows = 'auto,auto,*,auto,1';
        this.root.iosOverflowSafeArea = false;
        this.root.iosOverflowSafeAreaEnabled = false;
        this.page.content = this.root;
        const top = new GridLayout();
        top.columns = '*,auto,auto';
        this.title.text = this.session.project.name;
        this.title.hint = '作品名称';
        this.title.returnKeyType = 'done';
        top.addChild(this.title);
        const save = button('保存', () => this.save(), 'primary');
        GridLayout.setColumn(save, 1);
        top.addChild(save);
        const tools = button('⋯', () => this.tools());
        tools.accessibilityLabel = '更多操作';
        GridLayout.setColumn(tools, 2);
        top.addChild(tools);
        this.root.addChild(top);
        this.title.on('textChange', () => { if (this.title.text !== this.session.project.name) {
            this.session.project.name = this.title.text || 'Untitled shader';
            this.session.changed();
            this.draft();
        } });
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
        this.createCode();
        this.panes.addChild(this.preview);
        this.panes.addChild(this.code);
        this.panes.addChild(this.channelScroll);
        this.showSource();
        this.renderChannels();
        this.page.on('layoutChanged', () => this.layout());
        this.canvas.ignoreTouchEvents = true;
        this.canvas.on('loaded', () => this.attach());
        this.page.on('navigatingFrom', event => { if ((event as {
            isBackNavigation?: boolean;
        }).isBackNavigation)
            this.dispose(); });
        const suspend = () => { this.foreground = false; this.audio?.pause(); this.runtime?.releaseInput(); };
        Application.on(Application.suspendEvent, suspend);
        const resume = () => { this.foreground = true; };
        Application.on(Application.resumeEvent, resume);
        this.unlisten = () => { Application.off(Application.suspendEvent, suspend); Application.off(Application.resumeEvent, resume); };
    }
    private createPreview() {
        this.preview.rows = 'auto,*,auto,auto';
        const bar = row(button('运行', () => this.compile(), 'primary'));
        this.playingButton = button('暂停', () => { if (!this.runtime)
            return; const play = !this.runtime.playing; this.runtime.setPlaying(play); this.playingButton.text = play ? '暂停' : '播放'; if (play)
            this.startSound();
        else
            this.audio?.pause(); });
        bar.addChild(this.playingButton);
        bar.addChild(button('重置', () => { this.runtime?.reset(); this.audio?.reset(); this.startSound(); }));
        bar.addChild(button('单帧', () => { this.runtime?.step(); this.audio?.pause(); this.playingButton.text = '播放'; }));
        this.preview.addChild(scroll(bar, true));
        GridLayout.setRow(this.canvas, 1);
        this.preview.addChild(this.canvas);
        const options = row(button('Canvas / 3D', async () => { const value = await Dialogs.action({ title: '渲染方式', cancelButtonText: '取消', actions: ['Canvas', '球体', '立方体', '圆环'] }); if (value === '取消')
            return; this.session.project.preview.mode = value === 'Canvas' ? 'canvas' : 'scene'; this.session.project.preview.mesh = value === '立方体' ? 'box' : value === '圆环' ? 'torus' : 'sphere'; this.session.changed(); this.runtime?.setMode(this.session.project.preview.mode, this.session.project.preview.mesh); this.draft(); }), button('查看通道', async () => { const ids = this.session.project.passes.filter(p => p.enabled).map(p => p.id); const choice = await Dialogs.action({ title: '预览输出', cancelButtonText: '取消', actions: ids.map(id => PASS_LABELS[id]) }); const id = ids.find(id => PASS_LABELS[id] === choice); if (id && this.runtime) {
            this.runtime.viewed = id;
            this.host?.requestFrame();
        } }), button('分辨率', async () => { const choice = await Dialogs.action({ title: '渲染比例', cancelButtonText: '取消', actions: PREVIEW_SCALES.map(s => s * 100 + '%') }); const scale = PREVIEW_SCALES.find(s => s * 100 + '%' === choice); if (scale) {
            this.session.project.preview.scale = scale;
            this.session.changed();
            await this.compile();
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
        this.code.rows = 'auto,auto,*,auto';
        this.tabs.orientation = 'horizontal';
        this.tabs.className = 'toolbar';
        this.code.addChild(scroll(this.tabs, true));
        this.language = button('WGSL', () => { this.session.switchLanguage(this.session.language === 'wgsl' ? 'glsl' : 'wgsl'); this.showSource(); this.draft(); });
        const actions = row(this.language, button('粘贴', async () => { this.session.paste(await readClipboard()); this.showSource(); this.draft(); }), button('生成代码', () => this.generated()), button('声音', () => { if (this.audio?.playing)
            this.audio.pause();
        else
            this.startSound(); }), button('运行', () => this.compile(), 'primary'));
        const actionsScroll = scroll(actions, true);
        GridLayout.setRow(actionsScroll, 1);
        this.code.addChild(actionsScroll);
        this.editor.autocorrect = false;
        this.editor.autocapitalizationType = 'none';
        this.editor.hint = '';
        GridLayout.setRow(this.editor, 2);
        this.code.addChild(this.editor);
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
        GridLayout.setRow(log, 3);
        this.code.addChild(log);
    }
    private showSource() { this.changing = true; this.editor.text = this.session.source; this.language.text = this.session.language.toUpperCase(); this.tabs.removeChildren(); for (const id of this.session.tabs)
        this.tabs.addChild(button(PASS_LABELS[id], () => { this.session.pass = id; this.showSource(); this.renderChannels(); }, id === this.session.pass ? 'primary' : '')); this.tabs.addChild(button('＋', () => this.addPass())); this.changing = false; setTimeout(() => this.highlight(), 0); }
    private highlight() { if (!this.disposed)
        applyShaderHighlight(this.editor, this.session.language); }
    private draft() { this.status.text = '有未保存的修改'; if (this.draftTimer)
        clearTimeout(this.draftTimer); this.draftTimer = setTimeout(() => void projects.draft(this.session.project, this.session.pass).catch(error => this.message(String(error))), 500); }
    private async save() { const revision = this.session.revision; await projects.save(structuredClone(this.session.project)); this.session.savedRevision = revision; this.status.text = this.session.dirty ? '已保存；仍有新的修改' : '已保存到我的作品'; await projects.draft(this.session.project, this.session.pass); }
    private select(pane: MobilePane) { this.pane = pane; if (pane !== 'code')
        this.editor.dismissSoftInput(); this.layout(); }
    // NativeScript parses column sizes as integer pixels or integer star weights,
    // so percentages (43%) and fractional stars (0.43*) cannot express this split.
    private layout() { const bounds = this.panes.getActualSize(), layout = mobileLayout(bounds.width, bounds.height, this.pane); this.panes.columns = layout.split && this.pane !== 'channels' ? Math.round(layout.previewFraction * 100) + '*,' + Math.round((1 - layout.previewFraction) * 100) + '*' : '*'; this.preview.visibility = layout.preview && this.pane !== 'channels' ? 'visible' : 'collapse'; this.code.visibility = layout.code && this.pane !== 'channels' ? 'visible' : 'collapse'; this.channelScroll.visibility = this.pane === 'channels' ? 'visible' : 'collapse'; GridLayout.setColumn(this.code, layout.split && this.pane !== 'channels' ? 1 : 0); const visible = this.preview.visibility === 'visible'; if (this.previewVisible !== visible) {
        this.previewVisible = visible;
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
        this.host = new NativeRenderHost(this.canvas, text => this.message(text), { diagnosticName: 'shaderlab', diagnosticIntervalFrames: 0, canvasInput: this.touch.target as unknown as HTMLCanvasElement, needsAnimationFrame: () => this.previewVisible && (this.runtime?.playing ?? false), prepareScene: async (engine) => { this.runtime = new NativeShaderRuntime(engine, () => this.host?.requestFrame(), (this.touch!.orbitTarget ?? this.touch!.target) as unknown as HTMLCanvasElement); await this.runtime.initialize(); this.audio = new NativeSoundStream((start, count) => this.runtime!.sound(start, count), message => this.message(message)); try {
                await this.compile();
            }
            catch (error) {
                this.message(String(error));
            } return { product: 'ShaderLab', passes: this.session.tabs }; }, bindInput: () => ({ suspend: () => { this.touch?.suspend(); this.desktop?.suspend(); this.runtime?.releaseInput(); }, resume: () => { this.touch?.resume(); this.desktop?.resume(); }, dispose: () => { this.touch?.dispose(); this.desktop?.dispose(); }, snapshot: () => this.touch?.snapshot() }), disposeScene: () => { this.audio?.dispose(); this.runtime?.dispose(); } });
        const names = ['ArrowLeft', 'ArrowUp', 'ArrowRight', 'ArrowDown', ' ', ...'abcdefghijklmnopqrstuvwxyz', ...'0123456789'];
        this.desktop = new NativeDesktopInput(this.canvas, { bindings: names.map(key => ({ key })), enabled: () => this.previewVisible && !this.disposed, onKey: event => { const code = keyCode(event.key); this.pulse(code); return true; } });
        this.canvas.on('tap', () => this.desktop?.focus());
        this.layout();
    }
    private message(text: string) { if (this.disposed)
        return; this.status.text = text; }
    private startSound() { if (this.foreground && this.runtime?.playing && this.session.project.sound.enabled)
        this.audio?.start(this.session.project.sound.volume); }
    private async compile() { if (!this.runtime) {
        this.message('等待原生 WebGPU 初始化');
        return;
    } if (this.compiling)
        return; this.compiling = true; this.audio?.reset(); this.message('正在编译…'); try {
        const result = await this.runtime.compile(this.session.project);
        if (this.disposed || result.stale)
            return;
        this.diagnostics.text = result.diagnostics.length ? result.diagnostics.map(d => PASS_LABELS[d.pass] + ':' + d.line + ':' + d.column + ' ' + d.message).join('\n') : '编译成功';
        this.diagnostics.className = result.diagnostics.length ? 'error' : 'muted';
        this.message('编译成功 · ' + this.runtime.bufferFormat);
        this.startSound();
    }
    catch (error) {
        this.diagnostics.text = error instanceof NativeCompileError ? error.diagnostics.map(d => PASS_LABELS[d.pass] + ':' + d.line + ':' + d.column + ' ' + d.message).join('\n') : String(error);
        this.diagnostics.className = 'error';
        this.message('编译失败，请查看代码区诊断');
        this.select('code');
    }
    finally {
        this.compiling = false;
    } }
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
        const choices = ['无纹理', '键盘', ...BUILTIN_TEXTURES.map(t => t.name), ...PASS_IDS.filter(id => id !== 'image').map(id => PASS_LABELS[id]), ...this.session.project.assets.map(a => a.name), '上传图片', '上传视频', '上传立方体六面'];
        const choice = await Dialogs.action({ title: 'iChannel' + index, cancelButtonText: '取消', actions: choices });
        if (choice === '取消')
            return;
        let value: Channel | undefined;
        if (choice === '无纹理')
            value = { kind: 'none' };
        else if (choice === '键盘')
            value = { kind: 'keyboard' };
        else {
            const builtin = BUILTIN_TEXTURES.find(t => t.name === choice), buffer = PASS_IDS.find(id => id !== 'image' && PASS_LABELS[id] === choice), asset = this.session.project.assets.find(a => a.name === choice);
            if (builtin)
                value = { kind: 'builtin', texture: builtin.id };
            else if (buffer)
                value = { kind: 'buffer', pass: buffer as BufferId };
            else if (asset)
                value = { kind: asset.kind ?? 'image', assetId: asset.id };
            else if (choice.startsWith('上传'))
                value = await this.upload(choice);
        }
        if (value) {
            this.session.channel(index, value);
            this.showSource();
            this.renderChannels();
            this.draft();
            await this.compile();
        }
    }
    private async upload(choice: string): Promise<Channel | undefined> { if (this.session.project.assets.length >= 16)
        throw Error('每个作品最多 16 个资源'); if (choice === '上传立方体六面') {
        const faces = {} as Record<typeof CUBE_FACES[number], string>;
        for (const face of CUBE_FACES) {
            await Dialogs.alert('请选择 ' + CUBE_FACE_LABELS[face]);
            const file = await pickFile('image');
            if (!file)
                return;
            faces[face] = imageDataUrl(file);
        }
        const id = crypto.randomUUID();
        this.session.project.assets.push({ id, name: 'Cubemap ' + (this.session.project.assets.length + 1), kind: 'cubemap', faces });
        return { kind: 'cubemap', assetId: id };
    } const video = choice === '上传视频', file = await pickFile(video ? 'video' : 'image'); if (!file)
        return; const id = crypto.randomUUID(), kind = video ? 'video' as const : 'image' as const, url = video ? dataUrl(file, 'video/mp4') : imageDataUrl(file); if (url.length > (video ? 24 : 8) * 1024 * 1024 * 1.34)
        throw Error('资源过大，请压缩后导入'); this.session.project.assets.push({ id, name: File.fromPath(file).name, kind, dataUrl: url }); return { kind, assetId: id }; }
    private async generated() {
        const id = this.session.pass;
        let code: string, language: 'wgsl' | 'glsl', notes: string;
        if (this.session.language === 'glsl') {
            const result = translateGlsl(this.session.source, projectTranslationOptions(this.session.project, id));
            if (result.code === null)
                throw Error(result.diagnostics.map(d => d.line + ':' + d.column + ' ' + d.message).join('\n'));
            code = result.code;
            language = 'wgsl';
            notes = result.warnings.join('\n');
        }
        else {
            if (id === 'common')
                throw Error('请在使用 Common 的 Image / Buffer / Sound 页签导出完整 GLSL。');
            const snapshot = structuredClone(this.session.project), diagnostics = refreshProjectGlsl(snapshot);
            if (diagnostics.length)
                throw Error(diagnostics.map(d => d.message).join('\n'));
            this.message('正在生成 Shadertoy GLSL…');
            const result = await this.compiler.translate(codeOf(snapshot, id), { entryPoint: id === 'sound' ? 'sound' : 'image', common: snapshot.common, channels: passOf(snapshot, id).channels });
            if (result.code === null)
                throw Error(result.diagnostics.map(d => d.line + ':' + d.column + ' ' + d.message).join('\n'));
            code = result.code;
            language = 'glsl';
            notes = result.warnings.join('\n');
        }
        if (this.disposed) return;
        const modal = page('生成的 ' + language.toUpperCase(), false), body = new GridLayout();
        body.rows = 'auto,auto,*';
        const close = () => modal.closeModal(), bar = row(button('关闭', close), button('复制', async () => { await Utils.copyToClipboard(code); this.message('已复制生成代码'); }), button('导出', async () => { const file = path.join(knownFolders.temp().path, 'ShaderLab.' + language); await File.fromPath(file).writeText(code); await shareFile(file); }));
        body.addChild(scroll(bar, true));
        const note = label(notes || '生成结果只读。GLSL 输出已包含 Common。', 'muted');
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
    private async tools() { const choice = await Dialogs.action({ title: '作品操作', cancelButtonText: '取消', actions: ['重命名', '导出作品', '导入作品', '保存截图到照片', '分享截图', '导出 Sound WAV', '自动识别粘贴语言：' + (this.session.autoDetect ? '开' : '关')] }); if (choice === '重命名') {
        const result = await Dialogs.prompt({ title: '作品名称', defaultText: this.session.project.name, okButtonText: '确定', cancelButtonText: '取消' });
        if (result.result)
            this.title.text = result.text;
    }
    else if (choice === '导出作品')
        await shareFile(await projects.export(this.session.project));
    else if (choice === '导入作品') {
        const value = await imported();
        if (value) {
            this.dispose();
            this.page.frame.navigate({ create: () => editorPage(value), backstackVisible: false });
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
    else if (choice.startsWith('自动识别'))
        this.session.autoDetect = !this.session.autoDetect; }
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
    private dispose() { if (this.disposed)
        return; this.disposed = true; if (this.editTimer)
        clearTimeout(this.editTimer); if (this.draftTimer)
        clearTimeout(this.draftTimer); void projects.draft(this.session.project, this.session.pass).catch(() => { }); this.unlisten(); this.compiler.dispose(); this.audio?.dispose(); this.host?.dispose(); this.touch?.dispose(); this.desktop?.dispose(); }
}
function keyCode(key: string) { const special: Record<string, number> = { ArrowLeft: 37, ArrowUp: 38, ArrowRight: 39, ArrowDown: 40, '←': 37, '↑': 38, '→': 39, '↓': 40, ' ': 32, Space: 32 }; return special[key] ?? key.toUpperCase().charCodeAt(0); }
function channelLabel(channel: Channel, project: ShaderProject) { switch (channel.kind) {
    case 'none': return '无纹理';
    case 'buffer': return PASS_LABELS[channel.pass];
    case 'keyboard': return '键盘 · held / pressed / toggle';
    case 'builtin': return builtinTexture(channel.texture).name;
    default: return project.assets.find(a => a.id === channel.assetId)?.name ?? '资源缺失';
} }
function readClipboard() { if (!isAndroid)
    return UIPasteboard.generalPasteboard.string ?? ''; const manager = Utils.android.getApplicationContext().getSystemService(android.content.Context.CLIPBOARD_SERVICE) as android.content.ClipboardManager; return manager.hasPrimaryClip() ? String(manager.getPrimaryClip().getItemAt(0).coerceToText(Utils.android.getApplicationContext())) : ''; }
function imageDataUrl(file: string) { const image = ImageSource.fromFileSync(file); if (!image || !image.width || !image.height || Math.max(image.width, image.height) > 4096)
    throw Error('图片需为可解码格式，最大 4096 × 4096 像素'); const value = 'data:image/png;base64,' + image.toBase64String('png'); if (value.length > 8 * 1024 * 1024 * 1.34)
    throw Error('PNG 图片超过 8 MB，请压缩尺寸'); return value; }
