import { declarations, maskComments } from './wgslModules.js';

type Language = import('./model.js').ShaderLanguage;
type Comment = { text: string; start: number; end: number };
const internal = (text: string) => /^\/\/\s*@haiyue-/.test(text)
  || /^\/\/ Shadertoy GLSL ES 3\.00 · Common 已合并到此 Pass\s*$/.test(text);

/** Comments are not represented in either compiler's IR. Read them separately,
 * respecting strings, nested WGSL blocks and GLSL line continuations. */
export function shaderComments(source: string, language: Language): Comment[] {
  const comments: Comment[] = [];
  for (let at = 0; at < source.length;) {
    const char = source[at];
    if (char === '"' || char === "'") {
      const quote = char; at++;
      while (at < source.length) {
        if (source[at++] === '\\') at++;
        else if (source[at - 1] === quote) break;
      }
      continue;
    }
    const start = at;
    if (source.startsWith('//', at)) {
      at += 2;
      while (at < source.length) {
        if (source[at] === '\n') {
          const previous = source[at - 1] === '\r' ? at - 2 : at - 1;
          if (language === 'wgsl' || source[previous] !== '\\') break;
        }
        at++;
      }
    } else if (source.startsWith('/*', at)) {
      at += 2; let depth = 1;
      while (at < source.length && depth) {
        if (language === 'wgsl' && source.startsWith('/*', at)) { depth++; at += 2; }
        else if (source.startsWith('*/', at)) { depth--; at += 2; }
        else at++;
      }
    } else { at++; continue; }
    const text = source.slice(start, at);
    if (!internal(text)) comments.push({ text, start, end: at });
  }
  return comments;
}

function safeComment(text: string, target: Language) {
  // GLSL cannot represent nested WGSL block comments. Continued // comments
  // must not turn their second line into executable code in the other language.
  if ((target !== 'wgsl' && text.startsWith('/*') && text.slice(2, -2).includes('/*'))
    || (text.startsWith('//') && (text.includes('\n') || /\\\r?$/.test(text)))) {
    return text.split(/\r?\n/).map(line => '// ' + line + (/\\$/.test(line) ? ' //' : '')).join('\n');
  }
  return text;
}

/** Preserve contents, not obsolete statement positions after IR lowering.
 * Attach to the corresponding declaration; ambiguous/deleted owners fall back
 * to the file header. Internal linker markers must remain first. */
export function preserveShaderComments(source: string, output: string, options: {
  from: Language; to: Language; names?: Readonly<Record<string, string>>; linkedCommon?: boolean; deduplicate?: boolean;
}): string {
  const comments = shaderComments(source, options.from);
  if (!comments.length) return output;
  const inputDeclarations = declarations(source, options.from);
  const outputDeclarations = declarations(output, options.to);
  const masked = maskComments(source);
  const firstCode = masked.search(/\S/);
  const starts = new Map(outputDeclarations.map(d => [d, d.start + maskComments(d.text).search(/\S/)]));
  const targetOf = (name: string) => {
    const mapped = options.names?.[name] ?? name;
    const exact = outputDeclarations.find(d => d.name === mapped);
    if (exact) return exact;
    const candidates = outputDeclarations.filter(d => options.to === 'wgsl'
      ? d.name.startsWith(`hy_fn_${name}_`) || d.name.startsWith(`hy_common_fn_${name}_`)
        || d.name === `hy_global_${name}` || d.name === `hy_common_global_${name}`
      : d.name === mapped + '_');
    return candidates.length === 1 ? candidates[0] : undefined;
  };
  const tokenStart = (d: typeof outputDeclarations[number]) => starts.get(d)!;
  const markers = /^(?:[ \t]*\/\/\s*@haiyue-[^\n]*(?:\n|$))*/.exec(output)![0].length;
  const firstOwn = options.linkedCommon
    ? inputDeclarations.map(d => targetOf(d.name)).find(Boolean)
      ?? outputDeclarations.find(d => d.name === 'mainImage' || d.name === 'mainSound')
    : undefined;
  const header = firstOwn ? tokenStart(firstOwn) : markers;
  const existing = new Map<string, number>();
  if (options.deduplicate) for (const c of shaderComments(output, options.to)) existing.set(c.text, (existing.get(c.text) ?? 0) + 1);
  const insertions = new Map<number, string[]>();
  let declarationIndex = 0;
  for (const comment of comments) {
    const text = safeComment(comment.text, options.to);
    const count = existing.get(text) ?? 0;
    if (count) { existing.set(text, count - 1); continue; }
    const fileHeader = firstCode < 0 || comment.end <= firstCode;
    while (declarationIndex < inputDeclarations.length && inputDeclarations[declarationIndex]!.end <= comment.start) declarationIndex++;
    const previous = inputDeclarations[declarationIndex - 1], current = inputDeclarations[declarationIndex];
    const owner = previous && !source.slice(previous.end, comment.start).includes('\n') && !masked.slice(previous.end, comment.start).trim()
      ? previous : current && comment.start >= current.start && comment.end <= current.end ? current : undefined;
    const target = !fileHeader && owner ? targetOf(owner.name) : undefined;
    const position = target ? tokenStart(target) : header;
    const group = insertions.get(position) ?? [];
    group.push(text); insertions.set(position, group);
  }
  for (const [position, group] of [...insertions].sort((a, b) => b[0] - a[0])) {
    output = output.slice(0, position) + group.join('\n') + '\n' + output.slice(position);
  }
  return output;
}
