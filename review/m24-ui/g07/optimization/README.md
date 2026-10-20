# G07 共享 UI 性能优化与设备复验

2026-10-19 最新：[iPhone 候选 15](apple-jitter/README.md) 已安装，运行时代码与实测候选 14 一致。共享 UI 普通操作中位数约降低 10%，p95 中位数约降低 7.6%；轮间波动仍使性能结果为 inconclusive。50 次页面释放、GPU/保存与完整交互通过。iPad 保持候选 10 历史通过；Web 性能按用户安排暂缓。

2026-10-18 Apple 更新：iPhone/iPad 新包的 50 次真实页面循环、退休对象释放、系统交互和 GPU/保存一致性已通过；共享 UI 性能仍因轮间波动记为 inconclusive。最新身份、修复和原始证据见 [Apple 新包验收](apple-final/README.md)。下文旧 Apple 待测或原生内存未测描述仅对应历史候选。

2026-10-18 更新：安卓内存修复后的最终包已完成 50 次真实宿主循环，同机 UI 性能通过原门槛。最新候选及实际系统 UI 进度见 [Android 最终验收](android-final/README.md)；下文 `.3` 与恢复验收中的失败记录保留为历史。

日期：2026-10-17。状态：**validating**。实现已优化；尚未达到全部验收完成条件。初版 `.0` 的结果保留在上级 results，不能沿用其真机通过结果代表本轮候选。

## 安卓恢复验收更新

2026-10-17 用户恢复安卓验收。最新候选的系统交互、GPU/持久化回放通过，当前性能对照为 inconclusive；50 次宿主创建/退出暴露系统内存终止，已经从“设备待测”改记为**失败、待修复**。本轮修复、候选身份和完整证据见 [安卓恢复验收](android-resumed/README.md)。下文原始三端数据继续对应各自当时的安装包，不能推广到本轮修改。

## 改动与兼容

- UI 页面缓存未改变的 binding 结果；属性更新跳过结构重排。可信的内部不可变快照复用复制/校验结果，目标后端能力仍逐次校验。
- Web 值更新保留 Select 选项节点，避免无关关系遍历和焦点布局读取。禁用状态、标签、错误关联、选区、外部覆盖与失败事务有回归覆盖。
- ShaderLab 比例操作避免重复提交编辑缓冲；共享页面只更新依赖变化的片段，Web 不再写入无关语言、音量和时长控件。
- 未更改 UI 公开导出。依赖为私有 UI `0.2.0-m24.3` / Native `0.1.4-m24.3`。Native 的 149 个非 package.json 文件与初版一致，见 [来源检查](native-provenance.json)。未发布、推送或打标签。

## 自动化与构建

[检查摘要](checks.json)：UI 96 项单元、61 项既有浏览器、42 项 Chromium/WebKit 适配测试通过，39 个公开入口保持一致。ShaderLab 257 项测试通过。类型、依赖边界、Web 共享与旧入口功能回归通过。

[全新目录构建](fresh-build.json) 从源码快照和锁定 tarball 安装，通过 Web assembly、iOS/Android JS bundle，依赖图证实消费同一 shared/application 与 shared/views。该检查不等同于从空 SDK 缓存构建原生 archive。IPA/APK 另有本机 SDK 构建记录。

[候选身份](identity.json) 记录精确包、锁文件、Web/IPA/APK 哈希。工作区存在另一个任务的相机修改，后续源码及 Android 默认输出已有变化；新目录快照、被测二进制和当前工作区分别记录，不将旧结果自动推广到新包。iOS 已冻结副本，源码映射内容哈希见 [打包源码身份](ios-packaged-source-hashes.json)。

## 性能测量

每组 3 次独立运行、每次 100 次比例操作，同设备交替新旧入口，记录 handler、编译后呈现与帧回调节奏。中位数比例不得超过 1.10；任一路径的轮次最大/最小比超过 1.10 时判 inconclusive。门槛不变，失败和噪声样本保留。

