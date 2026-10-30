import { languageOf, sourceOf } from './sourceLanguage.js';
import { codeOf, passOf, type ShaderProject } from './model.js';
import { translateGlsl } from './glsl.js';
import { projectTranslationOptions } from './glslProject.js';
import { projectHlslOptions } from './sourceProject.js';
import type { HlslTranslator } from './hlslTypes.js';
import { hlslAuthoringWgsl } from './hlslAuthoring.js';
import type { WgslTranslationOptions, WgslTranslationResult } from './wgsl.js';
import type { ShaderSourceConverter } from '../../shared/dist/ports/services.js';
import { commonWgsl, externalCommon, glslCommon } from './sourceCommon.js';
import { declarations, detachCommon, renameIdentifiers } from './wgslModules.js';
import { compactShaderWhitespace } from './shaderWhitespace.js';
import { preserveShaderComments } from './shaderComments.js';
import { passCommon, resolveChannelBindings } from './channelBindings.js';
import {normalizeExtendedSources} from './extendedSources.js';

/** Compiler dependencies are supplied by Web or the native compiler bridge. */
export function createSourceConverter(compilers: {
  wgsl(code: string, options: WgslTranslationOptions): Promise<WgslTranslationResult>;
  hlsl: HlslTranslator;
}): ShaderSourceConverter {
  const resultCode = (result: WgslTranslationResult) => {
    if (result.code === null) throw Error(result.diagnostics.map(d =>
      `${d.source === 'common' ? 'Common ' : ''}${d.line}:${d.column} ${d.message}`).join('\n') || '代码转换失败。');
    return compactShaderWhitespace(result.code);
  };
  const convert: ShaderSourceConverter = async (snapshot, pass, target) => {
    const project = snapshot as ShaderProject, from = languageOf(project, pass), source = sourceOf(project, pass);
    if (from === target || !source.trim()) return source;
    if (target === 'hlsl') {
      let wgsl=from==='wgsl'?source:await convert(snapshot,pass,'wgsl');
      if(/^\s*\/\/ @haiyue-hlsl-module(?:\r?\n|$)/.test(wgsl))
        wgsl='// @haiyue-common-included\n'+hlslAuthoringWgsl(wgsl,pass==='sound');
      const included=pass!=='common'&&languageOf(project,'common')==='hlsl'&&!passCommon({...passOf(project,pass),code:wgsl},'Common');
      let common='';
      if(pass!=='common'&&!included){
        if(languageOf(project,'common')!=='hlsl'||!sourceOf(project,'common').trim())common=commonWgsl(project);
        else {
          // When Common was just converted, prove which retained WGSL/GLSL
          // source still matches it. An edited HLSL library must never fall
          // back to a stale other-language draft.
          const candidates=[project.common??''];
          if(project.commonGlsl!==undefined){const parsed=translateGlsl(project.commonGlsl,{entryPoint:'common'});if(parsed.code!==null)candidates.push(parsed.code);}
          let matched=false;
          for(const candidate of candidates){
            const translated=await compilers.wgsl(candidate,{entryPoint:'common',target:'hlsl'});
            if(translated.code!==null&&compactShaderWhitespace(translated.code)===compactShaderWhitespace(sourceOf(project,'common'))){common=candidate;matched=true;break;}
          }
          if(!matched)throw Error('当前 HLSL Common 已独立修改，无法安全转换仍引用其他语言 Common 的 Pass；已保留原代码。');
        }
      }
      const result=await compilers.wgsl(wgsl,{
        target:'hlsl',entryPoint:pass==='common'?'common':pass==='sound'?'sound':'image',
        ...(pass==='common'?{}:{common,commonMode:'separate',channels:passOf(project,pass).channels}),
      });
      const code=resultCode(result);
      // Validate the actual generated source before updating the document.
      resultCode(await compilers.hlsl(code,{entryPoint:pass==='common'?'common':pass==='sound'?'sound':'image',common:result.common??'',...(pass==='common'?{}:{channelTypes:resolveChannelBindings({...passOf(project,pass),code},result.common??'').dimensions})}));
      return included?'// @haiyue-common-included\n'+code:code;
    }
    if (from === 'hlsl') {
      if (pass === 'common') throw Error('HLSL Common 需要与 Pass 一起编译，暂不支持单独转换。');
      const options=await projectHlslOptions(project,pass,compilers.wgsl);
      const generated=resultCode(await compilers.hlsl(source,options));
      const shared=externalCommon(source)&&languageOf(project,'common')!=='hlsl'?commonWgsl(project):undefined;
      const included=Boolean(options.common?.trim())&&shared===undefined;
      const wgsl=compactShaderWhitespace(preserveShaderComments(source,(included?'// @haiyue-common-included\n':'')+hlslAuthoringWgsl(generated,pass==='sound',shared),{from:'hlsl',to:'wgsl'}));
      if(target==='wgsl')return wgsl;
      const code=resultCode(await compilers.wgsl(wgsl,{entryPoint:pass==='sound'?'sound':'image',channels:passOf(project,pass).channels,...(shared?{common:shared,commonMode:'separate'}:{})}));
      return included?'// @haiyue-common-included\n'+code:code;
    }
    if (target === 'wgsl') {
      // Recover the previous version's exact generated output only if the
      // retained WGSL reproduces it byte-for-byte. Never restore a stale draft
      // after a user has edited either the output or Common.
      if (pass !== 'common' && /^\s*\/\/ @haiyue-common-included(?:\r?\n|$)/.test(source) && /\/\/ Shadertoy GLSL ES 3\.00\b/.test(source)) {
        const retained = codeOf(project, pass);
        const previous = await compilers.wgsl(retained, {
          common: commonWgsl(project), entryPoint: pass === 'sound' ? 'sound' : 'image', channels: passOf(project, pass).channels,
          legacyEntryWrapper: true,
        });
        if (previous.code !== null && source === '// @haiyue-common-included\n' + previous.code) return retained;
      }
      if (pass !== 'common' && externalCommon(source)) {
        const common = await glslCommon(project, pass, compilers.wgsl);
        const linked = resultCode(translateGlsl(source, { ...projectTranslationOptions(project, pass), common }));
        const library = resultCode(translateGlsl(common, { entryPoint: 'common' }));
        const detached = detachCommon(linked, library);
        const names: Record<string, string> = {};
        for (const d of declarations(library, 'wgsl')) {
          const original = /slCommonX([0-9a-f]+)Z/.exec(d.name);
          if (original) names[d.name] = original[1]!.replace(/../g, hex => String.fromCharCode(parseInt(hex, 16)));
          else {
            const builtin = /^(?:hy_common_global_)?slLink(i\w+)$/.exec(d.name);
            if (builtin) names[d.name] = builtin[1]!;
          }
        }
        // The derived GLSL library also owns texture/derivative ABI helpers.
        // They are not definitions from the user's Common: keep the helpers
        // actually referenced by this Pass (and their dependency closure).
        let linkedPass=detached;
        const helpers=declarations(library,'wgsl').filter(d=>!names[d.name]&&!/\bslCommonX[0-9a-f]+Z\b/.test(d.name));
        const kept=new Set<string>();
        for(let changed=true;changed;){
          changed=false;
          for(const d of helpers)if(!kept.has(d.name)&&new RegExp(`\\b${d.name}\\b`).test(linkedPass)){
            kept.add(d.name);linkedPass=d.text+'\n'+linkedPass;changed=true;
          }
        }
        let code = renameIdentifiers(linkedPass, names);
        // The runtime wrapper initializes an external GLSL Common once before
        // the entry. Remove the generated GLSL entry's explicit second call.
        if (languageOf(project, 'common') === 'glsl')
          code = code.replace(/\bhy_common_library_init\s*\([^;]*\);/g, '');
        return compactShaderWhitespace(code);
      }
      return resultCode(translateGlsl(source, projectTranslationOptions(project, pass)));
    }
    if (pass === 'common') throw Error('暂不支持单独将 WGSL Common 转换为 GLSL，转换 Image / Buffer / Sound 时会保持 Common 独立。');
    const included=languageOf(project,'common')==='hlsl'&&!passCommon({...passOf(project,pass),code:source},'Common');
    const common = included?'':commonWgsl(project);
    const code = resultCode(await compilers.wgsl(source, {
      entryPoint: pass === 'sound' ? 'sound' : 'image', common, channels: passOf(project, pass).channels, commonMode: 'separate',
    }));
    return included?'// @haiyue-common-included\n'+code:code;
  };
  const legacy:ShaderSourceConverter=async (snapshot, pass, target) => {
    const from = languageOf(snapshot, pass), source = sourceOf(snapshot, pass);
    if (pass !== 'common' && from !== target && from !== 'hlsl' && target !== 'hlsl' && source.trim()) {
      const retained = target === 'wgsl' ? codeOf(snapshot, pass) : passOf(snapshot as ShaderProject, pass).glsl;
      // Language drafts are already serialized with the project. Reuse one
      // only when compiling it with *current* Common/channels reproduces the
      // current source exactly. Edits must never be replaced by a stale draft.
      if (retained?.trim() && !(target === 'glsl' && /@haiyue-common-included/.test(retained))) {
        try {
          const candidate = { ...snapshot, editorLanguages: { ...snapshot.editorLanguages, [pass]: target } };
          if (await convert(candidate, pass, from) === source) return retained;
        } catch { /* A stale/unsupported draft is not a conversion failure. */ }
      }
    }
    return convert(snapshot, pass, target);
  };
  return async(snapshot,pass,target)=>{
    const from=languageOf(snapshot,pass),source=sourceOf(snapshot,pass);
    if(from===target||!source.trim())return source;
    if(!['typescript','slang'].includes(from)&&!['typescript','slang'].includes(target)&&!['typescript','slang'].includes(languageOf(snapshot,'common')))return legacy(snapshot,pass,target);
    const project=JSON.parse(JSON.stringify(snapshot)) as ShaderProject;
    const errors=await normalizeExtendedSources(project,compilers.wgsl,pass);
    if(errors.length)throw Error(errors.map(d=>`${d.pass}:${d.line}:${d.column} ${d.message}`).join('\n'));
    if(target==='typescript'){
      const wgsl=await legacy(project,pass,'wgsl');
      const common=pass==='common'||!passCommon({...passOf(project,pass),code:wgsl},'Common')?'':commonWgsl(project);
      return resultCode(await compilers.wgsl(wgsl,{target:'typescript',entryPoint:pass==='common'?'common':pass==='sound'?'sound':'image',...(pass==='common'?{}:{common,channels:passOf(project,pass).channels})}));
    }
    if(from==='slang'&&target==='hlsl'){
      const code=await legacy(project,pass,'wgsl');if(pass==='common')throw Error('Slang Common 请与使用它的 Pass 一起转换。');
      passOf(project,pass).code=code;project.editorLanguages={...project.editorLanguages,[pass]:'wgsl'};
    }
    return legacy(project,pass,target==='slang'?'hlsl':target);
  };
}
