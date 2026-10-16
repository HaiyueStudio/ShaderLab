# 原生工程与构建

## 环境

Node.js >= 24.12。依赖在 ShaderLab 根目录安装，根 package-lock.json 固定 Web / Native 共用代码和桥接版本。不要单独在 mobile/ 安装另一套依赖。

| 平台 | 工具链 | 项目配置 |
| --- | --- | --- |
| iOS | macOS、Xcode / Command Line Tools、Ruby Bundler / CocoaPods | mobile/nativescript.config.ts、App_Resources/iOS/ |
| Android | JDK 21、Android SDK platform 35 / build-tools、已接受的 SDK licenses | mobile/nativescript.config.ts、App_Resources/Android/ |

原生 Bundle ID / applicationId：studio.haiyue.shaderlab。iOS 最低 15.0，Metal 设备；Android 最低 API 26，Vulkan 设备。模拟器不能代替真机的 GPU 验收。

## 在 Mac 上生成和打包 iOS 工程

```sh
cd /path/to/ShaderLab
npm ci --ignore-scripts
cd mobile
bundle install
node scripts/doctor.mjs ios
npm run prepare:ios
open platforms/ios/ShaderLab.xcworkspace
```

prepare 会从锁定的 NativeScript iOS 9.0.3 生成 Xcode 工程并安装 Canvas / Metal Pods。工程位于 mobile/platforms/ios/，属于生成物。App_Resources/iOS 的 Info.plist、图标、部署版本和手机/平板设置是受版本管理的工程输入。更改这些文件后重新 prepare。

Canvas 的本地 Swift Package 默认从 App 的 `node_modules` 查找。`nativescript.config.ts` 通过已安装的 Canvas 包解析实际路径，以兼容 npm workspace 将依赖提升到仓库根目录；不要在 `mobile/` 重装另一份依赖来修复路径。

在 Xcode 中为 ShaderLab target 选择你自己的 Team、签名方式和设备。未预填证书、Team ID 或 provisioning profile。

```sh
# 从根目录：构建到设备（开发签名由本机 Xcode 管理）
npm run build:ios
# 或完整安装/检查/构建脚本，可继续传 NativeScript CLI 参数
bash mobile/scripts/build-ios.sh
# 例如：bash mobile/scripts/build-ios.sh --release --team-id YOUR_TEAM_ID
# 真机运行
npm run run:ios -w ./mobile
```

需要 App Store / Ad Hoc 分发时，在生成的 Xcode workspace 中执行 Product → Archive，再按本机证书导出。发行签名密钥不进入仓库。Windows 可先运行 npm run bundle:ios 验证 JS 与资源，不能生成或签署 IPA。

## Android

安装 Android SDK platform 35、相应 build-tools 和 platform-tools，在系统 SDK 管理器中确认 licenses。JAVA_HOME 指向 JDK 21，ANDROID_HOME 指向 SDK 根目录。

```powershell
cd D:\HaiyueStudio\ShaderLab
npm ci --ignore-scripts
node mobile/scripts/doctor.mjs android
npm run build:android
# 或：powershell -File mobile/scripts/build-android.ps1
npm run run:android -w ./mobile
```

APK 输出位于 mobile/platforms/android/app/build/outputs/apk/；发布 AAB 可向构建脚本传 --release --aab，并使用自己的 keystore。不要提交签名文件或口令。

## 随包内容与 Native 能力

构建脚本自动：编译共享纯逻辑到 web/dist；复制内置纹理和实际渲染的示例封面；将 WGSL→GLSL WASM 转换器打包为本地系统 WebView 页面（WASM 内嵌，不依赖网络）；复制 Native 的 Android 分享 provider；验证并应用 Canvas 补丁；再调用平台构建。

WebView 仅承担 WASM 转换。画布是 NativeScript Canvas 的原生 WebGPU，设备、Surface、生命周期、触摸与照片导出使用 @haiyue/native 的公开接口。NativeScript 原生文本控件负责代码编辑。

移动端视频按 Shader 时间循环抽取帧，最多 12 次/秒、最长边 1024 像素，避免移动 GPU 内存无界增长。预览最长边 1280，总像素预算 786432；分辨率菜单可继续降低。Buffer 在设备支持并启用 float32-filterable 时使用 rgba32float，否则使用 rgba16float 并提示精度警告。非常依赖历史相机矩阵精度的 Shader 需在目标手机上验证。

Sound 以 44100 Hz 双声道持续生成四分之一秒块，队列约一秒；iOS 用 AVAudioEngine / AVAudioPlayerNode，Android 用 AudioTrack。播放不受导出时长限制。暂停、后台、音频中断和换工程会释放旧队列；返回前台后由用户主动恢复。虚拟键盘支持 held / pressed / toggle；硬件按键通过 Native 输入桥接为短按事件。

