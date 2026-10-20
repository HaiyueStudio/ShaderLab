# G07 安卓恢复验收

2026-10-17，X4000 / Android 14。用户恢复授权后，USB 连接可用，完成当前候选的功能与资源验收。**功能通过，但 50 次宿主生命周期验收失败，G07 不能标记完成。**

## 精确候选

APK SHA-256：`38a34059db6292b96c6a0c7a6bd7e79d16ce619318674ce999377c7305b748df`。冻结安装包在本地 `artifacts/m24-g07/android-resumed/ShaderLab-fixed-3.apk`；[身份与打包源码哈希](identity.json) 记录其原生 bundle、源码映射和锁文件。安装使用覆盖方式，未清除用户数据。

这是后续相机/HLSL 工作基础上的独立安卓候选，不沿用此前 `.3` APK 的验收结论，也不声明这些独立功能全部通过。[UI 来源核对](ui-provenance.json) 证明实际打包的 9 个 UI 模块与 `0.2.0-m24.3` tarball 一致。iPhone/iPad 先前报告仍只对应各自旧 IPA；本轮共享源码和 Canvas 兼容补丁尚未部署到 Apple 设备。

## 通过项目

- [系统交互](ui.json)：五档原生分辨率选择、预览不跳页、设置弹窗重开、横竖屏、后台恢复、名称输入、键盘收起、保存重开。测试后恢复原有旋转设置。
- [GPU 与存储回放](gpu-storage.json)：实际目标尺寸与像素读回、播放状态、稳定特殊视图、保存及重开。
- [Web/安卓持久化一致](persistence-comparison.json)：只归一化 updatedAt，其余业务字段完全相等。
- 按需源码转换器实际生成两次 GLSL，弹窗关闭与再开正常，未更改编辑源码。
- [代码检查](checks.json)：16 项移动端测试、类型检查和 Android SDK 构建通过。

自动化按键和 Unicode 回放不代表物理中文 IME 或 TalkBack 验收。

## 发现的问题及已落实的修改

1. 普通编辑器原本也创建转换 WebView。改为使用空布局占位，首次 WGSL 导出/HLSL 转换时才创建；退出时移除原生控件并取消等待加载或求值的请求。实际 GLSL 转换及取消分支回归通过。
2. 调整退出顺序：先关闭渲染宿主，再让共享 PlatformView 移除 Canvas，避免原生上下文提前释放。
3. 最终销毁预览时直接调用纹理和缓冲区 destroy，并销毁非当前场景。原先通过队列完成回调延后清理，但宿主紧接着销毁设备；针对“不能等待已销毁设备的队列回调”新增测试。
4. Canvas 2.1.18 的错误回调只绑定其已存在的弱 observable，避免强引用整个 GPUDevice。补丁严格校验原文件 SHA-256，并验证 Android/iOS 错误转发与幂等应用。该修改**未证明解决整个内存问题**，未推广为 Native 包发布。

## 未通过的资源门禁

[最初候选](lifecycle-before.json)、[仅转换器修复](lifecycle-first-fix.json)、[第二轮](lifecycle-second-fix.json) 和 [当前候选](lifecycle-final.json) 都未完成 50 次真实创建/退出。轮询在终止前采集到 13 个完整周期；随后读取同一 startedAt 的 [设备最后快照](lifecycle-last-device-snapshot.json)，确认已写入 18 个完整周期。系统随后终止进程，应用来不及写入终止状态，50 次门禁仍为失败。

[系统终止原因](termination.txt) 是 lowmemorykiller 的 low on swap / thrashing，**不是 USB 断开，也不是测试脚本主动关闭应用**。已采集周期的共享订阅、节点、监听器及帧回调均归零，但这不足以证明原生内存已释放。[内存观测](memory-observations.json) 中，应用 native heap 从 27.3 MiB 增至 81.7 MiB，PSS 从 167.6 MiB 变为 197.4 MiB。此计数不包含完整 GPU 分配，不能据此断言占用归属或泄漏根因已经确定。

当前阻塞仍是反复创建/关闭原生渲染宿主时的内存累积。下一步应隔离无 UI 的 Canvas/wgpu device、surface、资源句柄与 native callback 生命周期，采集完整 GPU/系统分配及 NativeScript 宿主堆；分别比较旧入口与共享入口，确认是否属于共同的渲染底层。不能通过缩短到十几次、每轮重启进程或只看适配器计数把 50 次门禁改成通过。

## 性能与继续方式

[当前包同机性能](performance.json) 为 **inconclusive**：handler p95 中位数旧入口 3.838 ms、共享入口 4.282 ms，比例 1.116；共享三轮最大/最小比 1.111，超过 1.10 噪声门槛。同步处理时间和波动都未达要求，不能沿用旧 APK 的通过结果。编译后呈现和帧回调节奏通过。实际固定 surface 为 113×64，不代替全尺寸 GPU 时间；Web 性能仍按用户安排待复测。

从 ShaderLab 根目录，用本地冻结 APK 身份运行：

```sh
ADB=/path/to/adb DEVICE=<serial> DEVICE_LABEL=android-next ARTIFACT=artifacts/m24-g07/android-resumed/ShaderLab-fixed-3.apk node mobile/test/shared-lifecycle.mjs android
ADB=/path/to/adb DEVICE=<serial> DEVICE_LABEL=android-next ARTIFACT=artifacts/m24-g07/android-resumed/ShaderLab-fixed-3.apk node mobile/test/shared-replay.mjs android
ADB=/path/to/adb ANDROID_SERIAL=<serial> node mobile/test/android/shared-page.mjs
```

运行前安装或核对相同 APK；不要直接使用可能被其他任务覆盖的默认构建输出。未发布、推送或打标签。

验收结束再次读取安装 APK 的 SHA-256，与上述冻结候选一致；应用已恢复普通入口，旋转设置恢复为测试前值。
