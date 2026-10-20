# M24 G01 ShaderLab 行为与基线

当前接入 UI **0.2.0** 的固定 tarball，Web Engine 保持 0.1.0，mobile Engine 保持 0.2.0。npm 官方仓库尚无 UI 0.2.0，本次不发布包。`web/package.json` 的本地 tarball 引用指向仓库内 vendor，锁文件固定版本和 integrity，不引用相邻 UI 源码。升级前的 UI 0.1.2 身份记录在 `results/pre-ui-upgrade.json`。

## 可重现入口

在 ShaderLab 根目录依次执行：

```sh
npm ci
npm run typecheck
npm test
npm run build
node review/m24-ui/g01/replay.mjs
node review/m24-ui/g01/verify-web-probe.mjs
node review/m24-ui/g01/browser-baseline.mjs
node review/m24-ui/g01/ui-upgrade-smoke.mjs
```

浏览器入口使用本机 Chrome、隔离配置和临时本地服务器，需要图形/GPU 权限。代码与固定 fixture 是同仓资源，UI 契约探针来自 `haiyue-m24-ui-contract-probe-1.0.0.tgz`，解包内容已核验与 producer 一致。重新解包用 `tar -xzf … -C vendor/contract --strip-components=1`（路径相对此目录）。不得修改解包内容；契约改变先由 UI 重新产包并更新接受哈希。

`project.hyshader` 固定工程 ID、时间、源码、预览模式及纹理通道。测试使用 75% → 50% → 25% → 100% → 75%，浏览器每轮重复 20 次，共 3 个独立浏览器会话。预热 30 帧后记录 120 个 rAF 间隔。选择事件为合成输入，真正执行现有 WebComponent、业务回调和 WebGPU 预览，不代替人工 IME/触摸验收。

## 证据范围

| 证据 | 说明 |
| --- | --- |
| `results/replay.json` | 现有 MobileSession 的 Node 业务回放与模拟 native setter；不是手机性能 |
| `results/web-probe.json` | 真实 UI 0.2.0 WebComponent 与私有契约探针连接、取消和释放 |
| `results/web-baseline.json` | 迁移前页面的 3 × 100 次切换、实际输出尺寸、控件身份、程序回填事件数、帧节奏与 CPU/堆指标 |
| `results/web-ui-0.2-*.png` | 同轮真实页面截图 |
| `results/shaderlab-*.log` | UI 升级后的类型检查、220 项 Web 与 7 项 mobile 测试、构建 |
| `results/ui-upgrade-browser-smoke.log` | 完整浏览器 smoke 在 GLSL 结构体像素断言处失败，见下方独立问题 |
| `results/ui-upgrade-smoke.json` | UI 专项：下拉菜单、checkbox、代码输入、dialog、保存/重开/刷新 |
| `results/struct-no-ui.json` | 不加载 UI 的独立渲染复核，用于分类完整 smoke 暴露的结构体像素问题 |
| `results/identity.json`、`source.patch` | source revision、已有工作区改动快照与依赖/关键文件哈希 |

rAF 间隔是呈现节奏指标，不是 GPU timestamp。当前 UI handler 和等待编译/呈现的 p95 有波动，报告中的 quality 明确标为不能据此判定优化收益；G07 比较候选前须在空闲同机重跑旧/新路径，保持锁定依赖和相同场景，噪声超门槛时判 inconclusive。

旧完整 smoke 的桌面操作已修正：新增 75% 选项；macOS 使用平台对应的文末/全选/撤销/保存快捷键；下拉框通过真实 select 的 input/change 接线验证。普通 HTML select 的独立探针也确认当前无头 Chrome 无法靠 CDP 驱动系统菜单选择，相关记录为 `native-select-keyboard-reference.json`；这不视为人工键盘验收。完整 smoke 的最终状态必须读取实际日志，不能由 UI 专项通过推导全部着色器用例通过。

[GLSL 结构体渲染问题](known-rendering-issue.md) 已在不导入 UI 的独立场景中复现，保留后续修复。当前不声明完整 GPU/编译器回归通过。

## 共享业务边界

[application-contract.d.ts](application-contract.d.ts) 冻结产品状态、actions 和实际切片需要的服务。G02 先抽领域和业务，G07 才替换页面。dirty 从 revision/savedRevision 派生，保存确认旧 snapshot 不清除后续编辑；编译资源由 preview 服务持有，过期句柄要 release。界面不直接持有 GPU/native 对象。

G01 尚未建立当前 iPhone/iPad/Android/Safari 性能会话：设备旧路径基线明确交给 G07，并由 G10 汇总最终验收，不能用 Node replay、此前设备截图或 Web 数据代替。G07 在替换原页面之前先运行本 fixture 和相同选择序列，再测迁移后路径。
