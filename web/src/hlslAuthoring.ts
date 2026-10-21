import { declarations, renameIdentifiers } from './wgslModules.js';

/** Slang's runtime module includes host bindings and a stage wrapper. Language
 * conversion exposes the authored functions, so it can be edited/converted
 * again without duplicating those bindings or the host initialization. */
export function hlslAuthoringWgsl(
  code: string,
  sound = false,
  common?: string,
): string {
  const hints = code.match(/^\/\/ @haiyue-channel[^\n]*/gm)?.join('\n') ?? '';
  const parts = declarations(code, 'wgsl');
  const entry = parts.find((d) => d.name === 'hy_fragment');
  const author =
    entry &&
    new RegExp(`\\b(main${sound ? 'Sound' : 'Image'}_\\d+)\\s*\\(`).exec(
      entry.text,
    )?.[1];
  if (!entry || !author)
    throw Error('HLSL 转换结果缺少可编辑的 mainImage / mainSound 入口。');
  const output = /->\s*(\w+)/.exec(entry.text)?.[1];
  const builtins = [
    'iResolution',
    'iTime',
    'iTimeDelta',
    'iFrame',
    'iFrameRate',
    'iMouse',
    'iDate',
    'iSampleRate',
    'iChannelResolution',
    'iChannelTime',
    'iSampler',
    'iChannel0',
    'iChannel1',
    'iChannel2',
    'iChannel3',
  ];
  const names: Record<string, string> = {
    [author]: sound ? 'mainSound' : 'mainImage',
  };
  const remove = new Set([entry.name, ...(output ? [output] : [])]);
  for (const d of parts) {
    const builtin = builtins.find((name) =>
      new RegExp(`^${name}_\\d+$`).test(d.name),
    );
    if (builtin) {
      names[d.name] = builtin;
      remove.add(d.name);
    }
    if (common !== undefined) {
      const encoded = /^(?:Construct)?slCommonX([0-9a-f]+)Z_\d+$/.exec(d.name);
      if (encoded) {
        const original = encoded[1]!.replace(/../g, (hex) =>
          String.fromCharCode(parseInt(hex, 16)),
        );
        names[d.name] = original;
        remove.add(d.name);
        const shared = declarations(common, 'wgsl').find(
          (d) => d.name === original,
        );
        if (shared && /\bstruct\b/.test(shared.text))
          for (const field of d.text.matchAll(/\b(\w+)_\d+\s*:/g)) {
            if (new RegExp(`\\b${field[1]}\\s*:`).test(shared.text))
              names[field[0].replace(/\s*:$/, '')] = field[1]!;
          }
      }
    }
    if (/@\s*group\s*\(/.test(d.text)) {
      remove.add(d.name);
      const uniform = /var\s*<\s*uniform\s*>\s+\w+\s*:\s*(\w+)/.exec(d.text);
      if (uniform) remove.add(uniform[1]!);
    }
  }
  for (const d of [...parts].reverse())
    if (remove.has(d.name)) code = code.slice(0, d.start) + code.slice(d.end);
  return (
    (hints ? hints + '\n' : '') +
    renameIdentifiers(
      code.replace(/^\s*\/\/ @haiyue-hlsl-module\s*$/gm, ''),
      names,
    ).trim() +
    '\n'
  );
}
