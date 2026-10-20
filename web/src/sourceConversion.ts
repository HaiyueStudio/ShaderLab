import { languageOf, sourceOf } from './sourceLanguage.js';
import { passOf, type ShaderProject } from './model.js';
import { translateGlsl } from './glsl.js';
import { projectTranslationOptions } from './glslProject.js';
import { projectHlslOptions } from './sourceProject.js';
import type { HlslTranslator } from './hlslTypes.js';
import type { WgslTranslationOptions, WgslTranslationResult } from './wgsl.js';
import type { ShaderSourceConverter } from '../../shared/dist/ports/services.js';

/** Compiler dependencies are supplied by Web or the native compiler bridge. */
export function createSourceConverter(compilers: {
  wgsl(code: string, options: WgslTranslationOptions): Promise<WgslTranslationResult>;
  hlsl: HlslTranslator;
}): ShaderSourceConverter {
  const resultCode = (result: WgslTranslationResult) => {
    if (result.code === null) throw Error(result.diagnostics.map(d =>
      `${d.source === 'common' ? 'Common ' : ''}${d.line}:${d.column} ${d.message}`).join('\n') || '代码转换失败。');
    return result.code;
  };
  return async (snapshot, pass, target) => {
    const project = snapshot as ShaderProject, from = languageOf(project, pass), source = sourceOf(project, pass);
    if (from === target || !source.trim()) return source;
    // Slang currently exposes HLSL -> runtime WGSL only. Never replace a work
    // with a sample, an empty Common or an unrelated saved language draft.
    if (target === 'hlsl') throw Error('当前转换器尚不支持生成 HLSL，已保留原代码和语言。');
    if (from === 'hlsl') {
      if (pass === 'common') throw Error('HLSL Common 需要与 Pass 一起编译，暂不支持单独转换。');
      if (target !== 'wgsl') throw Error('HLSL 目前只能转换为运行用 WGSL，暂不支持转换为 GLSL。');
      return resultCode(await compilers.hlsl(source, projectHlslOptions(project, pass)));
    }
    if (target === 'wgsl') return resultCode(translateGlsl(source, projectTranslationOptions(project, pass)));
    if (pass === 'common') throw Error('暂不支持单独将 WGSL Common 转换为 GLSL，请在 Image / Buffer / Sound 中转换，Common 会一起合并。');
    let common = sourceOf(project, 'common');
    if (common.trim() && languageOf(project, 'common') === 'hlsl'
      && !source.includes('// @haiyue-common-included'))
      throw Error('当前 Pass 依赖 HLSL Common，暂不支持转换为 GLSL。');
    if (languageOf(project, 'common') === 'glsl')
      common = resultCode(translateGlsl(common, { entryPoint: 'common' }));
    const code = resultCode(await compilers.wgsl(source, {
      entryPoint: pass === 'sound' ? 'sound' : 'image', common, channels: passOf(project, pass).channels,
    }));
    // The reverse compiler includes Common in its output. Preserve that fact
    // across rendering, future conversions and project export/reopen.
    return '// @haiyue-common-included\n' + code;
  };
}
