import {languageOf,sourceOf} from './sourceLanguage.js';
import {passOf,type ShaderProject,type CodeId,type ShaderDiagnostic} from './model.js';
import {commonWgsl} from './sourceCommon.js';
import type {WgslTranslator} from './sourceCommon.js';
import {passCommon} from './channelBindings.js';

/** Normalize only a detached compile/conversion snapshot, never the editor document. */
export async function normalizeExtendedSources(project:ShaderProject,compiler:WgslTranslator|undefined,only?:CodeId):Promise<ShaderDiagnostic[]>{
  const diagnostics:ShaderDiagnostic[]=[];
  const lower=async(id:CodeId)=>{
    const language=languageOf(project,id),source=sourceOf(project,id);
    if(language==='slang'){
      if(id==='common')project.commonHlsl=source;else passOf(project,id).hlsl=source;
      project.editorLanguages={...project.editorLanguages,[id]:'hlsl'};return;
    }
    if(language!=='typescript')return;
    try{
      if(!compiler)throw Error('TypeScript 编译服务尚未就绪。');
      const common=id==='common'||!passCommon({...passOf(project,id),code:source},'Common')?'':commonWgsl(project);
      const result=await compiler(source,{sourceLanguage:'typescript',entryPoint:id==='common'?'common':id==='sound'?'sound':'image',...(id==='common'?{}:{common,channels:passOf(project,id).channels})});
      if(result.code===null){diagnostics.push(...result.diagnostics.map(d=>({pass:d.source==='common'?'common' as const:id,language,severity:'error' as const,line:d.line,column:d.column,message:d.message})));return;}
      if(id==='common')project.common=result.code;else passOf(project,id).code=result.code;
      project.editorLanguages={...project.editorLanguages,[id]:'wgsl'};
    }catch(error){diagnostics.push({pass:id,language,severity:'error',line:1,column:1,message:String(error instanceof Error?error.message:error)});}
  };
  await lower('common');if(diagnostics.length||only==='common')return diagnostics;
  for(const pass of [...project.passes,project.sound])if(only?pass.id===only:pass.enabled)await lower(pass.id);
  return diagnostics;
}
