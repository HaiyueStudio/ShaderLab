import type { Module, ModuleInfo } from 'naga-wasm';
import type { WgslTranslationOptions, WgslTranslationResult } from './wgsl.js';
import { HEADER } from './shaders.js';
import { LIMITS, emptyChannels, type RenderPass } from './model.js';
import {
  cubemapRequirements,
  passCommon,
  resolveChannelBindings,
} from './channelBindings.js';
import {
  declarations,
  detachCommon,
  maskComments,
  renameIdentifiers,
} from './wgslModules.js';
import { wgslBuiltins } from './wgslBuiltins.js';
import { compactShaderWhitespace } from './shaderWhitespace.js';
import { preserveShaderComments } from './shaderComments.js';

/** Runtime reads stay external to the Pass. Initializers and array lengths
 * still need constant expressions, including chains such as COUNT=ROWS*COLS. */
function externalConstants(common: string, source: string) {
  const constants = declarations(common, 'wgsl').flatMap((d) => {
    const match = /\bconst\s+(\w+)\s*(:[^=]+)?=\s*([\s\S]*);\s*$/.exec(
      maskComments(d.text),
    );
    return match
      ? [{ ...d, name: match[1]!, type: match[2] ?? '', value: match[3]! }]
      : [];
  });
  const names = Object.fromEntries(
    constants.map((d) => [d.name, d.name + 'ConstInit']),
  );
  const aliases = constants
    .map(
      (d) =>
        `const ${names[d.name]}${d.type} = ${renameIdentifiers(d.value, names)};`,
    )
    .join('\n');
  for (const d of [...constants].reverse())
    common =
      common.slice(0, d.start) +
      `\nvar<private> ${d.name}${d.type} = ${names[d.name]};` +
      common.slice(d.end);
  const staticContexts = (source: string) => {
    const mask = maskComments(source),
      ranges: { start: number; end: number }[] = [];
    for (const match of mask.matchAll(/\barray\s*</g)) {
      let depth = 1,
        end = match.index! + match[0].length;
      for (; end < mask.length && depth; end++) {
        if (mask[end] === '<') depth++;
        else if (mask[end] === '>') depth--;
      }
      if (!depth) ranges.push({ start: match.index!, end });
    }
    // Keep the outer range only when array types are nested.
    let covered = 0;
    for (const range of ranges
      .filter((r) => {
        if (r.start < covered) return false;
        covered = r.end;
        return true;
      })
      .reverse())
      source =
        source.slice(0, range.start) +
        renameIdentifiers(source.slice(range.start, range.end), names) +
        source.slice(range.end);
    for (const d of declarations(source, 'wgsl').reverse()) {
      if (
        !/^(?:@[^\n]*\s*)*(?:const|override|var(?:\s*<[^>]+>)?)\b/.test(
          maskComments(d.text).trim(),
        )
      )
        continue;
      const equal = d.text.indexOf('=');
      if (equal < 0) continue;
      source =
        source.slice(0, d.start + equal + 1) +
        renameIdentifiers(d.text.slice(equal + 1), names) +
        source.slice(d.end);
    }
    return source.replace(/\bcase\s+[^:]*:|\bconst_assert\s+[^;]*;/g, (text) =>
      renameIdentifiers(text, names),
    );
  };
  return {
    common: aliases + '\n' + staticContexts(common),
    source: staticContexts(source),
  };
}

/** Naga represents aggregate constructors as helper calls. Slang requires
 * aggregate initializer lists in static const declarations, not function calls. */
