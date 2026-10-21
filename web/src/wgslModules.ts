/** Small structural scanner; syntax/type conversion remains Naga's job. */
export function maskComments(source: string): string {
  let depth = 0, out = '', at = 0;
  while (at < source.length) {
    if (source.startsWith('/*', at)) { depth++; out += '  '; at += 2; }
    else if (depth && source.startsWith('*/', at)) { depth--; out += '  '; at += 2; }
    else if (!depth && source.startsWith('//', at)) {
      const end = source.indexOf('\n', at), next = end < 0 ? source.length : end;
      out += ' '.repeat(next - at); at = next;
    } else { out += depth && source[at] !== '\n' ? ' ' : source[at]; at++; }
  }
  return out;
}
export function declarations(source: string, language: 'wgsl' | 'glsl' | 'hlsl') {
  const masked = maskComments(source), result: { name: string; text: string; start: number; end: number }[] = [];
  let start = 0, braces = 0, parentheses = 0;
  for (let at = 0; at < masked.length; at++) {
    const c = masked[at];
    if (c === '(') parentheses++;
    if (c === ')') parentheses--;
    if (c === '{') braces++;
    if (c === '}') braces--;
    if (braces || parentheses || (c !== ';' && c !== '}')) continue;
    const head = masked.slice(start, at + 1).trim();
    const name = language === 'wgsl'
      ? /\b(?:fn|struct|alias|const|override|var(?:\s*<[^>]+>)?)\s+(\w+)/.exec(head)?.[1]
      : /^struct\s+(\w+)/.exec(head)?.[1] ?? /^(?:(?:static|const|highp|mediump|lowp)\s+)*\w+(?:<[^;{}]+>)?\s+(\w+)/.exec(head)?.[1];
    if (language !== 'wgsl' && c === '}' && /^struct\b/.test(head)) {
      const tail = /^\s*;/.exec(masked.slice(at + 1));
      if (tail) at += tail[0].length;
    }
    if (name) result.push({ name, text: source.slice(start, at + 1), start, end: at + 1 });
    start = at + 1;
  }
  return result;
}
export function renameIdentifiers(source: string, names: Readonly<Record<string, string>>) {
  const masked = maskComments(source);
  return source.replace(/\b[A-Za-z_]\w*\b/g, (name, at: number) =>
    masked.slice(at, at + name.length) === name ? names[name] ?? name : name);
}
const tokens = (source: string) => maskComments(source).match(/[A-Za-z_]\w*|(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?[fiu]?|[^\s]/g)?.join(' ') ?? '';

/** Detach old GLSL-imported Common only when its definitions still match.
 * Never erase hand-edited definitions just because their names match. */
export function detachCommon(source: string, common: string) {
  if (!/^\s*(?:\/\/[^\n]*\n)*\/\/ @haiyue-common-included(?:\n|$)/.test(source)) return source;
  const normalized = common.replace(/\bhy_common_/g, 'hy_');
  const known = new Map(declarations(normalized, 'wgsl').map(d => [d.name, d]));
  const names: Record<string, string> = {};
  const removed: {start: number; end: number; replacement?: string}[] = [];
  let initRemoved = false;
  for (const d of declarations(source, 'wgsl')) {
    const reference = known.get(d.name);
    if (!reference) continue;
    if (d.name === 'hy_init_globals' && tokens(d.text) !== tokens(reference.text)) {
      const bodyStart = d.text.indexOf('{') + 1, body = d.text.slice(bodyStart, d.text.lastIndexOf('}'));
      const sharedBody = reference.text.slice(reference.text.indexOf('{') + 1, reference.text.lastIndexOf('}'));
      const prefix = tokens(sharedBody).split(' ').filter(Boolean);
      const actual = [...maskComments(body).matchAll(/[A-Za-z_]\w*|(?:\d*\.\d+|\d+)(?:[eE][+-]?\d+)?[fiu]?|[^\s]/g)];
      if (prefix.length && prefix.every((token, i) => actual[i]?.[0] === token)) {
        const end = actual[prefix.length - 1]!;
        removed.push({...d, replacement:d.text.slice(0,bodyStart) + body.slice(end.index! + end[0].length) + '\n}'});
        continue;
      }
    }
    if (tokens(d.text) !== tokens(reference.text))
      throw Error(`Common 定义 ${d.name} 已在当前 Pass 中单独修改，无法安全拆分；请先将公共定义统一到 Common。`);
    removed.push(d);
    if (d.name === 'hy_init_globals') initRemoved = true;
    else names[d.name] = d.name.startsWith('hy_') ? d.name.replace(/^hy_/, 'hy_common_') : d.name;
  }
  if (!removed.length && [...known.keys()].some(name => name !== 'hy_library_init'))
    throw Error('当前 Pass 已包含旧版重写过的 Common，无法安全拆分；请从未合并的源码重新转换。');
  let detached = source;
  for (const {start, end, replacement = ''} of removed.reverse()) detached = detached.slice(0, start) + replacement + detached.slice(end);
  if (initRemoved) detached = detached.replace(/\bhy_init_globals\s*\(\s*\)\s*;/g, '');
  detached = detached.replace(/^\s*\/\/ @haiyue-common-included\s*$/gm, '');
  return renameIdentifiers(detached, names);
}
