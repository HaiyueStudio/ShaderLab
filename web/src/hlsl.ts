import {FRAME_BYTES} from '../../shared/dist/domain/parameters.js';
import { compactWgslFloatLiterals } from './shaderFloatLiterals.js';
import type { MainModule, GlobalSession } from '../../vendor/slang-2026.19/slang-wasm.js';
import { LIMITS } from './model.js';
import { cubemapRequirements } from './channelBindings.js';
import type { HlslTranslator, HlslTranslationOptions, HlslTranslationResult } from './hlslTypes.js';
export type { HlslTranslator, HlslTranslationOptions, HlslTranslationResult } from './hlslTypes.js';

export const HLSL_MODULE = '// @haiyue-hlsl-module';
const failure = (message: string): HlslTranslationResult => ({ code: null, diagnostics: [{ line: 1, column: 1, message }], warnings: [] });
function header(options: HlslTranslationOptions) {
  return `struct HyUniforms {
  float4 resolutionTime; float4 timing; float4 mouse; float4 date;
  float4 channelResolution[4]; float4 channelTime; float4 params[8];
};
[[vk::binding(0, 0)]] ConstantBuffer<HyUniforms> hy_uniforms;
[[vk::binding(0, 2)]] SamplerState iSampler;
${Array.from({ length: 4 }, (_, i) => `[[vk::binding(${i + 1}, 2)]] Texture${options.channelTypes?.[i] === 'cube' ? 'Cube' : '2D'}<float4> iChannel${i};`).join('\n')}
static float3 iResolution; static float iTime; static float iTimeDelta;
static int iFrame; static float iFrameRate; static float4 iMouse; static float4 iDate;
static float4 iParams[8];
static float iSampleRate; static float3 iChannelResolution[4]; static float iChannelTime[4];
${Array.from({ length: 4 }, (_, i) => options.channelTypes?.[i] === 'cube'
    ? `float4 channel${i}(float3 direction) { return iChannel${i}.SampleLevel(iSampler, direction, 0.0); }`
    : `float4 channel${i}(float2 uv) { return iChannel${i}.SampleLevel(iSampler, float2(uv.x, 1.0 - uv.y), 0.0); }`).join('\n')}
`;
}
function entry(sound: boolean) {
  return `\n#line 1 "shaderlab-entry.slang"
[shader("fragment")]
float4 hy_fragment(float4 position : SV_Position) : SV_Target {
  iResolution = hy_uniforms.resolutionTime.xyz;
  iTime = hy_uniforms.resolutionTime.w;
  iTimeDelta = hy_uniforms.timing.x; iFrame = int(hy_uniforms.timing.y);
  iFrameRate = hy_uniforms.timing.z; iSampleRate = hy_uniforms.timing.w;
  iMouse = hy_uniforms.mouse; iDate = hy_uniforms.date;
  for (int i = 0; i < 4; i++) {
    iChannelResolution[i] = hy_uniforms.channelResolution[i].xyz;
    iChannelTime[i] = hy_uniforms.channelTime[i];
  }
  for (int hy_param = 0; hy_param < 8; hy_param++) { iParams[hy_param] = hy_uniforms.params[hy_param]; }
  ${sound ? `uint base = asuint(hy_uniforms.timing.x);
  uint index = base + uint(position.y) * 1024u + uint(position.x);
  iSampleRate = 44100.0; iResolution = float3(1024.0, 64.0, 1.0);
  iTime = hy_uniforms.timing.y + (index < base ? 4294967296.0 / iSampleRate : 0.0) + float(index) / iSampleRate;
  iTimeDelta = 1.0 / iSampleRate; iFrameRate = iSampleRate; iFrame = 0;
  return float4(mainSound(int(index), iTime), 0.0, 1.0);` : 'return mainImage(float2(position.x, iResolution.y - position.y));'}
}
`;
}
function diagnostics(message: string): HlslTranslationResult['diagnostics'] {
  const results: HlslTranslationResult['diagnostics'] = [];
  for (const match of message.matchAll(/error(?:\[[^\]]+\])?:\s*([^\n]+)\n\s*-->\s*([^:\n]+):(\d+):(\d+)/g)) {
    const name = match[2]!.trim(), authored = name === 'common.hlsl' || name === 'pass.hlsl';
    results.push({ line: authored ? Number(match[3]) : 1, column: authored ? Number(match[4]) : 1, source: name === 'common.hlsl' ? 'common' : 'pass', message: match[1]!.trim() });
  }
  // #line filenames preserve both Common and original pass locations.
  for (const match of message.matchAll(/([^\s():]+)\((\d+)(?:,\s*(\d+))?\):\s*(?:fatal\s+)?error[^:]*:\s*([^\n]*)/g)) {
    const name = match[1]!, authored = name === 'common.hlsl' || name === 'pass.hlsl';
    results.push({ line: authored ? Number(match[2]) : 1, column: Number(match[3] ?? 1), source: name === 'common.hlsl' ? 'common' : 'pass', message: match[4]!.trim() });
  }
  return results.length ? results : [{ line: 1, column: 1, message }];
}

