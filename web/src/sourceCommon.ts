import { languageOf, sourceOf } from './sourceLanguage.js';
import { translateGlsl } from './glsl.js';
import { passOf, type CodeId, type ShaderProject } from './model.js';
import type { WgslTranslationOptions, WgslTranslationResult } from './wgsl.js';
import { wgslBuiltins, writtenWgslBuiltins } from './wgslBuiltins.js';
import { declarations, renameIdentifiers } from './wgslModules.js';
import { passCommon } from './channelBindings.js';

export type WgslTranslator = (source: string, options: WgslTranslationOptions) => Promise<WgslTranslationResult>;
export const externalCommon = (source: string) => /^\s*\/\/ @haiyue-common-external(?:\r?\n|$)/.test(source);
export function requireTranslation(result: WgslTranslationResult) {
  if (result.code === null) throw Error(result.diagnostics.map(d => `${d.source === 'common' ? 'Common ' : ''}${d.line}:${d.column} ${d.message}`).join('\n'));
  return result.code;
}
export function commonWgsl(project: Readonly<ShaderProject>): string {
  const source = sourceOf(project, 'common'), language = languageOf(project, 'common');
  if (!source.trim()) return '';
  if (language === 'hlsl') throw Error('HLSL Common 暂不支持转换为 GLSL。');
  return language === 'glsl' ? requireTranslation(translateGlsl(source, { entryPoint: 'common' })) : source;
}
const caches = new WeakMap<WgslTranslator, Map<string, Promise<string>>>();
/** Derive the current Common in HLSL without changing its editor language. */
export async function hlslCommon(project: Readonly<ShaderProject>, pass: CodeId, compiler?: WgslTranslator) {
  const source=sourceOf(project,'common');
  if(pass!=='common'&&!passCommon({...passOf(project as ShaderProject,pass),code:sourceOf(project,pass)},'Common'))return '';
  const separate=pass!=='common'&&externalCommon(sourceOf(project,pass));
  if(!source.trim())return source;
  if(languageOf(project,'common')==='hlsl'){
    if(!separate)return source;
    const names=Object.fromEntries(declarations(source,'hlsl').map(d=>[d.name,'slCommonX'+[...d.name].map(c=>c.charCodeAt(0).toString(16).padStart(2,'0')).join('')+'Z']));
    return renameIdentifiers(source,names);
  }
  if(!compiler)throw Error('转换当前 Common 为 HLSL 需要本地转换服务。');
  const common=commonWgsl(project),channels=pass==='common'?undefined:passOf(project as ShaderProject,pass).channels;
  const key=JSON.stringify(['hlsl',common,separate,channels?.map(c=>c.kind==='cubemap'?'cube':'2d')]);
  let cache=caches.get(compiler);if(!cache){cache=new Map();caches.set(compiler,cache);}
  let value=cache.get(key);
  if(!value){
    value=compiler(separate?'fn mainImage(p:vec2f)->vec4f{return vec4f(0.0);}':common,{
      target:'hlsl',entryPoint:separate?'image':'common',...(channels?{channels}:{}),
      ...(separate?{common,commonMode:'separate' as const}:{}),
    }).then(result=>{
      const code=requireTranslation(result);
      if(separate&&result.common===undefined)throw Error('转换器未返回独立 HLSL Common。');
      return separate?result.common!:code;
    }).catch(error=>{cache!.delete(key);throw error;});
    if(cache.size>=8)cache.delete(cache.keys().next().value!);cache.set(key,value);
  }
  return value;
}
/** Derived library belongs only to the compile/export snapshot. Common's editor
 * source remains untouched, and a source/dimension change invalidates the cache. */
export async function glslCommon(project: Readonly<ShaderProject>, pass: CodeId, compiler: WgslTranslator) {
  const common = commonWgsl(project);
  if (!common.trim()) return '';
  const channels = pass === 'common' ? undefined : passOf(project as ShaderProject, pass).channels;
  const source = sourceOf(project, pass);
  // A saved external GLSL Pass explicitly refers to the aliases it needs.
  // Also support exporting a freshly converted WGSL snapshot before saving.
  const preserveBuiltinAliases = languageOf(project, pass) === 'wgsl' ? writtenWgslBuiltins(source)
    : wgslBuiltins.filter(name => new RegExp(`\\bslLink${name}\\b`).test(source));
  const sound = pass === 'sound';
  const key = JSON.stringify([common, sound, preserveBuiltinAliases, channels?.map(c => c.kind === 'cubemap' ? 'cube' : '2d')]);
  let cache = caches.get(compiler);
  if (!cache) { cache = new Map(); caches.set(compiler, cache); }
  let value = cache.get(key);
  if (!value) {
    value = compiler(sound ? 'fn mainSound(s: i32, t: f32) -> vec2f { return vec2f(0.0); }' : 'fn mainImage(p: vec2f) -> vec4f { return vec4f(0.0); }', {
      common, ...(channels ? {channels} : {}), commonMode: 'separate', entryPoint: sound ? 'sound' : 'image', preserveBuiltinAliases,
    }).then(result => {
      requireTranslation(result);
      if (result.common === undefined) throw Error('转换器未返回独立 Common。');
      return result.common;
    }).catch(error => { cache!.delete(key); throw error; });
    if (cache.size >= 8) cache.delete(cache.keys().next().value!);
    cache.set(key, value);
  }
  return value;
}
