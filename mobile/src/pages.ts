import {validateProduct,nativeProductRequested} from './platform/product-validation';
import {nativeTutorialIndex,nativeTutorialChapter,type TutorialPorts} from './tutorial';
import {tutorialReview} from './platform/tutorial-review';
import {validateCreations,nativeCreationRequested} from './platform/creation-validation';
import {nativeCreationLibrary,nativeEngineExport,type NativeCreationPorts} from './platform/creation-tools';
import {createEnginePackage} from '../../web/src/enginePackage.js';
import {nativeParameters,nativeMetadata,nativeInspection,nativeSharing,type NativeProductPorts} from './platform/product-tools';
import {filterLibrary,duplicateProject,receiveProject,type LibraryFilter} from '../../shared/dist/domain/library.js';
import {practiceForChapter} from '../../shared/dist/domain/learning.js';
import {HYNativeCardGrid,hyShowNativeOverlay} from '@haiyue/native/ui';
import {HYNativeButton,nativeAction,nativeCardTarget,nativeTab,pickNative} from './platform/presentation';
import type {HYIconName} from '@haiyue/ui/core';
import {practiceIndex} from './practice';
import {NativeCodeChrome} from './platform/code-chrome';
import {confirmNative} from './platform/confirmation';
import {createGalleryDeleteAction} from './platform/gallery-deletion';
import {createPageNavigation} from './platform/page-navigation';
import {showNativeDrafts,showNativeTrash,showNativeHistory,reviewNativeConversion} from './platform/recovery';
import {EditorKeyboardHost,type EditorCommand} from './platform/editor-keyboard';
import {openNativeSearch,focusNativeLine,nativeComposing,nativeSelection} from './platform/editor-tools';
import {validateRecovery} from './platform/recovery-validation';
import {shaderPreviewModes} from '../../shared/dist/views/presentation.js';
import {shaderAppearance,shaderTheme} from '../../shared/dist/views/presentation.js';
import {editorIcons} from '../../shared/dist/views/editor-icons.js';
import {shaderReference} from '../../shared/dist/views/shader-reference.js';
import {saveIndicator,saveMessage} from '../../shared/dist/views/editor-controller.js';
import {openNativeChannelDrawer} from './platform/channel-drawer';
import {preferences} from './preferences';
import {installNativeSettings,localizedNativeText} from './platform/settings';
import {t,onLocaleChange} from '../../shared/dist/views/i18n.js';
import {preferredProject,preferredSource} from '../../shared/dist/domain/preferences.js';
import {guiComparisonRequested} from './experiments/gui-ui/flags';
import {configurePreviewExperiment, previewProfileSnapshot} from './experiments/gui-ui/preview-profile';
import {installFrameProbe,measureGuiComparison,type FrameProbe} from './experiments/gui-ui/sampling';
import { NativeSharedEditor, useSharedEditor } from './platform/shared-editor';
import { validateNativeEditor, nativePerformanceRequested, measureNativeEditor, nativeLifecycleRequested } from './platform/validation';
import { TrailingTask } from './platform/trailing-task';
import { observeEditorDocument } from './platform/editor-document';
import { validateNativeLifetimes } from './platform/lifecycle-validation';
import { preparedPreview } from '../../shared/dist/ports/preparedPreview.js';
import { ApplicationSettings, Application, Page, Frame, GridLayout, StackLayout, ScrollView, Label, Button, TextView, TextField, FormattedString, Span, Switch, ActionBar, NavigationButton, Image, ImageSource, Color, Utils, knownFolders, path, File, Dialogs, isAndroid, type View, type TouchGestureEventData } from '@nativescript/core';
import { Canvas } from '@nativescript/canvas';
import { NativeRenderHost, NativeTouchInput, NativeCanvasTextures } from '@haiyue/native/engine';
import { NativeDesktopInput } from '@haiyue/native/input/desktop';
import { savePhoto } from '@haiyue/native/media';
import { createProject, parseProject, passOf, PASS_IDS, PASS_LABELS, PREVIEW_SCALES, CUBE_FACES, CUBE_FACE_LABELS, codeOf, type CodeId, type ShaderLanguage, type ShaderProject, type Channel, type BufferId, type PassId } from './project';
import { examples } from '../../web/src/examples.js';
import { BUILTIN_TEXTURES, builtinTexture } from '../../shared/dist/domain/builtinTextures.js';
import { TUTORIAL_CHAPTERS } from '../../web/src/tutorialContent.js';
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
import { applyShaderHighlight, bindShaderHighlight } from './highlight';
import { NativeShaderRuntime, NativeCompileError } from './gpu-runtime';
import { NativeSoundStream } from './audio';
import { MobileCompiler } from './compiler';
import { pickFile, shareFile, dataUrl, writeBytes } from './files';
let projects = new MobileProjects();
function label(text: string, cls = '', wrap = true) { const v = localizedNativeText(new Label(),text); v.className = cls; v.textWrap = wrap; return v; }
function button(text: string, fn: () => void | Promise<void>, cls = '',translate=true) {
    const b=cls==='example-card-target'?nativeCardTarget():nativeAction(translate?t(text):text,cls==='primary');
    if(translate)localizedNativeText(b,text);if(cls==='danger'&&b instanceof HYNativeButton)b.setPresentation({text:translate?t(text):text,variant:'danger'},shaderTheme);
    b.className=cls;b.accessibilityLabel=translate?t(text):text;b.on('tap',()=>void perform(fn));return b;
}
function iconButton(icon:HYIconName,name:string,fn:()=>void|Promise<void>,cls='') { const b=new HYNativeButton({text:'',icon,variant:cls==='primary'?'primary':'quiet',a11y:{label:t(name)}},shaderTheme);localizedNativeText(b,'',name);b.width=44;b.height=44;b.on('tap',()=>void perform(fn));return b; }
async function perform(fn: () => unknown | Promise<unknown>) { try {
    await fn();
}
catch (error) {
    await Dialogs.alert({ title: 'ShaderLab', message: String(error instanceof Error ? error.message : error), okButtonText: t('知道了') });
} }
function scroll(content: View, horizontal = false) { const v = new ScrollView(); v.orientation = horizontal ? 'horizontal' : 'vertical'; v.content = content; return v; }
function row(...children: View[]) { const v = new StackLayout(); v.orientation = 'horizontal'; for (const child of children)
    {child.verticalAlignment='middle';v.addChild(child);} return v; }
