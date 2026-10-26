import {validateProject,type ShaderProject,type ShaderLanguage} from './model.js';
import {validateParameters,validValue,type ShaderParameter} from './parameters.js';
import {cloneValue,utf8Length} from './values.js';

export const CREATION_KINDS=['function','template','preset'] as const;
export type CreationKind=typeof CREATION_KINDS[number];
interface Base {id:string;name:string;description:string;tags:string[];favorite:boolean;updatedAt:string}
export type CreationItem=Base & ({kind:'function';sources:Partial<Record<ShaderLanguage,string>>}|{kind:'template';project:ShaderProject}|{kind:'preset';parameters:ShaderParameter[]});
export interface CreationBundle {format:'haiyue-shader-library';version:1;items:CreationItem[]}
export function validateCreation(value:unknown):CreationItem {
 const p=value as CreationItem,assert=(condition:unknown,message:string)=>{if(!condition)throw Error(message);};
 assert(p&&typeof p==='object'&&typeof p.id==='string'&&/^[\w-]{1,80}$/.test(p.id),'素材 ID 无效 / Invalid asset ID');
 assert(typeof p.name==='string'&&p.name.trim()&&p.name.length<=120,'素材名称须为 1–120 字 / Asset name required');
 assert(typeof p.description==='string'&&p.description.length<=2000&&typeof p.favorite==='boolean'&&typeof p.updatedAt==='string'&&Number.isFinite(Date.parse(p.updatedAt)),'素材信息无效 / Invalid asset metadata');
 assert(Array.isArray(p.tags)&&p.tags.length<=12&&p.tags.every(v=>typeof v==='string'&&v.trim()&&v.length<=30)&&new Set(p.tags).size===p.tags.length,'标签无效 / Invalid tags');
 if(p.kind==='template')validateProject(p.project);
 else if(p.kind==='preset'){validateParameters(p.parameters,undefined);assert(p.parameters.length>0,'没有可保存的参数 / No parameters to save');}
 else if(p.kind==='function'){
  assert(p.sources&&typeof p.sources==='object'&&!Array.isArray(p.sources)&&Object.keys(p.sources).length>0,'函数源码为空 / Empty function');
  for(const [lang,source] of Object.entries(p.sources))assert(['wgsl','glsl','hlsl'].includes(lang)&&typeof source==='string'&&source.trim()&&source.length<=100000&&!/\bmain(?:Image|Sound)\s*\(/.test(source),'只保存辅助函数，且每种语言不能超过 100 KB / Save helper functions only, up to 100 KB per language');
 }else throw Error('素材类型无效 / Invalid asset kind');
 return cloneValue(p);
}
export function parseCreationBundle(source:string):CreationBundle {
 if(utf8Length(source)>64*1024*1024)throw Error('素材包不能超过 64 MB / Library exceeds 64 MB');
 const p=JSON.parse(source) as CreationBundle;
 if(!p||p.format!=='haiyue-shader-library'||p.version!==1||!Array.isArray(p.items)||p.items.length>200)throw Error('不支持的素材包 / Unsupported library');
 const ids=new Set<string>(),items=p.items.map(value=>{const item=validateCreation(value);if(ids.has(item.id))throw Error('素材 ID 重复 / Duplicate asset ID');ids.add(item.id);return item;});
 return{format:p.format,version:1,items};
}
export function creationBundle(items:readonly CreationItem[]){const text=JSON.stringify({format:'haiyue-shader-library',version:1,items},null,2);parseCreationBundle(text);return text;}
export function filterCreations(items:readonly CreationItem[],kind:CreationKind,query='',favorites=false){const q=query.trim().toLocaleLowerCase();return items.filter(v=>v.kind===kind&&(!favorites||v.favorite)&&(!q||[v.name,v.description,...v.tags].join(' ').toLocaleLowerCase().includes(q))).sort((a,b)=>Number(b.favorite)-Number(a.favorite)||b.updatedAt.localeCompare(a.updatedAt)||a.name.localeCompare(b.name));}
/** Insert at module scope as one source edit; never place a declaration inside mainImage. */
export function insertCreationFunction(source:string,item:CreationItem,language:ShaderLanguage){
 if(item.kind!=='function'||!item.sources[language])throw Error('此函数没有当前语言版本 / No function for this language');
 const code=item.sources[language]!,clean=(v:string)=>v.replace(/\/\*[\s\S]*?\*\//g,' ').replace(/\/\/[^\n]*/g,' '),pattern=language==='wgsl'?/\b(?:fn|struct|alias|const|override)\s+(\w+)/g:/\b(?:struct\s+|(?:void|float[234]?|int[234]?|uint[234]?|bool|vec[234]|mat[234])\s+)(\w+)\s*(?:\(|\{|=)/g;
 const names=[...clean(code).matchAll(pattern)].map(v=>v[1]!);if(!names.length)throw Error('未找到函数或全局声明 / No function or global declaration found');
 const current=new Set([...clean(source).matchAll(pattern)].map(v=>v[1]!));for(const name of names)if(current.has(name))throw Error('名称已存在，请先重命名 / Name already used: '+name);
 // GLSL #version and WGSL enable/requires/diagnostic must precede functions.
 const trivia='(?:\\s|/\\/[^\\n]*(?:\\n|$)|/\\*[\\s\\S]*?\\*/)*',directive=language==='wgsl'?'(?:(?:enable|requires)\\s+[^;]+;|diagnostic\\s*\\([^;]*\\)\\s*;)':language==='glsl'?'(?:#\\s*(?:version|extension)\\b[^\\n]*(?:\\n|$)|precision\\s+\\w+\\s+\\w+\\s*;)':null;
 let at=0;if(directive){const header=new RegExp('^'+trivia+directive);for(;;){const match=header.exec(source.slice(at));if(!match)break;at+=match[0].length;}}
 const result=source.slice(0,at)+(at?'\n':'')+code.trim()+'\n\n'+source.slice(at);if(result.length>100000)throw Error('代码超过 100 KB / Source exceeds 100 KB');return result;
}
/** Match by semantic name + type, never by a coincidentally equal slot number. */
export function applyCreationPreset(current:readonly ShaderParameter[],item:CreationItem):ShaderParameter[]{
 if(item.kind!=='preset')throw Error('不是参数预设 / Not a parameter preset');validateCreation(item);
 if(!current.length)return cloneValue(item.parameters);
 const result=cloneValue([...current]);const used=new Set<number>();
 for(const source of item.parameters){const matches=result.filter(v=>v.name===source.name&&v.kind===source.kind);if(matches.length!==1||used.has(matches[0]!.slot))throw Error('参数名称或类型不匹配 / Parameter mismatch: '+source.name);const target=matches[0]!;if(!validValue(target,source.value))throw Error('预设值超出当前范围 / Preset out of range: '+source.name);target.value=source.value;used.add(target.slot);}
 validateParameters(result,undefined);return result;
}
export function instantiateTemplate(item:CreationItem,id:string,at:string){if(item.kind!=='template')throw Error('不是效果模板 / Not an effect template');return validateProject({...cloneValue(item.project),id,updatedAt:at});}
