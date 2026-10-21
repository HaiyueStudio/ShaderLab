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

安装 APK 后，可在仓库根目录逐个验收八个示例（设备保持解锁，`adb` 位于 PATH）：

```sh
node mobile/test/android/examples.mjs YOUR_DEVICE_SERIAL
```

也可通过 `ADB` 指定 adb 路径、`ANDROID_SERIAL` 指定设备、`SHADERLAB_ANDROID_EVIDENCE` 指定输出目录。默认输出到 `mobile/artifacts/android-examples/`，记录每个示例的首帧、重新编译、预览像素、动态示例的画面变化、返回导航、截图及应用日志。

## 随包内容与 Native 能力

构建脚本自动：独立编译领域与应用状态到 shared/dist（无需 Web 页面构建）；移动 bundler 直接编译同仓 web/src 中现有的 Shader/声音/教程帮助模块；复制内置纹理和实际渲染的示例封面；将 WGSL→GLSL WASM 转换器打包为本地系统 WebView 页面（WASM 内嵌，不依赖网络）；复制 Native 的 Android 分享 provider；验证并应用 Canvas 补丁；再调用平台构建。

WebView 仅承担 WASM 转换。画布是 NativeScript Canvas 的原生 WebGPU，设备、Surface、生命周期、触摸与照片导出使用 @haiyue/native 的公开接口。NativeScript 原生文本控件负责代码编辑。

移动端视频按 Shader 时间循环抽取帧，最多 12 次/秒、最长边 1024 像素，避免移动 GPU 内存无界增长。预览最长边 1280，总像素预算 786432；分辨率菜单可继续降低。Buffer 在设备支持并启用 float32-filterable 时使用 rgba32float，否则使用 rgba16float 并提示精度警告。非常依赖历史相机矩阵精度的 Shader 需在目标手机上验证。

Buffer A–D 和 Image 通道可选择前置或后置相机。Android 使用 Camera2，iOS 使用 AVFoundation，实时帧上传到原生 WebGPU 纹理；多个通道和 Buffer 共用同一股视频流，切换方向会同步其他相机通道。采集尺寸接近 640 × 480，并随设备方向调整，实际尺寸与采集时间通过 `iChannelResolution`、`iChannelTime` 提供。只请求相机权限，不采集麦克风；暂停、隐藏预览、后台或退出时关闭相机，恢复播放与预览后重新采集。工程仅保存通道选择，不保存视频帧。

语言按钮提供 WGSL、GLSL、HLSL，切换时分别保留各自源码。HLSL 使用随包 Slang 2026.19，在隔离的本地编译页面转换为 WGSL；独立脚本按需加载并内嵌 WASM，不依赖 file 页面跨文件读取权限，也不需要联网。Image / Buffer 使用 `float4 mainImage(float2 fragCoord)`，Sound 使用 `float2 mainSound(int sampleIndex, float time)`；非空 Common 需与 HLSL Pass 同时使用 HLSL。具体约定见 [HLSL 语言支持](hlsl-support.md)。

Sound 以 44100 Hz 双声道持续生成四分之一秒块，队列约一秒；iOS 用 AVAudioEngine / AVAudioPlayerNode，Android 用 AudioTrack。播放不受导出时长限制。暂停、后台、音频中断和换工程会释放旧队列；返回前台后由用户主动恢复。虚拟键盘支持 held / pressed / toggle；硬件按键通过 Native 输入桥接为短按事件。

## 当前验证与设备验收

Windows 已验证类型检查、219 项原 Web 单元测试、移动端布局/文档/高亮/作品保存恢复/150 秒连续音频调度测试、真实 WebGPU 浏览器渲染及移动端 Shader 图/反馈/3D 切换（测试替换了平台文件 IO，未替换移动端渲染逻辑）、离线 WASM 转换、Android 与 iOS 的 Webpack 资源包。没有在 Windows 上声称完成 iOS 原生编译、签名或真机验收。Android APK 也需要实际 SDK / JDK 环境。

