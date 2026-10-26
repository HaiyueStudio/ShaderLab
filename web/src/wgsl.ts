import type { Module, ModuleInfo } from 'naga-wasm';
import { HEADER } from './shaders.js';
import { passCommon, resolveChannelBindings } from './channelBindings.js';
import { LIMITS, emptyChannels, type Channel, type RenderPass } from './model.js';
import { declarations, detachCommon, renameIdentifiers } from './wgslModules.js';
import { wgslBuiltins as builtins, writtenWgslBuiltins } from './wgslBuiltins.js';
import { compactShaderWhitespace } from './shaderWhitespace.js';
import { preserveShaderComments } from './shaderComments.js';
import { translateWgslToHlsl } from './wgslHlsl.js';
import { restoreGlslForLoops } from './glslLoops.js';

export interface WgslTranslationOptions {
  entryPoint?: 'image' | 'sound' | 'common';
  /** Authoring output for the editor; the native bridge uses the same writer. */
  target?: 'glsl' | 'hlsl';
  common?: string;
  channels?: Channel[];
  /** Editor conversion keeps Common external; standalone exports still link it. */
  commonMode?: 'separate';
  /** Reproduce historical output only to verify a saved legacy language pair. */
  legacyEntryWrapper?: boolean;
  /** Keep the external Common ABI compatible with a Pass that writes a builtin. */
  preserveBuiltinAliases?: string[];
}
export interface WgslTranslationResult {
  code: string | null;
  diagnostics: { line: number; column: number; message: string; source?: 'common' | 'pass' }[];
  warnings: string[];
  common?: string;
}
let compiler: Promise<typeof import('naga-wasm')> | undefined;
async function loadCompiler() {
  compiler ??= (async () => {
    const naga = await import('naga-wasm');
    if (typeof window !== 'undefined') {
      const { default: url } = await import('naga-wasm/naga_bg.wasm');
      await naga.init({ module_or_path: url });
    }
    return naga;
  })().catch(error => { compiler = undefined; throw error; });
  return compiler;
}

/** Only identifiers outside WGSL comments are rewritten. Naga handles all syntax
 * and type lowering; these names bridge the product ABI to Shadertoy uniforms. */
function rename(source: string, names: Readonly<Record<string, string>>, maskComments = false) {
  let out = '', at = 0, depth = 0;
  while (at < source.length) {
    if (source.startsWith('//', at) && !depth) {
      const end = source.indexOf('\n', at), next = end < 0 ? source.length : end;
      out += maskComments ? ' '.repeat(next - at) : source.slice(at, next); at = next; continue;
    }
    if (source.startsWith('/*', at)) { depth++; out += maskComments ? '  ' : '/*'; at += 2; continue; }
    if (depth && source.startsWith('*/', at)) { depth--; out += maskComments ? '  ' : '*/'; at += 2; continue; }
    if (depth && maskComments) { out += source[at] === '\n' ? '\n' : ' '; at++; continue; }
    const word = !depth && /^[A-Za-z_]\w*/.exec(source.slice(at));
    if (word) { out += names[word[0]] ?? word[0]; at += word[0].length; }
    else out += source[at++];
  }
  return out;
}
const failure = (message: string): WgslTranslationResult => ({ code: null, diagnostics: [{ line: 1, column: 1, message }], warnings: [] });

/** Naga emits immutable Load expression temporaries even for uniforms. Inline
 * only whole, read-only builtin loads; never general locals or indexed loads
 * whose index could change. Names are local to each generated function. */
function inlineUniformLoads(code: string, uniforms: ReadonlySet<string>) {
  for (const declaration of declarations(code, 'glsl').reverse()) {
    if (!/\([^)]*\)\s*\{/.test(declaration.text)) continue;
    const aliases: Record<string, string> = {};
    let text = declaration.text.replace(/\b(?:float|int|uint|bool|[biu]?vec[234])\s+(_e\d+\w*)\s*(?:\[\d+\])?\s*=\s*(\w+)\s*;/g, (statement, local: string, value: string) => {
      if (!uniforms.has(value)) return statement;
      aliases[local] = value; return '';
    });
    text = text.replace(/\b[A-Za-z_]\w*\b/g, (name, at: number) =>
      /\.\s*$/.test(text.slice(0, at)) ? name : aliases[name] ?? name);
    code = code.slice(0, declaration.start) + text + code.slice(declaration.end);
  }
  return code;
}

