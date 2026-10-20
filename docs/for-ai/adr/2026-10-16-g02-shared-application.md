# G02：ShaderLab 共享应用层与异步提交契约

日期：2026-10-16。状态：accepted。范围：ShaderLab 内部业务契约 `shaderlab-application/2`；不修改 `haiyue-portable-ui/1`、Engine、Native 或 UI 包的公开 API。由 M24 串行集成 owner 接线和验收。

## 决策

同仓 `shared/domain` 保存 `.hyshader` v1 的类型、校验、解析、语言选择和预览比例；`shared/application` 的 `ShaderApplication` 是每个编辑会话唯一的工程、revision/savedRevision、当前 pass、预览播放、pane、切片 route、保存和编译状态来源。`shared/ports` 描述环境、工程存储和预览服务。它们单独用 ES2022、`types: []`、无 DOM 的 TypeScript 配置构建到 `shared/dist`，不建新 npm 包，不依赖 UI/Native/Engine。

时间和唯一 ID 由调用者注入；共享代码不使用 crypto、Date 当前时间、structuredClone、TextEncoder 或任何宿主对象。旧文件可缺少的 Common/Sound 字段仍按原规则补齐，工程版本不变。typing 使用结构共享，只替换代码及元数据，不序列化/复制图片与视频。完整校验、保存和编译使用独立快照。

Web `ShaderDocument` 与移动 `MobileSession` 只是兼容门面。保留 Web 原有 EditorPlatform、CodeMirror、Gallery、教程路由和移动 NativeScript 页面；它们委托应用层执行修改、选择、保存与编译。Gallery 的缩略图/IndexedDB、文件选择器、原生恢复草稿/文件写入、GPU 资源属于平台端口。Web 教程路径仍由 shell 管理，映射到共享切片的 gallery/editor；G02 不迁移全部页面。

## G01 到 G02 的契约细化与消费方影响

G01 的历史文件 `review/m24-ui/g01/application-contract.d.ts` 和冻结记录原样保留。G02 接受以下应用契约 v2 差异：

- `preview.commit` 从 `Promise<void>` 收敛为同步 `undefined` 返回。现有 EditorPlatform 的事务 commit 必须同步，否则无法同时完成 revision 检查和资源发布。异步工作全部在 prepare；共享应用另外提供 `prepareCompilation()` 返回同步 `commit/release` 令牌，常规页面调用 `compile()`。Web 自动化使用相同令牌完成提交/回滚。端口必须在当前调用栈检查取消并替换资源，不能异步排队后无条件发布。
- `ShaderRequest` 增加快照时的 `activePass`，防止排队草稿保存了后续选择的页签。
- 补充现有行为实际需要的 pass.add/enable、channel.set、route.select、project.pick、draft.request；`pick(fork)` 允许 Web 保留“导入副本”的行为。
- `projects`、`preview` 可在宿主就绪后分别 connect；未接通的服务操作明确报错，不伪造成功。Web 没有自动恢复草稿功能，其草稿端口为空实现，页面不调用此动作。

消费方：Web document/workspace/main、MobileSession/pages/gpu-runtime，以及 G02 无界面/资源测试已接入。G03 的 UI 核心没有应用依赖；G07/G08 后续产品页面应导入 shared 的现行类型。G01 probe 仅为历史基线，不将其提案类型当作新的运行实现。所有仓库包版本保持不变。

## 时序与所有权

每次打开工程创建新 session；每次修改增加 revision；每个异步请求带递增 request 和取消信号。打开、修改、重新编译、dispose 会使相关旧编译失效；旧准备结果到达时释放且不发布诊断。准备完成的令牌在取消或回滚时也立即释放，释放幂等。成功提交后 GPU 对象所有权归 renderer，应用状态仅保存 opaque handle/诊断，旧预览由 renderer 替换时释放。失败保留上次可用画面。

保存和草稿共用有序队列。每次请求先捕获工程、session、revision、activePass。编辑不会取消已请求的保存；保存成功只标记当时的 revision，因此中途编辑仍 dirty。打开新工程、dispose 后的旧结果不更新当前状态，尚未启动的旧写入取消。已进入底层写入的快照可完成在原工程 ID 下，但不能标记新工程已保存。失败不阻塞后续重试。文件选择期间发生编辑/切换/销毁时，晚到的文件不替换当前工程；取消不修改状态。

Web 缩略图仅在当前 session、revision 与已编译图一致时捕获，否则保留该作品已有缩略图；不会把后续修改的画面贴到旧保存快照上。Web 文件选择后的解析和移动文件选择/读取走同一应用请求检查。系统文件弹窗是否能主动关闭仍属于平台能力，不能中止的 IO 通过丢弃过期结果处理。

`subscribe/select` 返回解绑函数；dispose 幂等，阻止后续通知和修改。selectors 提供 dirty、source、language、tabs、compiled；对象/数组 selector 可传自定义相等比较。旧 UI 的整页同步留给 G07 优化，G02 不声称已完成组件级更新或性能门禁。

## 构建与后续边界

Web 的 model/sourceLanguage/builtinTextures 旧入口转导出 shared，默认创建工程的宿主时间/ID 留在 Web/mobile adapter。移动构建先生成 shared，不再执行 Web tsconfig；编译器、shader 包装、声音和教程这些尚未迁移的纯产品帮助模块直接从同仓 `web/src` 的显式允许列表取源，由移动 bundler 编译。生产 mobile 源禁止导入 `web/dist`、Web UI/main/runtime/storage；共享源禁止导入平台或包。它们仍是同仓源码复用，不声称完全不需要 web 源目录。

G02 的干净目录验证只复制 shared、根 TypeScript 配置和 MobileSession，不复制 Web 或 node_modules，用锁定的本机 TypeScript/esbuild 工具编译并运行；证明业务层独立，不等同于 G10 的全新依赖安装/发布包验收。

验收证据见 [G02](../../../review/m24-ui/g02/README.md)。新组件、实际 iPhone/iPad/Android 的输入、旋转/后台、Safari 和新旧 UI 性能比较交 G07；此批构建不继承早期 IPA 的真机通过记录。