2026-10-16 在 macOS / Xcode 26.3 上完成类型检查、iOS 真机编译、开发签名与导出，安装 ShaderLab 0.1.0（build 1）到 iPad Air 4 和 iPhone 15 Plus。两台设备均启动成功，25 秒启动日志采样未见应用异常，采样结束后进程仍在。构建使用的 CocoaPods 依赖已记录在 `mobile/Gemfile.lock`；安装与启动记录保存在本地忽略目录 `artifacts/ios-install-2026-10-16/`。日志末尾的 25 秒 timeout 是主动设置的控制台采样上限，不是应用崩溃。这次完成安装和启动检查，下列完整功能验收仍待执行。

同日追加真机修复：返回按钮仅在 Android 设置 `systemIcon`；编辑器分栏使用整数星号权重；工具栏行号设置在直接加入 GridLayout 的 ScrollView 上。`mobile/test/ios/NavigationSmoke.swift` 在 iPad Air 4、iPhone 15 Plus 各运行两项 XCTest，均通过，覆盖新建、打开示例、教程章节、返回、代码区宽度和工具栏可点击性；截图确认原生 Shader 预览正常。最新安装、测试、截图与包哈希保存在 `artifacts/ios-navigation-2026-10-16/summary.json` 及同目录，完整导入、导出、音频和生命周期验收仍按下方清单进行。

新图标原稿和生成提示词位于 `mobile/resources/branding/`。iOS 使用 `ASSETCATALOG_COMPILER_APPICON_NAME = AppIcon` 将图标集编入应用，已验证安装包的 iPhone / iPad 图标配置；Android 使用 `mipmap-*/shaderlab_icon.png`，本次未进行安卓安装验收。

同日修复 75% 预览分辨率报错：移动端菜单包含 75%，但共享工程校验原先只允许 25%、50%、100%，因此选择后触发“预览设置无效”并切到代码页。现在 Web、移动端菜单和校验共同使用 `PREVIEW_SCALES`。新增工程往返测试，并覆盖移动端 75% 工程的保存、草稿恢复、导出；220 项 Web 测试、7 项移动端测试及两端类型检查通过。iPad Air 4 先在旧包复现，再安装修复包，XCTest 验证 75% → 50% → 25% → 100% → 75% 均编译成功、保留可操作预览；截图确认实际渲染。记录位于 `artifacts/ios-resolution-2026-10-16/`。iPhone 当时未连接，修复包已完成开发签名和导出，iPhone 安装与此项真机复测仍待连接后执行。

Web 同步重新构建并验证：100% 时渲染尺寸为 567 × 332，切到 75% 后为 425 × 249，编译成功且画面继续渲染，控制台无错误或警告。截图和安装包校验记录见上述目录的 `summary.json`。

随后 iPhone 15 Plus 重新连接，已安装与 iPad 验收相同的修复包。首轮 XCTest 在开启系统自动化模式时超时，尚未执行应用测试；重新启动应用后复测通过：75% → 50% → 25% → 100% → 75% 全部编译成功，竖屏预览保持可见，未跳转代码页，截图确认 Shader 正常渲染。此次分辨率问题的 iPhone 待验收项已关闭，失败连接记录与成功复测分别保存在 `iphone-fixed.xcresult`、`iphone-fixed-retry.xcresult`，不表示下方其他完整功能均已验收。

同日修复移动端 Gallery 只显示一个示例：八个共享示例原已随包提供，但卡片没有在首次测量前分配网格位置，旧包真机测试确认八张卡片叠在同一位置。现在先分配独立单元格，再根据卡片区的实际宽度排列为 1–3 列，显示示例名称、编号和分类。行列重排延后到当前布局结束，避免 iOS 清空已测量的子控件；编辑器也预先初始化预览，并在根容器完成布局后更新分栏，修复首次打开预览空白。

