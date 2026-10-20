# Apple 新包：内存释放与共享 UI 复验

2026-10-18。iPhone 15 Plus（iOS 27.2）和 iPad Air 4（iPadOS 26.7.1）均已安装同一最终包并恢复正常入口。**内存释放、实际系统交互、GPU/保存一致性通过；UI p95 稳定性仍为 inconclusive，G07 保持 validating。**

## 候选与修复

[精确身份](identity.json)：Native 私有 `0.1.4-m24.6`、UI 私有 `0.2.0-m24.3`、Engine `0.2.0`、Canvas `2.1.18`；Debug 真机签名包，测试时未连接 JS 调试器。IPA SHA-256：`43c5c47e10f16c08a790c6efac1312f021265ac6f5a9ea6bab5ce9100182dd14`。本机副本为 `artifacts/m24-g07/apple-final-m24.6-r2/ShaderLab-m24.6.ipa`。没有发布、推送或修改正式版本。

- Apple ARM64 Canvas 使用与安卓相同的 Rust 注册表释放修复，并修复 Swift 通知/触摸处理器的强引用环；模拟器和 visionOS 未替换、未验收。
- Canvas JS 原生回调改为弱引用工厂，ready listener 使用共享类和每实例弱 owner，卸载时清空原生事件块。
- Native iOS 文本、键盘和完成按钮回调使用可清空中继；注销观察器时解除对共享控件树的持有。
- Native 渲染宿主销毁时注销全局帧错误回调；全局 RAF 函数不再捕获安装它的宿主上下文。

[真实堆持有链](../apple-memory/README.md) 显示编辑器对象由 50 → 1 → 0。原始失败包、只修 Swift 的中间包和第一版采样结果分别保存在 [initial](../apple-initial/README.md)、[intermediate](../apple-intermediate/README.md)、[sampling1](../apple-m24.6-sampling1/README.md)。最终包已移除临时 V8 堆导出 C++ 入口与 JS 触发选项。

## 内存与资源

[内存摘要及逐轮曲线](memory.json)，原始 [iPhone](iphone-lifecycle.json) / [iPad](ipad-lifecycle.json)。每台设备在**同一进程内真实进入、渲染并退出 50 次编辑器**，没有用强制重启替代回收。

| 检查 | iPhone | iPad |
| --- | ---: | ---: |
| 真实宿主循环 | 50/50 | 50/50 |
| 最终存活的退休对象 / 跟踪对象 | 0/550 | 0/550 |
| 第 11–50 次退出后的进程 footprint 范围 | 133.6–198.1 MiB | 148.1–212.9 MiB |
| 静置并完成延后收集后的 footprint | 144.7 MiB | 109.0 MiB |

旧包曾分别增长到约 1029/1006 MiB，并持有全部 50 组对象。新包不再呈现这种逐页面累积；原生视图已拆卸，Engine destroyed，调度回调、共享订阅、适配器节点/监听器/资源均归零。

最终 liveness 观察在两个定时器轮次的 GC 后进行，允许原生 autorelease/弱包装器清理先完成；每轮即时数据仍原样保留，不筛除峰值。采集器现在检查全部 50 组退休对象，避免只看资源计数就输出通过。该专项是页面对象释放和 Mach 进程内存观测，**不是完整 Metal 堆计量，也不承诺任意长运行绝不增长**。

## 同机交互性能

每模式 3 轮 × 100 次真实语义比例操作，旧/新入口交替启动、同一 fixture 和固定画布；门槛保持 p95 中位数比 ≤1.10，且各模式轮间最大/最小 ≤1.10。原始样本全部保留：[iPhone](iphone-performance.json)、[iPad](ipad-performance.json)。

| 最终包 | 旧入口 p95 中位数 | 共享入口 p95 中位数 | 新/旧 | 共享轮间最大/最小 | 判定 |
| --- | ---: | ---: | ---: | ---: | --- |
| iPhone | 3.769 ms | 1.284 ms | 0.341 | 2.304 | inconclusive |
| iPad | 3.799 ms | 1.711 ms | 0.450 | 2.118 | inconclusive |

共享入口各轮的普通操作中位数约 1.06–1.10 ms（iPhone 首轮约 1.14 ms）；少量 2–3 ms 样本落在 p95 附近，使三轮 p95 波动明显。高值分布在多个比例和序号，尚不能认定具体原因；未过滤离群值、改变样本量或放宽门槛。不能仅凭中位数降低约 55%–66% 宣称性能门禁通过。

两台设备的编译后呈现时间、帧回调节奏均通过原门槛。此项只覆盖固定测试画布下的 UI/CPU 交互；不包含系统选择器动画，帧节奏不是 GPU timestamp，也不用于跨设备比较 GPU 性能。下一步应定位共享 handler 的尾部慢样本，再按相同规则复验。Web 性能仍按用户安排待复测。

## 功能与画面

- [iPhone 系统 UI](iphone-ui.json)、[iPad 系统 UI](ipad-ui.json) 均通过：五次比例切换且保持预览、播放/暂停、设置横屏与后台恢复、弹窗关闭重开、名称输入和完成按钮、代码软键盘输入/收起、两次 GLSL 生成、保存重开保留名称与源码。
- [iPhone GPU/存储](iphone-gpu-storage.json)、[iPad GPU/存储](ipad-gpu-storage.json) 通过。只归一化 `updatedAt` 后，持久化工程与 Web 完全一致，见对应 persistence-comparison.json。
- [截图](screens/) 保留 75% 预览、横屏设置和保存重开，已检查正常呈现。
- [本地检查](checks.json)：28 项移动测试、22 项 Native 测试（包括 jitless 真 GC 回调释放）、5 项共享 UI 测试、类型/边界及 iOS SDK 构建通过。

尚未扩大到真实中文候选输入、VoiceOver、iPad 多任务分屏、完整 GPU 堆/时间戳专项。原有 Android `.5` 验收仍只对应其原 APK；本次 `.6` 的共享帧回调清理有单元覆盖，但没有新增安卓真机包验收。旧入口保留，G06/G07 状态不变。
