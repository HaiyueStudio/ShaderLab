/** Clean generated source only. Keep comment bodies and preprocessor
 * continuations intact; ordinary declarations retain one separating blank. */
export function compactShaderWhitespace(source: string): string {
  const output: string[] = [];
  let commentDepth = 0, continuation = false, pendingBlank = false;
  for (const line of source.replace(/\r\n/g, '\n').split('\n')) {
    const directive: boolean = continuation || /^\s*#/.test(line);
    let protectedLine = commentDepth > 0 || directive, quote = '';
    for (let at = 0; at < line.length; at++) {
      if (quote) {
        if (line[at] === '\\') at++;
        else if (line[at] === quote) quote = '';
        continue;
      }
      if (!commentDepth && (line[at] === '"' || line[at] === "'")) { quote = line[at]!; continue; }
      if (!commentDepth && line.startsWith('//', at)) break;
      if (line.startsWith('/*', at)) { commentDepth++; protectedLine = true; at++; }
      else if (commentDepth && line.startsWith('*/', at)) { commentDepth--; at++; }
    }
    continuation = directive && /\\$/.test(line);
    if (!protectedLine && !line.trim()) { pendingBlank = true; continue; }
    if (pendingBlank && output.length && !output.at(-1)!.trimEnd().endsWith('{') && !line.trimStart().startsWith('}')) output.push('');
    pendingBlank = false;
    output.push(protectedLine ? line : line.trimEnd());
  }
  return output.length ? output.join('\n') + '\n' : '';
}
