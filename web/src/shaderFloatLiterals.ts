import { maskComments } from './wgslModules.js';

/** Shorten compiler-generated, explicitly f32 literals. Every replacement must
 * round back to the same f32; abstract floats, f16, integers and bitcasts stay intact.
 */
export function compactWgslFloatLiterals(source: string): string {
  const mask = maskComments(source);
  return source.replace(
    /[A-Za-z_]\w*|0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?[fh]?|(?:\d+\.\d*|\.\d+|\d+)(?:[eE][+-]?\d+)?[fhiu]?/g,
    (token, at: number) => {
      if (mask.slice(at, at + token.length) !== token || !/^(?:\d|\.)/.test(token)
        || token.startsWith('0x') || token.startsWith('0X') || !token.endsWith('f')
        || /[\w.]/.test(source[at + token.length] ?? '')) return token;
      const number = Number(token.slice(0, -1)), value = Math.fround(number);
      if (!Number.isFinite(value) || (value === 0 && /[1-9]/.test(token.split(/[eE]/)[0]!))) return token;
      // Nine significant decimal digits suffice to round-trip any finite f32.
      for (let digits = 1; digits <= 9; digits++) {
        const candidate = Number(value.toPrecision(digits));
        if (!Object.is(Math.fround(candidate), value)) continue;
        const decimal = String(candidate), scientific = candidate.toExponential().replace('e+', 'e');
        const literal = (text: string) => /[.e]/.test(text) ? text + 'f' : text + '.0f';
        const choices = [literal(decimal), literal(scientific)].sort((a, b) => a.length - b.length);
        return choices[0]!.length < token.length ? choices[0]! : token;
      }
      return token;
    },
  );
}