iPad Air 4、iPhone 15 Plus 均已安装最终修复包，八个示例分别通过打开、原生 WebGPU 首帧呈现、重新编译及返回检查，保存了每台设备的八张渲染截图。两台设备的卡片位置、代码页宽度、分辨率切换和教程导航回归也通过。验收先等待首帧状态，再主动运行并检查编译结果，避免宿主用首帧状态覆盖启动时的编译状态造成误报。类型检查、220 项 Web / 7 项移动端单元测试、全部八个示例的浏览器 WebGPU 渲染，以及最终 iOS / Android 平台资源打包通过；Android 未做真机安装验收。安装包、截图、包哈希和分次测试结果见本地忽略目录 `artifacts/ios-examples-2026-10-16/summary.json`，最终 IPA 位于同目录 `export-final/ShaderLab.ipa`。

同日晚间完成 Android 真机追加验收：XREAL X4000、Android 14 / API 34、Adreno 710 Vulkan，安装当前工作区生成的 ShaderLab 0.1.0（build 1）APK。八个示例全部通过打开、原生 WebGPU 首帧、重新编译、预览像素及返回导航检查；极光、液态金属、隧道、反馈、时钟还通过连续截图的像素变化检查。应用在完整验收期间保持同一进程，应用日志未见崩溃、未捕获异常或 GPU 校验错误。首次 APK 构建暴露 `AppThemeBase` 和 `NativeScriptToolbarStyleBase` 缺失，已补齐基础主题供 NativeScript 的 API 专用主题继承，保留现有暗色界面。已保存 APK 签名验证、包与源码哈希、逐例截图、像素统计和日志，入口为 `artifacts/android-examples-2026-10-16/summary.json`，安装包为同目录 `ShaderLab-debug.apk`。

示例卡片现已取消底部“打开”按钮，封面、名称、说明及留白都可直接点击进入对应示例。整卡保留原生按钮的无障碍名称与滚动取消行为，Android 透明点击层不显示按钮阴影。Android 真机再次完成八个示例的打开、渲染、重新编译和返回检查，交替点击卡片上部、中部与下部；验收脚本通过稳定的示例标识定位卡片，并检查不存在单独的“打开”按钮。iPad Air 4 也通过整卡点击八个示例的渲染、重新编译及返回检查，以及八张卡片独立排列且无底部按钮的布局检查。此次构建与验收证据保存在本地忽略目录 `artifacts/card-tap-2026-10-16/`。

2026-10-17 相机通道验收：XREAL X4000 / Android 14、iPad Air 4、iPhone 15 Plus 均使用真实后置相机，同时接入 Buffer A、Buffer B，再由 Image 采样 Buffer A；实际帧尺寸分别为 480 × 640、640 × 480、480 × 640，尺寸、采集时间、原生 GPU 读回、暂停释放和恢复均通过。两台 iOS 设备的相机授权及后台返回 XCTest 通过；Android 另外通过系统相机服务确认后台和退出时释放、前台返回后重新打开，进程保持不变。真机测试使用隔离工程，未替换普通作品或草稿。Web 使用浏览器测试视频源覆盖连续帧、共享取流、前后置切换状态、拒绝授权、暂停及路由退出；移动渲染器的浏览器测试覆盖帧方向、通道尺寸/时间，并回归八个示例。最终构建、类型检查、单元测试、设备报告与 APK 哈希保存在 `artifacts/camera-2026-10-17/summary.json`，安装包为同目录 `ShaderLab-debug.apk`。前置相机尚未进行本轮真机取流验收。

iOS / Android 真机功能验收清单：

1. Gallery 的八个示例分别运行；教程打开示例后返回到原章节。
2. 手机横竖屏、iPad 横屏/分屏，打开软键盘仍可编辑并看到诊断。
3. 图片/视频/Cubemap 导入、四通道绑定、反馈重置、Buffer 实际输出；上传文件拒绝越界尺寸。
4. 切换 Canvas / 球 / 立方体 / 圆环，单指拖动和双指缩放；切后台/锁屏/返回。
5. 虚拟方向键操作拼图、扫雷，MSDF 示例显示字母。
6. 添加 Sound 后播放超过 120 秒，暂停恢复、锁屏、耳机拔出/音频中断；导出 WAV。
7. 保存/重启/导入导出、取消文件选择、照片拒绝权限、iPad 分享弹窗、未保存示例不进入作品列表。
8. 故意输入错误 Shader；显示源码行号且保留上次可运行结果；修复后重新运行。

