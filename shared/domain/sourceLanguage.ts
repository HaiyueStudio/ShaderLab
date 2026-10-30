import { COMMON_SOURCE_FIELDS, SOURCE_FIELDS, SHADER_LANGUAGES, codeOf, passOf, type CodeId, type ShaderProject, type ShaderLanguage } from './model.js';

/** Ignore comments and require unambiguous language-specific syntax. */
export function detectShaderLanguage(source: string, preferred?: ShaderLanguage): ShaderLanguage | null {
  const text = source.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');
  if (/\b(?:extension|implementing|__generic|This|associatedtype)\b|\[\s*(?:Differentiable|BackwardDifferentiable)\s*\]|\bfunc\s+|\b\w+\s+\w+\s*<\s*(?:typename\s+)?[A-Z]\w*\s*>\s*\(/.test(text)) return 'slang';
  if (/\bfunction\s+\w+|\b(?:const|let)\s+\w+\s*:\s*(?:number|boolean)|\bMath\.|\bgpu\./.test(text)) return 'typescript';
  if (/\binterface\s+\w+/.test(text)) return preferred==='slang'?'slang':'typescript';
  const hlsl = /\b(?:float|half|int|uint|bool)[234](?:x[234])?\b|\b(?:Texture(?:1D|2D|3D|Cube)|SamplerState|cbuffer)\b|:\s*SV_\w+\b|\[\s*shader\s*\(/.test(text);
  const wgsl = /\bfn\s+\w+\s*\(|\b(?:var|let|const)(?:\s*<[^>]+>\s*|\s+)\w+\s*:|\b(?:var|let)\s+\w+\s*=|@(?:fragment|vertex|group|binding)\b|\bvec[234][fiu]\s*\(|\b(?:vec[234]|mat[234]x[234]|array|ptr|atomic)\s*<|\balias\s+\w+\s*=|\bstruct\s+\w+\s*\{\s*(?:@\w+\s*(?:\([^)]*\))?\s*)*\w+\s*:/.test(text);
  const glsl = /^\s*#\s*(?:define|version|if|ifdef|ifndef)\b/m.test(text) || /\b(?:void|float|int|uint|bool|[biu]?vec[234]|mat[234](?:x[234])?|sampler2D|samplerCube)\s+\w+\s*(?:\(|=|;|\[|,)|\bprecision\s+(?:highp|mediump|lowp)\b/.test(text);
  if (hlsl) return wgsl || /\b(?:[biu]?vec[234]|mat[234]|sampler2D|samplerCube)\b/.test(text) ? null : preferred === 'slang' ? 'slang' : 'hlsl';
  if (!wgsl && glsl && preferred === 'hlsl' && !/\b(?:[biu]?vec[234]|mat[234]|sampler2D|samplerCube|precision)\b|#\s*version\b/.test(text)) return 'hlsl';
  return wgsl === glsl ? null : wgsl ? 'wgsl' : 'glsl';
}
export function languageOf(project: Readonly<ShaderProject>, pass: CodeId): ShaderLanguage {
  return project.editorLanguages?.[pass] ?? SHADER_LANGUAGES.slice().reverse().find(language=>language!=='wgsl'&&(pass==='common'?project[COMMON_SOURCE_FIELDS[language]]:passOf(project as ShaderProject,pass)[SOURCE_FIELDS[language]])!==undefined) ?? 'wgsl';
}
export function sourceOf(project: Readonly<ShaderProject>, pass: CodeId): string {
  const language=languageOf(project,pass);
  return (pass==='common'?project[COMMON_SOURCE_FIELDS[language]]:passOf(project as ShaderProject,pass)[SOURCE_FIELDS[language]])??'';
}

export function defaultHlsl(pass: CodeId) {
  if (pass === 'common') return '';
  if (pass === 'sound') return 'float2 mainSound(int sampleIndex, float time) {\n  return float2(0.2 * sin(6.2831853 * 440.0 * time));\n}\n';
  return 'float4 mainImage(float2 fragCoord) {\n  float2 uv = fragCoord / iResolution.xy;\n  float3 color = 0.5 + 0.5 * cos(iTime + uv.xyx + float3(0.0, 2.0, 4.0));\n  return float4(color, 1.0);\n}\n';
}
export function defaultGlsl(pass: CodeId) {
  if (pass === 'common') return '';
  if (pass === 'sound') return 'vec2 mainSound(int sampleIndex, float time) {\n  return vec2(0.2 * sin(6.2831853 * 440.0 * time));\n}\n';
  return 'void mainImage(out vec4 fragColor, in vec2 fragCoord) {\n  vec2 uv = fragCoord / iResolution.xy;\n  vec3 color = 0.5 + 0.5 * cos(iTime + uv.xyx + vec3(0.0, 2.0, 4.0));\n  fragColor = vec4(color, 1.0);\n}\n';
}
