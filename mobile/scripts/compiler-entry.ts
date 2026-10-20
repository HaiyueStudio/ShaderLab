import { translateWgsl } from '../../web/src/wgsl.js';
import type { HlslTranslator, HlslTranslationOptions } from '../../web/src/hlslTypes.js';
// This entry is bundled as an isolated local page, without the web editor UI.
const results=new Map<string,string>(),cancelled=new Set<string>();
let hlsl: Promise<HlslTranslator> | undefined;
function loadHlsl() {
 return hlsl ??= new Promise<HlslTranslator>((resolve,reject)=>{
  const script=document.createElement('script');script.src='hlsl-compiler.js';
  script.onload=()=>resolve((window as unknown as {nativeHlslCompiler:{translate:HlslTranslator}}).nativeHlslCompiler.translate);
  script.onerror=()=>{hlsl=undefined;script.remove();reject(Error('HLSL 编译器加载失败。'));};document.head.append(script);
 });
}
function store(id:string,job:Promise<unknown>){void job.then(result=>{if(!cancelled.delete(id))results.set(id,JSON.stringify(result));}).catch(error=>{if(!cancelled.delete(id))results.set(id,JSON.stringify({code:null,diagnostics:[{line:1,column:1,message:String(error)}],warnings:[]}));});return '';}
Object.assign(window,{nativeShaderCompiler:{
  start(id:string,code:string,options:Parameters<typeof translateWgsl>[1]){return store(id,translateWgsl(code,options));},
  hlsl(id:string,code:string,options:HlslTranslationOptions){return store(id,loadHlsl().then(translate=>translate(code,options)));},
  take(id:string){const value=results.get(id)??'';if(value)results.delete(id);return value;},
  cancel(id:string){results.delete(id);cancelled.add(id);return '';},
}});
