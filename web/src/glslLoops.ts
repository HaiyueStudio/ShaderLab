import { declarations, maskComments } from './wgslModules.js';

function endOf(text: string, start: number, open: string, close: string): number {
  let depth = 0;
  for (let at = start; at < text.length; at++) {
    if (text[at] === open) depth++;
    if (text[at] === close && --depth === 0) return at + 1;
  }
  return -1;
}
function substitute(text: string, names: Record<string, string>): string {
  return text.replace(/\b[A-Za-z_]\w*\b/g, (name, at: number) =>
    /\.\s*$/.test(text.slice(0, at)) ? name : names[name] ?? name);
}
function unparenthesize(text: string): string {
  text = text.trim();
  while (text[0] === '(' && endOf(text, 0, '(', ')') === text.length) text = text.slice(1, -1).trim();
  return text;
}
type Language = 'glsl' | 'hlsl';
const types = {
  glsl: '(?:bool|int|uint|float|[biu]?vec[234])',
  hlsl: '(?:bool|int|uint|float|half)(?:[234](?:x[234])?)?',
};
function pure(text: string, language: Language): boolean {
  if (/\+\+|--|(?:^|[^=!<>])=(?!=)/.test(text)) return false;
  return [...text.matchAll(/\b([A-Za-z_]\w*)\s*\(/g)].every(m =>
    new RegExp('^' + types[language] + '$').test(m[1]!) || language === 'hlsl' && /^(?:asint|asuint|asfloat)$/.test(m[1]!));
}
/** Only fold side-effect-free SSA loads. Calls/pointer updates retain Naga's
 * ordering instead of relying on GLSL's unspecified operand evaluation order. */
function loads(text: string, language: Language) {
  const names: Record<string, string> = {};
  const declaration = new RegExp('^\\s*(?:const\\s+)?' + types[language] + '\\s+(_e\\d+\\w*)\\s*=\\s*([^;{}]+);');
  for (;;) {
    const m = declaration.exec(text); if (!m) break;
    const value = substitute(m[2]!, names); if (!pure(value, language)) return undefined;
    names[m[1]!] = /^\w+(?:\.[xyzw]+)?$/.test(value.trim()) ? value.trim() : '(' + value + ')';
    text = text.slice(m[0].length);
  }
  return { rest: text, names };
}
function loopCondition(text: string, language: Language) {
  const condition = loads(text, language); if (!condition) return undefined;
  const guard = /^\s*if\s*\(/.exec(condition.rest); if (!guard) return undefined;
  const end = endOf(condition.rest, guard[0].lastIndexOf('('), '(', ')'); if (end < 0) return undefined;
  const stop = /^\s*\{\s*\}\s*else\s*\{\s*break;\s*\}/.exec(condition.rest.slice(end)); if (!stop) return undefined;
  const test = unparenthesize(substitute(condition.rest.slice(guard[0].length, end - 1), condition.names));
  const length = text.length - condition.rest.length + end + stop[0].length;
  if (!pure(test, language) || Object.keys(condition.names).some(name => new RegExp('\\b' + name + '\\b').test(text.slice(length)))) return undefined;
  return { test, length };
}

/** Recover a normal GLSL for from Naga's first-iteration/continuing scaffold.
 * The update moves to the for header, so continue still executes it exactly once.
 * Complex continuing blocks keep the original scaffold; effectful conditions
 * stay at the start of the body, preserving the order of loads and calls.
 */
export function restoreGlslForLoops(code: string): string {
  return restoreForLoops(code, 'glsl');
}

/** HLSL also includes Naga's finite iteration guard and wrapping integer math.
 * Keep both, including skipping the update when the iteration budget runs out.
 */
export function restoreHlslForLoops(code: string): string {
  return restoreForLoops(code, 'hlsl');
}

function restoreForLoops(code: string, language: Language): string {
  for (const fn of declarations(code, language).reverse()) {
    if (!/\([^)]*\)\s*\{/.test(fn.text)) continue;
    let text = fn.text;
    const candidates = [...maskComments(text).matchAll(/\bbool\s+(loop_init\w*)\s*=\s*true;\s*while\s*\(\s*true\s*\)\s*\{/g)].reverse();
    for (const candidate of candidates) {
      const mask = maskComments(text), start = candidate.index!, flag = candidate[1]!;
      if ([...mask.matchAll(new RegExp('\\b' + flag + '\\b', 'g'))].length !== 3) continue;
      const open = start + candidate[0].lastIndexOf('{'), end = endOf(mask, open, '{', '}'); if (end < 0) continue;
      let loop = mask.slice(open + 1, end - 1), prefixLength = 0, boundDeclaration = '', exhausted = '', decrement = '';
      let before = text.slice(0, start);
      if (language === 'hlsl') {
        const bound = /\buint2\s+(loop_bound\w*)\s*=\s*uint2\(4294967295u,\s*4294967295u\);\s*$/.exec(before);
        if (bound && [...mask.matchAll(new RegExp('\\b' + bound[1] + '\\b', 'g'))].length === 4) {
          const name = bound[1]!;
          const guard = new RegExp('^\\s*if\\s*\\(all\\(' + name + '\\s*==\\s*uint2\\(0u,\\s*0u\\)\\)\\)\\s*\\{\\s*break;\\s*\\}\\s*(' + name + '\\s*-=\\s*uint2\\(' + name + '\\.y\\s*==\\s*0u,\\s*1u\\);)').exec(loop);
          if (guard) {
            boundDeclaration = before.slice(bound.index); before = before.slice(0, bound.index);
            exhausted = 'all(' + name + ' == uint2(0u, 0u))'; decrement = guard[1]!;
            prefixLength = guard[0].length; loop = loop.slice(prefixLength);
          }
        }
        // A complex continuing block can still retain for syntax verbatim,
        // without moving any statement across Naga's guard or first-entry flag.
        text = text.slice(0, open + 1).replace(/while\s*\(\s*true\s*\)\s*\{$/, original => 'for (;;) {'.padEnd(original.length, ' ')) + text.slice(open + 1);
        // Replacement has the same length, keeping the structural offsets valid.
      }
      const advance = new RegExp('^\\s*if\\s*\\(\\s*!' + flag + '\\s*\\)\\s*\\{').exec(loop); if (!advance) continue;
      const advanceEnd = endOf(loop, advance[0].lastIndexOf('{'), '{', '}'); if (advanceEnd < 0) continue;
      const update = loads(loop.slice(advance[0].length, advanceEnd - 1), language); if (!update) continue;
      const assignment = /^\s*([A-Za-z_]\w*)\s*=\s*([^;{}]+);\s*$/.exec(update.rest); if (!assignment) continue;
      const counter = assignment[1]!, rhs = substitute(assignment[2]!, update.names); if (!pure(rhs, language)) continue;
      const reset = new RegExp('^\\s*' + flag + '\\s*=\\s*false;').exec(loop.slice(advanceEnd)); if (!reset) continue;
      const conditionStart = advanceEnd + reset[0].length;
      // An effectful condition stays at the top of the body; for's condition
      // can be empty without changing first-entry or continuing semantics.
      const condition = loopCondition(loop.slice(conditionStart), language);
      let step = counter + ' = ' + rhs;
      const increment = new RegExp('^' + counter + '\\s*([+-])\\s*1u?$').exec(unparenthesize(rhs));
      if (increment) step = counter + (increment[1] === '+' ? '++' : '--');
      const after = text.slice(end); let init = '';
      // Move the declaration into the header only if its scope can end here.
      const declaration = new RegExp('(' + types[language] + '\\s+' + counter + '\\s*=\\s*[^;{}]+);\\s*$').exec(before);
      if (declaration && !new RegExp('\\b' + counter + '\\b').test(mask.slice(end))) {
        init = declaration[1]!.trim(); before = before.slice(0, declaration.index);
      }
      const bodyOffset = prefixLength + conditionStart + (condition?.length ?? 0);
      const body = text.slice(open + 1 + bodyOffset, end - 1);
      let test = condition?.test ?? '';
      if (exhausted) {
        test = '!' + exhausted + (test ? ' && (' + test + ')' : '');
        step = counter + ' = ' + exhausted + ' ? ' + counter + ' : (' + rhs + ')';
      }
      text = before + boundDeclaration + `for (${init}; ${test}; ${step}) {` + (decrement ? '\n        ' + decrement : '') + body + '}' + after;
    }
    code = code.slice(0, fn.start) + text + code.slice(fn.end);
  }
  return code;
}
