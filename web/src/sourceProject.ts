import { languageOf, sourceOf } from './sourceLanguage.js';
import { refreshProjectGlsl } from './glslProject.js';
import { passOf, type ShaderProject, type ShaderDiagnostic, type CodeId } from './model.js';
import type { HlslTranslator, HlslTranslationOptions } from './hlslTypes.js';
import { passCommon, resolveChannelBindings } from './channelBindings.js';
import { externalCommon, glslCommon, hlslCommon, type WgslTranslator } from './sourceCommon.js';
import {normalizeExtendedSources} from './extendedSources.js';
export {normalizeExtendedSources} from './extendedSources.js';

export async function projectHlslOptions(project: ShaderProject, pass: CodeId, wgsl?: WgslTranslator): Promise<HlslTranslationOptions> {
  if (pass === 'common') return { entryPoint: 'common' };
  const common=sourceOf(project,'common');
  if(common.trim()&&languageOf(project,'common')!=='hlsl'&&!wgsl)throw Error('转换当前 Common 为 HLSL 需要本地转换服务。');
  const library=await hlslCommon(project,pass,wgsl);
  return { entryPoint: pass === 'sound' ? 'sound' : 'image', common: library, channelTypes: resolveChannelBindings({...passOf(project,pass),code:sourceOf(project,pass)},library).dimensions };
}

/** Work only on a renderer/export snapshot; authored drafts are never replaced
 * by generated WGSL or by another language's Common cache. */
export async function refreshProjectSources(project: ShaderProject, hlsl?: HlslTranslator, wgsl?: WgslTranslator): Promise<ShaderDiagnostic[]> {
  const authoringLanguages=new Map([...project.passes,project.sound].map(pass=>[pass.id,languageOf(project,pass.id)]));
  const extended=await normalizeExtendedSources(project,wgsl);if(extended.length)return extended;
  const diagnostics: ShaderDiagnostic[] = [];
  const commonLanguage = languageOf(project, 'common'), common = sourceOf(project, 'common');
  const enabled = [...project.passes, project.sound].filter(p => p.enabled);
  for (const pass of enabled) {
    const language = languageOf(project, pass.id);
    if (common.trim() && !((language === 'wgsl' || language === 'glsl') && !passCommon({...pass,code:sourceOf(project,pass.id)}, common))
      && ((language !== 'hlsl' && commonLanguage === 'hlsl') || (language === 'hlsl' && commonLanguage !== 'hlsl' && !wgsl))) diagnostics.push({ pass: pass.id, language, severity: 'error', line: 1, column: 1, message: 'HLSL Common 需要搭配 HLSL Pass；跨语言 Common 需要本地转换服务。' });
  }
  if (diagnostics.length) return diagnostics;
  if (commonLanguage === 'hlsl') project.common = '';
  const libraries = new Map<CodeId, string>();
  for (const pass of [...project.passes, project.sound]) {
    if (languageOf(project, pass.id) !== 'glsl' || !externalCommon(pass.glsl ?? '')) continue;
    if (!wgsl) continue;
    try { libraries.set(pass.id, await glslCommon(project, pass.id, wgsl)); }
    catch (error) { if (pass.enabled) diagnostics.push({pass:'common', severity:'error', line:1,column:1,message:String(error)}); }
  }
  if (diagnostics.length) return diagnostics;
  diagnostics.push(...refreshProjectGlsl(project, libraries));
  if (diagnostics.length) return diagnostics;
  for (const pass of [...project.passes, project.sound]) {
    if (languageOf(project, pass.id) !== 'hlsl' || !pass.enabled) continue;
    if (!hlsl) { diagnostics.push({ pass: pass.id, language: 'hlsl', severity: 'error', line: 1, column: 1, message: 'HLSL 编译器尚未就绪，请重新运行。' }); continue; }
    let options:HlslTranslationOptions;
    try {options=await projectHlslOptions(project,pass.id,wgsl);}
    catch(error){diagnostics.push({pass:'common',language:commonLanguage,severity:'error',line:1,column:1,message:String(error instanceof Error?error.message:error)});continue;}
    const result = await hlsl(pass.hlsl ?? '', options);
    if (result.code !== null) pass.code = result.code;
    else {const language:'slang'|'hlsl'=authoringLanguages.get(pass.id)==='slang'?'slang':'hlsl';diagnostics.push(...result.diagnostics.map(d => ({ pass: d.source === 'common' ? 'common' as const : pass.id, language, severity: 'error' as const, line: d.line, column: d.column, message: (language==='slang'?'Slang: ':'HLSL: ') + d.message })));}
  }
  return diagnostics;
}
