import { translateHlsl } from '../../web/src/hlsl.js';
Object.assign(window, { nativeHlslCompiler: { translate: translateHlsl } });
