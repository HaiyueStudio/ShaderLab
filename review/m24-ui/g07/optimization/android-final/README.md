# G07 Android 内存修复与共享 UI 优化

2026-10-18，X4000 / Android 14 / arm64-v8a。**最终包的 50 次真实页面循环、同机性能、实际系统 UI、GPU/持久化回放全部通过。** G07 总体仍为 validating：Apple 新包、用户暂缓的 Web 性能及原有物理专项不包含在本次结论中。

## 候选身份

[identity.json](identity.json) 记录安装包、打包源码、依赖和原生库 SHA-256；安装后核对一致。APK：`c2fe33e316326cf8de04b0d98712f0157af328d27dd7bf853ee89bff3351d6b4`。Native 私有预览 `0.1.4-m24.5`，UI 私有预览 `0.2.0-m24.3`，Engine `0.2.0`，Canvas `2.1.18`。没有发布、推送或调整正式版本。

Native `.5` 相比 `.3` 只改变 NativeScript renderer，另更新预览版本和 provenance。Canvas 修补库的上游提交、源码补丁、锁文件、许可及重建脚本见 [mobile/patches](../../../../../mobile/patches/README.md)。仅替换 ARM64 Rust 库；Java、V8 绑定和其他 ABI 保留。原有 1,060 个导出、V8 所需 798 个接口、系统依赖及 16 KiB LOAD 对齐已检查。

## 内存修复

此前约 18 次循环后发生系统内存终止。页面计数归零不等于 GPU 设备释放；[调查记录](../android-memory/investigation.json) 保留失败迭代和原生资源表证据。

- JavaScript：显式销毁时解除仍挂起的设备 lost 订阅；错误回调只持有弱引用；一次性原生回调执行后清除捕获对象，允许旧设备/管线及编辑器回收。
- 原生回读纹理：unconfigure/drop 时释放 `ContextReadBack` 的注册句柄。
- 原生着色器：恢复被注释的 `shader_module_drop`。
- 原生命令编码器：wgpu 29 的 `finish()` 创建独立 command-buffer 句柄，仍须释放 encoder；原先 `open=false` 的析构分支跳过了释放。

[最终 50 次循环](lifecycle.json) 在同一进程真实创建/退出编辑器、Engine/GPU 和原生视图，没有减少次数或每轮重启。每次检查原生视图拆除、Engine destroyed、节点/资源/订阅及帧回调归零。[内存观测](memory.json) 的第 21～50 次 native heap 为 **31.2～37.7 MiB**，进程 PSS 为 170.7～179.4 MiB；系统可用内存在 2.40～2.86 GiB 波动，未再逐轮下降约 200 MiB。末轮弱引用仍能观察到最近 3 组对象，较早对象随后续 GC 回收，未随 50 次累计。

[诊断包](../android-memory/diagnostic-summary.json) 也通过 50 次，原生 trace 观察到 encoder 归零、shader module 不再累积。logcat 在第 31 次 device destroy 附近意外结束，所以 trace 仅是部分证据；完整次数来自设备持久化报告。最终包移除了临时原生日志。以上不等于完整 GPU 堆计量或无限时长无泄漏证明。

## 共享 UI 性能

值/文字更新不再重复写入未变化的尺寸、字体、颜色；仅布局、显隐、页签、弹窗等相关变更重新处理整页关系。无障碍值随内容更新，表单标签/错误、主题、原生视图重建和键盘行为保留。裁剪开关可缓存，但裁剪矩形必须在布局后按实际尺寸刷新。

[最终性能报告](performance.json)：同一 APK，旧/新入口交替各 3 轮，每轮 100 次语义操作；下表为三轮 p95 的中位数。实际 surface **113×64**，不计选择器动画。

| 指标 | 旧入口 | 共享入口 | 比例 | 结论 |
| --- | ---: | ---: | ---: | --- |
| UI handler | 3.654 ms | 3.838 ms | 1.050 | 通过 |
| 编译后呈现 | 68.590 ms | 69.490 ms | 1.013 | 通过 |
| 帧回调节奏 | 18.397 ms | 18.508 ms | 1.006 | 通过 |

保持原门槛：p95 比例 ≤ 1.10，各路径 max/min ≤ 1.10。handler 额外开销约 5.0%，轮次波动为旧入口 2.97%、共享入口 6.81%。结论是共享入口通过预算，不能宣称比旧入口更快。帧回调节奏不是 GPU timestamp，也不能据小画布结果推断全尺寸 GPU 性能。

## 功能、回归与边界

- [系统 UI](ui.json)：五次分辨率选择、预览保留、设置旋转/后台恢复/重开、键盘收起、两次 GLSL 转换、保存重开和源码保留通过；旋转设置已恢复。[代码页重开截图](reopened.png)。
- [GPU/存储](gpu-storage.json)：真实像素读回及应用状态通过；[持久化对照](persistence-comparison.json) 与既有 Web 功能基线只归一化 updatedAt 后一致，不是重新测 Web 性能。
- [自动化](checks.json)：25 项移动测试、20 项原生适配器测试、5 项共享页面测试、类型/边界检查、Native 统一 `verify:ui -- --profile core` 及 Android SDK 构建通过。
- [`.4` 中间候选](../android-m24.4-intermediate/README.md) 虽然内存/性能通过，但发现隐藏代码页首次显示被零尺寸裁剪，标记失败并保留。本 `.5` 补充布局尺寸回归测试，重新完成上述所有设备验收，没有继承旧包通过结果。
- 仅声明 Android ARM64 候选。其他 ABI、Apple 修补库及本轮共享适配改动的 Apple 真机回归待验收；物理中文输入法选字、读屏等原专项独立保留。旧入口继续可回退。
