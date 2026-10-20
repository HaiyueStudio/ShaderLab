# Apple 首轮内存验收：失败记录

2026-10-18。两台设备均完成 50 次真实编辑页/GPU 宿主创建与销毁，UI/帧计数归零，但实际进程内存持续增长。因此原始 lifecycle 中的计数 `passed` **不代表内存验收通过**，最终内存结论为 failed，见 [内存记录](memory.json)。

首包身份见 [identity](identity.json)，iPhone 从约 91 MiB 增至 1029 MiB，iPad 从约 82 MiB 增至 1006 MiB。全部历史宿主弱引用仍存活。随后在 iPad 上关闭诊断弱引用重跑 50 次，仍持续增长，见 [无探针对照](ipad-no-refs.json)。该对照排除了新增探针造成整页持有的解释。

固定 Canvas 2.1.18 源码发现 Apple 独有持有链：NotificationCenter 的闭包强持有 Canvas（移除 observer 又依赖 deinit）；Canvas 与触摸处理器相互强持有；原生 block 持有 JavaScript Canvas，且构造函数内回调可能与缓存的 Objective-C 方法共享词法上下文。后续候选修复通知/触摸反向引用，并隔离和清除 JS 原生回调。不能用本目录计数通过的结果替代修复后新包的验收。