/** Slang parses, type-checks and lowers HLSL; product code only supplies the
 * entry point and fixed rendering ABI. Each compile owns a disposable session. */
export function createHlslTranslator(load: () => Promise<MainModule>): HlslTranslator {
  let compiler: Promise<{ module: MainModule; global: GlobalSession; target: number }> | undefined;
  return async (source, options = {}) => {
    if (source.length > LIMITS.code || (options.common?.length ?? 0) > LIMITS.code) return failure('HLSL 代码不能超过 100 KB。');
    const commonOnly = options.entryPoint === 'common';
    const common = commonOnly ? source : options.common ?? '';
    const pass = commonOnly ? 'float4 mainImage(float2 p) { return float4(0.0); }' : source;
    const wrapped = header(options) + '\n#line 1 "common.hlsl"\n' + common + '\n#line 1 "pass.hlsl"\n' + pass + entry(options.entryPoint === 'sound');
    try {
      compiler ??= load().then(module => {
        const global = module.createGlobalSession();
        const target = module.getCompileTargets().find((t: { name: string; value: number }) => t.name.toLowerCase() === 'wgsl');
        if (!global || !target) throw Error('HLSL 编译器未提供 WGSL 目标。');
        return { module, global, target: target.value };
      }).catch(error => { compiler = undefined; throw error; });
      const { module, global, target } = await compiler;
      const session = global.createSession(target);
      if (!session) return failure('无法创建 HLSL 编译会话。');
      try {
        const error = () => ({ code: null, diagnostics: diagnostics(String(module.getLastError().message)), warnings: [] });
        const program = session.loadModuleFromSource(wrapped, 'shaderlab', 'shaderlab.slang');
        if (!program) return error();
        const point = program.findEntryPointByName('hy_fragment');
        if (!point) return error();
        const composite = session.createCompositeComponentType([program, point]);
        if (!composite) return error();
        const linked = composite.link();
        if (!linked) return error();
        const generated = linked.getEntryPointCode(0, 0);
        const code = generated ? compactWgslFloatLiterals(generated) : generated;
        if (!code) return error();
        // Reject additional user resources instead of allowing Slang's automatic
        // register allocation to collide with the host's fixed bindings.
        const layout = linked.getLayout(0)?.toJsonObject();
        const allowed = new Set(['hy_uniforms', 'iSampler', 'iChannel0', 'iChannel1', 'iChannel2', 'iChannel3']);
        if (layout?.parameters?.some((p: { name: string }) => !allowed.has(p.name))) return failure('HLSL 使用内置 iChannel0–3、iSampler 和 iResolution 等变量；暂不支持自定义 uniform、纹理或存储缓冲区。');
        const uniform = layout?.parameters?.find((p: { name: string }) => p.name === 'hy_uniforms');
        if (!uniform || uniform.type?.elementType?.sizes?.find((s: { kind: string }) => s.kind === 'uniform')?.value !== FRAME_BYTES)
          return failure('HLSL 编译结果的内置变量布局不兼容，请检查编译器版本。');
        for (const resource of layout.parameters) {
          const group = resource.name === 'hy_uniforms' ? 0 : 2;
          const binding = resource.name.startsWith('iChannel') ? Number(resource.name.slice(8)) + 1 : 0;
          if ((resource.binding?.space ?? 0) !== group || resource.binding?.index !== binding)
            return failure('HLSL 编译结果的纹理绑定不兼容。');
        }
        const dimensions = Array.from({ length: 4 }, (_, i) => options.channelTypes?.[i] ?? '2d');
        return { code: commonOnly ? '' : HLSL_MODULE + '\n// @haiyue-common-included\n' + cubemapRequirements(dimensions) + code,
          diagnostics: [], warnings: commonOnly ? ['Common 会与各个 HLSL Pass 一起编译，请在 Image / Buffer / Sound 页签查看完整 WGSL。'] : [] };
      } finally { session.delete(); }
    } catch (error) { return failure('HLSL: ' + (error instanceof Error ? error.message : String(error))); }
  };
}
export const translateHlsl = createHlslTranslator(async () => (await import('./hlslCompiler.js')).loadSlang());
