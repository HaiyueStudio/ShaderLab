# G07 ShaderLab 共享页面迁移

## iPhone 持续预览波动定位与优化（2026-10-20）

用户报告已清理其他后台应用后，先用未修改的统一样式 candidate4 重跑四轮两组对照，再在新候选中保留旧路径开关，交替测试原生/GUI × 旧/新预览路径。**确认并修复了两种 UI 共用的重复键盘纹理生成/上传；原生路径还合并了 GPU 提交并跳过重复尺寸上传。正式同包对照中，原生持续预览耗时下降 51.2%、完整操作下降 17.5%；GUI 完整操作下降 13.0%，持续预览仅下降 1.4%，不能认定有明显稳定收益。持续预览 CPU 波动尚未解决，G07 门槛仍未通过。**

### 清理后台后的基线

仍用上一候选相同项目、尺寸、四轮顺序和计时口径，共 800 次操作。原生持续预览 p95 的四轮中位数为 2.288 ms、最大/最小比 1.733；GUI 为 3.269 ms、比值 1.505。清理前对应波动为 82.2% / 42.7%，清理后为 **73.3% / 50.5%**。两组仍有明显波动，现有证据不支持把它主要归因为最近应用列表中的应用数量；本实验也没有枚举系统进程或控制所有系统后台任务，不能声称系统干扰已排除。[原包复测](experiments/preview-cpu-20261020/clean-background/report.json) 保留全部样本。