function page(title: string, back = true) { const p = new Page(); p.backgroundColor = new Color(shaderAppearance.color.canvas); p.actionBar = new ActionBar(); p.actionBar.title = title; if (back) {
    const nav = new NavigationButton();
    nav.text = '返回';
    if (isAndroid)
        nav.android.systemIcon = 'ic_menu_back';
    nav.on('tap', () => p.frame.goBack());
    p.actionBar.navigationButton = nav;
} return p; }
function navigate(create: () => Page) { Frame.topmost().navigate({ create }); }
async function imported() { const file = await pickFile('project'); return file ? receiveProject(parseProject(await File.fromPath(file).readText()),await projects.list(),crypto.randomUUID(),new Date().toISOString()) : null; }
export function galleryPage() {
    const p = page('haiyue / ShaderLab', false), content = new StackLayout();
    const navigation = createPageNavigation(p, {current:()=>p.frame?.currentPage,navigate:create=>p.frame.navigate({create})});
    const navigate = (create:()=>Page):void => { navigation.open(create); };
    p.on('navigatedTo',()=>navigation.returned());
    installNativeSettings(p);
    content.className = 'body';
    p.content = scroll(content);
    content.addChild(label('从灵感开始', 'title'));
    content.addChild(label('编写 GLSL / WGSL / HLSL，用原生 WebGPU 看见想法。', 'muted'));
    const shortcuts=new GridLayout();shortcuts.id='gallery-actions';shortcuts.columns='44,8,44,8,44,8,44,8,44,*';shortcuts.marginTop=12;shortcuts.marginBottom=4;
    const shortcut=(id:string,name:string,action:()=>void|Promise<void>,primary=false)=>{
        const control=new HYNativeButton({text:'',variant:primary?'primary':'secondary',a11y:{label:t(name)}},shaderTheme);
        localizedNativeText(control,'',name);control.id=control.accessibilityIdentifier='gallery-'+id;control.width=control.height=44;
        control.backgroundImage='~/assets/gallery-actions/'+id+'.png';control.backgroundSize='22 22';control.backgroundPosition='center center';control.backgroundRepeat='no-repeat';
        control.on('tap',()=>void perform(action));GridLayout.setColumn(control,shortcuts.getChildrenCount()*2);shortcuts.addChild(control);
    };
    shortcut('new','新建',()=>navigate(()=>editorPage(preferredProject(preferences().shaderLanguage,{ids:{next:()=>crypto.randomUUID()},clock:{nowISO:()=>new Date().toISOString()}}))),true);
    shortcut('import','导入',async()=>{const value=await imported();if(value)navigate(()=>editorPage(value));});
    shortcut('tutorial','教程',()=>navigate(tutorialIndex));
    shortcut('practice','练习场',()=>navigate(()=>practiceIndex(project=>editorPage(project),'',tutorialChapter)));
    shortcut('restore-draft','恢复草稿',()=>showNativeDrafts(p,projects,(project,pass)=>navigate(()=>editorPage(project,false,pass,true))));
    content.addChild(shortcuts);
    const samples = examples();
    content.addChild(label(`示例 · ${samples.length} 个 · 打开即可编辑`, 'section'));
    const cards = new HYNativeCardGrid({minCardWidth:260,maxColumns:3,gap:12});
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
        return card;
    });
    cards.setItems(sampleViews);
    const worksHeading=new GridLayout();worksHeading.id='library-heading';worksHeading.columns='auto,12,*';worksHeading.marginTop=16;worksHeading.marginBottom=12;
    const worksTitle=label('我的作品','section');worksTitle.margin=0;worksTitle.verticalAlignment='middle';worksHeading.addChild(worksTitle);
    const filter:LibraryFilter={sort:'updated'},search=new TextField();search.hint=search.accessibilityLabel=t('搜索作品');search.id=search.accessibilityIdentifier='library-search';
    search.width='100%';search.maxWidth=280;search.height=44;search.horizontalAlignment='right';search.verticalAlignment='middle';
    search.backgroundImage='~/assets/gallery-actions/search.png';search.backgroundSize='18 18';search.backgroundPosition='12 center';search.backgroundRepeat='no-repeat';
    search.paddingLeft=40;search.paddingRight=12;search.style.placeholderColor=new Color(shaderAppearance.color.muted);search.autocorrect=false;search.autocapitalizationType='none';search.returnKeyType='search';search.on('returnPress',()=>search.dismissSoftInput());
    GridLayout.setColumn(search,2);worksHeading.addChild(search);content.addChild(worksHeading);
    const filters=button('筛选与排序',async()=>{const choice=await pickNative(filters,'筛选与排序',[{value:'favorite',label:t('只看收藏')},{value:'updated',label:t('最近更新')},{value:'oldest',label:t('最早更新')},{value:'name',label:t('按名称')},{value:'folder',label:t('文件夹')},{value:'tag',label:t('标签')},{value:'clear',label:t('清除筛选')}]);if(choice==='favorite')filter.favorites=!filter.favorites;else if(choice==='folder'||choice==='tag'){const value=await Dialogs.prompt({title:t(choice==='folder'?'文件夹':'标签'),defaultText:filter[choice]??'',okButtonText:t('确定'),cancelButtonText:t('取消')});if(value.result)filter[choice]=value.text.trim();}else if(choice==='clear'){filter.favorites=false;filter.folder='';filter.tag='';search.text='';}else if(choice)filter.sort=choice as NonNullable<LibraryFilter['sort']>;await refresh();});content.addChild(filters);search.on('textChange',()=>{filter.query=search.text??'';void perform(refresh);});
    const works = new HYNativeCardGrid({minCardWidth:260,maxColumns:3,gap:12});
    content.addChild(works);
    const deleteProject=createGalleryDeleteAction({
        confirm:project=>confirmNative(p,{title:t('删除作品'),message:t('将“{name}”移到回收站？之后可以恢复。',{name:project.name}),accept:t('删除'),destructive:true}),
        remove:id=>projects.remove(id),refresh:()=>refresh(),
    });
    let refreshVersion=0;const refresh = async () => { const version=++refreshVersion,items:View[]=[];const saved = filterLibrary((await projects.list()).map(project=>({project})),filter).map(item=>item.project); if(version!==refreshVersion)return;if (!saved.length)
        items.push(label('点击编辑器里的“保存”，作品才会出现在这里。', 'muted')); for (const project of saved) {
        const card = new GridLayout();
        card.className = 'card';
        card.columns = '*,auto,auto';card.rows='auto,auto';const meta=[project.library?.folder,...project.library?.tags??[]].filter(Boolean).join(' · ');if(meta){const details=label(meta,'muted');GridLayout.setRow(details,1);GridLayout.setColumnSpan(details,3);card.addChild(details);}
        let opening=false;
        const open = button(project.name, async()=>{if(opening||p.frame?.currentPage!==p)return;opening=true;try{const draft=await projects.restoreDraft(project.id);if(draft){const choice=await pickNative(open,'此作品有未保存草稿',[{value:'draft',label:t('恢复草稿')},{value:'saved',label:t('打开已保存版本')}]);if(choice==='draft')navigate(()=>editorPage(draft.project,false,draft.pass,true));else if(choice==='saved')navigate(()=>editorPage(project));}else navigate(()=>editorPage(project));}finally{opening=false;}},'',false);
        card.addChild(open);
        const remove = button('🗑', () => deleteProject(project), 'danger');
        remove.accessibilityIdentifier='delete-project-'+project.id;
        open.accessibilityIdentifier='saved-project-'+project.id;
        remove.accessibilityLabel = '删除 ' + project.name;
        const organize=button('⋯',async()=>{const choice=await pickNative(organize,'作品操作',[{value:'metadata',label:t('整理作品')},{value:'copy',label:t('复制作品')},{value:'favorite',label:t(project.library?.favorite?'取消收藏':'收藏')}]);if(choice==='metadata')nativeMetadata(p,project,async value=>{value.updatedAt=new Date().toISOString();await projects.save(value);await refresh();});else if(choice==='copy'){await projects.save(duplicateProject(project,crypto.randomUUID(),new Date().toISOString()));await refresh();}else if(choice==='favorite'){await projects.save({...project,library:{folder:project.library?.folder??'',tags:project.library?.tags??[],favorite:!project.library?.favorite}});await refresh();}});organize.accessibilityIdentifier='organize-'+project.id;GridLayout.setColumn(organize,1);card.addChild(organize);GridLayout.setColumn(remove, 2);
        card.addChild(remove);
        items.push(card);
    } works.setItems(items);};
    const trash=button('回收站',()=>showNativeTrash(p,projects,refresh));trash.accessibilityIdentifier='gallery-trash';content.addChild(trash);
    p.on('navigatedTo', () => void perform(refresh));
    return p;
}
function tutorialPorts():TutorialPorts{return{page,chapter:tutorialChapter,editor:id=>editorPage(tutorialProject(id),true),practice:id=>practiceIndex(project=>editorPage(project),practiceForChapter(id),tutorialChapter)};}
export function tutorialIndex(){return nativeTutorialIndex(tutorialPorts());}
export function tutorialReviewPage(){projects=new MobileProjects('ShaderLab-TutorialReview');return tutorialReview(tutorialIndex);}
function tutorialChapter(id:string){return nativeTutorialChapter(id,tutorialPorts());}
export function editorPage(project: ShaderProject, fork = false, initial: CodeId = 'image',recovered=false) {
    return new MobileEditor(project, fork, initial,false,recovered).page;
}
export function validationPage() {
    if(!isAndroid)UIApplication.sharedApplication.idleTimerDisabled=true;
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
    private previewSurface?:GridLayout;
    private code = new GridLayout();
    private channels = new StackLayout();
    private channelScroll = scroll(this.channels);
    private canvas = new Canvas();
    private editor = new TextView();
    private tabs = new StackLayout();
    private tabSaveLamp?: Span;
    private activeCodeTab?: Button;
    private navigation = new GridLayout();
    private wideLayout = false;
    private channelColumns:1|2=1;
    private codeChrome?: NativeCodeChrome;
    private outputLog = new ScrollView();
    private outputExpanded = false;
    private outputToggle!: Button;
    private time = label('0.00 s','muted',false);
    private modeButton?: Button;
    private paneButtons:{pane:MobilePane;view:Button}[]=[];
    private codeRun?: Button;
    private language!: Button;
    private title = new TextField();
    private status = label('正在初始化…', 'status');
    private diagnostics = label('点击运行，编译全部启用的通道。', 'muted');
    private fps = label('— FPS','muted',false);
    private compileState = label('准备编辑','muted',false);
    private channelDrawer?:{close():void;closed:Promise<void>};
    private channelOpening=false;
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
    private highlighter?: ReturnType<typeof bindShaderHighlight>;
    private edited=false;
    private readonly draftTask = new TrailingTask(500, () => void this.session.application.saveDraft().catch(error => this.message(String(error))));
    private layoutTimer?: ReturnType<typeof setTimeout>;
    private previewVisible = true;
    private foreground = true;
    private statsAt=0;private fullPreview=false;private fullExit?:View;
    private productPorts():NativeProductPorts{return{page:this.page,app:this.session.application,runtime:()=>this.runtime,compile:()=>this.compile(),changed:()=>this.draft(),flush:()=>this.shared?.controller.flushEdits(),fullscreen:()=>this.presentation()};}
    private creationPorts():NativeCreationPorts{return{...this.productPorts(),library:projects.creations,selection:()=>{const r=nativeSelection(this.editor);return (this.editor.text??'').slice(r.start,r.end);},open:async project=>{if(this.session.dirty)await this.session.application.saveDraft();this.session.open(project);this.showSource();this.renderChannels();this.draft();await this.compile();},package:project=>createEnginePackage(project,(source,options)=>this.compiler.hlsl(source,options),this.wgslCompiler,async id=>dataUrl(path.join(knownFolders.currentApp().path,'assets',builtinTexture(id).file),'image/png'))};}
    private presentation(){this.fullPreview=!this.fullPreview;if(this.fullPreview){this.select('preview');if(!this.fullExit&&this.previewSurface){const exit=button('退出全屏',()=>this.presentation());exit.accessibilityIdentifier='exit-presentation';exit.horizontalAlignment='right';exit.verticalAlignment='top';this.previewSurface.addChild(exit);this.fullExit=exit;}}if(this.fullExit)this.fullExit.visibility=this.fullPreview?'visible':'collapse';this.root.getChildAt(0).visibility=this.fullPreview?'collapse':'visible';this.layout();}

    private playingButton!: Button;
    private unlisten = () => { };
    constructor(project: ShaderProject, fork: boolean, initial: CodeId, private readonly validate = false,recovered=false) {
        this.session.application.connect({
            projects: {
                open: async context => { const file = await pickFile('project'); return file && !context.signal.aborted ? receiveProject(parseProject(await File.fromPath(file).readText()),await projects.list(),crypto.randomUUID(),new Date().toISOString()) : null; },
                save: async (snapshot, context) => { if (context.signal.aborted) return 'cancelled'; await projects.save(snapshot as ShaderProject); return 'saved'; },
                saveDraft: async (snapshot, context) => {if(context.signal.aborted)return;const state=this.session.application.state;if(context.session===state.session&&context.revision<=state.savedRevision){if(context.revision===state.revision){await projects.ready();await projects.archive.discardDraft(snapshot.id,context.session);}return;}await projects.draft(snapshot as ShaderProject,context.activePass,context.session);},
                checkpoint:async(snapshot,context)=>{if(!context.signal.aborted)await projects.checkpoint(snapshot as ShaderProject,'before-conversion',context.activePass);},
            },
            preview: preparedPreview(() => {
                const runtime = this.runtime;
                if (!runtime) throw Error('等待原生 WebGPU 初始化');
                return { prepare: project => runtime.prepareOwnedSnapshot(project), commit: value => runtime.commit(value), release: value => runtime.releasePrepared(value),
                    play: value => runtime.setPlaying(value), step: () => runtime.step(), reset: () => runtime.reset() };
            }),
        });
        this.session.open(project, fork);
        if(recovered)this.session.application.markModified();
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
        this.page.actionBarHidden = true;
        const settings=installNativeSettings(this.page,value=>this.runtime?.setMSAA(value),{inline:true});
        this.root.rows = 'auto,auto,*,auto,1';
        this.root.iosOverflowSafeArea = false;
        this.root.iosOverflowSafeAreaEnabled = false;
        this.page.content = this.root;
        const top=new GridLayout();top.columns='*,auto,auto,auto';top.className='editor-project-bar';
        const sharedHost=new GridLayout();top.addChild(sharedHost);
        if(this.shared)this.shared.mount('project',sharedHost);
        else {
            const name=new GridLayout();name.columns='*,auto,auto';this.title.text=this.session.project.name;this.title.hint=t('作品名称');name.addChild(this.title);
            const save=iconButton(editorIcons.save,'保存作品',()=>this.save(),'primary'),exported=iconButton(editorIcons.export,'导出工程',async()=>{await shareFile(await projects.export(this.session.project));});
            GridLayout.setColumn(save,1);GridLayout.setColumn(exported,2);name.addChild(save);name.addChild(exported);sharedHost.addChild(name);
            this.title.on('textChange',()=>{if(this.title.text!==this.session.project.name){this.session.application.dispatch({type:'project.rename',name:this.title.text||'Untitled shader'});this.draft();}});
        }
        const back=iconButton('back','返回 Gallery',async()=>{this.shared?.controller.flushEdits();if(this.session.dirty)await this.session.application.saveDraft();this.page.frame.goBack();});back.accessibilityIdentifier='editor-back';GridLayout.setColumn(back,1);top.addChild(back);
        GridLayout.setColumn(settings,2);top.addChild(settings);
        const tools=button('⋯',()=>this.tools(tools));tools.width=44;tools.height=44;tools.fontSize=24;tools.accessibilityLabel=t('更多操作');GridLayout.setColumn(tools,3);top.addChild(tools);this.root.addChild(top);
        const nav=row(...([['preview','预览'],['code','代码'],['channels','通道']] as const).map(([pane,name])=>{const view=button(name,()=>this.select(pane));this.paneButtons.push({pane,view});view.on('loaded',()=>nativeTab(view,this.pane===pane,true));return view;}));
        this.navigation.addChild(nav);this.navigation.className='editor-navigation';
        GridLayout.setRow(this.navigation,1);this.root.addChild(this.navigation);
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
        const suspend = () => {if(this.session.dirty)void this.session.application.saveDraft().catch(error=>this.message(String(error)));this.shared?.suspend(); this.foreground = false; this.audio?.pause(); this.runtime?.releaseInput(); this.runtime?.setCaptureVisible(false); };
        Application.on(Application.suspendEvent, suspend);
        const resume = () => { this.foreground = true; this.shared?.resume(); this.runtime?.setCaptureVisible(this.previewVisible); };
        Application.on(Application.resumeEvent, resume);
        const stateOff = this.shared ? observeEditorDocument(this.session, {
            showSource: () => {this.channelDrawer?.close();this.showSource();}, renderChannels: () => this.renderChannels(),
            syncSource: source => { if (!this.changing && this.editor.text !== source) { this.changing = true; this.editor.text = source; this.changing = false; this.highlight(); } },
            title: () => {}, draft: () => this.draft(),
        }) : () => {};
        const saveOff=this.shared?this.shared.controller.subscribe(state=>saveIndicator(state)+':'+saveMessage(state),()=>this.syncTabSaveState()):this.session.application.subscribe(()=>this.syncTabSaveState());
        const compileLabel=()=>{const status=this.session.application.state.compile.status;this.compileState.text=t(status==='ready'?'已编译':status==='compiling'?'正在编译…':status==='failed'?'编译失败':'代码已修改');this.compileState.color=new Color(status==='failed'?shaderAppearance.color.danger:status==='ready'?shaderAppearance.color.saved:shaderAppearance.color.muted);this.outputLog.visibility=status==='failed'||this.outputExpanded?'visible':'collapse';this.codeChrome?.setErrors(this.session.application.state.compile.diagnostics.filter(d=>d.pass===this.session.pass&&d.severity==='error').map(d=>d.line));};
        const compileOff=this.session.application.select(state=>state.compile.status,compileLabel);
        const localeOff=onLocaleChange(()=>{compileLabel();this.renderChannels();this.syncTabSaveState();});
        this.unlisten = () => { localeOff();compileOff();saveOff();stateOff(); Application.off(Application.suspendEvent, suspend); Application.off(Application.resumeEvent, resume); };
        this.layout();
    }
    private createPreview() {
        if (!this.shared) { this.createLegacyPreview(); return; }
        this.preview.rows = '*,auto,auto';this.preview.className='editor-preview';
        const surface=new GridLayout();this.previewSurface=surface;surface.className='editor-preview-surface';surface.clipToBounds=true;this.preview.addChild(surface);
        this.shared.mount('preview',surface,this.canvas,value=>{if(!value)this.runtime?.releaseInput();this.runtime?.setCaptureVisible(value&&this.foreground&&this.previewVisible);});
        const modeButton=new HYNativeButton({text:'Canvas',icon:'chevronDown',variant:'secondary',size:'compact',a11y:{label:t('渲染方式')}},shaderTheme);
        modeButton.width=110;modeButton.height=44;modeButton.horizontalAlignment='right';modeButton.verticalAlignment='top';modeButton.margin=8;modeButton.accessibilityIdentifier='editor-preview-mode';this.modeButton=modeButton;
        modeButton.on('tap',()=>void perform(async()=>{
            const choice=await pickNative(modeButton,'渲染方式',shaderPreviewModes.map(option=>({value:option.value,label:t(option.label)})),this.session.project.preview.mode==='canvas'?'canvas':this.session.project.preview.mesh);
            const selected=shaderPreviewModes.find(option=>option.value===choice);if(!selected||this.disposed)return;
            const mesh=selected.value==='canvas'?this.session.project.preview.mesh:selected.value as typeof this.session.project.preview.mesh;
            this.session.application.dispatch({type:'preview.mode',mode:selected.value==='canvas'?'canvas':'scene',mesh});this.runtime?.setMode(this.session.project.preview.mode,mesh);this.updateMode();this.draft();
        }));surface.addChild(modeButton);this.updateMode();
        const outputButton=button('Image',async()=>{
            const ids=this.session.project.passes.filter(p=>p.enabled).map(p=>p.id);
            const choice=await pickNative(outputButton,'预览输出',ids.map(id=>({value:id,label:PASS_LABELS[id]})),this.runtime?.viewed??'image');
            const id=ids.find(id=>id===choice);if(id&&this.runtime){this.runtime.viewed=id;outputButton.text=PASS_LABELS[id];this.host?.requestFrame();}
        },'',false);outputButton.accessibilityLabel=t('预览输出');outputButton.horizontalAlignment='left';outputButton.verticalAlignment='top';outputButton.margin=8;surface.addChild(outputButton);
        const playback=new GridLayout();playback.columns='*,auto';playback.className='editor-playback';const toolbar=new GridLayout();playback.addChild(toolbar);this.shared.mount('toolbar',toolbar);
        const stats=new StackLayout();stats.verticalAlignment='middle';stats.paddingLeft=4;this.time.fontSize=11;this.fps.fontSize=11;this.time.textAlignment=this.fps.textAlignment='right';stats.addChild(this.time);stats.addChild(this.fps);GridLayout.setColumn(stats,1);playback.addChild(stats);GridLayout.setRow(playback,1);this.preview.addChild(playback);
    }
    private updateMode(){if(this.modeButton){const value=this.session.project.preview;this.modeButton.text=t(shaderPreviewModes.find(option=>option.value===(value.mode==='canvas'?'canvas':value.mesh))?.label??'Canvas');}}
    private createLegacyPreview() {
        this.preview.rows = 'auto,*,auto,auto';
        const bar = row(iconButton(editorIcons.run, '运行', () => this.compile(), 'primary'));
        this.playingButton = iconButton(editorIcons.pause, '暂停', () => { if (!this.runtime)
            return; const play = !this.runtime.playing; this.session.application.dispatch({ type: 'preview.play', value: play }); (this.playingButton as HYNativeButton).setPresentation({text:'',icon:play?editorIcons.pause:editorIcons.play,variant:'quiet',a11y:{label:t(play?'暂停':'播放')}},shaderTheme); this.playingButton.accessibilityLabel = play ? '暂停' : '播放'; if (play)
            this.startSound();
        else
            this.audio?.pause(); });
        bar.addChild(this.playingButton);
        bar.addChild(iconButton(editorIcons.reset, '重置', () => { this.session.application.dispatch({ type: 'preview.reset' }); this.audio?.reset(); this.startSound(); }));
        bar.addChild(iconButton(editorIcons.step, '单帧', () => { this.session.application.dispatch({ type: 'preview.step' }); this.audio?.pause(); (this.playingButton as HYNativeButton).setPresentation({text:'',icon:editorIcons.play,variant:'quiet',a11y:{label:t('播放')}},shaderTheme); this.playingButton.accessibilityLabel = '播放'; }));
        this.preview.addChild(scroll(bar, true));
        GridLayout.setRow(this.canvas, 1);
        this.preview.addChild(this.canvas);
        const options = row(button('Canvas / 3D', async () => { const value = await Dialogs.action({ title: t('渲染方式'), cancelButtonText: t('取消'), actions: ['Canvas', '球体', '立方体', '圆环'] }); if (value === '取消')
            return; this.session.application.dispatch({ type: 'preview.mode', mode: value === 'Canvas' ? 'canvas' : 'scene', mesh: value === '立方体' ? 'box' : value === '圆环' ? 'torus' : 'sphere' }); this.runtime?.setMode(this.session.project.preview.mode, this.session.project.preview.mesh); this.draft(); }), button('查看通道', async () => { const ids = this.session.project.passes.filter(p => p.enabled).map(p => p.id); const choice = await Dialogs.action({ title: t('预览输出'), cancelButtonText: t('取消'), actions: ids.map(id => PASS_LABELS[id]) }); const id = ids.find(id => PASS_LABELS[id] === choice); if (id && this.runtime) {
            this.runtime.viewed = id;
            this.host?.requestFrame();
        } }), button('分辨率', async () => { const choice = await Dialogs.action({ title: t('渲染比例'), cancelButtonText: t('取消'), actions: PREVIEW_SCALES.map(s => s * 100 + '%') }); const scale = PREVIEW_SCALES.find(s => s * 100 + '%' === choice); if (scale) {
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
        this.code.rows = 'auto,auto,*,auto,auto';this.code.className='editor-code';
        this.tabs.orientation = 'horizontal';
        this.tabs.className = 'toolbar';
        const tabBar=new GridLayout();tabBar.className='editor-pass-bar';tabBar.columns='*,auto,auto,auto';tabBar.addChild(scroll(this.tabs,true));
        for(const[index,title,glyph,command]of [[1,'撤销','↶','undo'],[2,'重做','↷','redo']] as const){const control=button(glyph,()=>this.editorCommand(command));control.width=44;control.fontSize=22;control.accessibilityLabel=t(title);control.accessibilityIdentifier='editor-'+command;GridLayout.setColumn(control,index);tabBar.addChild(control);}
        const reference=button('内置变量',()=>{
            const body=new StackLayout();body.padding=20;
            for(const [name,description] of shaderReference){body.addChild(label(name));const detail=label(description,'muted');detail.marginBottom=12;body.addChild(detail);}
            hyShowNativeOverlay(this.page,{title:t('内置变量'),content:body,theme:shaderTheme,kind:'drawer',closeLabel:t('关闭'),returnFocus:reference});
        });GridLayout.setColumn(reference,3);tabBar.addChild(reference);this.code.addChild(tabBar);
        this.session.application.connect({ convertSource: createSourceConverter({
            wgsl: this.wgslCompiler,
            hlsl: (code, options) => this.compiler.hlsl(code, options),
        }) });
        this.language = button('WGSL', async () => {
            const choice = await pickNative(this.language,'转换代码语言',['WGSL','GLSL','HLSL'].map(label=>({value:label,label})),this.session.language.toUpperCase());
            if (this.disposed || (!choice||!['WGSL', 'GLSL', 'HLSL'].includes(choice)) || choice.toLowerCase() === this.session.language) return;
            this.language.isEnabled = false;
            this.message('正在转换代码…');
            try {
                if(nativeComposing(this.editor))throw Error(t('请先确认输入法候选，再保存或运行。'));
                const plan=await this.session.application.prepareLanguageConversion(this.session.pass,choice.toLowerCase() as ShaderLanguage);
                if (plan&&await reviewNativeConversion(this.page,this.session.application,plan)) {
                    this.showSource(); this.draft(); this.message('已转换为 ' + choice);
                }
            } finally { if (!this.disposed) { this.language.isEnabled = true; this.showSource(); } }
        });
        this.language.accessibilityIdentifier = 'shader-language';
        const detect=button('自动识别',()=>{this.session.autoDetect=!this.session.autoDetect;paintDetect();});
        detect.accessibilityIdentifier='editor-detect-language';const paintDetect=()=>{(detect as HYNativeButton).setPresentation({text:t('自动识别'),icon:this.session.autoDetect?'check':undefined,variant:'quiet',size:'compact',a11y:{label:t('粘贴时自动识别语言')}},shaderTheme);detect.accessibilityState=this.session.autoDetect?'checked':undefined;};paintDetect();
        (this.language as HYNativeButton).setPresentation({text:this.session.language.toUpperCase(),icon:'chevronDown',variant:'secondary',size:'compact'},shaderTheme);this.language.minWidth=88;
        const more=button('⋯',()=>this.codeTools(more));more.width=44;more.fontSize=24;more.accessibilityLabel=t('代码操作');more.accessibilityIdentifier='editor-code-tools';
        const actions=new GridLayout();actions.columns='auto,*,auto,auto,auto';actions.className='editor-code-actions';actions.addChild(this.language);GridLayout.setColumn(detect,1);detect.horizontalAlignment='left';actions.addChild(detect);const hide=iconButton('chevronDown','收起键盘',()=>this.editor.dismissSoftInput());hide.accessibilityIdentifier='editor-hide-keyboard';hide.visibility='collapse';this.editor.on('focus',()=>{hide.visibility='visible';if(this.pane!=='code')this.session.application.dispatch({type:'pane.select',pane:'code'});});this.editor.on('blur',()=>hide.visibility='collapse');GridLayout.setColumn(hide,2);actions.addChild(hide);GridLayout.setColumn(more,3);actions.addChild(more);this.codeRun=iconButton(editorIcons.run,'运行',()=>this.compile(),'primary');this.codeRun.accessibilityIdentifier='editor-code-run';GridLayout.setColumn(this.codeRun,4);actions.addChild(this.codeRun);GridLayout.setRow(actions,1);this.code.addChild(actions);
        this.editor.className='editor-source';this.editor.accessibilityIdentifier='shader-code';
        this.editor.autocorrect = false;
        this.editor.autocapitalizationType = 'none';
        this.editor.hint = '';
        this.codeChrome=new NativeCodeChrome(this.editor);const keyboard=new EditorKeyboardHost(this.editor,command=>void perform(()=>this.editorCommand(command)));keyboard.content=this.editor;this.codeChrome.mount(keyboard);
        if(this.shared){const host=new GridLayout();GridLayout.setRow(host,2);this.code.addChild(host);this.shared.mount('editor',host,this.codeChrome.view,undefined,()=>{this.editor.focus();});}
        else {GridLayout.setRow(this.codeChrome.view,2);this.code.addChild(this.codeChrome.view);}
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
        this.highlighter = bindShaderHighlight(this.editor, () => this.session.language);
        this.editor.on('textChange', () => { if (this.changing)
            return; try {
            const before=this.session.source,after=this.editor.text??'';if(before===after)return;let start=0,endBefore=before.length,endAfter=after.length;while(start<endBefore&&start<endAfter&&before[start]===after[start])start++;while(endBefore>start&&endAfter>start&&before[endBefore-1]===after[endAfter-1]){endBefore--;endAfter--;}
            const group=Math.max(endBefore-start,endAfter-start)<=4&&!/[\n\r]/.test(before.slice(start,endBefore)+after.slice(start,endAfter));
            this.session.setSource(after,this.session.language,group);
            this.draft();

        }
        catch (error) {
            this.message(String(error));
        } });
        this.outputLog.content=this.diagnostics;this.outputLog.maxHeight=110;this.outputLog.visibility='collapse';this.outputLog.className='editor-output-body';
        this.outputToggle=button('编译输出',()=>{this.outputExpanded=!this.outputExpanded;this.outputLog.visibility=this.outputExpanded||this.session.application.state.compile.status==='failed'?'visible':'collapse';});this.outputToggle.accessibilityIdentifier='editor-output-toggle';
        const outputHeading=new GridLayout();outputHeading.columns='*,auto';outputHeading.className='editor-output-heading';outputHeading.addChild(this.outputToggle);this.outputToggle.horizontalAlignment='left';this.compileState.marginRight=12;this.compileState.verticalAlignment='middle';GridLayout.setColumn(this.compileState,1);outputHeading.addChild(this.compileState);GridLayout.setRow(outputHeading,3);this.code.addChild(outputHeading);
        GridLayout.setRow(this.outputLog,4);this.code.addChild(this.outputLog);
    }
    private editorCommand(command:EditorCommand){
        if(this.disposed)return;if(nativeComposing(this.editor)){this.message(t('请先确认输入法候选，再保存或运行。'));return;}
        if(command==='save')return this.save();if(command==='run')return this.compile();
        if(command==='find'||command==='replace'){this.select('code');openNativeSearch(this.page,this.editor,this.session.application,()=>{this.showSource();this.draft();});return;}
        if(command==='undo')this.session.application.undoSource();else this.session.application.redoSource();this.showSource();this.draft();
    }
    private async codeTools(anchor:View){
        const choices=['创作素材库','导出 Haiyue 组件','参数与预设','画面与 Pass 调试','撤销','重做','查找与替换','版本历史','粘贴','生成代码','声音','Shader 键盘'];
        const choice=await pickNative(anchor,'代码操作',choices.map(value=>({value,label:t(value)})));
        if(this.disposed)return;
        if(choice==='创作素材库')await nativeCreationLibrary(this.creationPorts());else if(choice==='导出 Haiyue 组件')nativeEngineExport(this.creationPorts());else if(choice==='参数与预设')nativeParameters(this.productPorts());else if(choice==='画面与 Pass 调试')await nativeInspection(this.productPorts());else if(choice==='撤销')this.editorCommand('undo');else if(choice==='重做')this.editorCommand('redo');else if(choice==='查找与替换')this.editorCommand('find');else if(choice==='版本历史')await showNativeHistory(this.page,projects,this.session.application,()=>{this.showSource();this.renderChannels();this.draft();});
        else if(choice==='粘贴'){this.session.paste(await readClipboard());this.showSource();this.draft();}
        else if(choice==='生成代码')await this.generated();
        else if(choice==='声音'){if(this.audio?.playing)this.audio.pause();else this.startSound();}
        else if(choice==='Shader 键盘')this.keyboard();
    }
    private showSource() { this.changing = true; this.editor.text = this.session.source; this.language.text = this.session.language.toUpperCase(); this.language.accessibilityLabel = this.language.text; this.tabs.removeChildren();this.tabSaveLamp=undefined;this.activeCodeTab=undefined;
        for (const id of this.session.tabs) {
            const tab=button(PASS_LABELS[id], () => { this.session.pass = id; this.showSource(); this.renderChannels(); }, '');
            nativeTab(tab,id===this.session.pass);tab.on('loaded',()=>nativeTab(tab,id===this.session.pass));
            if(id===this.session.pass){const text=new FormattedString(),name=new Span(),lamp=new Span();name.text=PASS_LABELS[id]+'  ';lamp.text='●';lamp.fontSize=10;text.spans.push(name,lamp);tab.formattedText=text;this.tabSaveLamp=lamp;this.activeCodeTab=tab;}
            this.tabs.addChild(tab);
        }
        this.syncTabSaveState();this.updateMode();this.codeChrome?.setErrors(this.session.application.state.compile.diagnostics.filter(d=>d.pass===this.session.pass&&d.severity==='error').map(d=>d.line));this.tabs.addChild(button('＋', () => this.addPass())); this.changing = false; setTimeout(() => this.highlight(), 0); }
    private syncTabSaveState() {
        if(!this.tabSaveLamp||!this.activeCodeTab)return;
        const view=this.shared?.controller.getSnapshot(),modified=view?saveIndicator(view)==='modified':this.session.dirty||this.session.application.state.save.status==='failed';
        this.tabSaveLamp.color=new Color(modified?shaderAppearance.color.unsaved:shaderAppearance.color.saved);
        const save=this.session.application.state.save,description=save.status==='saving'?'正在保存…':save.status==='failed'?'保存失败：'+save.error:modified?'有未保存的修改':'已保存';
        this.activeCodeTab.accessibilityLabel=PASS_LABELS[this.session.pass]+' · '+description;
    }
    private highlight() { if (!this.disposed)
        this.highlighter?.refresh(); }
    private draft() {this.edited=true;if (!this.shared) this.status.text = '有未保存的修改'; this.draftTask.request(); }
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
    private layout() {
        if(this.disposed)return;
        const bounds=this.panes.getActualSize(),viewport=this.root.getActualSize(),layout=mobileLayout(bounds.width,bounds.height,this.pane),split=layout.split&&!this.fullPreview;
        const columns:1|2=viewport.width>viewport.height?2:1,columnsChanged=columns!==this.channelColumns;
        this.channelColumns=columns;
        const rows=Math.ceil(4/columns),desiredChannels=this.session.pass==='common'?104:40+rows*100+(rows-1)*8+(this.session.pass==='image'?0:44);
        const channelHeight=Math.min(desiredChannels,Math.max(180,bounds.height-200));
        if(this.previewSurface){
            this.preview.rows=split?'auto,auto,auto,*':'*,auto,auto';
            const height=split?Math.max(120,Math.round(Math.min(Math.max(120,bounds.height-channelHeight-72),(bounds.width*layout.previewFraction-16)*.75))):'auto';
            if(this.previewSurface.height!==height)this.previewSurface.height=height;
        }
        this.navigation.visibility=split||this.fullPreview?'collapse':'visible';if(this.codeRun)this.codeRun.visibility=split?'collapse':'visible';
        const moved=this.wideLayout!==split||this.channelScroll.parent!==(split?this.preview:this.panes);
        if(moved){
            this.wideLayout=split;if(this.channelScroll.parent instanceof GridLayout)this.channelScroll.parent.removeChild(this.channelScroll);
            if(!this.shared)this.preview.rows=split?'auto,*,auto,auto,auto':'auto,*,auto,auto';
            GridLayout.setColumn(this.channelScroll,0);GridLayout.setRow(this.channelScroll,split?(this.shared?2:4):0);(split?this.preview:this.panes).addChild(this.channelScroll);
        }
        const channelSize=split?channelHeight:'auto';if(this.channelScroll.height!==channelSize)this.channelScroll.height=channelSize;
        if(moved||columnsChanged)this.renderChannels();
        for(const {pane,view} of this.paneButtons)nativeTab(view,this.pane===pane,true);
        this.panes.columns=split?Math.round(layout.previewFraction*100)+'*,'+Math.round((1-layout.previewFraction)*100)+'*':'*';
        this.preview.visibility=split||this.pane==='preview'?'visible':'collapse';this.code.visibility=split||this.pane==='code'?'visible':'collapse';this.codeChrome?.setVisible(this.code.visibility==='visible');this.channelScroll.visibility=split||this.pane==='channels'?'visible':'collapse';GridLayout.setColumn(this.code,split?1:0);
        const visible=this.preview.visibility==='visible';if(this.previewVisible!==visible){this.previewVisible=visible;this.runtime?.setCaptureVisible(visible&&this.foreground);if(!visible)this.hiddenRelease=this.host?.pausePresentation();else{this.hiddenRelease?.();this.hiddenRelease=undefined;this.host?.requestFrame();}}
    }
    private attach() {
        if (this.host || this.disposed)
            return;
        this.touch = new NativeTouchInput(this.canvas, event => { if (!['down', 'move', 'up', 'cancel'].includes(event.action)) {
            this.runtime?.releaseInput();
            return;
        } const size = this.canvas.getActualSize(); for (const point of event.points)
            this.runtime?.touch(event.action, point.id, point.x, point.y, size.width, size.height); }, { pinchZoom: true });
        this.host = new NativeRenderHost(this.canvas, text => this.message(text), { diagnosticName: 'shaderlab', diagnosticIntervalFrames: 0, canvasInput: this.touch.target as unknown as HTMLCanvasElement, needsAnimationFrame: () => this.previewVisible && ((this.runtime?.playing ?? false)||!!this.runtime?.hasPendingGpuWork), prepareScene: async (engine) => { if(guiComparisonRequested())this.guiFrameProbe=installFrameProbe(engine); this.runtime = new NativeShaderRuntime(engine, () => this.host?.requestFrame(), (this.touch!.orbitTarget ?? this.touch!.target) as unknown as HTMLCanvasElement, (code, options) => this.compiler.hlsl(code, options), undefined, this.wgslCompiler); this.runtime.onCameraError = message => { this.message(message); this.shared?.controller.report(message); }; this.runtime.setCaptureVisible(this.foreground && this.previewVisible); configurePreviewExperiment(this.runtime, engine); await this.runtime.initialize();this.runtime.setMSAA(preferences().msaa); this.runtime.onFrame=()=>{const state=this.runtime!.status(),now=Date.now();if(state.playing&&now<this.statsAt)return;this.statsAt=now+250;const text=state.playing&&!state.fps?'— FPS':`${Math.round(state.fps)} FPS`;if(this.fps.text!==text)this.fps.text=text;const time=state.time.toFixed(2)+' s';if(this.time.text!==time)this.time.text=time;}; this.audio = new NativeSoundStream((start, count) => this.runtime!.sound(start, count), message => this.message(message)); try {
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
            saved:()=>projects.list(),pixels:()=>this.runtime!.readImage(),recovery:async()=>{const recovery=await validateRecovery(this.session.application,projects,this.editor,()=>this.showSource());if(nativeCreationRequested())return{...recovery,creation:await validateCreations(this.creationPorts(),projects)};return nativeProductRequested()?{...recovery,product:await validateProduct(this.productPorts(),this.runtime!,projects)}:recovery;},
        });
        this.layout();
    }
    private message(text: string) { if (this.disposed)
        return;if(/^原生 WebGPU 已呈现 \d+ 帧$/.test(text)){this.status.visibility='collapse';return;}this.status.text=t(text);this.status.visibility='visible'; }
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
        const items=new StackLayout();if(result.diagnostics.length){for(const diagnostic of result.diagnostics){const row=button(`${PASS_LABELS[diagnostic.pass]}:${diagnostic.line}:${diagnostic.column} · ${diagnostic.message}`,async()=>{if(diagnostic.language&&diagnostic.language!==languageOf(this.session.project,diagnostic.pass)){this.session.pass=diagnostic.pass;await this.generated();return;}this.session.pass=diagnostic.pass;this.showSource();this.select('code');setTimeout(()=>{if(!this.disposed)focusNativeLine(this.editor,diagnostic.line,diagnostic.column);},50);},'',false);row.accessibilityIdentifier='diagnostic-'+diagnostic.pass+'-'+diagnostic.line;items.addChild(row);}}else items.addChild(label(this.diagnostics.text,this.diagnostics.className,false));this.outputLog.content=items;
        if(result.status==='ready')this.startSound();
    }
    private async addPass() { const ids: CodeId[] = ['common', 'buffer-a', 'buffer-b', 'buffer-c', 'buffer-d', 'sound']; const available = ids.filter(id => !this.session.tabs.includes(id)); if (!available.length)
        return; const choice = await Dialogs.action({ title: t('添加页签'), cancelButtonText: t('取消'), actions: available.map(id => PASS_LABELS[id]) }), id = available.find(id => PASS_LABELS[id] === choice); if (!id)
        return; this.session.add(id);this.session.setSource(preferredSource(id,preferences().shaderLanguage),preferences().shaderLanguage); this.showSource(); this.renderChannels(); this.draft(); if (id === 'sound')
        await this.compile(); }
    private renderChannels() {
        this.channels.removeChildren();this.channels.padding=this.wideLayout?0:12;
        this.channels.addChild(label(PASS_LABELS[this.session.pass]+' · '+t('纹理通道'),'editor-channel-heading'));
        if(this.session.pass==='common'){this.channels.addChild(label('Common 的函数和常量可供所有 Buffer、Image 和 Sound 共用；通道在各个渲染页签里绑定。','muted'));return;}
        const pass=passOf(this.session.project,this.session.pass),grid=new HYNativeCardGrid({minCardWidth:130,maxColumns:this.channelColumns,gap:8}),items:View[]=[];
        for(let i=0;i<4;i++){
            const channel=pass.channels[i]!,card=new GridLayout();card.className='card';card.margin=0;card.padding=0;card.height=100;
            const body=new StackLayout();body.padding=8;body.accessibilityHidden=true;body.addChild(label('iChannel'+i,'muted',false));
            if(channel.kind==='builtin'){const image=new Image();image.src='~/assets/'+builtinTexture(channel.texture).file;image.height=42;image.stretch='aspectFill';body.addChild(image);}
            else {const symbol=label(channel.kind==='none'?'＋':channel.kind==='buffer'?PASS_LABELS[channel.pass]:channel.kind==='camera'?'CAM':channel.kind==='video'?'VIDEO':channel.kind==='keyboard'?'KEY':'IMG','muted',false);symbol.height=42;symbol.textAlignment='center';symbol.verticalAlignment='middle';body.addChild(symbol);}
            const name=label(channelLabel(channel,this.session.project),'muted',false);name.fontSize=10;body.addChild(name);card.addChild(body);
            const choose=button('',()=>this.chooseChannel(i),'example-card-target');choose.accessibilityIdentifier='editor-channel-'+i;choose.accessibilityLabel=t('选择 iChannel{index} 素材',{index:i});choose.horizontalAlignment=choose.verticalAlignment='stretch';card.addChild(choose);items.push(card);
        }
        grid.setItems(items);this.channels.addChild(grid);
        if(this.session.pass!=='image')this.channels.addChild(button(pass.enabled?'停用此页签':'启用此页签',()=>{if(this.session.pass==='common')return;this.session.enable(this.session.pass,!pass.enabled);this.renderChannels();this.draft();}));
    }
    private async chooseChannel(index: number) {
        if(this.session.pass==='common'||this.channelOpening||this.channelDrawer)return;
        this.channelOpening=true;
        try {
        const pass=this.session.pass,session=this.session.application.state.session;
        // Finish the UIKit button event before presenting, and coalesce repeated taps.
        await new Promise<void>(resolve=>setTimeout(resolve,0));
        if(this.disposed||session!==this.session.application.state.session||pass!==this.session.pass)return;
        const drawer=openNativeChannelDrawer(this.page,{project:()=>this.session.project,session:()=>this.session.application.state.session,pass,index,
            bind:async value=>{if(this.disposed||session!==this.session.application.state.session)throw Error('作品已切换，请重新选择通道。');this.session.application.dispatch({type:'channel.set',pass,index,channel:value});this.showSource();this.renderChannels();this.draft();await this.compile();},
            upload:kind=>this.upload(kind==='image'?'上传图片':kind==='video'?'上传视频':'上传立方体六面',session),
            bufferPreview:async id=>{
                if(!this.runtime)return;
                const image=await this.runtime.readImage(id),raster=new NativeCanvasTextures(this.runtime.engine.device);
                try{const canvas=raster.createCanvas2D(image.width,image.height),ctx=canvas.getContext('2d');if(!ctx)return;const pixels=ctx.createImageData(image.width,image.height);pixels.data.set(image.pixels);ctx.putImageData(pixels,0,0);const url=canvas.toDataURL('image/png');return ImageSource.fromBase64Sync(url.slice(url.indexOf(',')+1));}finally{raster.dispose();}
            },
        });
        this.channelDrawer=drawer;
        void drawer.closed.then(()=>{if(this.channelDrawer===drawer)this.channelDrawer=undefined;});
        } finally {this.channelOpening=false;}
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
        const body = new GridLayout();let modal:ReturnType<typeof hyShowNativeOverlay>;
        body.rows = 'auto,auto,*';
        const close = () => modal.close(), bar = row(button('关闭', close), button('复制', async () => { await Utils.copyToClipboard(code); this.message('已复制生成代码'); }), button('导出', async () => { const file = path.join(knownFolders.temp().path, 'ShaderLab.' + language); const exported = language === 'glsl' && externalCommon(code) ? (await glslCommon(snapshot, id, this.wgslCompiler)) + '\n' + code : code; await File.fromPath(file).writeText(exported); await shareFile(file); }));
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
        const release = this.host?.pausePresentation();
        this.audio?.pause();
        modal=hyShowNativeOverlay(this.page,{title:t('生成的 ')+language.toUpperCase(),content:body,scrollable:false,kind:'drawer',width:760,theme:shaderTheme,closeLabel:t('关闭'),onClosed:()=>{release?.();if(!this.disposed)this.startSound();}});
    }
    private pulse(code: number) { if (!code || !this.runtime)
        return; this.runtime.keyboard.down(code); this.host?.requestFrame(); setTimeout(() => { this.runtime?.keyboard.up(code); this.host?.requestFrame(); }, 90); }
    private async keyboard() { const body = new StackLayout(); body.className = 'body'; body.addChild(label('按住虚拟按键，写入 256 × 3 键盘纹理。', 'muted')); for (const keys of [['↑', '←', '↓', '→'], ['W', 'A', 'S', 'D', 'R', 'F'], ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'.match(/.{1,6}/g)!.map(s => s.split('')), ['Space']]) {
        const line = new HYNativeCardGrid({minCardWidth:44,maxColumns:6,gap:4}),keysViews:View[]=[];
        for (const key of keys) {
            const code = keyCode(key), b = new HYNativeButton({text:key,variant:'secondary',size:'compact'},shaderTheme);
            b.minWidth = 44; b.minHeight=44;b.margin=0;
            b.padding = 0;
            b.on('touch', event => { const action = (event as TouchGestureEventData).action; if (action === 'down')
                this.runtime?.keyboard.down(code);
            else if (action === 'up' || action === 'cancel')
                this.runtime?.keyboard.up(code); this.host?.requestFrame(); });
            keysViews.push(b);
        }
        line.setItems(keysViews);body.addChild(line);
    } hyShowNativeOverlay(this.page,{title:t('Shader 键盘'),content:body,theme:shaderTheme,kind:'sheet',height:600,closeLabel:t('关闭'),onClosed:()=>{if(!this.disposed){this.runtime?.releaseInput();this.host?.requestFrame();}}}); }
    private async tools(anchor:View) { const choice=await pickNative(anchor,'作品操作',['创作素材库','导出 Haiyue 组件','参数与预设','整理作品','画面与 Pass 调试','分享与展示','重命名','导出作品','导入作品','保存截图到照片','分享截图','导出 Sound WAV'].map(value=>({value,label:t(value)}))); if (choice === '重命名') {
        const result = await Dialogs.prompt({ title: t('作品名称'), defaultText: this.session.project.name, okButtonText: t('确定'), cancelButtonText: t('取消') });
        if (result.result) { this.session.application.dispatch({type:'project.rename',name:result.text.trim()||'Untitled shader'}); if(!this.shared)this.title.text=result.text; }
    }
    else if(choice==='创作素材库')await nativeCreationLibrary(this.creationPorts());
    else if(choice==='导出 Haiyue 组件')nativeEngineExport(this.creationPorts());
    else if(choice==='参数与预设')nativeParameters(this.productPorts());
    else if(choice==='画面与 Pass 调试')await nativeInspection(this.productPorts());
    else if(choice==='分享与展示')nativeSharing(this.productPorts());
    else if(choice==='整理作品')nativeMetadata(this.page,this.session.application.snapshot(),async value=>{this.session.application.change(p=>{p.library=value.library;});this.draft();});
    else if (choice === '导出作品')
        await shareFile(await projects.export(this.session.project));
    else if (choice === '导入作品') {
        if(this.session.dirty)await this.session.application.saveDraft();
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
        const result = await Dialogs.prompt({ title: t('WAV 导出时长（秒）'), defaultText: String(this.session.project.sound.duration), okButtonText: t('导出'), cancelButtonText: t('取消') });
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
        return; this.disposed = true; this.highlighter?.dispose();this.codeChrome?.dispose(); if (this.layoutTimer)
        clearTimeout(this.layoutTimer);this.channelDrawer?.close(); this.draftTask.dispose(); if(this.session.dirty)void projects.draft(this.session.application.snapshot(), this.session.pass,this.session.application.state.session).catch(() => { });else if(this.edited)void projects.ready().then(()=>projects.archive.discardDraft(this.session.project.id,this.session.application.state.session)).catch(()=>{});
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