function constantAggregates(code: string) {
  const constructors = new Set(
    declarations(code, 'hlsl')
      .filter(
        (d) =>
          /^Construct\w+$/.test(d.name) && /\breturn ret;\s*}\s*$/.test(d.text),
      )
      .map((d) => d.name),
  );
  const initializer = (text: string): string => {
    const mask = maskComments(text);
    for (const match of mask.matchAll(/\b(Construct\w+)\s*\(/g)) {
      if (!constructors.has(match[1]!)) continue;
      const start = match.index!,
        args = start + match[0].length;
      let end = args,
        depth = 1;
      for (; end < mask.length && depth; end++) {
        if (mask[end] === '(') depth++;
        else if (mask[end] === ')') depth--;
      }
      if (depth) continue;
      return (
        text.slice(0, start) +
        '{' +
        initializer(text.slice(args, end - 1)) +
        '}' +
        initializer(text.slice(end))
      );
    }
    return text;
  };
  for (const d of declarations(code, 'hlsl').reverse()) {
    // Slang's WGSL backend currently emits an invalid unsigned unary negate
    // for Naga's overflow-safe signed abs helper. Unsigned subtraction keeps
    // the same wrapping result, including INT_MIN, and lowers to valid WGSL.
    if (/^naga_abs(?:_\d+)?$/.test(d.name)) {
      code =
        code.slice(0, d.start) +
        d.text.replace(/asint\(-asuint\((\w+)\)\)/g, 'asint(0u - asuint($1))') +
        code.slice(d.end);
      continue;
    }
    if (!/^static\s+const\b/.test(maskComments(d.text).trim())) continue;
    const equal = d.text.indexOf('=');
    if (equal < 0) continue;
    code =
      code.slice(0, d.start + equal + 1) +
      initializer(d.text.slice(equal + 1)) +
      code.slice(d.end);
  }
  return code;
}

/** Naga performs syntax/type lowering. Only the fixed host declarations are
 * removed: generated text remains ordinary mainImage/mainSound HLSL source. */
