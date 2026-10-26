export const shaderReference = [
  ['iResolution','vec3f · 像素宽、高、像素比例'],
  ['iTime / iTimeDelta','f32 · 时间 / 帧间隔（秒）'],
  ['iFrame / iFrameRate','i32 / f32 · 帧编号 / 帧率'],
  ['iMouse','vec4f · xy 拖动位置，zw 点击位置；松开后 zw 为负'],
  ['iDate','vec4f · 年、月、日、当日秒数'],
  ['iChannelResolution','array<vec3f, 4> · 通道尺寸'],
  ['iParams','array<vec4f, 8> · 自定义参数 / Custom parameters'],
  ['iChannelTime','array<f32, 4> · 通道时间'],
  ['channel0–3(coords)','二维纹理使用 vec2f UV（左下角原点），Cubemap 使用 vec3f 方向'],
  ['iChannel0–3 / iSampler','WGSL 纹理与采样器（二维 UV 或立方体方向）'],
  ['iSampleRate','44100 Hz · Sound 音频采样率'],
] as const;