2026-10-16 G02 将编辑、保存、编译状态迁入独立 shared 层。当前代码的无界面、Web 和资源包验收记录见 [G02](../review/m24-ui/g02/README.md)；以上旧版 IPA 真机记录不代表这批新代码已完成设备验收。G07 负责新共享页面与此批业务接线的 iPhone/iPad/Android 回归。

2026-10-17 HLSL 自动化验收通过：Web 语言菜单、Common / Buffer / Image / Sound 编译、GPU 颜色与 PCM、原始源码诊断、生成 WGSL、工程往返；移动渲染器使用同一隔离编译页面，读回 `[102, 51, 153, 255]`，生成 2048 个音频采样，并回归八个示例。file 协议下的离线编译、原 WGSL / GLSL 编辑流程、262 项单元测试、类型与边界检查通过。

最终包已安装到 XREAL X4000 / Android 14、iPad Air 4 和 iPhone 15 Plus。三台设备均通过本地 HLSL Common / Buffer / Image / Sound 编译、原生 WebGPU 像素读回 `[102, 51, 153, 255]`、工程保存重开、WGSL / GLSL / HLSL 菜单与独立源码保留，以及后台返回后继续操作。语言按钮的无障碍标签随当前语言更新；隔离验收脚本也改为读取当前语言的源码，并要求重开后实际编译成功。测试未替换普通作品或草稿。iPhone 在用户确认解锁并保持亮屏后完成复测，先前运行器未能建立连接的记录保留供排查。构建、最终 APK、源码哈希、三台设备报告及两台 iOS 设备通过的 XCTest 记录见 `artifacts/hlsl-2026-10-17/summary.json`。

2026-10-20 修复语言菜单拒绝 WGSL / GLSL → HLSL：共享转换器使用 Naga 生成可编辑 HLSL，并由 Slang 验证后再更新文档。Common 保持独立，修改后由当前编译桥重新派生；兼容常量依赖、常量数组初始化、整数绝对值、旧工程中的完整 WGSL 模块，以及 Image / Buffer / Sound 往返转换。八个 Gallery 示例的所有启用 Pass 均通过真实语言菜单转换与 WebGPU 渲染，矩阵、Buffer 采样、PCM、错误保护及工程重开通过。移动渲染器通过随包编译页面实际验证转换后像素和 Common 更新；本地 file 页面离线转换、全量单元测试、类型、边界检查与 Android / iOS 资源包构建通过。此次验证使用浏览器及平台 IO 测试适配器，未重复真机安装验收。记录见 `artifacts/hlsl-conversion-2026-10-20/summary.json`。

## 2026-10-18 Android Canvas 资源释放补丁

Android build/prepare 会验证并应用仓库内的 Canvas 2.1.18 ARM64 修补库，释放回读纹理、着色器模块和已完成的命令编码器，避免反复打开编辑页时保留旧 GPU 设备。普通 APK 构建直接使用 `mobile/vendor/canvas-2.1.18-android-arm64`，不需要自行安装 Rust；只有重建该原生库才需要 Rust、NDK 与 Skia 构建工具。上游提交、源码补丁、锁文件、重建方式和适用范围见 [补丁说明](../mobile/patches/README.md)。构建脚本会拒绝版本或校验值不符的 Canvas 包。

当前替换仅覆盖 Android arm64-v8a，其他 ABI 和 Apple 平台保留原库，不能沿用这次安卓验收结论。正式设备结果集中在 [G07 安卓最终候选](../review/m24-ui/g07/optimization/android-final/README.md)。
