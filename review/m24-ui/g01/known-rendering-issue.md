# 独立记录：GLSL 结构体渲染像素不符

2026-10-16，UI 升级回归发现，状态为 **待修复**。

运行完整 `node web/test/browser-smoke.mjs` 时，`web/test/fixtures/structs.glsl` 的中心像素为 `[255, 0, 0, 255]`，断言期望 `[64, 128, 191, 255]`。日志保存在 [ui-upgrade-browser-smoke.log](results/ui-upgrade-browser-smoke.log)。完整 smoke 在这里失败，后续用例未因此取得通过证据。

为确认与 UI 接入的关系，另外用同一 ShaderRuntime、GLSL 转换器、Engine 版本和 fixture 创建独立 canvas，没有导入 UI 组件。重复得到相同像素结果，构建输入中 `@haiyue/ui` 模块数量为 0，浏览器未报告异常。详见 [struct-no-ui.json](results/struct-no-ui.json)。这证明此渲染失败可以独立于 UI 接入复现；尚未确定是翻译器、渲染路径还是平台行为导致，也没有用升级前完整回归证明首次引入版本。

在 ShaderLab 根目录，完成 `npm run build` 后复核：

```sh
node review/m24-ui/g01/verify-struct-no-ui.mjs
```

这个诊断命令成功表示完成采样和 UI 隔离检查；像素是否正确必须读取报告的 `matches`，本次为 `false`。不能将诊断命令退出 0 当成渲染用例通过。

UI 接入本身的下拉菜单、复选框、编辑、弹窗、保存与重开由 [ui-upgrade-smoke.mjs](ui-upgrade-smoke.mjs) 单独验收。后续修复此渲染问题时，应先定位不带 UI 的最小复现，再重跑完整 smoke，不能修改像素期望来绕过错误。此项不属于 G01 契约实现，但保留为 ShaderLab 后续渲染验收事项。
