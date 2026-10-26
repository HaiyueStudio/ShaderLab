import { declarations, maskComments } from './wgslModules.js';

const scalar = '(?:bool|int|uint|float|half)(?:[234](?:x[234])?)?';
const primitive = new RegExp('^' + scalar + '$');
const math = new Set(('abs acos acosh all any asin asinh atan atan2 atanh ceil clamp cos cosh cross degrees determinant distance dot exp exp2 floor fma fmod frac isfinite isinf isnan ldexp length lerp log log2 max min mul normalize pow radians rcp reflect refract reversebits round rsqrt saturate sign sin sinh smoothstep sqrt step tan tanh transpose trunc countbits firstbithigh firstbitlow asint asuint asfloat ddx ddy fwidth').split(' '));
const control = /[{}]|\b(?:if|else|for|while|do|switch|case|break|continue|discard)\b/;

function references(mask: string, name: string, from: number) {
  return [...mask.slice(from).matchAll(new RegExp('\\b' + name + '\\b', 'g'))]
    .map(m => from + m.index!)
    .filter(at => !/\.\s*$/.test(mask.slice(0, at)));
}
function writes(mask: string, name: string): boolean {
  const target = '\\b' + name + '(?:\\s*\\.\\s*\\w+|\\s*\\[[^\\]]+\\])*';
  return new RegExp(target + '\\s*(?:=(?!=)|(?:[+\\-*/%&|^]|<<|>>)=|\\+\\+|--)|(?:\\+\\+|--)\\s*\\b' + name + '\\b').test(mask);
}
function pureCalls(mask: string, functions: ReadonlySet<string>): boolean {
  return [...mask.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].every(m => {
    if (/\.\s*$/.test(mask.slice(0, m.index)) || functions.has(m[1]!) || !(primitive.test(m[1]!) || math.has(m[1]!))) return false;
    // asuint also has an overload with out parameters for a double's two words.
    if (m[1] === 'asuint') {
      let depth = 1;
      for (let at = m.index! + m[0].length; at < mask.length && depth; at++) {
        if (mask[at] === '(') depth++;
        else if (mask[at] === ')') depth--;
        else if (mask[at] === ',' && depth === 1) return false;
      }
    }
    return true;
  });
}

/** Inline only generated primitive loads within a straight-line sequence.
 * No dependency may change before its last use, and no unknown call may
 * observe or mutate it. Branches, loops, dynamic indices and author locals stay.
 */
function inlineLoads(text: string, functions: ReadonlySet<string>, authored: ReadonlySet<string>): string {
  const pattern = new RegExp('\\b(?:const\\s+)?' + scalar + '\\s+(_e\\d+(?:_\\d+)?)\\s*=\\s*([A-Za-z_]\\w*)((?:\\s*\\.\\s*[xyzwrgba]{1,4}|\\s*\\[\\s*\\d+u?\\s*\\])*)\\s*;', 'g');
  const candidates = [...maskComments(text).matchAll(pattern)];
  for (const m of candidates.reverse()) {
    const local = m[1]!, root = m[2]!, start = m.index!, end = start + m[0].length;
    if (authored.has(local) || authored.has(local.replace(/_\d+$/, '')) || candidates.filter(c => c[1] === local).length !== 1) continue;
    const mask = maskComments(text);
    if (!/[;{}]$/.test(mask.slice(0, start).trimEnd())) continue;
    const uses = references(mask, local, end); if (!uses.length || writes(mask.slice(end), local)) continue;
    const last = uses[uses.length - 1]!, stop = mask.indexOf(';', last); if (stop < 0) continue;
    const range = mask.slice(end, stop + 1), finalStart = range.lastIndexOf(';', last - end) + 1;
    if (control.test(range) || /\breturn\b/.test(range.slice(0, finalStart)) || !pureCalls(range, functions)) continue;
    // A final `x = ...snapshotOfX...` writes only after evaluating its RHS.
    // Earlier writes, compound updates and calls cannot be moved past the load.
    const finalWrite = new RegExp('^\\s*' + root + '(?:\\s*\\.\\s*\\w+|\\s*\\[[^\\]]+\\])*\\s*=(?!=)').exec(range.slice(finalStart));
    const mutations = finalWrite
      ? range.slice(0, finalStart) + ' '.repeat(finalWrite[0].length) + range.slice(finalStart + finalWrite[0].length)
      : range;
    if (writes(mutations, root)) continue;
    const value = root + m[3]!;
    for (const at of uses.reverse()) text = text.slice(0, at) + value + text.slice(at + local.length);
    text = text.slice(0, start) + text.slice(end);
  }
  return text;
}

/** Naga hoists GLSL locals as zero-initialized variables, then assigns the real
 * initializer. Combine them only before the first read in the same basic block.
 */
function mergeInitializers(text: string): string {
  const pattern = new RegExp('\\b(' + scalar + ')\\s+([A-Za-z_]\\w*)\\s*=\\s*([^;{}]+);', 'g');
  const zero = new RegExp('^(?:(?:\\(' + scalar + '\\)\\s*)?0(?:\\.0*)?[fu]?|' + scalar + '\\(\\s*0(?:\\.0*)?[fu]?\\s*\\)|\\(0(?:\\.0*)?\\)\\.[xyzwrgba]{1,4}|false)$');
  for (const m of [...maskComments(text).matchAll(pattern)].reverse()) {
    if (!zero.test(m[3]!.trim())) continue;
    const start = m.index!, end = start + m[0].length, name = m[2]!, mask = maskComments(text);
    if (!/[;{}]$/.test(mask.slice(0, start).trimEnd())) continue;
    const at = references(mask, name, end)[0]; if (at === undefined) continue;
    const between = mask.slice(end, at), head = /^\s*=(?!=)/.exec(mask.slice(at + name.length));
    if (!head || control.test(between) || /\breturn\b/.test(between) || !/^\s*$/.test(between.slice(between.lastIndexOf(';') + 1))) continue;
    const stop = mask.indexOf(';', at); if (stop < 0 || references(mask.slice(at + name.length + head[0].length, stop), name, 0).length) continue;
    text = text.slice(0, at) + m[1]! + ' ' + text.slice(at);
    text = text.slice(0, start) + text.slice(end);
  }
  return text;
}

export function simplifyHlslAuthoring(code: string, authoredSource = ''): string {
  const functions = new Set(declarations(code, 'hlsl').filter(d => /\([^)]*\)\s*\{/.test(d.text)).map(d => d.name));
  const authored = new Set(maskComments(authoredSource).match(/\b[A-Za-z_]\w*\b/g) ?? []);
  for (const fn of declarations(code, 'hlsl').reverse()) {
    if (!functions.has(fn.name)) continue;
    const text = mergeInitializers(inlineLoads(fn.text, functions, authored));
    code = code.slice(0, fn.start) + text + code.slice(fn.end);
  }
  return code;
}
