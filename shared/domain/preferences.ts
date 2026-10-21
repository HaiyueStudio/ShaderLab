import { createProject, DEFAULT_CODE, BUFFER_CODE, SOUND_CODE, type CodeId, type ShaderLanguage } from './model.js';
import type { ShaderEnvironment } from '../ports/services.js';
export interface Preferences { locale:'zh-CN'|'en'; msaa:boolean; shaderLanguage:ShaderLanguage }
export const preferencesKey='haiyue.shaderlab.preferences.v1';
export const defaultPreferences:Readonly<Preferences>=Object.freeze({locale:'zh-CN',msaa:false,shaderLanguage:'wgsl'});
export function parsePreferences(source:string|null):Preferences {
  let value:Partial<Preferences>={};try{const parsed:unknown=JSON.parse(source??'{}');if(parsed&&typeof parsed==='object')value=parsed;}catch{}
  return {locale:value.locale==='en'?'en':'zh-CN',msaa:value.msaa===true,shaderLanguage:['wgsl','glsl','hlsl'].includes(value.shaderLanguage??'')?value.shaderLanguage!:'wgsl'};
}
export function preferredSource(pass:CodeId,language:ShaderLanguage):string {
  if(pass==='common')return '';
  if(language==='wgsl')return pass==='sound'?SOUND_CODE:pass==='image'?DEFAULT_CODE:BUFFER_CODE;
  if(pass==='sound')return language==='glsl'?'vec2 mainSound(int sampleIndex, float time) { return vec2(0.1 * sin(6.2831853 * 440.0 * time)); }':'float2 mainSound(int sampleIndex, float time) { return float2(0.1 * sin(6.2831853 * 440.0 * time), 0.1 * sin(6.2831853 * 440.0 * time)); }';
  if(pass!=='image')return language==='glsl'?'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 uv = fragCoord / iResolution.xy;\n  fragColor = vec4(uv, 0.5 + 0.5 * sin(iTime), 1.0);\n}':'float4 mainImage(float2 fragCoord) {\n  float2 uv = fragCoord / iResolution.xy;\n  return float4(uv, 0.5 + 0.5 * sin(iTime), 1.0);\n}';
  return language==='glsl'?`void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 uv = fragCoord / iResolution.xy;\n  fragColor = vec4(0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0)), 1.0);\n}`:`float4 mainImage(float2 fragCoord) {\n  float2 uv = fragCoord / iResolution.xy;\n  return float4(0.5 + 0.5 * cos(iTime + uv.xyx + float3(0.0, 2.0, 4.0)), 1.0);\n}`;
}
export function preferredProject(language:ShaderLanguage,environment:ShaderEnvironment) {
  const project=createProject('Untitled shader',environment);
  if(language!=='wgsl'){project.passes.find(pass=>pass.id==='image')![language]=preferredSource('image',language);project.editorLanguages={image:language};}
  return project;
}