export async function translateWgslToHlsl(
  source: string,
  options: WgslTranslationOptions,
  naga: typeof import('naga-wasm'),
): Promise<WgslTranslationResult> {
  const fail = (message: string): WgslTranslationResult => ({
    code: null,
    diagnostics: [{ line: 1, column: 1, message }],
    warnings: [],
  });
  if (
    source.length > LIMITS.code ||
    (options.common?.length ?? 0) > LIMITS.code
  )
    return fail('代码超过转换长度上限。');
  const separate =
    options.commonMode === 'separate' && Boolean(options.common?.trim());
  let common = options.common ?? '',
    original = source;
  const sharedNames: Record<string, string> = {};
  if (separate) {
    source = detachCommon(source, common);
    original = source;
    for (const d of declarations(common, 'wgsl'))
      sharedNames[d.name] =
        'slCommonX' +
        [...d.name]
          .map((c) => c.charCodeAt(0).toString(16).padStart(2, '0'))
          .join('') +
        'Z';
    source = renameIdentifiers(source, sharedNames);
    common = renameIdentifiers(common, sharedNames);
    ({ common, source } = externalConstants(common, source));
  }
  const pass: RenderPass = {
    id: options.entryPoint === 'sound' ? 'sound' : 'image',
    code: source,
    enabled: true,
    channels: options.channels ?? emptyChannels(),
    duration: 1,
    volume: 0,
  };
  if (!separate) common = passCommon(pass, common);
  const binding = resolveChannelBindings(pass, common);
  const errors = binding.diagnostics.filter((d) => d.severity === 'error');
  if (errors.length)
    return {
      code: null,
      diagnostics: errors.map((d) => ({
        ...d,
        source: d.pass === 'common' ? 'common' : 'pass',
      })),
      warnings: [],
    };
  const authored = common + '\n' + source;
  if (
    /@\s*(?:group|binding|vertex|fragment|compute|workgroup_size)\b|\bvar\s*<\s*(?:storage|uniform|workgroup)\b/.test(
      maskComments(authored),
    )
  )
    return fail(
      '请转换 ShaderLab 的 mainImage / mainSound 源码；自定义绑定和独立 GPU 阶段暂不支持转换为 HLSL。',
    );
  let prefix = 'slToHlsl';
  while (authored.includes(prefix)) prefix += 'X';
  const host = [
    ...wgslBuiltins,
    'iSampler',
    ...Array.from({ length: 4 }, (_, i) => 'iChannel' + i),
    ...Array.from({ length: 4 }, (_, i) => 'channel' + i),
  ];
  const names = Object.fromEntries(host.map((name) => [name, prefix + name]));
  let header = HEADER.slice(HEADER.indexOf('@group(2)'));
  binding.dimensions.forEach((type, i) => {
    if (type !== 'cube') return;
    header = header
      .replace(
        `var iChannel${i}: texture_2d<f32>`,
        `var iChannel${i}: texture_cube<f32>`,
      )
      .replace(
        `fn channel${i}(uv: vec2f) -> vec4f { return textureSampleLevel(iChannel${i}, iSampler, vec2f(uv.x, 1.0 - uv.y), 0.0); }`,
        `fn channel${i}(direction: vec3f) -> vec4f { return textureSampleLevel(iChannel${i}, iSampler, direction, 0.0); }`,
      );
  });
  header = renameIdentifiers(header, names);
  const commonPrefix = common ? renameIdentifiers(common, names) + '\n' : '';
  let module: Module | undefined, info: ModuleInfo | undefined;
  try {
    module = naga.parseWgsl(
      header + commonPrefix + renameIdentifiers(source, names),
    );
    info = naga.validate(module);
    let code = constantAggregates(
      naga.writeHlsl(module, info, {
        shaderModel: '6_0',
        reflect: true,
      }).code,
    );
    const emitted: Record<string, string> = {};
    for (const d of declarations(code, 'hlsl').reverse()) {
      if (
        !d.name.startsWith(prefix) &&
        !/^naga(?:(?:Comparison)?SamplerHeap|Group\d+SamplerIndexArray)$/.test(
          d.name,
        )
      )
        continue;
      const name = host.find(
        (name) => d.name === names[name] || d.name === names[name] + '_',
      );
      if (name) emitted[d.name] = name;
      code = code.slice(0, d.start) + code.slice(d.end);
    }
    code = renameIdentifiers(code, emitted);
    const comments = (input: string, output: string) =>
      preserveShaderComments(input, output, {
        from: 'wgsl',
        to: 'hlsl',
        names: sharedNames,
      });
    const hints = cubemapRequirements(binding.dimensions);
    if (separate) {
      const library: string[] = [];
      for (const d of declarations(code, 'hlsl').reverse())
        if (/^(?:Construct)?slCommonX/.test(d.name)) {
          library.unshift(d.text);
          code = code.slice(0, d.start) + code.slice(d.end);
        }
      return {
        code: compactShaderWhitespace(
          comments(original, '// @haiyue-common-external\n' + hints + code),
        ),
        common: compactShaderWhitespace(
          comments(options.common ?? '', library.join('\n')),
        ),
        diagnostics: [],
        warnings: [],
      };
    }
    return {
      code: compactShaderWhitespace(
        comments(original, comments(options.common ?? '', hints + code)),
      ),
      diagnostics: [],
      warnings: [],
    };
  } catch (error) {
    const message =
      error && typeof error === 'object' && 'formatted' in error
        ? String(error.formatted)
        : String(error instanceof Error ? error.message : error);
    const location = /wgsl:(\d+):(\d+)/.exec(message),
      row = Number(location?.[1] ?? 1),
      headerLines = header.split('\n').length - 1,
      commonLines = commonPrefix.split('\n').length - 1;
    const inCommon = row > headerLines && row <= headerLines + commonLines;
    return {
      code: null,
      diagnostics: [
        {
          line: Math.max(1, row - headerLines - (inCommon ? 0 : commonLines)),
          column: Number(location?.[2] ?? 1),
          source: inCommon ? 'common' : 'pass',
          message,
        },
      ],
      warnings: [],
    };
  } finally {
    info?.free();
    module?.free();
  }
}
