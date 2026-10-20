import { languageOf, sourceOf } from './sourceLanguage.js';
import { refreshProjectGlsl } from './glslProject.js';
import { channelTypes, passOf, type ShaderProject, type ShaderDiagnostic, type CodeId } from './model.js';
import type { HlslTranslator, HlslTranslationOptions } from './hlslTypes.js';
import { passCommon } from './channelBindings.js';

export function projectHlslOptions(project: ShaderProject, pass: CodeId): HlslTranslationOptions {
  if (pass === 'common') return { entryPoint: 'common' };
  return { entryPoint: pass === 'sound' ? 'sound' : 'image', common: languageOf(project, 'common') === 'hlsl' ? sourceOf(project, 'common') : '', channelTypes: channelTypes(passOf(project, pass).channels) };
}

/** Work only on a renderer/export snapshot; authored drafts are never replaced
 * by generated WGSL or by another language's Common cache. */
export async function refreshProjectSources(project: ShaderProject, hlsl?: HlslTranslator): Promise<ShaderDiagnostic[]> {
  const diagnostics: ShaderDiagnostic[] = [];
  const commonLanguage = languageOf(project, 'common'), common = sourceOf(project, 'common');
  const enabled = [...project.passes, project.sound].filter(p => p.enabled);
  for (const pass of enabled) {
    const language = languageOf(project, pass.id);
    if (common.trim() && !(language === 'wgsl' && !passCommon(pass, common))
      && ((language === 'hlsl') !== (commonLanguage === 'hlsl'))) diagnostics.push({ pass: pass.id, language, severity: 'error', line: 1, column: 1, message: 'HLSL Pass 和非空 Common 必须同时选择 HLSL；请切换 Common 语言，或清空当前 Common。' });
  }
  if (diagnostics.length) return diagnostics;
  if (commonLanguage === 'hlsl') project.common = '';
  diagnostics.push(...refreshProjectGlsl(project));
  if (diagnostics.length) return diagnostics;
  for (const pass of [...project.passes, project.sound]) {
    if (languageOf(project, pass.id) !== 'hlsl' || !pass.enabled) continue;
    if (!hlsl) { diagnostics.push({ pass: pass.id, language: 'hlsl', severity: 'error', line: 1, column: 1, message: 'HLSL 编译器尚未就绪，请重新运行。' }); continue; }
    const result = await hlsl(pass.hlsl ?? '', { entryPoint: pass.id === 'sound' ? 'sound' : 'image', common: commonLanguage === 'hlsl' ? common : '', channelTypes: channelTypes(pass.channels) });
    if (result.code !== null) pass.code = result.code;
    else diagnostics.push(...result.diagnostics.map(d => ({ pass: d.source === 'common' ? 'common' as const : pass.id, language: 'hlsl' as const, severity: 'error' as const, line: d.line, column: d.column, message: 'HLSL: ' + d.message })));
  }
  return diagnostics;
}