[Apple 说明](https://support.apple.com/en-ie/109359)指出，最近使用的应用主要在活跃或执行特定后台任务/服务时消耗资源；列表中存在应用本身并不等于它在持续占用 CPU。此次前后复测也不是严格隔离的后台应用因果实验。

### 已确认的问题与改动

1. `NativeShaderRuntime` 每帧调用 `KeyboardState.pixels()`：分配 3072 字节、遍历 768 个像素并上传纹理，即使没有键盘输入。现在通过状态版本判断，仅在 held/pressed/toggle 改变时生成与上传；首帧初始化、按键松开、快速点击、单帧 pressed 清除、失焦与 reset 仍会正确更新。
2. 原生 Canvas 路径原先每帧创建两份 encoder、提交两次（着色器图、最终显示）。现在在同一个 encoder 中按原顺序记录，合为一次提交；GUI/3D 的后续消费属于引擎，仍保持原来的提交边界。
3. 原生最终显示尺寸 uniform 原先每帧上传；现在仅在尺寸变化时上传。窗口尺寸变更依然触发更新，暂停后需要显示的帧也保留。

产品代码位于 `mobile/src/gpu-runtime.ts`、`web/src/keyboardTexture.ts`。独立诊断代码仅包裹本项目 JS 方法，不改写原生只读 GPU 方法；正式计时不启用它。新包提供 `--shaderlab-preview-baseline` 以关闭上述复用/合并，保证同包比较。Engine、Native、UI 的包版本和既有 GUI 优化补丁均未更换。

### 分段诊断

旧路径诊断的 120 个静态预览帧，两组均生成/上传键盘纹理 120 次；包含生成的上传段 p95 原生 0.452 ms、GUI 0.628 ms，其中像素生成分别为 0.193 / 0.249 ms。这是带探针的包含式时间，不能将这些独立 p95 相加，也不混入正式统计。新路径中，稳定预览键盘生成、上传均为 0；原生尺寸上传从 120 次降为 0，预览提交从 240 次降为 120，GUI 预览图提交保持 120 次（不包含 GUI 自己的引擎提交）。见 [诊断汇总](experiments/preview-cpu-20261020/profile-summary.json) 和原始 [旧路径](experiments/preview-cpu-20261020/profile-old/report.json)、[新路径](experiments/preview-cpu-20261020/profile-new/report.json)。

这确认了共同的无效工作及其消除，但不等于证明它是所有轮间波动的根因。

### 同包正式对照

iPhone 15 Plus / iOS 27.2，竖屏；冻结新 IPA SHA-256 `14bd02986ca06d93c1192719a15b5b581d632d99f737fb2b8d222212334173b7`。四组分别是原生新、GUI 新、原生旧、GUI 旧；四轮采用每组在各顺序位置各出现一次的平衡顺序，每组每轮 100 次，共 **1600 次操作**。全部 16 次运行持续前台、最终图像非空；诊断探针关闭，未删样本、未补跑筛选轮次。每组还采集 480 个持续预览帧。

仍是 Debug 候选、512×288 着色器基准尺寸，GUI surface 860×1678、原生引擎 surface 512×288。统计为四轮 p95 中位数，单位 ms。**沿用的“CPU”指标实际是同步代码段的经过时间，不是 OS 线程 CPU 记账；系统抢占也会计入。它不包含 UIKit 布局/系统合成，不是进程总 CPU；语义命令测试也不包含触摸或菜单动画。**

| 指标 | 原生旧 | 原生新 | 原生变化 | GUI 旧 | GUI 新 | GUI 变化 |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| 操作期间引擎帧 CPU | 2.806 | 1.722 | -38.7% | 5.561 | 5.268 | -5.3% |
| 命令 + 稳定前全部引擎帧 CPU | 6.643 | 5.484 | -17.5% | 13.076 | 11.378 | -13.0% |
| 持续预览引擎帧 CPU | 1.966 | 0.960 | -51.2% | 2.972 | 2.929 | -1.4% |
| 操作至预览稳定 | 51.110 | 50.879 | -0.5% | 50.966 | 50.770 | -0.4% |
| 持续预览帧间隔 | 17.284 | 16.977 | -1.8% | 17.496 | 17.594 | +0.6% |

该对照衡量整组优化，不把每一项改动的收益单独归因。GUI 持续预览的 1.4% 差异远小于轮次波动，应视为未证实的改善；原生路径的效果更明显。两组预览响应仍接近，并非把 CPU 降幅等同于用户可感知延迟降幅。

### 波动与未解决部分

沿用最大轮次 p95 / 最小轮次 p95 ≤1.10，不放宽门槛。下表同时给出绝对范围，避免较小的耗时分母放大百分比却被误解为新增长卡顿。

| 持续预览 | 四轮 p95 中位数 | 最小–最大 p95 | 最大/最小波动 | 结果 |
| --- | ---: | ---: | ---: | --- |
| 原生旧 | 1.966 | 1.329–2.297 | 72.8% | 未通过 |
| 原生新 | 0.960 | 0.709–1.310 | 84.7% | 未通过 |
| GUI 旧 | 2.972 | 2.640–3.855 | 46.0% | 未通过 |
| GUI 新 | 2.929 | 2.253–2.936 | 30.3% | 未通过 |

原生持续预览绝对轮差从 0.967 降到 0.601 ms，GUI 从 1.215 降到 0.683 ms，但两组仍未通过相对稳定性门槛。GUI 新路径完整操作 p95 为 7.370、10.721、12.202、12.035 ms，首轮明显较快；最大/最小波动 65.6%，不能只保留后几轮。原生新路径完整操作波动 28.9%，也未通过。四组帧间隔轮间比值均 ≤1.10，各 480 个持续预览间隔均未超过 33.333 ms。

共同重复工作不是残余波动的完整解释。原生/GUI 都使用相同帧调度、共享预览运行时和同一短窗采样器；当前数据不能进一步区分系统抢占、运行时/JIT/GC、CPU 调频及 GUI 剩余绘制工作各自的贡献。没有将温度或后台程序写成已证实原因。

额外分别采集了 30 秒 Time Profiler，仅保留最后 10 秒稳定预览、只附加 ShaderLab 进程，不用于正式比较。两份 `.trace` 均成功保存，但 Xcode 的 `xctrace export --toc` 均退出 139，输出为空；崩溃记录为工具进程 `EXC_BAD_ACCESS / SIGSEGV`，不是 ShaderLab 崩溃。因此本轮未获得可审阅的系统调用栈/调度结论。[导出失败证据](experiments/preview-cpu-20261020/system-export-failure.json) 已保留，原始记录在 `artifacts/m24-g07/preview-cpu-20261020/{gui,native}-steady.trace`。后续应先恢复这两份系统记录的解析，再结合更长固定采样窗验证残余波动；不能用扩大窗口替换或掩盖本次失败结果。

### 验证与复现

47 项移动端测试、3 项 Web 媒体测试、类型检查、职责边界检查通过。真实 Chrome WebGPU 通过优化前/后各 7 个键盘像素状态（14 组），并通过 8 个示例、反馈、缩放、相机、HLSL、声音和 3D 切换回归。[GPU 记录](experiments/preview-cpu-20261020/webgpu-regression.json) 与 [验收状态](experiments/preview-cpu-20261020/verification.json) 已保存。初版新增 GPU 测试直接在引擎帧外绘制造成 surface 失效，已修正为通过正常引擎帧触发并通过；初次失败日志亦保留，不当作产品故障证据。

新包已安装至 iPhone，系统采样后恢复默认原生入口且启用优化。本轮不是完整页面触摸/50 次释放验收，未发布 npm。正式入口设置 `PREVIEW_COMPARE=1`、iPhone `DEVICE`、唯一 `DEVICE_LABEL`、冻结新 IPA 的 `ARTIFACT`；`PREVIEW_PROFILE=1` 仅做独立诊断，`PREVIEW_BASELINE=1` 可诊断旧路径。[正式原始样本](experiments/preview-cpu-20261020/formal/report.json)、[统计与绝对范围](experiments/preview-cpu-20261020/formal-summary.json)、[预定顺序](experiments/preview-cpu-20261020/formal/plan.json)、[候选身份](experiments/preview-cpu-20261020/candidate-identity.json) 均可追溯。

## 统一样式后的 iPhone 对照与 iPad 比较（2026-10-20）

已在 iPhone 15 Plus（iOS 27.2，竖屏）完成统一样式候选的原生共享 UI / 优化 Engine GUI 对照。**耗时趋势与 iPad 一致：GUI 的完整操作 CPU 为原生的 1.87 倍（iPad 1.86 倍），操作到预览稳定时间接近。稳定性不完全一致：iPhone GUI 的完整操作 CPU 通过 10% 波动门槛，持续预览 CPU 未通过；iPad 恰好相反。不能据此宣称任一 UI 全面更稳定。**

### 实验身份与口径

重新安装与 iPad 相同的 candidate4 IPA，SHA-256 为 `4e55f08d2df54cba5d6d53c8b0f19fa2dfe8bafe2649dbdec7fd4aa1af63b168`，解包可执行文件与压缩包内哈希一致；未重新构建或修改应用。采样脚本与 iPad 留档版本逐字节一致。沿用预先固定的四轮顺序（原生→GUI、GUI→原生、原生→GUI、GUI→原生）、每组每轮 100 次操作、相同预热和 10% 波动门槛，共 **800 次操作**和每组 **480 个持续预览帧**。全部 8 次运行持续前台、读回非空，每次操作均以 3 个引擎帧达到稳定；没有失败重跑、删慢样本或挑轮次。测试后已恢复默认原生入口。

两台设备着色器基准均为 512×288，但 GUI surface 不同：iPhone 860×1678（竖屏），iPad 2360×1526（横屏）。设备、系统版本、布局和 GUI 像素数均不同，因此跨设备以各自的 GUI/原生比值和现象为主，不把绝对差异归因于单一硬件因素。这是同一 Debug 候选的短时实验，不是 Release 性能或长期稳定保证。

### iPhone 耗时

每轮 p95 再取四轮中位数，单位 ms；统计定义沿用下方 iPad 方法。完整操作 CPU 是逐次累加命令与全部稳定帧后取分位数，**不是整个进程 CPU**：UIKit 布局、系统合成及 after-update 后的 present 均不在测量范围。语义命令不包含触摸到显示、选择器动画、作品列表滚动或设置弹窗打开耗时。

| 指标 | 原生共享 UI | 引擎 GUI | GUI / 原生 |
| --- | ---: | ---: | ---: |
| 同步命令处理 | 1.390 | 0.491 | 0.354 |
| 操作期间引擎帧 CPU | 2.572 | 5.400 | 2.100 |
| 命令处理 + 下一引擎帧 CPU | 3.419 | 5.928 | 1.734 |
| 命令处理 + 稳定前全部引擎帧 CPU | 7.013 | 13.110 | 1.870 |
| 持续预览引擎帧 CPU | 2.223 | 3.168 | 1.425 |
| 操作至预览稳定 | 51.969 | 50.962 | 0.981 |
| 操作开始至提交队列完成 | 68.557 | 67.593 | 0.986 |
| 持续预览帧间隔 | 17.268 | 17.558 | 1.017 |

GUI 同步命令更快，但后续引擎绘制抵消了这部分收益。操作至预览稳定仅相差约 1 ms，不能把该差异视为已证明的感知响应提升；队列完成时间包含 CPU、调度和队列等待，也不是纯 GPU 执行时间。

### 与 iPad 的耗时趋势

| 指标（GUI / 原生） | iPhone | iPad |
| --- | ---: | ---: |
| 命令处理 + 稳定前全部引擎帧 CPU | 1.870 | 1.860 |
| 持续预览引擎帧 CPU | 1.425 | 2.179 |
| 操作至预览稳定 | 0.981 | 1.005 |
| 持续预览帧间隔 | 1.017 | 0.983 |

两台设备都呈现“GUI 引擎 CPU 成本较高、预览响应接近”的趋势。持续预览成本倍数在 iPhone 上较小，但不能据此断言是硬件、屏幕面积或系统版本中的哪一个因素造成。

### 稳定性对照

下表为 `(最大轮次 p95 / 最小轮次 p95 - 1) × 100%`，≤10% 为本轮观察门槛。门槛不是统计显著性检验。

| 指标 | iPhone 原生 | iPhone GUI | iPad 原生 | iPad GUI |
| --- | ---: | ---: | ---: | ---: |
| 操作期间引擎帧 CPU | 11.7%（未通过） | 5.8%（通过） | 56.7%（未通过） | 5.0%（通过） |
| 命令处理 + 稳定前全部引擎帧 CPU | 17.3%（未通过） | 5.2%（通过） | 19.2%（未通过） | 11.7%（未通过） |
| 持续预览引擎帧 CPU | 82.2%（未通过） | 42.7%（未通过） | 21.9%（未通过） | 2.7%（通过） |
| 持续预览帧间隔 | 3.2%（通过） | 1.7%（通过） | 9.9%（通过） | 1.2%（通过） |
| 操作至预览稳定 | 0.7%（通过） | 1.3%（通过） | 0.7%（通过） | 0.9%（通过） |

iPhone 完整操作 CPU 四轮 p95（ms）：原生 6.945、7.819、6.668、7.081；GUI 13.076、13.145、12.569、13.223。

iPhone 持续预览 CPU 四轮 p95（ms）：原生 2.523、2.288、2.157、1.384；GUI 3.627、2.851、2.541、3.486。原生最后一轮较低、GUI 中间轮次较低的结果均原样保留，没有把波动归因于尚未测量的温度、频率或系统任务。

两组各 480 个持续预览间隔均未超过 33.333 ms，最大值原生 18.425 ms、GUI 19.002 ms；帧间隔轮间稳定性均通过。这只说明本轮引擎回调采样未出现明显长帧，不是屏幕逐帧呈现或全应用无卡顿证明。

**维持原生 UI 为默认方案；G07 整体性能门禁仍待验证。** 这次完成所请求的同机与跨设备比较，不追加筛选运行来追求门槛通过，也不代替四处页面完整触摸流程或 50 次页面释放验收。

[全部原始样本](experiments/style-unification/iphone-comparison/report.json)、[轮次摘要](experiments/style-unification/iphone-comparison/summary.json)、[稳定性与限制](experiments/style-unification/iphone-comparison/verification.json)、[两设备对照数据](experiments/style-unification/iphone-comparison/cross-device.json)、[冻结身份](experiments/style-unification/iphone-comparison/identity.json) 已留档。复现沿用 iPad 入口，使用 iPhone 的 `DEVICE`、全新的 `DEVICE_LABEL`、`ARMS=shared,optimized` 以及冻结 IPA 的 `ARTIFACT`。

## 统一样式后的 iPad 同机性能对照（2026-10-19）

在 iPad Air 4（iPad13,1，iPadOS 26.7.1，横屏）完成原生共享 UI 与优化 Engine GUI 对照。**GUI 命令处理较快，但包含后续引擎帧后的 CPU 成本更高；完整操作 CPU 为原生的 1.86 倍，持续预览为 2.18 倍。两组操作到预览稳定时间接近，帧间隔稳定；完整操作 CPU 的轮次波动仍未通过 10% 门槛，因此不把此次实验标为全面稳定性通过。**

### 候选与方法

直接安装上一轮统一样式的 candidate4，没有重新构建应用。IPA SHA-256 为 `4e55f08d2df54cba5d6d53c8b0f19fa2dfe8bafe2649dbdec7fd4aa1af63b168`，Native/UI/Engine 版本及补丁沿用 [冻结身份](experiments/style-unification/identity.json)。解包可执行文件与 IPA 内文件哈希一致，见 [iPad 运行身份](experiments/style-unification/ipad-comparison/identity.json)。这是冻结的 Debug 真机候选，不是 Release 性能结论。

四轮顺序事先固定为原生→GUI、GUI→原生、原生→GUI、GUI→原生，每组每轮 100 次分辨率变更（75/50/25/100/75 循环），共 **800 次操作**；每次均用 3 个引擎帧达到预览稳定。每次进程启动先预热 30 帧；每轮结束后额外采集 120 个持续预览帧，之前再丢弃固定的 30 个过渡帧。全部 8 次运行持续前台且最终 RGB 读回非空，没有失败后重跑、筛除慢操作或挑选轮次。正式计时未启用阶段诊断探针与 UI 自动化快照。计时器仍保留必要的统一帧 CPU 测量。

相同项目、相同 512×288 着色器基准尺寸；原生引擎 surface 为 512×288，GUI 还需绘制 2360×1526 的界面 surface。两组各自的尺寸在四轮中保持不变。该工作量差异属于两种 UI 实现，不能据此推导等像素 GPU 效率。**CPU 只覆盖同步命令处理与引擎 update→after-update，不包括 UIKit 布局、系统合成和其后的 present。操作由语义命令触发，不测触摸到显示、选择器动画、作品列表滚动或设置弹窗打开时间。**

### 耗时

每轮先取 p95，再取四轮 p95 的中位数（偶数个数取中间两项均值），单位 ms。操作期间引擎帧 CPU 是每次操作内帧 CPU 的 p95（本轮 3 帧即最大值），再取 100 次操作的 p95；完整操作 CPU 则逐操作先加总 handler 与全部稳定帧再取 p95，不把独立分位数相加。

| 指标 | 原生共享 UI | 引擎 GUI | GUI / 原生 |
| --- | ---: | ---: | ---: |
| 同步命令处理 | 1.610 | 0.541 | 0.336 |
| 操作期间引擎帧 CPU | 2.553 | 7.145 | 2.798 |
| 命令处理 + 下一引擎帧 CPU | 3.764 | 7.516 | 1.997 |
| 命令处理 + 稳定前全部引擎帧 CPU | 8.553 | 15.907 | 1.860 |
| 持续预览引擎帧 CPU | 2.617 | 5.704 | 2.179 |
| 操作至预览稳定 | 50.913 | 51.179 | 1.005 |
| 操作开始至提交队列完成 | 67.857 | 68.213 | 1.005 |
| 持续预览帧间隔 | 18.247 | 17.946 | 0.983 |

队列完成时间包含操作后的 CPU、调度与队列等待，并非纯 GPU 执行时间；帧间隔是引擎回调间隔，不是物理屏幕逐帧呈现统计。GUI 的命令 CPU 较少不能抵消后续绘制 CPU，当前数据不支持把默认原生界面替换为 GUI 能提升整体性能。

### 稳定性

沿用最大轮次 p95 / 最小轮次 p95 ≤ 1.10 的观察门槛；这是一轮短时重复实验，不是统计显著性检验或长时稳定保证。

| 指标 | 原生最大/最小 | GUI 最大/最小 | 结论 |
| --- | ---: | ---: | --- |
| 操作期间引擎帧 CPU | 1.567 | 1.050 | 仅 GUI 通过 |
| 命令处理 + 稳定前全部引擎帧 CPU | 1.192 | 1.117 | 两组未通过 |
| 持续预览引擎帧 CPU | 1.219 | 1.027 | 仅 GUI 通过 |
| 持续预览帧间隔 | 1.099 | 1.012 | 两组通过 |
| 操作至预览稳定 | 1.007 | 1.009 | 两组通过 |

完整操作 CPU 的原生四轮 p95 为 7.563、8.601、9.013、8.505 ms，GUI 为 15.988、17.495、15.660、15.826 ms。GUI 第二轮较慢的样本全部保留，其 11.7% 波动仍略超门槛；原生为 19.2%。原生持续预览 CPU 从首轮 3.090 ms 降到后续 2.658、2.577、2.535 ms，也未通过轮间稳定性。GUI 的单帧 CPU 与持续预览 CPU 分别只有 5.0%、2.7% 波动，表现更稳定，但绝对耗时仍较高。

两组各 480 个持续预览间隔均未超过 33.333 ms，最大值原生 19.290 ms、GUI 19.666 ms。这支持本次短时采样未出现明显长帧，不代表所有交互或长时间运行均无卡顿。G07 整体性能门禁仍保留待验收；本轮也不是 50 次页面释放或四处页面完整触摸流程验收。

[全部原始样本](experiments/style-unification/ipad-comparison/report.json)、[轮次摘要](experiments/style-unification/ipad-comparison/summary.json)、[门槛与限制](experiments/style-unification/ipad-comparison/verification.json)、[预先固定的顺序](experiments/style-unification/ipad-comparison/plan.json) 均已留存。测试后 iPad 已恢复默认原生入口。

复现使用 `mobile/test/gui-cpu-comparison.mjs`，设置 `ARMS=shared,optimized`、iPad 的 `DEVICE`、新的 `DEVICE_LABEL` 和上述冻结 IPA 的 `ARTIFACT`。脚本拒绝复用已有结果目录，记录采样计划，并检查相同设备、尺寸、100 个样本、连续前台及非空读回；不设置 `ARMS` 时保留既有三组对照模式。

## 四处界面样式统一（2026-10-19）

作品列表、编辑工具栏、设置与弹窗已完成共享样式调整。WebComponent、NativeScript 原生控件与 Engine GUI 实验界面统一采用组件库 Nightfall 配色、字号、圆角和间距；应用主题集中在 `shared/views/presentation.ts`，Web/Native CSS 由同一配置生成。样式调整阶段先完成交互验收，之后的 iPhone/iPad 同机性能对照见本文上方。**下方旧 iPhone CPU 结果属于统一样式前的候选，不代表新样式性能；G07 整体性能门禁仍待验证。**

- 作品列表统一卡片、缩略图和标题层级，按视口调整列数；GUI 缩略图按资源缓存，页面释放时销毁。
- 工具栏统一 44 点可见控件与 8 点圆角；修复 WebComponent 宿主为 44px、内部按钮却未填满的情况，保留动态控件与静态 GUI 分层。
- 设置采用左侧标签、右侧控件和独立底部操作区。原生弹窗及选择菜单共用居中、最大宽度 460 点的卡片，横屏高度受视口约束并可滚动；遮罩、选中态和“取消”文案随主题与配置。
- 代码编辑、系统导航、键盘及系统分享保留平台能力。GUI 仍是 Canvas 预览实验范围，未补齐原生/Web 的全部功能，不宣称全应用逐像素一致。

最终候选已安装至 iPhone 15 Plus，原生共享 UI 与 GUI 两条完整 XCTest 流程均通过（2 项通过、0 失败），覆盖新建、分辨率、播放暂停、设置内选择、弹窗重开、旋转、后台恢复、键盘收起及编辑保存重开。测试后已恢复默认原生入口。[原生设置](experiments/style-unification/shared-settings-portrait.png)、[原生选择菜单](experiments/style-unification/shared-select-menu.png) 和 [GUI 作品列表](experiments/style-unification/gui-gallery.png) 已目视检查。

Web 的 Chrome WebGPU 页面验收通过，另有 Chromium/WebKit 44 项组件适配测试通过；UI 98 项、Native UI 28 项、ShaderLab 移动端 44 项和共享页面 5 项自动化测试通过，Web/iOS 构建与类型检查通过。[Web 结果](experiments/style-unification/web/report.json)、[iPhone 结果](experiments/style-unification/iphone-ui-summary.json)、[完整验收状态](experiments/style-unification/verification.json) 保留了本轮证据。

[结构回放](experiments/style-unification/structural-counters.json) 确认 100 个静态 GUI 帧的缓冲分配和上传仍为 0，释放后 buffer/texture 残留为 0；这是结构检查，不是真机耗时或新的 50 次页面释放验收。iPad 同机性能对照已完成，见本文上方新结果；iPad 四处页面完整触摸流程及 Android 新样式真机验收尚未进行。

候选使用私有 Native `0.1.4-m24.21`、UI `0.2.0-m24.6`，Engine 仍为 `0.2.0` 加已有显式 GUI 优化实验补丁。本轮未发布 npm 包。[冻结身份](experiments/style-unification/identity.json) 包含最终 IPA、依赖和源码哈希。

## GUI CPU 优化与同机复测（2026-10-19）

已完成绘制提交与静态 UI 复用优化，并在 iPhone 15 Plus 上用同一候选包比较原生共享 UI、原版 GUI、优化 GUI。**操作期间引擎帧 CPU 的三轮 p95 中位数下降 24.3%；计入命令处理和稳定前全部引擎帧后下降 9.1%。持续预览中位数下降 19.8%，但轮间波动仍未通过 10% 观察门槛。** 这些结果支持保留优化，但不支持把 ShaderLab 默认原生界面全面替换为 GUI。

### 定位和修复

- 预览的两张纹理轮换时，图片顶点缓冲原先随纹理身份销毁和重建。改为保留批次内的几何位置，只更换纹理绑定；移除的几何位置仍正常释放。
- Shape/Text/Image renderer 只有在窗口尺寸变化或自身重建时才上传 viewport uniform。借用的纹理不再被“待销毁图片”集合强引用。
- 相同形状命令复用顶点数据；文字排版由两遍改为一遍，顶点内容未变时跳过上传。文字字体数据仍允许修改，不以字体对象身份掩盖字形变化。
- ShaderLab 把状态、运行、播放和分辨率控件从静态导航中分离；隐藏的设置选择器在打开时再同步，避免隐藏控件使整片静态页面失效。动态层空白处透传点击，弹窗与下拉选项仍使用引擎的全局层级规则。

代码位于 Engine 的 `engine/src/gui/rendering` 和 ShaderLab 的 `mobile/src/experiments/gui-ui`。对照包继续锁定 Engine **0.2.0**，通过显式实验构建替换六个私有 GUI 类，保留原版类作控制组，避免引入其他 0.2.1 改动；不是 npm 发布或依赖升级。[冻结身份和源码哈希](experiments/engine-gui/cpu-optimization/identity.json) 记录了实际替换范围。

### 统一样式前的正式结果

同一 IPA、相同 512×288 着色器基准尺寸，三组各三轮、每轮 100 次操作，共 **900 次**。轮换顺序为原生/原版/优化、优化/原生/原版、原版/优化/原生；每次操作均为 3 个引擎帧。全部持续前台，最终 RGB 读回非空。正式计时关闭诊断探针和 AX 测试快照；没有过滤慢样本。

下表为每轮 p95 再取三轮中位数，单位 ms。CPU 仅覆盖同步命令处理和引擎 update 至 after-update，**不含 UIKit 布局、系统合成及 after-update 之后的 surface present**。队列等待包含系统调度，不能视为纯 GPU 执行时间。

| 指标 | 原生共享 UI | 原版 GUI | 优化 GUI |
| --- | ---: | ---: | ---: |
| 同步命令处理 | 1.394 | 0.511 | 0.541 |
| 操作期间引擎帧 CPU | 3.051 | 7.844 | 5.941 |
| 命令处理 + 下一引擎帧 CPU | 3.241 | 8.233 | 6.411 |
| 命令处理 + 稳定前全部引擎帧 CPU | 7.568 | 15.006 | 13.642 |
| 持续预览引擎帧 CPU | 2.326 | 3.953 | 3.171 |
| 操作至预览稳定 | 51.809 | 51.366 | 51.127 |
| 提交至队列完成 | 68.325 | 67.373 | 67.510 |
| 持续预览帧间隔 | 17.695 | 17.715 | 17.672 |

优化 GUI 的操作期帧 CPU 最大/最小轮次 p95 为 **1.097**，命令加全部稳定帧 CPU 为 **1.053**，帧间隔为 **1.009**，均在 1.10 内；持续预览 CPU 为 **1.350**，仍不通过。原生操作期帧 CPU 本轮也有 1.434 的波动，不能只筛选某一组慢样本。完整数据见 [正式 900 个样本](experiments/engine-gui/cpu-optimization/comparison.json) 和 [所有轮次摘要](experiments/engine-gui/cpu-optimization/summary.json)。

优化后命令加全部稳定帧的测得 CPU 仍为原生的 **1.80 倍**，持续预览为 **1.36 倍**；不代表整个进程的 CPU 倍数。持续预览的稳定收益仍需进一步确认，G07 原有性能门禁不因此改判通过。

### 绘制结构与资源

[结构回放](experiments/engine-gui/cpu-optimization/structural-counters.json) 使用真实 GuiEditorView、完整实验字符集和共享 audit GPU device；字形尺寸为确定性测试值，不是真机 GPU 时间或实际字体字节数统计。每种情况均回放 100 帧，只有 GUI 渲染，不包含着色器预览自身的提交。

| 100 帧结构计数 | 原版 GUI | 优化 GUI |
| --- | ---: | ---: |
| 持续预览顶点缓冲分配 | 100 | 0 |
| 持续预览 GUI 上传次数 / 字节 | 400 / 33,600 | 0 / 0 |
| 分辨率交互缓冲分配 | 101 | 1 |
| 分辨率交互上传次数 / 字节 | 562 / 1,707,312 | 81 / 332,352 |
| 绘制调用 | 300 | 500 |
| 活跃 GUI 缓冲 | 6 | 8 |

分层增加了每帧 2 次绘制和 2 个缓冲，用来换取更小的批次重建范围；并非所有计数都减少。结构回放结束后 buffer/texture 残留均为 0。真机三个轮次追踪到的最终 GPU 资源子集稳定为原生 8、原版 GUI 17、优化 GUI 19；GUI 两组估算字节数同为 23,244,196（22.17 MiB）。这不是进程 RAM 或完整 GPU 内存，也不是新的 50 次页面释放验收。

独立诊断运行显示，两个根节点同时重建的帧，其 GUI 批次重建 p95 从 **3.896 → 1.414 ms**；GUI 整段从 **5.662 → 3.311 ms**。持续预览 GUI 整段为 **1.677 → 1.247 ms**。这些是带探针的包含式计时，不加入正式统计。见 [阶段诊断](experiments/engine-gui/cpu-optimization/profile-stages.json) 与 [原始诊断数据](experiments/engine-gui/cpu-optimization/profile.json)。

### 验收、历史与复现

最新 GUI 实际点击流程已通过：作品列表新建，75/50/25/100/75 分辨率、播放暂停、设置内选择、弹窗关闭重开、横竖屏、后台恢复、代码输入与键盘收起、保存重开逐字一致。[竖屏设置](experiments/engine-gui/cpu-optimization/gui-settings.png)、[横屏设置](experiments/engine-gui/cpu-optimization/gui-landscape.png) 已目视核对。精确验收状态与同包原生回归结果见 [verification](experiments/engine-gui/cpu-optimization/verification.json)。

本地通过 Engine 全仓类型检查、1,509 项测试、100 个示例构建、API/模块/职责/prepare 边界检查，ShaderLab 移动端 44 项测试与类型检查。真实 Chrome/Metal WebGPU 在 1×/4× MSAA、纹理轮换、裁剪、文字与窗口尺寸改变下完成 16 组缓存/新建像素一致性对照，无验证错误，见 [WebGPU 验证](experiments/engine-gui/cpu-optimization/webgpu-validation.json)。

上一候选仅优化引擎提交，完整 900 次测量未见稳定总 CPU 改善，仍保留在 [engine-only-comparison](experiments/engine-gui/cpu-optimization/engine-only-comparison.json)。诊断探针遇到原生 GPU 只读方法的初始化失败、分层后空白区域挡住设置按钮的失败也保留在候选记录中；没有重复运行未变的候选来挑选通过结果。

实验构建需要同级 Engine 源码；普通 ShaderLab 构建不加载此私有替换器。构建使用 `SHADERLAB_GUI_ENGINE_PATCH=1`；启动 `--shaderlab-ui=gui` 为优化组，加 `--shaderlab-gui-baseline` 为原版控制组；`--shaderlab-gui-profile` 只用于诊断。主性能入口为 `mobile/test/gui-cpu-comparison.mjs`（DEVICE、ARTIFACT、唯一 DEVICE_LABEL）；`PROFILE=1` 才启用独立诊断。构建器校验基础 GUI chunk 哈希，版本变化时主动失败，不静默替换。上述结果仍限于本轮 iPhone 实验范围。

## Engine GUI 对照实验（2026-10-19）

本轮先覆盖 iPhone 的作品列表、编辑主界面、设置和弹窗，代码区继续使用原生 TextView。实验入口在 `mobile/src/experiments/gui-ui`，仅显式传 `--shaderlab-ui=gui` 启用；普通启动仍是原生 UI。作品保存在独立 `ShaderLab-GUI-Experiment` 目录。

两种界面复用相同 application、controller 和 ShaderRuntime。GUI 使用直接的保留式绑定，没有经过 portable UI reconciliation；这是两种应用实现的对比，不能把差异全部归因于底层绘制方式。预览与静态 GUI 分为独立 GuiRoot，避免动态预览纹理使整个界面重建。

对照使用同一 IPA、同一工程、同一 512×288 着色器基准尺寸，三轮各 100 次操作、交替顺序。GUI 画布覆盖安全区域，原生版本只有预览使用 GPU 画布；额外 GUI 绘制像素属于方案本身成本。除同步处理耗时，还记录延后帧 CPU、操作至预览稳定、队列完成等待、帧间隔和持续预览 CPU。UIKit 布局/合成 CPU、真实显示延迟、整机能耗不在本轮测量内；队列完成等待不能称为 GPU 执行时间。

状态和候选历史见 [实验验收记录](experiments/engine-gui/verification.json)，冻结身份见 [identity](experiments/engine-gui/identity.json)。本地类型/边界检查和 42 项移动端测试通过；同包 GUI 与原生完整交互均通过，正式三轮对照共完成 600 次操作。所有轮次持续前台，最终着色器读回均有非零 RGB，保留全部样本及此前失败记录。该轮结束时 iPhone 安装 GUI 实验候选 5，测试后恢复默认原生入口；依赖仍为 Native 私有 `.15` / UI 私有 `.4` / Engine `0.2.0`。

### 测量结果

设备为 iPhone 15 Plus，iOS 27.2。以下是“每轮 100 个样本的 p95，再取三轮中位数”，单位 ms；不是平均值，也不是物理点击到屏幕显示的延迟。完整数据见 [600 个样本与轮次结果](experiments/engine-gui/comparison.json) 和 [统计摘要](experiments/engine-gui/summary.json)。

| 指标 | 原生共享 UI | Engine GUI | GUI / 原生 |
| --- | ---: | ---: | ---: |
| 同步命令处理 | 1.472 | 0.503 | 0.341 |
| 命令处理 + 下一引擎帧 CPU | 3.795 | 7.979 | 2.103 |
| 命令处理 + 预览稳定前全部引擎帧 CPU | 7.520 | 14.805 | 1.969 |
| 操作至预览稳定 | 52.134 | 51.229 | 0.983 |
| 提交至队列完成（含调度等待） | 68.569 | 67.983 | 0.991 |
| 持续预览的引擎帧 CPU | 2.196 | 3.150 | 1.434 |
| 持续预览的帧间隔 | 17.385 | 17.717 | 1.019 |

每次操作两组均等待 3 个引擎帧。CPU 行只覆盖同步 handler 和引擎更新/绘制提交路径，不包含 UIKit 布局与系统合成，也不包含引擎事件之后的原生 surface present，因此不能把表中比例称为整个进程的 CPU 倍数。

轮间稳定性沿用最大 p95 / 最小 p95 ≤1.10 的观察门槛，没有过滤慢样本：

| 指标 | 原生轮间比 | GUI 轮间比 | 观察 |
| --- | ---: | ---: | --- |
| 同步命令处理 | 1.120 | 1.060 | GUI 通过，原生超门槛 |
| 操作至预览稳定 | 1.265 | 1.013 | GUI 通过；原生第三轮 p95 为 65.673 ms，保留该轮 |
| 操作期间引擎帧 CPU | 1.400 | 1.145 | 两组均超门槛 |
| 持续预览帧间隔 | 1.024 | 1.005 | 两组均通过 |

GUI 同步处理约快 66%，这项指标和预览稳定等待的轮间波动更小；但延后绘制把工作移到了引擎帧中。计入这些帧后，测得的 CPU 成本约为原生方案的 1.97 倍，持续预览帧 CPU 约增加 43%。预览稳定时间和帧节奏的三轮中位数接近，完整性能稳定性仍不能判为通过。

两组分别追踪到 8 / 17 个存活 GPU 资源；最终估算 1.20 / 22.17 MiB。GUI 包含字体图集和更大的画布等成本。这只是引擎追踪到的 buffer/texture 子集，不是进程 RAM、系统合成内存或完整 GPU 内存，也不代替 50 次页面释放验收。

本轮结论：保留原生组件作为 ShaderLab 默认 UI。GUI 已证明可以承载所选页面，但这次数据不支持为性能目的全面替换原生界面；若继续推进，应先定位 GUI 持续绘制、静态批次复用与原生 GPU 调用成本，再用同一协议对照。当前实验没有改变 G07 原有性能门禁结论。

### 功能与证据

GUI 真机流程通过（56.502 秒）：作品列表新建、75/50/25/100/75 分辨率、播放/暂停、设置内选择、弹窗关闭重开、横竖屏、后台恢复、原生代码输入与键盘收起、保存重开后代码逐字相等。同包默认原生入口通过既有完整 SharedPageSmoke（62.859 秒）。

[GUI 竖屏设置](experiments/engine-gui/gui-settings.png)、[GUI 横屏设置](experiments/engine-gui/gui-landscape.png)、[保存后重开](experiments/engine-gui/gui-saved-reopened.png) 已人工查看。先前的初始化错误、旧画布旋转失败及系统应用卡片过渡期间的点击失败均保留；本次在用户确认可验收后，以修正坐标换算的测试运行器完成，不把失败录像当作通过证据。

重现入口（先安装冻结 IPA，保持手机解锁、应用前台）：

```sh
DEVICE=<CoreDevice-ID> ARTIFACT=artifacts/m24-g07/gui-comparison/candidate5/ShaderLab.ipa DEVICE_LABEL=iphone-candidate5 node mobile/test/gui-comparison.mjs
```

物理触摸使用 `mobile/test/ios/GuiExperimentSmoke.swift` 的独立 XCTest target。它通过 `--shaderlab-gui-ui-check` 读取绘制坐标并真实点击；测试信息不会在性能采样中启用。教程、导入导出、媒体设置、完整输入法与无障碍能力、50 次完整页面释放不在本轮 GUI 迁移完成声明中。

## 原生共享页面的既有验收

最新进展见 [Apple 波动定位与验收](optimization/apple-jitter/README.md)：iPhone 已安装候选 15，增量节点/焦点更新与单行排版优化后，普通操作中位数约降低 10%，p95 中位数约降低 7.6%；同包 p95 新/旧比为 1.018，但轮间波动仍超门槛。页面释放、GPU/保存和完整系统交互通过。iPad 保持候选 10 的历史通过，Web 性能仍待复测。

此前 Apple 复验历史见 [新包内存与 UI 报告](optimization/apple-final/README.md)；旧候选的性能失败保留。当前 G07 仍在验收，不将 iPad 通过推广到其他设备。

日期：2026-10-17。状态：**validating**。共享页面已实现；本目录区分功能通过、设备 UI、生命周期与性能证据，不表示 M24 或整个 ShaderLab 完成。

## 实现

- `shared/views/editor-controller.ts`：统一输入草稿、保存/取消/失败提示、设置及播放操作；复用 G02 application 的保存顺序与过期结果保护。
- `shared/views/editor-page.ts`：同一工程信息、设置窗口、工具栏和特殊视图片段，Web/Native 消费相同模块，没有复制页面定义。
- `web/src/platform/shared-editor.ts`、`mobile/src/platform/shared-editor.ts`：只装配 WebComponent / NativeScript 和 CodeMirror / TextView / GPU Canvas。
- 名称未失焦时保存会先提交草稿；组合输入未确认时禁止静默保存旧值；新修改清除旧的“已保存”提示。编译错误保留原页面与上次预览。保存状态只由共享页面呈现；无障碍名称同步当前状态，不固定成“保存状态”。
- 手机窄屏的保存提示独占一行，常用分辨率放在工具栏前部；设置标签和选项同行，避免横屏时完成按钮落到屏幕外。
- 保留明确的 legacy 回退开关，直到设备与性能门禁满足。旧路径只作为对照和回退运行。

## 验证入口

从 ShaderLab 根目录执行：

```sh
npm ci --ignore-scripts --legacy-peer-deps
npm test
npm run typecheck
npm run check:boundaries
npm run build
npm run test:shared-ui:browser
npm run test:shared-ui:performance
npm run test:shared-ui:fresh
# 可使用全新目录输出冻结本轮浏览器验收，避免其他任务重建 app-dist 的干扰
SHADERLAB_TEST_BUILD=artifacts/m24-g07/fresh/web-candidate npm run test:shared-ui:browser
SHADERLAB_TEST_BUILD=artifacts/m24-g07/fresh/web-candidate npm run test:shared-ui:performance
SHADERLAB_TEST_BUILD=artifacts/m24-g07/fresh/web-candidate node test/shared-ui/profile.mjs
SHADERLAB_TEST_UI=legacy node web/test/browser-smoke.mjs
```

产物在 `artifacts/m24-g07`。新目录构建执行锁定安装、类型/边界检查、Web assembly、iOS 和 Android JS bundle；不把它称为全新 SDK archive。实际 APK / IPA 另由平台 SDK 构建和安装。

移动端 `mobile/test/ios/SharedPageSmoke.swift` 用独立 XCTest target 对已安装包测试；`mobile/test/android/shared-page.mjs` 使用 ADB，参数为 `ADB` 与 `ANDROID_SERIAL`，并在 finally 恢复测试前旋转设置。核心回放使用 G01 fixture，隔离在 `ShaderLab-G07` 存储目录，不改普通草稿。iOS 传 `--shaderlab-ui-check`；Android 传 boolean extra `shaderlab-ui-check=true`。读取 `Documents/shaderlab-g07.json` / `files/shaderlab-g07.json` 时同时核对运行时间、runId 和安装包身份。

## 优化候选与剩余条件

本轮性能优化及最新验收以 [optimization/README.md](optimization/README.md) 和 [verification.json](verification.json) 为准。Android 最新候选使用 Native 私有 `.5` / UI 私有 `.3`，见 [安卓最终验收](optimization/android-final/README.md)；其他平台仍以各自二进制身份为准。Web 性能按用户安排待复测，设备报告区分精确安装包、完成的检查与尚未验收项。

## 初版 `.0` 历史结果

[results](results/) 保存初版 `.0` 的去除本机签名和设备连接标识后的摘要、包身份、页面截图与同机对照。原始 SDK、设备日志和 XCTest 视频保留在本地 artifacts，不作为公开发布附件。

| 初版 `.0` 结果（历史） | 范围 |
| --- | --- |
| 通过 | 253 项既有/新增自动化；最终共享 UI 5 项重新通过；类型、边界和全新目录构建 |
| Web 通过 | 冻结候选的真实 GPU、比例/播放/弹窗、Unicode 保存重开、50 次路由暂停恢复；旧入口完整编辑回归另有报告 |
| Android 通过 | 最新包 GPU/存储回放，以及原生选择器、键盘收起、旋转、后台恢复、保存重开；测试后恢复原旋转设置 |
| iPad 通过 | 最新包 GPU/存储回放和完整 XCTest；实际点击软键盘按键修改内容，再验证持久化相等 |
| iPhone 通过 | 重新连接后安装已校验的同一最新包，GPU/存储回放与完整 XCTest 通过；键盘、旋转、后台恢复、保存重开正常 |
| 性能未通过 | 初版共享 handler p95 中位数约 1.095 ms，旧入口约 0.405 ms，比例 2.70，超过 1.10 预算；编译后呈现噪声超预算，rAF 节奏相同 |

iPad 重试暴露并修复了状态栏的旧“未保存”提示及静态无障碍名称。代码框显示键盘后，XCTest `typeText` 仍无法识别其焦点；最终测试点击可见软键盘空格键，并严格断言内容改变且重开后一致。iPhone 的空格键以 `space` 标识而非 iPad 的空白标签暴露，脚本已兼容两者；iPhone 最终 XCTest 通过。四端持久化文件仅归一化 `updatedAt` 后完全一致。这些通过结果不代表物理中文 IME 或 VoiceOver 已验收。

[CPU 采样摘要](results/cpu-profile.json) 使用同一冻结包单独采样，未混入 p95 测量；原始 `.cpuprofile` 在本地 `artifacts/m24-g07/profile/`。这些初版数据触发了本轮共享事件、属性更新与组件渲染优化。后续数据见 optimization；初版回退记录保留，不用新数据覆盖。稳定 rAF 不能证明 GPU 时间无回退。

四端业务文件比较仅归一化 `updatedAt`，其余字段必须一致。GPU 回放检查实际 target 尺寸与像素读回，分别记录原生尺寸/像素预算，不能把 Web 与 Native 不同 GPU 后端的 target 上限当成 UI 性能收益。

性能按 G01 的 1.10 预算判断。报告同时给出 handler、编译后呈现、rAF 的绝对时间和轮次波动；rAF 是帧节奏，不能代替 GPU timestamp。噪声超预算为 inconclusive，测得回退保留为待优化，不改门槛。移动端同机新旧 UI/GPU 性能、完整 50 次宿主退出资源检查、Safari、物理中文 IME 与辅助功能等尚无完整证据时继续 pending，由 G07/G10 验收收敛。

G06 保持原 validating 状态。本次按用户明确要求开始 G07，不把 G06 的未完成专项视为通过。未发布、推送或修改生产版本。
