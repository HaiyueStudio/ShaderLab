# G07 ShaderLab shared editor views

日期：2026-10-17。状态：implemented, validating。

## 决策

预览工具栏、播放控制、分辨率、工程名称、工程设置与保存提示由同一 `shared/views` 模块生成。`ShaderEditorController` 实现 UI store，订阅 G02 的唯一 `ShaderApplication`；页面只有名称输入草稿、输入法组合态、弹窗开关和操作提示，工程、保存、编译与 revision 仍由 application 持有。

使用四个稳定的页面片段（project、toolbar、preview、editor），按节点 selector 更新。关闭的设置窗口不跟随工具栏反复更新隐藏内容；打开时读取最新工程。Web 的迁移部分停止同步旧控件，不因编译完成而重建未变化的通道/页签。不同片段不拥有第二个 application。

Web 使用 `@haiyue/ui/adapters/web`；移动端使用 `@haiyue/native/ui`。两者装配同一个 `mountShaderEditorPart`。CodeMirror、TextView 和 Canvas 通过 PlatformView 放入稳定容器，生命周期由原宿主销毁，普通值变化或工程打开不新建编辑器/GPU surface。平台端口只实现初始化、读取编辑缓冲、播放音频和呈现编译诊断；保存/取消/失败、预览设置和过期异步结果的业务规则共享。

`shared/tsconfig.json` 继续独立构建 domain/application/ports，不依赖 UI；`shared/tsconfig.views.json` 单独构建共享页面。移动端先构建这两层，再从本仓源码消费已有 shader 编译帮助模块，不需要 Web 页面构建结果。边界检查只允许 shared/views 导入 UI 的公开 core/portable 子路径。

## 候选与回退

初版使用已审计 G05/G06 的仓内 tarball：UI `0.2.0-m24.0`、Native `0.1.4-m24.0`。2026-10-17 性能优化候选更新为 UI `0.2.0-m24.3`、Native `0.1.4-m24.3`；Native 运行代码与 `.0` 一致，只修改私有版本及 UI peer。它们是私有预览依赖，不表示公开 npm 版本支持该 API。构建不读取相邻 UI/Native 仓库源码；精确身份、来源检查与新目录消费记录在 [优化证据](../../../review/m24-ui/g07/optimization/README.md) 中。

默认启用共享页面。Web `?ui=legacy`、iOS 启动参数 `--shaderlab-ui=legacy`、Android Intent 字符串 `shaderlab-ui=legacy` 保留旧呈现，以便回退和同机测量。迁移切片的旧事件处理只在 legacy 模式绑定，两条入口共用 application，未迁移的 Gallery、教程、通道和代码编辑工具继续保留。G10 达标后再删除旧呈现。

## 验证边界

无界面测试验证保存与异步语义；真实浏览器验证控件与 GPU；Native 开发启动参数 `--shaderlab-ui-check` / Intent boolean `shaderlab-ui-check=true` 回放同一 G01 fixture，写入独立 `ShaderLab-G07` 目录和带运行身份的 `shaderlab-g07.json`。这条回放不代表物理触摸或输入法验收。系统 UI 测试另外验证键盘、旋转、恢复和保存重开。

页面复用、页面销毁和宿主 GPU 资源销毁是三种不同证据。Web 的 50 次 Gallery/editor 切换只证明挂起/恢复计数不增长；单元测试的 50 次销毁只证明共享订阅和协议生命周期。移动端完整进入/退出的资源、真实 IME/读屏和性能预算仍需独立证据，不从这些测试推断通过。

## 2026-10-17 交互性能优化

页面 binding 只对依赖改变的片段生成新 props；预览比例的固定选项与布局复用经过校验的不可变快照。UI 内核记录自己生成的快照来源，减少重复复制与校验，同时继续逐次检查目标后端的能力。外部浅冻结对象不视为可信快照；外部 render/setProps 与失败事务会使 binding 缓存失效。

只更新属性时跳过结构排序；叶子更新只同步受影响的辅助关系。Select 值改变时保留已有选项节点，焦点未丢失时不读取布局来恢复焦点。标签、错误关联、禁用状态和选区仍有针对性测试。公开导出保持不变。

ShaderLab 的比例操作只提交一次编辑缓冲；Web 宿主不再因为比例或编译状态变化而写入无关语言、音量、时长控件。新旧入口仍共用同一业务状态与编译器。

增加真实 Web 宿主和原生页面 50 次创建/销毁验证，以及移动端同机三轮、每轮 100 次语义比例操作。移动端性能使用固定测试画布并记录实际尺寸，排除系统选项弹层动画；不能将其当作全尺寸 GPU 压力测试。帧回调节奏不等于 GPU timestamp，控件/引擎释放计数也不等于原生 GPU 堆审计。任何轮次波动超过 10% 仍记为 inconclusive；Web 性能按用户要求保留待复测。

## 安卓恢复验收与资源释放

用户恢复安卓验收后，50 次完整宿主生命周期暴露系统低内存终止。普通预览不再提前创建源码转换 WebView；首次导出或 HLSL 转换才加载，销毁时从容器移除以触发原生释放，同时取消等待加载和原生求值的 Promise。GPU 宿主先于共享 PlatformView 关闭；最终纹理/缓冲区销毁不再依赖随后会被关闭的设备队列回调，并清理非当前场景。

ShaderLab 的构建兼容补丁另外将 Canvas 2.1.18 的错误处理器绑定到既有弱 observable，而不是整个 GPUDevice。原文件 SHA-256 校验和 Android/iOS 转发契约测试保持必需；此补丁不意味着修改或发布 Native 包。

这些修改的单元检查、安卓按钮/键盘/旋转/保存流程、实际延迟加载转换器与 GPU/文件回放通过，但**资源循环仍未通过**，新的性能样本也为 inconclusive。详情与精确安装包见 [安卓恢复验收](../../../review/m24-ui/g07/optimization/android-resumed/README.md)。尚不能断言完整内存累积的根因已确定，不能仅凭 UI 计数归零宣称无泄漏。Apple 设备须对本轮共享源码和绑定变化重新构建验收，早期 IPA 的通过结果只保留为历史。