/** Export authoring WGSL, not arbitrary WebGPU pipelines, as a self-contained
 * Shadertoy pass. Common is linked just as in the renderer. */
export async function translateWgsl(source: string, options: WgslTranslationOptions = {}): Promise<WgslTranslationResult> {
  if (options.target === 'hlsl') {
    try { return await translateWgslToHlsl(source, options, await loadCompiler()); }
    catch (error) { return failure(error instanceof Error ? error.message : String(error)); }
  }
  if (source.length > LIMITS.code || (options.common?.length ?? 0) > LIMITS.code) return failure('代码超过转换长度上限。');
  const separate = options.commonMode === 'separate' && Boolean(options.common?.trim());
  let sharedNames: Record<string, string> = {};
  let shared = options.common ?? '';
  let commentSource = source;
  if (separate) {
    try {
      source = detachCommon(source, shared);
      commentSource = source;
      sharedNames = Object.fromEntries(declarations(shared, 'wgsl').map(d =>
        [d.name, 'slCommonX' + [...d.name].map(c => c.charCodeAt(0).toString(16).padStart(2, '0')).join('') + 'Z']));
      source = renameIdentifiers(source, sharedNames);
      shared = renameIdentifiers(shared, sharedNames);
      // Keep Common constants as external reads so editing Common does not
      // leave a constant folded into an unrelated Pass's saved GLSL.
      shared = shared.replace(/\bconst\s+(slCommonX\w+)\b/g, 'var<private> $1');
    } catch (error) { return failure(String(error)); }
  }
  const sound = options.entryPoint === 'sound';
  const pass: RenderPass = { id: sound ? 'sound' : 'image', code: source, channels: options.channels ?? emptyChannels(), enabled: true, duration: 60, volume: 1 };
  const common = separate ? shared : passCommon(pass, shared);
  const binding = resolveChannelBindings(pass, common);
  if (binding.diagnostics.some(d => d.severity === 'error')) return { code: null, diagnostics: binding.diagnostics.filter(d => d.severity === 'error').map(d => ({ ...d, source: d.pass === 'common' ? 'common' : 'pass' })), warnings: [] };
  const authored = common + '\n' + source;
  // Host resources and stage entry points have no equivalent in a Shadertoy tab.
  const unsupported = /@\s*(?:group|binding|vertex|fragment|compute|workgroup_size)\b|\bvar\s*<\s*(?:storage|uniform|workgroup)\b/.exec(rename(authored, {}, true));
  if (unsupported) return failure('请转换 Shader Lab 的 mainImage / mainSound 源码。自定义绑定、存储缓冲区及独立 GPU 阶段不能导出到 Shadertoy。');
  let prefix = separate ? 'slLink' : 'stExport';
  while (!separate && authored.includes(prefix)) prefix += 'X';
  const names = Object.fromEntries(builtins.map(name => [name, prefix + name]));
  names.mainImage = prefix + 'Image'; names.mainSound = prefix + 'Sound';
  let header = HEADER.slice(HEADER.indexOf('@group(2)'));
  binding.dimensions.forEach((kind, index) => {
    if (kind !== 'cube') return;
    header = header.replace(`var iChannel${index}: texture_2d<f32>`, `var iChannel${index}: texture_cube<f32>`).replace(
      `fn channel${index}(uv: vec2f) -> vec4f { return textureSampleLevel(iChannel${index}, iSampler, vec2f(uv.x, 1.0 - uv.y), 0.0); }`,
      `fn channel${index}(direction: vec3f) -> vec4f { return textureSampleLevel(iChannel${index}, iSampler, direction, 0.0); }`);
  });
  if (sound) header += `\nvar<private> ${prefix}Sample: i32;\nvar<private> ${prefix}Time: f32;\n`;
  header = rename(header, names);
  const commonPrefix = common ? rename(common, names) + '\n' : '';
  const init = /^\s*(?:\/\/[^\n]*\n)*\/\/ @haiyue-common-library(?:\n|$)/.test(common) ? `${sharedNames.hy_common_library_init ?? 'hy_common_library_init'}(${sound ? 'vec2f(0.0)' : 'position.xy'});` : '';
  const entry = `\n@fragment fn ${prefix}Entry(${sound ? '' : '@builtin(position) position: vec4f'}) -> @location(0) ${sound ? 'vec2f' : 'vec4f'} {\n${init}\nreturn ${prefix + (sound ? 'Sound' : 'Image')}(${sound ? prefix + 'Sample, ' + prefix + 'Time' : 'position.xy'});\n}`;
  const wrapped = header + commonPrefix + rename(source, names) + entry;
  let module: Module | undefined, info: ModuleInfo | undefined;
  try {
    const naga = await loadCompiler();
    module = naga.parseWgsl(wrapped); info = naga.validate(module);
    const generated = naga.writeGlsl(module, info, { version: '300 es', stage: 'fragment', entryPoint: prefix + 'Entry', reflect: true, flags: { adjustCoordinateSpace: false, includeUnusedItems: separate } });
    if (/^#extension\b/m.test(generated.code)) throw new Error('此 WGSL 需要 WebGL2 / Shadertoy 不提供的 GLSL 扩展，无法导出。');
    let code = generated.code.replace(/^#version[^\n]*\n|^precision[^\n]*\n/gm, '');
    if (!options.legacyEntryWrapper) code = restoreGlslForLoops(code);
    const output = /layout\(location = 0\) out vec[24] (\w+);/.exec(code);
    if (!output) throw new Error('编译器未生成可识别的颜色输出。');
    code = code.replace(output[0], '');
    const map: Record<string, string> = { [output[1]!]: prefix + 'Color', gl_FragCoord: `vec4(${prefix}Coord, 0.0, 1.0)` };
    for (const [name, item] of Object.entries(generated.reflection.textures)) {
      const index = (item.texture?.binding ?? 0) - 1;
      if (item.texture?.group !== 2 || index < 0 || index > 3) throw new Error('只能导出 iChannel0–3 纹理绑定。');
      code = code.replace(new RegExp(`^uniform\\s+(?:highp\\s+)?\\w+\\s+${name};\\n`, 'm'), '');
      map[name] = 'iChannel' + index;
    }
    if (separate) for (let index = 1; index <= 4; index++) {
      const name = `_group_2_binding_${index}_fs`;
      code = code.replace(new RegExp(`^uniform\\s+(?:highp\\s+)?sampler(?:2D|Cube)\\s+${name};\\n`, 'gm'), '');
      map[name] = 'iChannel' + (index - 1);
    }
    // Raw WebGPU samples use a top-left texture origin. Shadertoy textures use
    // bottom-left. Flip raw reads; channelN already flips once in its WGSL body.
    const helpers: string[] = [];
    if (separate || /\btexture(?:Lod)?\s*\(/.test(code)) {
      map.textureLod = prefix + 'TextureLod'; map.texture = prefix + 'Texture';
      helpers.push(`vec4 ${prefix}TextureLod(sampler2D t, vec2 p, float l) { return textureLod(t, vec2(p.x, 1.0-p.y), l); }`,
        `vec4 ${prefix}TextureLod(samplerCube t, vec3 p, float l) { return textureLod(t, p, l); }`,
        `vec4 ${prefix}Texture(sampler2D t, vec2 p) { return texture(t, vec2(p.x, 1.0-p.y)); }`,
        `vec4 ${prefix}Texture(samplerCube t, vec3 p) { return texture(t, p); }`,
        `vec4 ${prefix}Texture(sampler2D t, vec2 p, float b) { return texture(t, vec2(p.x, 1.0-p.y), b); }`,
        `vec4 ${prefix}Texture(samplerCube t, vec3 p, float b) { return texture(t, p, b); }`);
    }
    if (separate || /\btexelFetch\s*\(/.test(code)) {
      map.texelFetch = prefix + 'Texel';
      helpers.push(`vec4 ${prefix}Texel(sampler2D t, ivec2 p, int l) { return texelFetch(t, ivec2(p.x, textureSize(t,l).y-1-p.y), l); }`);
    }
    if (/\btextureGrad\s*\(/.test(code)) {
      map.textureGrad = prefix + 'TextureGrad';
      helpers.push(`vec4 ${prefix}TextureGrad(sampler2D t, vec2 p, vec2 x, vec2 y) { return textureGrad(t, vec2(p.x,1.0-p.y), x*vec2(1,-1), y*vec2(1,-1)); }`,
        `vec4 ${prefix}TextureGrad(samplerCube t, vec3 p, vec3 x, vec3 y) { return textureGrad(t,p,x,y); }`);
    }
    if (/\b(?:texture\w*Offset|textureGather\w*)\s*\(/.test(code)) throw new Error('带 offset 的纹理采样与 textureGather 暂不能导出到 Shadertoy。');
    // Screen-space y derivatives in WGSL point down, GL derivatives point up.
    if (separate || /\bdFdy\s*\(/.test(code)) {
      map.dFdy = prefix + 'Dy';
      for (const type of ['float', 'vec2', 'vec3', 'vec4']) helpers.push(`${type} ${prefix}Dy(${type} p) { return -dFdy(p); }`);
    }
    const mutable = new Set([...writtenWgslBuiltins(authored), ...(options.preserveBuiltinAliases ?? [])]);
    const direct = new Set(options.legacyEntryWrapper ? [] : builtins.filter(name =>
      !mutable.has(name) && (!sound || name === 'iSampleRate' || name === 'iParams' || name === 'iChannelResolution')));
    // Private WGSL globals become GLSL copies by default. Read-only builtins
    // already exist as Shadertoy uniforms, so remove the copies and their
    // initialization, including array-copy loops. Keep genuinely writable
    // values and Sound's per-sample ABI instead of assigning to uniforms.
    for (const declaration of declarations(code, 'glsl').reverse()) {
      const name = builtins.find(name => direct.has(name) && declaration.name === names[name]);
      if (!name) continue;
      code = code.slice(0, declaration.start) + code.slice(declaration.end);
      map[names[name]!] = name;
    }
    code = inlineUniformLoads(code, new Set([...direct].map(name => names[name]!)));
    const initializers = builtins.filter(name => !direct.has(name) && new RegExp(`\\b${names[name]}\\b`).test(code)).map(name => {
      const dest = names[name];
      if (sound) {
        const values: Record<string, string> = { iResolution: 'vec3(1024.0,64.0,1.0)', iTime: prefix + 'TimeInput', iTimeDelta: '(1.0/iSampleRate)', iFrameRate: 'iSampleRate', iFrame: '0', iMouse: 'vec4(0.0)', iDate: 'vec4(0.0)' };
        if (values[name]) return `${dest} = ${values[name]};`;
      }
      if (name === 'iParams') return `for (int ${prefix}I=0; ${prefix}I<8; ${prefix}I++) { ${dest}[${prefix}I] = iParams[${prefix}I]; }`;
      if (name === 'iChannelResolution' || name === 'iChannelTime') return `for (int ${prefix}I=0; ${prefix}I<4; ${prefix}I++) { ${dest}[${prefix}I] = ${sound && name === 'iChannelTime' ? '0.0' : name + '[' + prefix + 'I]'}; }`;
      return `${dest} = ${name};`;
    });
    code = rename(code, map);
    const main = /void main\(\)\s*\{/.exec(code);
    if (!main) throw new Error('编译器未生成可识别的入口。');
    let body = code.slice(main.index + main[0].length).trim();
    if (!body.endsWith('}')) throw new Error('编译器入口结构不完整。');
    body = body.slice(0, -1);
    const signature = sound ? `vec2 mainSound(int ${prefix}SampleInput, float ${prefix}TimeInput)` : `void mainImage(out vec4 ${prefix}Color, in vec2 ${prefix}Coord)`;
    if (sound) {
      initializers.unshift(`${prefix}Sample = ${prefix}SampleInput;`, `${prefix}Time = ${prefix}TimeInput;`, `vec2 ${prefix}Color = vec2(0.0);`);
      // Unused sound inputs are removed by the compiler.
      for (const name of ['Sample', 'Time']) if (!new RegExp(`\\b${prefix}${name}\\s*[=;]`).test(code.slice(0, main.index))) initializers.splice(initializers.findIndex(s => s.startsWith(prefix + name + ' =')), 1);
      body = body.replace(/\breturn\s*;/g, `return ${prefix}Color;`);
    }
    // Naga needs a GPU entry wrapper, but the editor does not. Turn the
    // author's translated entry itself into mainImage/mainSound; otherwise
    // every round trip treats the previous wrapper as another user helper.
    const library = code.slice(0, main.index);
    const authoredEntry = declarations(library, 'glsl').find(d => d.name === prefix + (sound ? 'Sound' : 'Image'));
    const entryHeader = authoredEntry && /^\s*vec[24]\s+\w+\(([^)]*)\)\s*\{/.exec(authoredEntry.text);
    const otherUses = authoredEntry && new RegExp(`\\b${authoredEntry.name}\\s*\\(`).test(
      library.slice(0, authoredEntry.start) + library.slice(authoredEntry.end));
    if (authoredEntry && entryHeader && !otherUses && !options.legacyEntryWrapper) {
      const params = entryHeader[1]!.split(',').map(p => p.trim().split(/\s+/).at(-1)!);
      let authoredBody = authoredEntry.text.slice(entryHeader[0].length, authoredEntry.text.lastIndexOf('}'));
      let setup = initializers;
      let directSignature: string;
      if (sound) {
        directSignature = `vec2 mainSound(${entryHeader[1]})`;
        // These assignments belong to the discarded GPU stage wrapper.
        setup = initializers.filter(s => !s.startsWith(`${prefix}Sample =`) && !s.startsWith(`${prefix}Time =`) && !s.startsWith(`vec2 ${prefix}Color =`))
          .map(s => rename(s, { [prefix + 'TimeInput']: params[1]! }));
      } else {
        directSignature = `void mainImage(out vec4 ${prefix}Color, in vec2 ${params[0]})`;
        // Braces preserve conditional/loop early-return behavior.
        authoredBody = authoredBody.replace(/\breturn\s+([^;]+);/g, `{ ${prefix}Color = $1; return; }`);
      }
      const commonInit = init ? `${sharedNames.hy_common_library_init ?? 'hy_common_library_init'}(${sound ? 'vec2(0.0)' : params[0]});` : '';
      code = library.slice(0, authoredEntry.start) + library.slice(authoredEntry.end)
        + `${directSignature} {\n${setup.join('\n')}\n${commonInit}\n${authoredBody}\n}\n`;
    } else {
      // An entry called by another user helper still needs its return-value ABI.
      code = library + `${signature} {\n    ${initializers.join('\n    ')}\n${body}\n}\n`;
    }
    // The forward importer reserves hy_ for generated helpers. Make reverse
    // exports reusable there too, with a namespace absent from the original.
    const reserved = Object.fromEntries([...code.matchAll(/\bhy_\w+\b/g)].map(m => [m[0], prefix + m[0]]));
    code = rename(code, reserved);
    const commentNames = { ...reserved, ...sharedNames, mainImage: 'mainImage', mainSound: 'mainSound' };
    const withComments = (input: string, output: string, deduplicate = false) => preserveShaderComments(input, output, { from: 'wgsl', to: 'glsl', names: commentNames, deduplicate });
    if (separate) {
      const commonParts: string[] = [];
      for (const declaration of declarations(code, 'glsl').reverse()) {
        if (!declaration.name.startsWith('slCommonX')
          && !builtins.some(name => declaration.name === names[name])
          && !/^channel[0-3]_?$/.test(declaration.name)) continue;
        commonParts.unshift(declaration.text);
        code = code.slice(0, declaration.start) + code.slice(declaration.end);
      }
      return { code: compactShaderWhitespace(withComments(commentSource, '// @haiyue-common-external\n' + code.trim() + '\n')),
        common: compactShaderWhitespace(withComments(options.common ?? '', helpers.join('\n') + '\n' + commonParts.join('\n'))), diagnostics: [], warnings: [] };
    }
    const exported = '// Shadertoy GLSL ES 3.00 · Common 已合并到此 Pass\n' + helpers.join('\n') + '\n' + code.trim() + '\n';
    return { code: options.legacyEntryWrapper ? exported : compactShaderWhitespace(withComments(commentSource, withComments(options.common ?? '', helpers.join('\n') + '\n' + code.trim() + '\n'), /\/\/ @haiyue-common-included\b/.test(commentSource))), diagnostics: [], warnings: [
      'Common 已合并到每个 Pass；在 Shadertoy 中请保持 Common 页为空，按对应页签粘贴代码。',
      '请按通道清单设置素材，使用 Linear 过滤、Repeat 寻址和基础 mip 层；Buffer 使用浮点格式。',
      ...binding.diagnostics.filter(d => d.severity === 'warning').map(d => d.message),
    ] };
  } catch (error) {
    const report = error && typeof error === 'object' && 'formatted' in error ? String(error.formatted) : error instanceof Error ? error.message : String(error);
    const location = /wgsl:(\d+):(\d+)/.exec(report);
    const row = Number(location?.[1] ?? 1), headerLines = header.split('\n').length - 1, commonLines = commonPrefix.split('\n').length - 1;
    const inCommon = row > headerLines && row <= headerLines + commonLines;
    return { code: null, diagnostics: [{ line: Math.max(1, row - headerLines - (inCommon ? 0 : commonLines)), column: Number(location?.[2] ?? 1), source: inCommon ? 'common' : 'pass', message: report }], warnings: [] };
  } finally { info?.free(); module?.free(); }
}
