import { maskComments } from './wgslModules.js';

export const wgslBuiltins = ['iResolution', 'iTime', 'iTimeDelta', 'iFrame', 'iFrameRate', 'iMouse', 'iDate', 'iSampleRate', 'iChannelResolution', 'iChannelTime', 'iParams'];

/** Conservative write/address detection. A false positive only retains a copy.
 * Taking an address also counts: a helper may mutate through the pointer. */
export function writtenWgslBuiltins(source: string): string[] {
  const text = maskComments(source), written = new Set<string>();
  for (const match of text.matchAll(/\b[A-Za-z_]\w*\b/g)) {
    const name = match[0];
    if (!wgslBuiltins.includes(name)) continue;
    if (/&\s*\(*\s*$/.test(text.slice(0, match.index))) { written.add(name); continue; }
    let at = match.index + name.length;
    while (at < text.length) {
      const close = /^\s*\)/.exec(text.slice(at));
      if (close) { at += close[0].length; continue; }
      const member = /^\s*\.\s*[A-Za-z_]\w*/.exec(text.slice(at));
      if (member) { at += member[0].length; continue; }
      const index = /^\s*\[/.exec(text.slice(at));
      if (!index) break;
      at += index[0].length;
      let depth = 1;
      while (at < text.length && depth) {
        if (text[at] === '[') depth++;
        if (text[at] === ']') depth--;
        at++;
      }
    }
    if (/^\s*(?:=(?!=)|(?:[+\-*/%&|^]|<<|>>)=|\+\+|--)/.test(text.slice(at))) written.add(name);
  }
  return [...written];
}
