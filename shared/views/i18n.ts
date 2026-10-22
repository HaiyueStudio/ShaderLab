import { helpEnglish } from './help-i18n.js';
export type Locale = 'zh-CN' | 'en';
let locale: Locale = 'zh-CN';
const listeners = new Set<() => void>();
export const getLocale = () => locale;
export function setLocale(value: Locale) { if(value===locale)return;locale=value;for(const listener of [...listeners])listener(); }
export function onLocaleChange(listener:()=>void) { listeners.add(listener);return ()=>{listeners.delete(listener);}; }
const english:Record<string,string> = {
  '格式化代码':'Format code','代码操作':'Code actions',
  '练习场':'Practice','返回练习场':'Back to practice',
  '生成代码':'Generated code','声音':'Audio','收起键盘':'Dismiss keyboard','粘贴':'Paste','正在初始化…':'Initializing…','正在转换代码…':'Converting code…','知道了':'OK',
  '点击编辑器里的“保存”，作品才会出现在这里。':'Save a project in the editor to see it here.','暂无可恢复草稿':'No draft to restore','删除':'Delete','是否删除此作品？':'Delete this project?',
  '触摸：iMouse · 3D：拖动旋转、双指缩放':'Touch: iMouse · 3D: drag to orbit, pinch to zoom',
  '转换代码语言':'Convert shader language','添加页签':'Add tab','转换失败':'Conversion failed','打开 Aurora ribbons 示例':'Open Aurora ribbons example','Aurora ribbons 渲染预览':'Aurora ribbons preview',
  '已转换为 {language}':'Converted to {language}','正在合成音频… {percent}%':'Synthesizing audio… {percent}%','保存失败：{message}':'Save failed: {message}',
  '只读预览 · {pass} · 可选择复制':'Read-only preview · {pass} · Select to copy',
  '上传立方体贴图':'Upload cubemap','关闭立方体贴图上传':'Close cubemap upload','分别选择六个面的图片。所有图片必须是尺寸相同的正方形；支持 PNG、JPEG、WebP。':'Choose all six faces as square images of the same size. PNG, JPEG and WebP are supported.',
  '名称':'Name','上传并绑定':'Upload and bind','环境贴图':'Environment map','正在校验并上传六个面…':'Checking and uploading six faces…',
  '+X 右':'+X Right','−X 左':'−X Left','+Y 上':'+Y Top','−Y 下':'−Y Bottom','+Z 前':'+Z Front','−Z 后':'−Z Back',
  ...helpEnglish,
  'Common 没有独立纹理通道。公共函数中的 channel0–3 使用调用它的 Buffer / Image / Sound 的绑定。':'Common has no separate texture inputs. channel0–3 use the bindings of the calling Buffer, Image or Sound pass.',
  '保存':'Save','GLSL 导入':'Import GLSL','布局':'Layout','多通道':'Multiple passes','内置素材':'Built-in assets','键盘纹理':'Keyboard texture','反馈':'Feedback','Sound 音乐':'Sound audio','Common 公共代码':'Common code',
  '翻译代码':'Convert code','应用到当前 Pass':'Apply to current pass','WGSL 预览':'WGSL preview','通道配置 · 素材需要手动设置':'Channel setup · Assets must be assigned manually',
  '翻译后可检查下方 WGSL 代码，再应用到当前 Pass。':'Review the converted WGSL below, then apply it to the current pass.',
  '选择页签，将 GLSL 粘贴到 Shadertoy 对应页签。Common 已合并，无需另外粘贴。此预览来自打开时的源码。':'Select a tab and paste its GLSL into the matching Shadertoy tab. Common is already included. This preview uses the source at the time it was opened.',
  '粘贴当前 Common 或 Pass 的 GLSL。Common 无需入口函数；其他 Pass 会自动使用已导入的 Common。支持 #define 宏、#if 条件编译与常用语法子集。错误会给出行号提示。':'Paste GLSL for Common or the current pass. Common needs no entry function; other passes include imported Common definitions. Supports #define, #if and common GLSL syntax, with line-numbered errors.',
  '取消':'Cancel','返回':'Back','更多操作':'More actions','预览输出':'Preview output','查看通道':'View pass','代码':'Code','通道':'Channels',
  '＋ 新建':'+ New','导入':'Import','恢复上次草稿':'Restore draft','编写 GLSL / WGSL / HLSL，用原生 WebGPU 看见想法。':'Write GLSL / WGSL / HLSL and bring ideas to life with native WebGPU.',
  '立方体贴图 · 六面预览':'Cubemap · Six-face preview','视频素材':'Video asset','图片素材':'Image asset','选择素材':'Choose asset',
  '选择 iChannel{index} 素材':'Choose iChannel{index} asset','预览并选择 iChannel{index} 素材':'Preview and choose iChannel{index} asset',
  '原创讲解与 WGSL 练习 · 延伸阅读链接指向原作者':'Original lessons and WGSL exercises · Further reading links to original authors',
  'Common 中的函数、常量和结构体可供所有 Buffer、Image 与 Sound 使用。可选择 GLSL、WGSL 或 HLSL 编写公共代码，无需入口函数；GLSL Pass 会一起转换 Common 中的 GLSL 定义；HLSL Pass 需要 HLSL Common。':'Common functions, constants and structures are shared by Buffer, Image and Sound. Write shared code in GLSL, WGSL or HLSL without an entry function. GLSL passes include Common GLSL definitions; HLSL passes require HLSL Common.',
  '通过“＋”添加 Sound 后会自动编译并播放，可在预览下方静音或暂停。播放时持续分块合成，不限制总时长；下方时长仅用于 WAV 导出。GLSL 使用 vec2 mainSound(int sampleIndex, float time)，WGSL 使用 mainSound(sampleIndex: i32, time: f32) 返回 vec2f；HLSL 使用 float2 mainSound(int sampleIndex, float time)。两分量分别为左、右声道，范围 −1 到 1。可使用 Common 和静态纹理。':'Add Sound with “+” to compile and play automatically. Mute or pause below the preview. Audio is synthesized continuously; the duration only controls WAV export. GLSL: vec2 mainSound(int sampleIndex, float time). WGSL: mainSound(sampleIndex: i32, time: f32) -> vec2f. HLSL: float2 mainSound(int sampleIndex, float time). Return left and right channels in the range −1 to 1. Common and static textures are supported.',
  '{errors} 个错误 · {warnings} 个警告':'{errors} errors · {warnings} warnings',
  '{language} 代码编辑器':'{language} code editor','{seconds} 秒':'{seconds} seconds','返回教程 · {name}':'Back to tutorial · {name}',
  '设置':'Settings','界面语言':'Interface language','中文':'中文','英文':'English','首选 Shader 语言':'Preferred shader language',
  '用于新建作品和新代码页签，不修改已有代码。':'Used for new projects and code tabs. Existing code stays unchanged.',
  '开启 MSAA':'Enable MSAA','4× 抗锯齿，平滑 3D 预览物体的边缘。':'4× anti-aliasing smooths the edges of objects in the 3D preview.',
  '偏好设置保存在当前设备。':'Preferences are saved on this device.','设置已保存':'Settings saved','无法保存设置':'Could not save settings',
  '编辑器':'Editor','教程':'Tutorials','使用指南 ↗':'User guide ↗','Shader Lab 首页':'Shader Lab home','主导航':'Main navigation',
  '从一行代码开始，探索光、色彩与运动。':'Start with a line of code. Explore light, color and motion.',
  '在 Haiyue 引擎里，让你的想法实时发生。':'Bring your ideas to life in real time with Haiyue.',
  '＋ 创建 Shader':'+ Create shader','导入工程 ↗':'Import project ↗','语言':'Language','渲染':'Rendering','预览':'Preview',
  '从灵感开始':'Start exploring','八个示例，八种可能。打开即可编辑。':'Eight examples, eight possibilities. Open one to start editing.',
  '重试预览':'Retry previews','我的作品':'My projects','搜索作品':'Search projects','搜索我的作品':'Search my projects',
  '下一个灵感，属于你。':'Your next idea starts here.','创建一个 Shader，或打开示例开始修改。点击「保存作品」后会显示在这里。':'Create a shader or edit an example. Saved projects appear here.',
  '创建第一个作品 →':'Create your first project →','本地创作 · 无需账号':'Create locally · No account needed',
  '作品名称':'Name','返回 Gallery':'Back to Gallery','保存作品':'Save project','导出工程':'Export project','尚未保存':'Not saved',
  '运行':'Run','暂停':'Pause','播放':'Play','重置':'Reset','单帧':'Step frame','正在保存…':'Saving…','编译中':'Compiling',
  '暂停 / 播放':'Pause / Play','渲染分辨率':'Render resolution','渲染比例':'Render scale','预览模式':'Preview mode','渲染方式':'Render mode',
  '球体':'Sphere','立方体':'Cube','圆环':'Torus','Canvas / 3D 物体':'Canvas / 3D object','3D 场景':'3D scene','3D 预览物体':'3D preview object',
  '重置相机':'Reset camera','物体':'Object','拖动旋转 · 滚轮缩放 · 右键平移':'Drag to orbit · Scroll to zoom · Right-drag to pan',
  'Shader 渲染画布':'Shader preview canvas','代码编辑器':'Code editor','全屏预览':'Fullscreen','保存 PNG 图像':'Save PNG image','导出 Image Pass PNG':'Export Image pass as PNG',
  '实时渲染帧率':'Live rendering frame rate','准备 WebGPU 预览…':'Preparing WebGPU preview…','重新加载预览':'Reload preview',
  '开启声音':'Enable sound','静音':'Mute','音量':'Volume','导出时长':'Export duration','导出 WAV':'Export WAV','WAV 导出时长':'WAV export duration',
  '纹理通道':'Texture channels','图片 / 视频 / 键盘 / Buffer':'Image / Video / Keyboard / Buffer','静态图片 / 内置纹理 / Cubemap':'Static image / Built-in / Cubemap',
  'Shader 键盘':'Shader keyboard','作品操作':'Project actions','重命名':'Rename','导出作品':'Export project','导入作品':'Import project','保存截图到照片':'Save image to Photos','分享截图':'Share image','导出 Sound WAV':'Export Sound WAV','自动识别':'Detect language','代码语言':'Shader language','切换语言会转换当前代码':'Switching language converts the current code','粘贴时自动识别语言':'Detect language on paste',
  '自动编译':'Auto compile','添加代码页签':'Add code tab','添加 Buffer、Sound 或 Common':'Add Buffer, Sound or Common','启用':'Enabled',
  '内置变量':'Built-in variables','查看内置变量':'Show built-in variables','编译输出':'Compiler output','准备编辑':'Ready to edit','0 个问题':'0 issues',
  '点击运行，查看你的 Shader。':'Run your shader to see the result.','✓ 编译成功 · Haiyue WebGPU':'✓ Compiled · Haiyue WebGPU',
  '正在编译…':'Compiling…','已编译':'Compiled','● 已编译':'● Compiled','● 代码已修改':'● Code changed','代码已修改':'Code changed',
  '● 代码已修改 · Ctrl / ⌘ + Enter 运行':'● Code changed · Ctrl / ⌘ + Enter to run','编译失败 · 保留上次预览':'Compilation failed · Keeping last preview',
  '编译失败':'Compilation failed','代码已变化，请重新运行':'Code changed. Run again.','运行（Ctrl / ⌘ + Enter）':'Run (Ctrl / ⌘ + Enter)',
  '无未保存修改':'All changes saved','有未保存的修改':'Unsaved changes','已保存':'Saved','作品已保存':'Project saved','已保存；仍有新的修改':'Saved; newer changes remain',
  '重置时间与 Buffer':'Reset time and buffers','暂停并前进一帧':'Pause and advance one frame','前进一帧':'Step frame',
  '内置纹理':'Built-in textures','图片':'Images','视频':'Video','设备':'Devices','键盘':'Keyboard','前置相机':'Front camera','后置相机':'Rear camera','素材':'Asset',
  '关闭':'Close','完成':'Done','清空通道':'Clear channel','选择素材 ›':'Choose asset ›','未绑定':'Not bound','当前输入：{name}':'Current input: {name}',
  '使用 {name}':'Use {name}','清空 iChannel{index}':'Clear iChannel{index}','关闭素材抽屉':'Close asset drawer','关闭提示':'Dismiss notification',
  '＋ 上传图片':'+ Upload image','＋ 上传视频':'+ Upload video','＋ 上传立方体六面':'+ Upload six cube faces',
  '↑ 上传图片':'↑ Upload image','↑ 上传立方体贴图':'↑ Upload cubemap','↑ 上传视频':'↑ Upload video',
  'PNG / JPEG / WebP · 8 MB 以内':'PNG / JPEG / WebP · Up to 8 MB','MP4 / WebM · 24 MB 以内':'MP4 / WebM · Up to 24 MB','六张尺寸相同的正方形图片':'Six square images of the same size',
  '暂无素材，上传后即可预览并绑定到此通道。':'No assets yet. Upload an asset to preview and bind it to this channel.',
  '暂无素材，上传后即可预览并绑定。':'No assets yet. Upload one to preview and bind it.',
  '当前 Buffer · 上一帧反馈':'Current buffer · Previous-frame feedback','实时渲染输出':'Live render output','绑定后启用此 Buffer':'Binding enables this buffer',
  '256 × 3 · 按下 / 持续 / 切换状态':'256 × 3 · Press / Hold / Toggle states','绑定后请求相机权限并输入实时视频':'Requests camera permission and streams live video',
  '无纹理':'No texture','等待渲染':'Waiting for rendering','暂无预览':'No preview','正在生成预览…':'Generating preview…','预览暂不可用':'Preview unavailable',
  '打开 ↗':'Open ↗','页签':'Tab','预览与代码区域大小':'Resize preview and code','预览与纹理区域大小':'Resize preview and textures','代码与编译输出区域大小':'Resize code and output',
  '运行用 WGSL':'Compiled WGSL','查看 WGSL':'View WGSL','只读 · 可选择复制':'Read only · Select to copy','转换说明':'Conversion notes',
  '导出到 Shadertoy':'Export to Shadertoy','复制 GLSL':'Copy GLSL','下载 .glsl':'Download .glsl','下载全部页签':'Download all tabs','导出页签':'Export tab',
  '转换时会自动加入已导入的 Common GLSL。':'Imported Common GLSL is included during conversion.',
  '从代码到画面':'From code to pixels','章节目录':'Chapters','搜索主题、关键词或作者…':'Search topics, keywords or authors…','学习阶段':'Learning stages','教程章节':'Tutorial chapters',
  '章节':'Chapters','阶段':'Stages','练习工程':'Practice projects','从一个圆，到一个世界。':'From a circle to a world.',
  '理解公式，画出形状，再让光线穿过你创造的空间。':'Understand formulas, draw shapes, and let light travel through the worlds you create.',
  '循序渐进学习 WGSL、距离场与 Ray Marching（光线步进）。':'Learn WGSL, distance fields and ray marching step by step.',
  'HAIYUE SHADER LAB · 学习路线':'HAIYUE SHADER LAB · Learning path','SHADER LAB · 学习路线':'SHADER LAB · Learning path',
  '正文可离线阅读 · 外部文档需联网':'Lessons are available offline · External references require internet',
  '正在转换…':'Converting…','源码已修改，请重新翻译。':'Source changed. Convert again.','代码转换失败':'Code conversion failed',
  '作品已保存到此浏览器的 Gallery。':'Project saved to this browser’s Gallery.','删除作品':'Delete project',
  '要删除“{name}”吗？此操作无法撤销。':'Delete “{name}”? This cannot be undone.',
  'vec3f · 像素宽、高、像素比例':'vec3f · Pixel width, height and pixel aspect ratio',
  'f32 · 时间 / 帧间隔（秒）':'f32 · Time / Frame interval (seconds)','i32 / f32 · 帧编号 / 帧率':'i32 / f32 · Frame index / Frame rate',
  'vec4f · xy 拖动位置，zw 点击位置；松开后 zw 为负':'vec4f · xy drag position, zw click position; zw is negative after release',
  'vec4f · 年、月、日、当日秒数':'vec4f · Year, month, day and seconds since midnight','array<vec3f, 4> · 通道尺寸':'array<vec3f, 4> · Channel dimensions',
  'array<f32, 4> · 通道时间':'array<f32, 4> · Channel times','二维纹理使用 vec2f UV（左下角原点），Cubemap 使用 vec3f 方向':'2D textures use vec2f UVs (bottom-left origin); cubemaps use vec3f directions',
  'WGSL 纹理与采样器（二维 UV 或立方体方向）':'WGSL textures and sampler (2D UVs or cubemap directions)','44100 Hz · Sound 音频采样率':'44100 Hz · Sound sample rate',
};
export function t(source:string, values:Record<string,string|number>={}) {
  let text=locale==='en'?(english[source]??source):source;
  if(locale==='en'&&!english[source]){
    if(source.startsWith('保存失败：'))text='Save failed: '+source.slice(5);
    else if(source.startsWith('已转换为 '))text='Converted to '+source.slice(5);
    else if(source.startsWith('返回教程 · '))text='Back to tutorial · '+source.slice(7);
  }
  return text.replace(/\{(\w+)\}/g,(match,key)=>String(values[key]??match));
}
/** Cache translated snapshots to preserve portable bindings' referential equality. */
const translated=new WeakMap<object,{locale:Locale,value:object}>();
export function localizeProps<P extends object>(props:P):P {
  if(locale==='zh-CN')return props;
  const cached=translated.get(props);if(cached?.locale===locale)return cached.value as P;
  const value={...props} as Record<string,unknown>;
  for(const key of ['text','label','title','placeholder','description'])if(typeof value[key]==='string')value[key]=t(value[key]);
  if(value.a11y){const a=value.a11y as Record<string,string>;value.a11y={...a,...(a.label?{label:t(a.label)}:{}),...(a.description?{description:t(a.description)}:{})};}
  if(Array.isArray(value.options))value.options=value.options.map(option=>({...option,label:t(option.label)}));
  translated.set(props,{locale,value});return value as P;
}
