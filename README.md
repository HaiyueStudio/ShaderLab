# Haiyue ShaderLab

[在线页面](https://haiyuestudio.github.io/ShaderLab/)

独立的 Shader 创作工具，包含 Web / PWA / Electron 编辑器和使用 Native 能力的 iOS / Android 应用。

App 的「设置 → 界面语言」支持中文、English、日本語。首次启动按系统语言匹配，不支持的语言回退为英文；手动选择会保存在本机。界面、练习题目/提示、教程章节标题与学习目标提供三语，65 章教程正文保留中文并标注正文语言。切换显示语言不修改作品名称、Shader 源码、素材或练习记录。iOS 的相机和照片权限说明也提供三种语言，由系统选择对应版本。

- `web/`：从 Editor/shaderEditor 迁移的完整 Gallery、WGSL / GLSL / HLSL / TypeScript / Slang 编辑器、65 章教程、8 个示例、API / IPC。
- `shared/`：工程领域、应用状态、actions/selectors、存储/编译端口，以及由 Web 和移动端共同使用的页面语义；领域与应用仍可无 UI 独立构建。
- `mobile/`：NativeScript 原生界面，Haiyue + Native WebGPU 在 Metal / Vulkan 上渲染，原生触摸与 OrbitControl。
- 同一份工程格式、GLSL 翻译器、WGSL 包装、Common、Buffer、键盘纹理和示例；通过 `.hyshader` 跨平台交换作品。

## Web

需要 Node.js 24.12 或更新版本。在本仓库根目录执行：

```sh
npm ci
npm run preview
```

默认地址 http://127.0.0.1:4176 。端口可通过 EDITOR_APP_PORT 更改。已有浏览器作品仍绑定原来的地址和存储命名空间；更换地址或迁往手机前，请导出工程。完整 Web / Electron 功能说明见 [web/README.md](web/README.md)。

使用 VS Code Live Server 等静态服务访问 `ShaderLab/web/index.html` 时，先在仓库根目录执行 `npm run build`。页面引用的 `web/web/main.js` 是 Rollup 生成的浏览器入口，不是重复拼错的路径；仅安装依赖、类型检查或打包 iOS 都不会生成它。看到该文件 404 时，完成 Web 构建后刷新原地址即可，保留原地址下的本地作品。

代码编辑区支持右键菜单“格式化代码”，主编辑器与练习场均可使用；也可按 Shift + Alt + F。支持 WGSL / GLSL / HLSL / TypeScript / Slang，整理缩进、换行和空格，保留注释、宏与续行，格式化可一次撤销。

## 草稿、历史与编辑转换

Web 与 App 按作品分别保存恢复草稿，编辑停止 500 ms 后写入本机，切换作品时补写当前草稿。恢复草稿独立于“我的作品”的手动保存版本；Gallery 的“恢复草稿”可选择作品，打开有草稿的作品时也可选择恢复草稿或打开已保存版本。已保存版本不会被自动草稿覆盖，打开已保存版本也会保留原草稿。App 退出编辑页、进入后台时会补写；Web 在离开页面时尝试补写，浏览器强制结束前尚未提交的最后一次输入不能保证恢复。

每个作品保留最近 30 个手动保存或检查点版本，包含全部 Pass、三种语言源码、通道、素材与预览设置。Web 在作品栏进入“版本历史”，App 在代码页的“⋯ → 版本历史”进入。选择版本可对比当前 Pass 的代码；恢复时还原整个工程，并先为当前工程创建恢复前检查点。还原后的内容仍需手动保存。图片、视频和 Cubemap 以不可变素材文件复用，避免每个历史版本重复保存相同视频。

删除作品会移入 Gallery 的“回收站”，恢复时同时保留已保存版本、恢复草稿和历史记录。旧版浏览器作品、App 的 works 文件和单一草稿会迁移到新存储，迁移保留原始数据。历史、草稿和回收站均保存在当前设备/浏览器地址；`.hyshader` 导出当前工程，不携带本机历史。

完整编辑器切换语言时先展示只读代码对比与逐行差异，应用转换前创建检查点，取消保持原文不变。撤销转换一次即可同时还原代码和语言，转换期间的新编辑不能被迟到结果覆盖。撤销/重做按 Pass 和编辑会话隔离，普通连续输入合并，粘贴、替换和转换分别作为一次操作。

App 的“⋯ → 查找与替换”支持字面量查找、区分大小写、上一个/下一个、替换当前和全部替换；编译输出中的诊断可点击跳转到源码行。外接键盘支持 Ctrl / ⌘ + Z 撤销、Ctrl / ⌘ + Shift + Z（或 Ctrl / ⌘ + Y）重做、Ctrl / ⌘ + F 查找、Ctrl / ⌘ + S 保存、Ctrl / ⌘ + Enter 运行；替换使用 Ctrl + H 或 ⌘ + Option + F。原生编辑控件与输入法代理保持不变，输入法候选未确认时不会执行破坏当前组合输入的命令。Web 保留 CodeMirror 的查找替换与键盘操作。

## 参数、学习、作品库与展示

编辑器右上角「⋯ → 创作工具」（Web）或「⋯ → 参数与预设 / 画面与 Pass 调试 / 分享与展示」（App）提供以下能力。

- **参数与预设**：定义最多 8 个滑块、颜色或开关，自动生成调整控件。三种语言统一读取 `iParams[0]` 到 `iParams[7]`：滑块和开关使用 `.x`（开关为 0/1），颜色使用 `.rgb`（0–1 RGB）。调整直接更新 uniform，不重新编译、不重置反馈；名称、范围、默认值、当前值及最多 20 个预设随工程、草稿和历史版本保存。删除参数不会重排其他槽位。Sound 中的参数随下一块音频合成生效。
- **学习路径**：颜色与坐标、距离场与形状、图案与变换、光照四条路线连接教程与练习。可标记学完章节后直接练习；提示逐层展开，记录运行次数与提示层数，显示重复未通过的知识点并推荐同路线下一题。仍以纯色代码开始；参考效果与输出可滑动叠加并点击取色，通过后可按开放任务转为自己的作品。
- **作品库**：按名称、描述、标签或文件夹搜索，按标签/文件夹/收藏筛选，按更新时间、名称或最早更新排序；支持复制作品。标签、文件夹和收藏随 `.hyshader` 传输。导入时，同 ID 的内容与本机不同会作为 `Imported` 新作品打开，保留两份内容；本阶段没有账号或云同步。
- **分享与展示**：复制无需服务器保存的只读播放链接，接收方可全屏播放或复制后创作。链接将完整的小工程编码在 URL 片段中，上限 36 KB 原始 JSON；大素材作品使用 `.hyshader` 文件分享。接收端需要本次更新后的网页版本。Web 的播放页隐藏编辑和保存入口。
- **短视频与序列帧**：横屏 640×360、竖屏 360×640、方形 512×512，1–10 秒、15/30 FPS；从时间 0 导出 Image 输出。Web 导出浏览器支持的 WebM/MP4；iOS / Android 使用原生 H.264 MP4 编码。PNG 序列打包为 ZIP，并带分辨率、帧率和帧数清单，上限 128 MB。导出不含音轨；相机、视频等实时输入使用系统录屏。App 导出结束后预览从头播放。
- **调试**：单独查看 Image / Buffer，点击像素读取左下角坐标、UV、RGBA 与 HEX；浮点 Buffer 显示为限制到 0–1 的预览。依赖面板区分当前帧输入和上一帧反馈。Web 支持时使用 GPU 时间戳统计各 Pass；不支持时显示 CPU 命令编码耗时。本版 App 显示明确标注的 CPU 命令编码耗时；原生 GPU 时间戳采样尚未启用，不把 CPU 时间当作 GPU 时间。

参数代码示例（先在参数面板添加一个滑块和一个颜色参数，再运行）：

```wgsl
fn mainImage(fragCoord: vec2f) -> vec4f {
  let uv = fragCoord / iResolution.xy;
  let pulse = 0.5 + 0.5 * sin(iTime * iParams[0].x + uv.x * 6.0);
  return vec4f(iParams[1].rgb * pulse, 1.0);
}
```

## 可复用素材与 Haiyue 接入（P2）

Web 编辑器「⋯ → 素材库」和 App「⋯ → 创作素材库」包含函数、效果模板、参数预设三个页签。提供 6 个 WGSL / GLSL / HLSL 函数、4 个带速度与颜色参数的效果模板、2 个参数预设；支持名称/说明/标签搜索及收藏筛选，也可保存自己的素材。

- **函数**：打开面板前选中编辑器中的辅助函数，或在面板内粘贴源码，保存当前语言版本。插入到当前页的模块顶部，重名时提示处理，一次撤销可还原。内置函数有三种语言版本；自存函数没有当前语言版本时不提供插入，避免混用语法。
- **效果模板**：保存完整工程，包括 Common、各 Pass、通道、素材、语言源码与参数。使用模板创建新 ID 的作品，保留原模板与原作品草稿。
- **参数预设**：保存参数定义与当前值，可跨作品复用。已有参数按「名称 + 类型」匹配，支持不同槽位；缺失、重名或超出当前范围时整次拒绝应用。空参数工程采用预设的槽位和定义。工程内的多组参数预设仍在 P1 参数面板管理。
- **迁移**：导出 / 导入 `.hylib` 素材包，最多 200 项、64 MB。相同 ID 的不同内容另存为 `Imported` 副本，不覆盖本机素材。素材库保存在本机，与已保存作品、草稿、历史及回收站使用独立键空间；无需账号。

「⋯ → Haiyue 组件」（Web）或「⋯ → 导出 Haiyue 组件」（App）导出 ZIP，包含可执行 `effect.mjs`、类型声明、WGSL、资源清单、原始 `.hyshader` 与接入说明。WGSL / GLSL / HLSL 都先在分离快照上生成完整 WGSL，不替换编辑器原文；导出前要求工程编译成功。

组件使用公开的 `@haiyue/engine/ecs` API，要求 Haiyue Engine 0.2.0，输出可供 `BasicMaterial.texture` 使用的纹理。支持 Image / Buffer A–D / Common、静态图片 / 立方体贴图 / 内置素材、8 槽参数与工程预设、鼠标输入、ECS 动画、暂停、重置、调整尺寸及释放资源。反馈 Buffer 保留当前/上一帧语义，格式为 `rgba16float`；与 Web 的 `rgba32float` 路径可能有精度差异。每帧在 `onTexture` 中更新材质纹理，避免持有交换前的旧纹理。

浏览器默认解码包内静态图片；Native 宿主注入 `loadTexture(device, asset)`，返回同设备的 `{texture,width,height,cube,owned}`。相机、视频、键盘实时纹理及 Sound 需要宿主接入，当前会在导出面板指出具体 Pass / Channel 并阻止导出；2D/3D 预览外壳和 MSAA 属于宿主。设备丢失后需重新创建组件。具体生命周期和单位见包内 README。

回归：`node web/test/product-p2-browser.mjs` 验证真实界面、HLSL 导出 ZIP、公开引擎 ECS、GPU 像素、反馈、立方体贴图及持久化；iPad 可用隔离验收参数 `--shaderlab-ui-check --shaderlab-p2-check`，报告写入 `Documents/shaderlab-p2.json`，普通启动不会运行测试。

## GPU 绘画练习场

导航栏“练习场”提供 36 道独立题目，入门、进阶、挑战各 12 道，覆盖颜色、距离场几何、程序化图案和光照。可按难度、知识点与完成状态筛选，并搜索中英文题目。移动端从首页“练习场”进入。

每题都有明确参数、GPU 参考效果、起始代码、提示和可展开的 WGSL 参考解法。支持 WGSL / GLSL / HLSL / TypeScript / Slang 编写与转换，默认使用首选语言。点击“运行并对比”查看参考图、自己的输出与放大 4 倍的差异图；Web 支持 Ctrl / ⌘ + Enter。草稿、最佳分数和完成进度自动保存在当前设备，与 Gallery 作品分开。Web 可保存为作品；移动端可转入完整编辑器继续创作和保存。

评测比较实际 WebGPU 像素，不比较代码。在 128×128 和 256×256 下分别取时间为 0、鼠标为 0 的首帧；RGBA 均方根误差换算匹配分数，两次均须达到 98%，且任一通道误差超过 12/255 的像素占比不超过 2%。这是一套本机绘画练习评测，不上传代码或图片。

题库与评分位于 `shared/domain/practice.ts`，Web 与原生端共用。网页参考图现场渲染；原生题库的离线封面来自同一套着色器的真实 GPU 输出，进入题目运行时会重新生成参考图。修改题目后可执行 `node web/test/practice-browser.mjs --update-references` 更新 `mobile/src/assets/practice/` 中的封面；无此参数时验证现有封面。

## 手机与平板

手机在预览、代码、通道间切换；可用宽度至少 720、可用高度至少 420 时并排显示预览与代码。依据当前窗口实际尺寸响应旋转、软键盘和 iPad 分屏。iPhone / iPad 均启用横竖屏，Android 不锁定方向。

通道选择使用分类素材抽屉，支持图片、视频、立方体贴图和 Buffer 预览及对应文件上传；Web 与移动端共用素材分类及 Sound 输入限制。粘贴语言识别开关与语言选择同排，编译状态位于编译输出标题行。

GLSL 和 WGSL 使用原生 TextView 高亮；粘贴按钮自动识别语言，独立保留两份源码。可添加 Common / Buffer A–D / Sound，选择四个图片、立方体、视频、内置纹理或键盘输入。Buffer 可以切换为实际画面预览。支持原生图片/视频文件选择、工程导入导出、截图保存/分享、持续 Sound 播放和 WAV 导出。示例封面来自实际 Shader 渲染。

首页与 Web 共用全部 8 个示例：Aurora ribbons、Liquid chrome、Neon passage、Afterglow、Key light、Sliding city、Minefield、Local time · 时钟。卡片显示名称、分类和封面，按窗口宽度排列为 1–3 列，点击卡片任意位置即可进入示例并编辑。

Sliding city 支持在画布上向左、右、上、下滑动来移动图片块，每次手势最多移动一块；也可使用方向键 / WASD，R 重新打乱，按住空格查看原图。

Buffer A–D 和 Image 的通道支持“后置相机 / 前置相机 · 实时视频”。选中后运行并授权，可用 `channel0(fragCoord / iResolution.xy)` 采样 iChannel0 的相机画面；Image 也可接入 Buffer 的输出继续处理。`iChannelResolution` 和 `iChannelTime` 提供视频尺寸和采集时间。同一股相机流可供多个 Buffer 共用，同一作品使用一个方向的相机。暂停、隐藏预览、切后台或退出时会停止采集，播放或返回预览后恢复；不采集麦克风，工程仅保存相机选择。Web 需 HTTPS 或 localhost，移动端使用原生相机。

语言菜单支持 WGSL / GLSL / HLSL / TypeScript / Slang，Image / Buffer / Sound 可以在五种语言之间互转。TypeScript 使用静态 GPU 数值子集；Slang 使用随包官方编译器。语法、离线资源与 Common 的转换范围见 [五种语言支持](docs/shader-languages.md)。手动切换会转换当前页签的最新代码，成功后一起更新语言和代码；失败或转换期间发生编辑时保留原内容，不再恢复旧草稿或填入模板。WGSL/GLSL Common 也可转换为 HLSL；单独 WGSL Common → GLSL 及 HLSL Common 的反向转换尚不支持，会提示原因。转换为 GLSL 或 HLSL 时，Common 保持独立，Pass 只保留引用；编译时链接当前 Common，并按内容和通道类型缓存派生库。修改 Common 后重新运行即可生效。HLSL 生成由随包 Naga 完成，再用 Slang 2026.19 验证并转换为运行用 WGSL，整个过程可离线进行。用法、入口与兼容范围见 [HLSL 语言支持](docs/hlsl-support.md)。

只有点击保存才进入“我的作品”。自动恢复草稿存放在独立文件里。教程示例返回时沿导航栈回到对应章节。原生教程按 8 个阶段组织 65 章，首页显示学习进度与继续学习入口；阶段卡片随可用宽度排列为 1–4 列，只展示当前阶段的章节，并支持跨阶段搜索。正文使用居中的阅读栏，分开呈现学习目标、核心表达式、分步讲解、动手实验与延伸阅读。

[iOS / Android 构建说明](docs/mobile-build.md) 包含 Mac 打包、Xcode 签名、Android 环境和设备验收清单。

## 验证

```sh
npm run typecheck
npm test
npm run check:boundaries
npm run test:shared:fresh
npm run test:shared-ui:fresh
npm run build
node web/test/recovery-browser.mjs
node web/test/product-p1-browser.mjs
SHADERLAB_TEST_UI=legacy node web/test/structs-browser.mjs
npm run test:shared-ui:browser
npm run test:shared-ui:performance
npm run test:browser
npm run bundle:android
npm run bundle:ios
npm run test:compiler -w ./mobile
```

bundle 命令验证平台 JavaScript、原生桥接引用和随包资源，不生成 APK / IPA。真正的原生编译需要对应 SDK。

原生应用额外带 `--shaderlab-p1-check` 可在同一隔离目录验证参数跨语言 GPU 像素、原生面板、预设/标签保存和实际 H.264 编码。

原生应用使用 `--shaderlab-ui-check` 启动时，在 `ShaderLab-G07` 隔离目录验收 GPU、文件存储、草稿、版本、撤销和查找替换，不改动用户作品。遇到模拟器 WebKit 的 WASM 崩溃时，可额外传 `--shaderlab-p0-fixture-compiler` 只验收原生交互与持久化；报告会明确标记转换器为 fixture，这种运行不代表真实编译器通过，真实转换需通过浏览器与真机另行验证。

2026-10-16 的 [GLSL 渲染修复验收](review/glsl-rendering-2026-10-16/verification.json) 覆盖结构体矩阵更新与包含 `continue` 的循环更新；G01 目录保留修复前的历史记录。

共享应用层的结构、异步取消与验收范围见 [G02 记录](review/m24-ui/g02/README.md) 和 [架构决策](docs/for-ai/adr/2026-10-16-g02-shared-application.md)。

G07 默认启用共享工程信息、设置和预览工具栏；WebComponent 与 NativeScript 使用同一页面定义，CodeMirror/TextView 和 GPU Canvas 保留平台实现。见 [G07 验证记录](review/m24-ui/g07/README.md) 与 [页面架构决策](docs/for-ai/adr/2026-10-17-g07-shared-editor-views.md)。当前使用仓内锁定的私有 UI/Native 预览包，尚未达到完整发布验收条件。Web 可用 `?ui=legacy` 回退；原页面浏览器回归由 `test:browser` 显式运行 legacy 路径，同时先验证共享页面。

## 依赖与迁移

不引用相邻仓库源码。Engine/UI 使用公开包导出。尚未公开发布的 Editor 基础包、Native 桥接以私有 tarball 固定在 vendor/，Native 包内 provenance.json 记录来源文件哈希。Webpack 固定在与 NativeScript 5.0.38 兼容的 5.111.1；Canvas 2.1.18 两处桥接补丁按原文件 SHA256 验证后应用。

迁移文件及资源哈希见 [docs/migration-manifest.json](docs/migration-manifest.json)。Editor 的旧源码已从工作区构建列表移除，原目录保留迁移说明；本地原始目录暂存于 Editor/.migration-backups/shaderEditor-20261016，便于恢复生成物。
