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

Mac / Android 设备首次验收：

1. Gallery 的八个示例分别运行；教程打开示例后返回到原章节。
2. 手机横竖屏、iPad 横屏/分屏，打开软键盘仍可编辑并看到诊断。
3. 图片/视频/Cubemap 导入、四通道绑定、反馈重置、Buffer 实际输出；上传文件拒绝越界尺寸。
4. 切换 Canvas / 球 / 立方体 / 圆环，单指拖动和双指缩放；切后台/锁屏/返回。
5. 虚拟方向键操作拼图、扫雷，MSDF 示例显示字母。
6. 添加 Sound 后播放超过 120 秒，暂停恢复、锁屏、耳机拔出/音频中断；导出 WAV。
7. 保存/重启/导入导出、取消文件选择、照片拒绝权限、iPad 分享弹窗、未保存示例不进入作品列表。
8. 故意输入错误 Shader；显示源码行号且保留上次可运行结果；修复后重新运行。