## 当前验证与设备验收

Windows 已验证类型检查、219 项原 Web 单元测试、移动端布局/文档/高亮/作品保存恢复/150 秒连续音频调度测试、真实 WebGPU 浏览器渲染及移动端 Shader 图/反馈/3D 切换（测试替换了平台文件 IO，未替换移动端渲染逻辑）、离线 WASM 转换、Android 与 iOS 的 Webpack 资源包。没有在 Windows 上声称完成 iOS 原生编译、签名或真机验收。Android APK 也需要实际 SDK / JDK 环境。

2026-10-16 在 macOS / Xcode 26.3 上完成类型检查、iOS 真机编译、开发签名与导出，安装 ShaderLab 0.1.0（build 1）到 iPad Air 4 和 iPhone 15 Plus。两台设备均启动成功，25 秒启动日志采样未见应用异常，采样结束后进程仍在。构建使用的 CocoaPods 依赖已记录在 `mobile/Gemfile.lock`；安装与启动记录保存在本地忽略目录 `artifacts/ios-install-2026-10-16/`。日志末尾的 25 秒 timeout 是主动设置的控制台采样上限，不是应用崩溃。这次完成安装和启动检查，下列完整功能验收仍待执行。

同日追加真机修复：返回按钮仅在 Android 设置 `systemIcon`；编辑器分栏使用整数星号权重；工具栏行号设置在直接加入 GridLayout 的 ScrollView 上。`mobile/test/ios/NavigationSmoke.swift` 在 iPad Air 4、iPhone 15 Plus 各运行两项 XCTest，均通过，覆盖新建、打开示例、教程章节、返回、代码区宽度和工具栏可点击性；截图确认原生 Shader 预览正常。最新安装、测试、截图与包哈希保存在 `artifacts/ios-navigation-2026-10-16/summary.json` 及同目录，完整导入、导出、音频和生命周期验收仍按下方清单进行。

新图标原稿和生成提示词位于 `mobile/resources/branding/`。iOS 使用 `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` 将图标集编入应用，已验证安装包的 iPhone / iPad 图标配置；Android 使用 `mipmap-*/shaderlab_icon.png`，本次未进行安卓安装验收。

同日修复 75% 预览分辨率报错：移动端菜单包含 75%，但共享工程校验原先只允许 25%、50%、100%，因此选择后触发“预览设置无效”并切到代码页。现在 Web、移动端菜单和校验共同使用 `PREVIEW_SCALES`。新增工程往返测试，并覆盖移动端 75% 工程的保存、草稿恢复、导出；220 项 Web 测试、7 项移动端测试及两端类型检查通过。iPad Air 4 先在旧包复现，再安装修复包，XCTest 验证 75% → 50% → 25% → 100% → 75% 均编译成功、保留可操作预览；截图确认实际渲染。记录位于 `artifacts/ios-resolution-2026-10-16/`。iPhone 当时未连接，修复包已完成开发签名和导出，iPhone 安装与此项真机复测仍待连接后执行。

Web 同步重新构建并验证：100% 时渲染尺寸为 567 × 332，切到 75% 后为 425 × 249，编译成功且画面继续渲染，控制台无错误或警告。截图和安装包校验记录见上述目录的 `summary.json`。

随后 iPhone 15 Plus 重新连接，已安装与 iPad 验收相同的修复包。首轮 XCTest 在开启系统自动化模式时超时，尚未执行应用测试；重新启动应用后复测通过：75% → 50% → 25% → 100% → 75% 全部编译成功，竖屏预览保持可见，未跳转代码页，截图确认 Shader 正常渲染。此次分辨率问题的 iPhone 待验收项已关闭，失败连接记录与成功复测分别保存在 `iphone-fixed.xcresult`、`iphone-fixed-retry.xcresult`，不表示下方其他完整功能均已验收。

iOS / Android 真机功能验收清单：

1. Gallery 的八个示例分别运行；教程打开示例后返回到原章节。
2. 手机横竖屏、iPad 横屏/分屏，打开软键盘仍可编辑并看到诊断。
3. 图片/视频/Cubemap 导入、四通道绑定、反馈重置、Buffer 实际输出；上传文件拒绝越界尺寸。
4. 切换 Canvas / 球 / 立方体 / 圆环，单指拖动和双指缩放；切后台/锁屏/返回。
5. 虚拟方向键操作拼图、扫雷，MSDF 示例显示字母。
6. 添加 Sound 后播放超过 120 秒，暂停恢复、锁屏、耳机拔出/音频中断；导出 WAV。
7. 保存/重启/导入导出、取消文件选择、照片拒绝权限、iPad 分享弹窗、未保存示例不进入作品列表。
8. 故意输入错误 Shader；显示源码行号且保留上次可运行结果；修复后重新运行。
