# Haiyue ShaderLab

独立的 Shader 创作工具，包含 Web / PWA / Electron 编辑器和使用 Native 能力的 iOS / Android 应用。

- `web/`：从 Editor/shaderEditor 迁移的完整 Gallery、双语言编辑器、65 章教程、8 个示例、API / IPC。
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

## 手机与平板

手机在预览、代码、通道间切换；可用宽度至少 720、可用高度至少 420 时并排显示预览与代码。依据当前窗口实际尺寸响应旋转、软键盘和 iPad 分屏。iPhone / iPad 均启用横竖屏，Android 不锁定方向。

GLSL 和 WGSL 使用原生 TextView 高亮；粘贴按钮自动识别语言，独立保留两份源码。可添加 Common / Buffer A–D / Sound，选择四个图片、立方体、视频、内置纹理或键盘输入。Buffer 可以切换为实际画面预览。支持原生图片/视频文件选择、工程导入导出、截图保存/分享、持续 Sound 播放和 WAV 导出。示例封面来自实际 Shader 渲染。

首页与 Web 共用全部 8 个示例：Aurora ribbons、Liquid chrome、Neon passage、Afterglow、Key light、Sliding city、Minefield、Local time · 时钟。卡片显示名称、分类和封面，按窗口宽度排列为 1–3 列，点击卡片任意位置即可进入示例并编辑。

Sliding city 支持在画布上向左、右、上、下滑动来移动图片块，每次手势最多移动一块；也可使用方向键 / WASD，R 重新打乱，按住空格查看原图。

Buffer A–D 和 Image 的通道支持“后置相机 / 前置相机 · 实时视频”。选中后运行并授权，可用 `channel0(fragCoord / iResolution.xy)` 采样 iChannel0 的相机画面；Image 也可接入 Buffer 的输出继续处理。`iChannelResolution` 和 `iChannelTime` 提供视频尺寸和采集时间。同一股相机流可供多个 Buffer 共用，同一作品使用一个方向的相机。暂停、隐藏预览、切后台或退出时会停止采集，播放或返回预览后恢复；不采集麦克风，工程仅保存相机选择。Web 需 HTTPS 或 localhost，移动端使用原生相机。

语言菜单已支持 WGSL / GLSL / HLSL，各语言分别保留源码。HLSL 使用随包的 Slang 2026.19 离线转换为 WGSL，支持 Image、Buffer、Common 与 Sound；用法、入口与兼容范围见 [HLSL 语言支持](docs/hlsl-support.md)。

只有点击保存才进入“我的作品”。自动恢复草稿存放在独立文件里。教程示例返回时沿导航栈回到对应章节。

[iOS / Android 构建说明](docs/mobile-build.md) 包含 Mac 打包、Xcode 签名、Android 环境和设备验收清单。

## 验证

```sh
npm run typecheck
npm test
npm run check:boundaries
npm run test:shared:fresh
npm run test:shared-ui:fresh
npm run build
SHADERLAB_TEST_UI=legacy node web/test/structs-browser.mjs
npm run test:shared-ui:browser
npm run test:shared-ui:performance
npm run test:browser
npm run bundle:android
npm run bundle:ios
npm run test:compiler -w ./mobile
```

bundle 命令验证平台 JavaScript、原生桥接引用和随包资源，不生成 APK / IPA。真正的原生编译需要对应 SDK。

2026-10-16 的 [GLSL 渲染修复验收](review/glsl-rendering-2026-10-16/verification.json) 覆盖结构体矩阵更新与包含 `continue` 的循环更新；G01 目录保留修复前的历史记录。

共享应用层的结构、异步取消与验收范围见 [G02 记录](review/m24-ui/g02/README.md) 和 [架构决策](docs/for-ai/adr/2026-10-16-g02-shared-application.md)。

G07 默认启用共享工程信息、设置和预览工具栏；WebComponent 与 NativeScript 使用同一页面定义，CodeMirror/TextView 和 GPU Canvas 保留平台实现。见 [G07 验证记录](review/m24-ui/g07/README.md) 与 [页面架构决策](docs/for-ai/adr/2026-10-17-g07-shared-editor-views.md)。当前使用仓内锁定的私有 UI/Native 预览包，尚未达到完整发布验收条件。Web 可用 `?ui=legacy` 回退；原页面浏览器回归由 `test:browser` 显式运行 legacy 路径，同时先验证共享页面。

## 依赖与迁移

不引用相邻仓库源码。Engine/UI 使用公开包导出。尚未公开发布的 Editor 基础包、Native 桥接以私有 tarball 固定在 vendor/，Native 包内 provenance.json 记录来源文件哈希。Webpack 固定在与 NativeScript 5.0.38 兼容的 5.111.1；Canvas 2.1.18 两处桥接补丁按原文件 SHA256 验证后应用。

迁移文件及资源哈希见 [docs/migration-manifest.json](docs/migration-manifest.json)。Editor 的旧源码已从工作区构建列表移除，原目录保留迁移说明；本地原始目录暂存于 Editor/.migration-backups/shaderEditor-20261016，便于恢复生成物。
