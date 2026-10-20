import { cleanOutputDirectory, haiyuePlugins } from '../config/rollup.shared.js';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

// The compiler is lazy-loaded and its WASM is local in web, PWA and Electron.
const nagaAsset = {
  name: 'shader-naga-asset',
  resolveId(id) { if (id === 'naga-wasm/naga_bg.wasm') return '\0naga-asset'; },
  load(id) {
    if (id !== '\0naga-asset') return null;
    const ref = this.emitFile({ type: 'asset', name: 'naga_bg.wasm', source: readFileSync(fileURLToPath(import.meta.resolve('naga-wasm/naga_bg.wasm'))) });
    return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
  },
};
const slangAsset = {
  name: 'shader-slang-asset',
  buildStart() {
    const root = new URL('../vendor/slang-2026.19/', import.meta.url);
    for (const name of ['LICENSE', ...readdirSync(new URL('LICENSES/', root)).map(n => 'LICENSES/' + n), ...readdirSync(new URL('third-party-notices/', root)).map(n => 'third-party-notices/' + n)])
      this.emitFile({ type: 'asset', fileName: 'licenses/slang/' + name, source: readFileSync(new URL(name, root)) });
  },
  resolveId(id) { if (id === 'shaderlab:slang-wasm') return '\0slang-asset'; if (id === 'node:module') return { id, external: true }; },
  load(id) {
    if (id !== '\0slang-asset') return null;
    const ref = this.emitFile({ type: 'asset', name: 'slang-2026.19.wasm', source: readFileSync(new URL('../vendor/slang-2026.19/slang-wasm.wasm', import.meta.url)) });
    return `export default import.meta.ROLLUP_FILE_URL_${ref};`;
  },
};

export default {
  input: 'src/main.ts',
  output: { dir: 'web', format: 'es', entryFileNames: 'main.js', chunkFileNames: 'chunks/[name]-[hash].js', sourcemap: false },
  plugins: [cleanOutputDirectory('web'), nagaAsset, slangAsset, ...haiyuePlugins({ tsconfig: './tsconfig.web.json', declaration: false, minify: true, mangle: true })],
};
