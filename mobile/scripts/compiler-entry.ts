import { translateWgsl } from '../../web/src/wgsl.js';
// This entry is bundled as an isolated local page, without the web editor UI.
const results=new Map<string,string>(),cancelled=new Set<string>();
Object.assign(window,{nativeShaderCompiler:{
  start(id:string,code:string,options:Parameters<typeof translateWgsl>[1]){void translateWgsl(code,options).then(result=>{if(!cancelled.delete(id))results.set(id,JSON.stringify(result));}).catch(error=>{if(!cancelled.delete(id))results.set(id,JSON.stringify({code:null,diagnostics:[{line:1,column:1,message:String(error)}],warnings:[]}));});return '';},
  take(id:string){const value=results.get(id)??'';if(value)results.delete(id);return value;},
  cancel(id:string){results.delete(id);cancelled.add(id);return '';},
}});
