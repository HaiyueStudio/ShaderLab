import {engineExportIssues,engineExportFiles,type EffectManifest} from '../../shared/dist/domain/engineExport.js';
import {validateProject,type ShaderProject} from './model.js';
import {refreshProjectSources} from './sourceProject.js';
import {wrapShader} from './shaders.js';
import {resolveChannelBindings} from './channelBindings.js';
import type {HlslTranslator} from './hlslTypes.js';
import type {WgslTranslator} from './sourceCommon.js';
/** Convert a detached snapshot; authored language variants and drafts remain intact. */
export async function createEnginePackage(project:ShaderProject,hlsl:HlslTranslator,wgsl:WgslTranslator,builtin:(id:string)=>Promise<string>){
 const original=validateProject(project),issues=engineExportIssues(original);if(issues.length)throw Error(issues.join('\n'));
 const snapshot=validateProject(original),diagnostics=await refreshProjectSources(snapshot,hlsl,wgsl);if(diagnostics.length)throw Error(diagnostics.map(v=>v.pass+': '+v.message).join('\n'));
 const passes=snapshot.passes.filter(v=>v.enabled),used=new Set(passes.flatMap(p=>p.channels.flatMap(c=>c.kind==='image'||c.kind==='cubemap'?[c.assetId]:[])));
 const manifest:EffectManifest={format:'haiyue-shader-effect',version:1,name:original.name,parameters:original.parameters??[],presets:original.parameterPresets??[],assets:snapshot.assets.filter(v=>used.has(v.id)),passes:[]};
 const builtinIds=new Map<string,string>();for(const id of new Set(passes.flatMap(p=>p.channels.flatMap(c=>c.kind==='builtin'?[c.texture]:[])))){let assetId='builtin-'+id;while(manifest.assets.some(v=>v.id===assetId))assetId+='-copy';builtinIds.set(id,assetId);manifest.assets.push({id:assetId,name:id,kind:'image',dataUrl:await builtin(id)});}
 for(const pass of passes){const binding=resolveChannelBindings(pass,snapshot.common);if(binding.diagnostics.some(v=>v.severity==='error'))throw Error(binding.diagnostics.map(v=>v.message).join('\n'));manifest.passes.push({id:pass.id,wgsl:wrapShader(pass,snapshot.common).code,dimensions:binding.dimensions,channels:pass.channels.map(c=>c.kind==='builtin'?{kind:'image',assetId:builtinIds.get(c.texture)!}:c)});}
 return{manifest,files:engineExportFiles(original,manifest)};
}