| 最终候选首轮 | handler 旧 / 新 p95 中位数 | 结果 |
| --- | --- | --- |
| Android | 4.877 / 4.120 ms | 小固定画布的 CPU/UI 对照通过，约降低 15.5% |
| iPhone | 4.937 / 3.234 ms | 约降低 34.5%，旧入口波动 29.8%，因此 inconclusive |
| iPad | 4.927 / 2.318 ms | 约降低 52.9%，新入口波动 84.8%，因此 inconclusive |
| Web | 高负载下波动超预算 | 用户明确要求留待空闲环境复测 |

原始分轮数据：[Android](android-performance.json)、[iPhone](iphone-performance.json)、[iPad](ipad-performance.json)、[Web 噪声](web-performance-noisy.json)。iPad `.2` 的 [中间候选](ipad-performance-intermediate.json) 通过，但不能代替 `.3` 最终包验收。[iPad 复测](ipad-performance-confirmation.json) 仍有较大波动（共享 1.39–2.74 ms），维持 inconclusive；编译呈现与帧回调节奏通过。复测另存，不覆盖首轮结果。

Android 测得实际 surface 为 **113×64**；iPad 为 **512×288**；各平台的同机两条路径尺寸一致。它们只验证固定测试画布下的 UI CPU/编译交互，不能证明全尺寸 GPU 性能。帧回调节奏通过也不等于 GPU timestamp 通过。Web 原有输入序列可能包含同值选择，原生测试直接派发全部 100 次操作；不将跨平台绝对耗时当作性能提升依据。

## 功能与资源

- [Web 共享页面](web-functional.json)、[旧入口完整回归](legacy-web-functional.json) 均通过；五档比例、稳定 Canvas/编辑器、播放、弹窗、保存重开和 50 次路由挂起恢复正常。
- [Web 真实宿主 50 次销毁](web-host-lifecycle.json) 通过。包括实际 CodeMirror、Engine/GPU、页面、计时器、帧回调、全局监听器与资源句柄计数；DOM 节点和 document 数量回到基线，同时保存堆观测。
- [iPad 实际系统 UI](ipad-ui.json)、[GPU/文件回放](ipad-gpu-storage.json)、[Web/iPad 持久化对照](ipad-persistence-comparison.json)、[原生页面 50 次进入退出](ipad-lifecycle.json) 通过。只归一化 updatedAt 后业务文件一致。
- 原生生命周期检查验证 engine destroyed、帧回调归零、共享订阅和适配器节点/监听器/资源归零。iOS 暂无原生 GPU 堆计量；Android 内存观测与设备专项仍需补齐。
- iPhone 已安装最终 IPA 并完成三轮性能采样，之后 USB 再次丢失，最终系统 UI、GPU/文件回放与 50 次退出还待执行。Android 之后经用户授权恢复验收；当前包功能通过，50 次资源循环失败。更新见上方安卓恢复验收记录。

实际中文输入法选字/候选窗、emoji/粘贴、VoiceOver/TalkBack、Safari 应用与 iPad 分屏仍是独立物理专项；Unicode 注入或 XCTest 按软键盘不等同于完成这些项目。

## 继续验收

在 ShaderLab 根目录执行；设备标识由本机连接列表提供，不写入正式报告。运行前确认安装的包与 ARTIFACT 一致。固定 ARTIFACT 副本可防止其他构建覆盖默认输出；脚本结束时再次校验文件哈希。

```sh
ARTIFACT=/absolute/candidate.ipa DEVICE=<CoreDevice-ID> DEVICE_LABEL=iphone-next node mobile/test/shared-performance.mjs ios
ARTIFACT=/absolute/candidate.ipa DEVICE=<CoreDevice-ID> DEVICE_LABEL=iphone-next node mobile/test/shared-lifecycle.mjs ios
ARTIFACT=/absolute/candidate.ipa DEVICE=<CoreDevice-ID> DEVICE_LABEL=iphone-next node mobile/test/shared-replay.mjs ios
# Android 使用同一入口，将 ios 改为 android，并设置 ADB、DEVICE 和 APK 的 ARTIFACT。
# 实际触摸/键盘/旋转：mobile/test/ios/SharedPageSmoke.swift 与 mobile/test/android/shared-page.mjs。
```

保持旧入口可回退。Web 性能按用户安排暂缓；安卓已恢复并形成独立候选结果，内存问题需继续修复。后续先验证安装身份，再补剩余测试。GPU 计时、原生内存和物理专项未完成前继续 validating。
