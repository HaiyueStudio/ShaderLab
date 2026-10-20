import createSlang from '../../vendor/slang-2026.19/slang-wasm.js';
import wasmUrl from 'shaderlab:slang-wasm';

/** The mobile build replaces this asset module with an embedded data URL. No shader
 * source, file handles or GPU objects leave the compiler page. */
export async function loadSlang() {
  const response = await fetch(wasmUrl);
  if (!response.ok) throw Error('HLSL 编译器资源加载失败。');
  const bytes = await response.arrayBuffer();
  return createSlang({ wasmBinary: new Uint8Array(bytes), locateFile: () => wasmUrl });
}
