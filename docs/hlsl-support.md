# HLSL → WGSL 语言支持

编辑器的语言菜单提供 WGSL、GLSL、HLSL。Web 和移动端共用 HLSL 源码模型及编译规则；选择 HLSL 后点击运行，使用随包的 Slang 2026.19 WebAssembly 编译器生成 WGSL，再交给 Haiyue WebGPU 渲染。

## 编写与运行

Image 与 Buffer A–D 使用返回 RGBA 的函数：

```hlsl
float4 mainImage(float2 fragCoord) {
    float2 uv = fragCoord / iResolution.xy;
    return float4(uv, 0.5 + 0.5 * sin(iTime), 1.0);
}
```

像素坐标原点在左下角。通道菜单与其他语言相同，可使用图片、Cubemap、Buffer、键盘、视频和相机。二维纹理的便捷采样函数使用左下角 UV：

```hlsl
float4 mainImage(float2 fragCoord) {
    return channel0(fragCoord / iResolution.xy);
}
```

`channel0`–`channel3` 对 Cubemap 接受 `float3` 方向。也可直接使用 `iChannel0.SampleLevel(iSampler, uv, 0.0)`；原生 Texture2D 采样遵循 WebGPU 的左上角纹理原点，与便捷函数的 UV 约定不同。Cubemap 与二维类型由当前通道选择决定，改变通道后重新运行。

内置量包括 `float3 iResolution`、`float iTime / iTimeDelta / iFrameRate / iSampleRate`、`int iFrame`、`float4 iMouse / iDate`、`float3 iChannelResolution[4]`、`float iChannelTime[4]`。不必自行声明这些名称、iChannel0–3 或 iSampler。

Common 可编写 HLSL 函数、结构体、宏和常量，无需入口。非空 HLSL Common 必须搭配 HLSL Pass，HLSL Pass 也需要非空 Common 使用 HLSL；不兼容组合会显示诊断。Common 为空时，一个工程可以同时使用不同语言的 Pass，通过 Buffer 纹理交换结果。

Sound 使用以下入口，返回左右声道的 −1 到 1 波形，可使用 HLSL Common 和静态纹理：

```hlsl
float2 mainSound(int sampleIndex, float time) {
    return float2(0.2 * sin(6.2831853 * 440.0 * time));
}
```

## 源码与诊断

切换语言分别保留 WGSL、GLSL、HLSL 草稿，包括尚未编译成功的源码。工程保存、恢复和 `.hyshader` 导入导出保留 `hlsl`、`commonHlsl` 和 `editorLanguages`。运行用 WGSL 只写入编译快照，不覆盖编辑草稿。Web 的 `shader.source.set` API 接受 `language: "hlsl"`。

Slang 负责解析、类型检查和语法降低，支持其 HLSL 兼容语法，包括向量、矩阵与 `mul`、结构体、循环、函数和预处理。编译器诊断通过虚拟源码文件映射回 Pass / Common 的原始行列；语法错误保留上次成功的 GPU 图。Web 的“查看 WGSL”及移动端“生成代码”可查看、复制完整运行模块；Common 的生成结果包含在使用它的 Pass 中。

当前入口仅覆盖片元着色的 mainImage 和音频合成的 mainSound，不接受任意 Unity / Unreal 管线入口。自定义 uniform、资源组、纹理和存储缓冲区未接入宿主，编译时会拒绝；应使用内置变量和通道。外部 include 文件没有提供文件加载接口。HLSL 工程暂不支持导出 Shadertoy GLSL，导出界面会提示使用工程文件或运行用 WGSL，避免输出旧草稿。

## 离线与构建

官方发布包及 SHA-256 来源记录在 `vendor/slang-2026.19/provenance.json`，保留上游许可证与第三方声明。原始 WASM 大小为 24,518,850 字节，因此应用资源预算包含这部分新增编译资源。

Web 在首次使用 HLSL 时加载本地编译器与 WASM；PWA / Electron 包含离线资源。移动端按需加载隔离的本地编译页面，WASM 以 data URL 嵌入独立的懒加载脚本，避免 file 页面跨文件读取限制；通过现有编译桥返回 WGSL；页面不获得应用文件或 GPU 句柄，渲染仍由原生 WebGPU 完成。每次编译创建独立会话并释放，重复编译共享已初始化的编译器。运行时不下载编译器，也不上传着色器源码。

开发验证：`node --test web/test/hlsl.test.mjs`（先构建类型）、`node web/test/hlsl-browser.mjs`、`node mobile/test/gpu-browser.mjs`。移动 GPU 测试使用随包的同一 Slang 编译页面，再将结果交给移动端渲染器。

## 官方依据

- [Slang 2026.19 官方发布包](https://github.com/shader-slang/slang/releases/tag/v2026.19)
- [Slang 与 HLSL 的兼容定位](https://docs.shader-slang.org/en/latest/external/slang/docs/user-guide/00-introduction.html)
- [WGSL 目标、显式绑定及限制](https://docs.shader-slang.org/en/stable/external/slang/docs/user-guide/a2-03-wgsl-target-specific.html)
- [官方浏览器 Playground](https://shader-slang.org/slang-playground/)
