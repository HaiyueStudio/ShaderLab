/** Project values are JSON data. No platform structuredClone/TextEncoder dependency. */
export function cloneValue<T>(value: T): T {
  if (Array.isArray(value)) {
    const copy = new Array(value.length);
    for (let i = 0; i < value.length; i++) if (i in value) copy[i] = cloneValue(value[i]);
    return copy as T;
  }
  if (value !== null && typeof value === 'object') {
    // Avoid an entries array, mapping closure and two temporary key/value
    // tuples per property. Native jitless V8 pays for those allocations on
    // every compile/recovery snapshot, even when no UI node changes.
    const copy: Record<string, unknown> = {};
    for (const key in value) {
      if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
      const item = cloneValue((value as Record<string, unknown>)[key]);
      // Preserve Object.fromEntries semantics for JSON containing this key;
      // assignment would invoke Object.prototype's legacy prototype setter.
      if (key === '__proto__') Object.defineProperty(copy, key, { value: item, enumerable: true, writable: true, configurable: true });
      else copy[key] = item;
    }
    return copy as T;
  }
  return value;
}

export function utf8Length(text: string): number {
  let bytes = 0;
  for (const character of text) {
    const point = character.codePointAt(0)!;
    bytes += point <= 0x7f ? 1 : point <= 0x7ff ? 2 : point <= 0xffff ? 3 : 4;
  }
  return bytes;
}
