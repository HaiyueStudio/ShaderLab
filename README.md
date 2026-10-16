# Haiyue ShaderLab

独立的 Shader 创作工具，包含 Web / PWA / Electron 编辑器和使用 Native 能力的 iOS / Android 应用。

- `web/`：从 Editor/shaderEditor 迁移的完整 Gallery、双语言编辑器、65 章教程、8 个示例、API / IPC。
- `mobile/`：NativeScript 原生界面，Haiyue + Native WebGPU 在 Metal / Vulkan 上渲染，原生触摸与 OrbitControl。
- 同一份工程格式、GLSL 翻译器、WGSL 包装、Common、Buffer、键盘纹理和示例；通过 `.hyshader` 跨平台交换作品。

## Web

需要 Node.js 24.12 或更新版本。在本仓库根目录执行：

```sh
npm ci
npm run preview
```

默认地址 http://127.0.0.1:4176 。端口可通过 EDITOR_APP_PORT 更改。已有浏览器作品仍绑定原来的地址和存储命名空间；更换地址或迁往手机前，请导出工程。完整 Web / Electron 功能说明见 [web/README.md](web/README.md)。

## 手机与平板

手机在预览、代码、通道间切换；可用宽度至少 720、可用高度至少 420 时并排显示预览与代码。依据当前窗口实际尺寸响应旋转、软键盘和 iPad 分屏。iPhone / iPad 均启用横竖屏，Android 不锁定方向。

GLSL 和 WGSL 使用原生 TextView 高亮；粘贴按钮自动识别语言，独立保留两份源码。可添加 Common / Buffer A–D / Sound，选择四个图片、立方体、视频、内置纹理或键盘输入。Buffer 可以切换为实际画面预览。支持原生图片/视频文件选择、工程导入导出、截图保存/分享、持续 Sound 播放和 WAV 导出。示例封面来自实际 Shader 渲染。

只有点击保存才进入“我的作品”。自动恢复草稿存放在独立文件里。教程示例返回时沿导航栈回到对应章节。

[iOS / Android 构建说明](docs/mobile-build.md) 包含 Mac 打包、Xcode 签名、Android 环境和设备验收清单。

## 验证

```sh
npm run typecheck
npm test
npm run check:boundaries
npm run build
npm run test:browser
npm run bundle:android
npm run bundle:ios
npm run test:compiler -w ./mobile
```

bundle 命令验证平台 JavaScript、原生桥接引用和随包资源，不生成 APK / IPA。真正的原生编译需要对应 SDK。

## 依赖与迁移

不引用相邻仓库源码。Engine/UI 使用公开包导出。尚未公开发布的 Editor 基础包、Native 桥接以私有 tarball 固定在 vendor/，Native 包内 provenance.json 记录来源文件哈希。Webpack 固定在与 NativeScript 5.0.38 兼容的 5.111.1；Canvas 2.1.18 两处桥接补丁按原文件 SHA256 验证后应用。

迁移文件及资源哈希见 [docs/migration-manifest.json](docs/migration-manifest.json)。Editor 的旧源码已从工作区构建列表移除，原目录保留迁移说明；本地原始目录暂存于 Editor/.migration-backups/shaderEditor-20261016，便于恢复生成物。
