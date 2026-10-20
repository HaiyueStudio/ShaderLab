# Apple 页面对象持有链诊断

2026-10-18。使用同一 iPhone 的诊断安装包导出真实 V8 堆，逐项定位原生回调与全局函数的持有关系。只用于定位，不能替代无诊断钩子的最终包验收。

[持有链及快照哈希](retainer-evidence.json) 保留三个阶段：

1. 输入通知/UIAction 的 native block 持有 JS 回调上下文，间接保留全部 50 个编辑器、控件树和 GPU 宿主。
2. 可清空回调中继解绑后降至 1 个；剩余根来自全局帧错误处理函数持有最后一个宿主。
3. 宿主 dispose 时注销帧错误回调、全局 RAF 函数移出注册作用域后，堆内 MobileEditor 为 0。

另修复 Canvas Apple 通知和触摸处理器的 Swift 强引用、JS 原生回调及每页面创建的 Objective-C ready listener。保留原 API；设备框架与来源校验见 mobile/patches 和 mobile/vendor。

原始堆只留本地忽略的 artifacts/m24-g07/apple-{heap,relay,last-retainer}，不纳入 npm 或源码证据包。最终构建已恢复原 CanvasModule.mm，移除堆导出入口；最终结果以 [Apple 新包验收](../apple-final/README.md) 为准。
