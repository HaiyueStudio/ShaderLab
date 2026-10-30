# ShaderLab 的五种语言

Web 和 Native 编辑器、练习场、首选语言设置支持 WGSL、GLSL、HLSL、TypeScript 和 Slang。语言菜单转换当前编辑版本，不会用旧草稿或模板覆盖代码。转换预览、取消、检查点、撤销与重做、保存、历史恢复和 `.hyshader` 导入导出都保留五种语言的独立源码。

Image / Buffer A–D 使用 `mainImage`，Sound 使用 `mainSound`。各语言最终编译为 WGSL，沿用原有 Haiyue WebGPU 渲染、内置变量、参数和四个通道。

## TypeScript

这是 ShaderLab 的静态 GPU 数值子集。编译器使用 TypeScript AST 解析，然后生成 WGSL 并通过 Naga 类型验证；不执行用户的 JavaScript。不是任意网页 / Node.js 程序，也不是 TypeGPU 文件导入器。

```typescript
export function mainImage(fragCoord: vec2f): vec4f {
  const uv = gpu.div(fragCoord, iResolution.xy);
  const pulse = 0.5 + 0.5 * Math.sin(iTime);
  return vec4f(uv, pulse, 1.0);
}
```

标量使用 `number` / `boolean`，或明确的 `f32` / `i32` / `u32`；向量使用 `vec2f` / `vec3f` / `vec4f`，也支持整数向量、矩阵和 `array<T, N>` 固定长度数组。函数参数需要类型，辅助函数的返回值需要明确类型；入口默认返回 `vec4f` / `vec2f`。

标量可用普通运算符。向量、矩阵运算使用 `gpu.add`、`gpu.sub`、`gpu.mul`、`gpu.div`、`gpu.mod` 和 `gpu.neg`；这些调用对应 WGSL 运算，不会转成 JavaScript 数组运算。`gpu.eq / ne / lt / le / gt / ge` 支持比较。通用数值函数沿用 WGSL 名称，例如 `mix`、`smoothstep`、`dot`、`normalize`、`select`。支持常用 `Math.sin / cos / pow / sqrt / floor / abs` 等确定性数学函数。

`channel0(uv)` 至 `channel3(uv)` 与其他语言使用同样的通道和左下角 UV 约定；Cubemap 接受 `vec3f` 方向。

```typescript
interface Tint { color: vec3f; }

export function mainImage(p: vec2f): vec4f {
  const values = gpu.array<number, 3>(0.012, 0.2, 0.3);
  let sum: number = 0.0;
  for (let i: i32 = 0; i < 3; i++) {
    sum += values[i];
  }
  const tint = gpu.construct<Tint>(vec3f(sum));
  return vec4f(tint.color, 1.0);
}
```

支持函数、类型别名、字段型 interface、可变变量、固定数组、if / else、for / while / do、break / continue、无 case 穿透的 switch，以及函数内指针。结构体用 `gpu.construct<T>`，固定数组用 `gpu.array<T, N>`；生成源码中的 `gpu.addressOf / load / store` 表示 WGSL 函数内指针。

不支持 import、async、生成器、异常、类、动态对象或宿主 API。条件值用 if / else 或显式 `select`，不会把有副作用的 JavaScript 三元表达式改成提前求值。反向转换不支持 continuing 读取循环体局部变量的特殊 WGSL loop，会提示先改写为 for，并保留原代码。

浮点数保留源字面量，例如 `0.012`、`0.0`；避免改变推断类型或产生长小数。十六进制浮点数转换为等值十进制。反向转换输出可编辑的 TypeScript 函数和运算表达式，不把 WGSL 藏在字符串中；输出会重新编译验证后才提交。若复合赋值的数组索引含函数调用，需先将索引存入局部变量，防止重复求值改变行为。

## Slang

使用随包的 Slang 2026.19 官方编译器，与 HLSL 使用同一份固定资源绑定和 GPU 入口。支持该版本可编译到 WGSL 的 Slang 数值语法及泛型专门化。

```slang
T identity<T>(T value) { return value; }

float4 mainImage(float2 fragCoord) {
  float2 uv = fragCoord / iResolution.xy;
  return identity<float4>(float4(uv, 0.012, 1.0));
}
```

WGSL / GLSL / HLSL → Slang 生成可编辑的 HLSL 兼容语法。Slang → HLSL 先编译和专门化，再从 WGSL 生成 HLSL；不会将 Slang 泛型仅改名为 HLSL。Slang 源码独立保存，不会被编译结果覆盖。

Sound 示例：`float2 mainSound(int sampleIndex, float time) { return float2(0.2 * sin(time * 440.0 * 6.2831853)); }`。

自定义资源绑定、外部 include / import 文件、Unity / Unreal 完整管线入口没有接入宿主；使用内置变量、iParams 和 iChannel0–3。详细资源约定见 [HLSL 支持](hlsl-support.md)。

## Common 和转换边界

TypeScript Common 是无需入口的数值函数 / interface 库，可与 WGSL、GLSL、HLSL / Slang Pass 链接；运行和转换时重新派生当前 Common，不使用旧缓存。WGSL / GLSL Common 可以转换为 TypeScript 或 Slang。Slang Common 与 HLSL Common 一样，搭配 HLSL / Slang Pass，转 Pass 时可将公共定义一起带入结果。

延续原有 Common 边界：不单独反向转换 HLSL / Slang Common，也不单独执行 WGSL Common → GLSL；泛型库不能在缺少调用点和具体类型时完整展开。转换失败或遇到没有等价表达的语法时提示原因，保留原代码、语言和版本。

## 构建和验证

TypeScript 解析器只在转换服务首次使用时加载。Web 资源和移动端隔离编译页面包含 TypeScript 解析器和许可证，移动端渲染仍由原生 WebGPU 完成；运行时无需下载编译器、上传源码或开放应用文件接口。Slang 编译器与 WASM 复用已有离线资源。新增的 TypeScript 解析器懒加载块约 4.4 MiB，Web 总资源约 41.2 MB，因此原始包预算从 39 MB 调整为 43 MB；压缩包预算仍为 20 MB。

`web/test/extended-languages.test.mjs` 覆盖五种语言 20 个转换方向、最新编辑、Slang 泛型、TypeScript Common / Sound / 数组 / 矩阵、8 个内置示例、失败保护及撤销重做。浏览器和移动编译页另验证本地打包后的真实编译器与 GPU 输出。

官方背景：[Slang 语言与编译器](https://docs.shader-slang.org/en/latest/external/slang/docs/user-guide/00-introduction.html)。
