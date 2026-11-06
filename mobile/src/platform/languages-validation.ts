import {Application,Device,File,Folder,knownFolders,path,isAndroid,type Page,type View,type Button,type TextView} from '@nativescript/core';
import {SHADER_LANGUAGES,LANGUAGE_LABELS,parseProject,type ShaderLanguage} from '../project';
import {sourceOf} from '../../../shared/dist/domain/sourceLanguage.js';
import type {ShaderApplication} from '../../../shared/dist/application/application.js';
import type {NativeShaderRuntime} from '../gpu-runtime';
import type {MobileProjects} from '../storage';

function requested(name:string){return isAndroid?(Application.android.startActivity?.getIntent()?.getBooleanExtra(name,false)??false):Array.from({length:NSProcessInfo.processInfo.arguments.count},(_,i)=>String(NSProcessInfo.processInfo.arguments.objectAtIndex(i))).includes('--'+name);}
export function nativeLanguagesRequested(){return requested('shaderlab-languages-check')||requested('shaderlab-glsl-check');}
/** Explicit isolated acceptance. Uses the actual native GPU and local compiler bridge. */
export async function validateNativeLanguages(p:{page:Page;app:ShaderApplication;store:MobileProjects;runtime:()=>NativeShaderRuntime|undefined;language:Button;editor:TextView;sync():void;codePane():void;previewPane():void;disposed():boolean}){
  const folder=Folder.fromPath(path.join(knownFolders.documents().path,'ShaderLab-languages-review')),report=File.fromPath(path.join(folder.path,'report.json')),checks:string[]=[],conversions:{from:ShaderLanguage;to:ShaderLanguage;maxChannelError:number}[]=[],images:string[]=[];
  if(!isAndroid)UIApplication.sharedApplication.idleTimerDisabled=true;
  const assert=(value:unknown,message:string)=>{if(!value)throw Error(message);},wait=async(test:()=>unknown,label:string)=>{const end=Date.now()+60000;while(!test()){if(p.disposed()||Date.now()>end)throw Error('Language review timeout: '+label);await new Promise(r=>setTimeout(r,50));}};
  const screenshot=async(name:string)=>{if(isAndroid)return;await new Promise(r=>setTimeout(r,250));const window=(p.page.nativeViewProtected as UIView).window!;const png=UIGraphicsImageRenderer.alloc().initWithSize(window.bounds.size).PNGDataWithActions(()=>window.drawViewHierarchyInRectAfterScreenUpdates(window.bounds,true));assert(png.writeToFileAtomically(path.join(folder.path,name+'.png'),true),'screenshot');images.push(name+'.png');};
  const render=async()=>{p.previewPane();p.sync();assert(await p.app.compile(),JSON.stringify(p.app.state.compile.diagnostics));const runtime=p.runtime()!;runtime.renderStill();const image=await runtime.readImage(),out:number[]=[];for(const y of [.2,.5,.8])for(const x of [.2,.5,.8]){const at=(Math.floor(image.height*y)*image.width+Math.floor(image.width*x))*4;out.push(...image.pixels.slice(at,at+4));}return out;};
  try{
    await report.writeText(JSON.stringify({status:'running',startedAt:new Date().toISOString()}));await wait(()=>p.runtime()&&p.app.state.compile.status==='ready','initial GPU');const runtime=p.runtime()!;
    if(requested('shaderlab-glsl-check')){
      p.app.setSource('image','// Native GLSL grouping regression\nfn difference(a:f32,b:f32,c:f32)->f32{return a-(b-c);}\nfn mainImage(p:vec2f)->vec4f{let uv=p/iResolution.xy;return vec4f(uv,difference(uv.x,uv.y,0.2)*0.1+0.4,1.0);}','wgsl');
      let first='';
      for(let cycle=0;cycle<4;cycle++){
        await p.app.switchLanguage('image','glsl');const code=sourceOf(p.app.state.project,'image');
        assert(/return a - \(b - c\);/.test(code),'required subtraction grouping');assert(/= p \/ iResolution.xy;/.test(code),'redundant division grouping removed');assert(!/return \(a -|= \(p \//.test(code),'no redundant outer expression groups');
        if(cycle===0)first=code;else assert(code===first,'stable GLSL cycle '+cycle);
        if(cycle<3)await p.app.switchLanguage('image','wgsl');
      }
      checks.push('four native WGSL/GLSL cycles retain necessary grouping and stable formatted code');
      p.previewPane();p.sync();assert(await p.app.compile(),JSON.stringify(p.app.state.compile.diagnostics));runtime.setPlaying(true);await wait(()=>runtime.status().frame>2,'visible GLSL frames');await screenshot('glsl-preview');p.codePane();await screenshot('glsl-code');checks.push('the generated GLSL compiles locally and presents native preview frames');
      await report.writeText(JSON.stringify({status:'passed',device:{model:Device.model,os:Device.osVersion},kind:'Native conversion source assertions and visible render frames; isolated project; no offscreen GPU readback',checks,cycles:4,render:runtime.status(),images},null,2));return;
    }
    runtime.setExportSize({width:128,height:96});
    const original='// native five-language parity\nfn mainImage(p:vec2f)->vec4f{var c=vec3f(p/iResolution.xy,0.012);for(var i=0;i<3;i++){if(i==1){continue;}c.z+=0.01;}return vec4f(c,1.0);}';
    const sources={} as Record<ShaderLanguage,string>;let baseline:number[]|undefined;
    for(const language of SHADER_LANGUAGES){p.app.setSource('image',original,'wgsl');if(language!=='wgsl')await p.app.switchLanguage('image',language);sources[language]=sourceOf(p.app.state.project,'image');const pixels=await render();if(!baseline)baseline=pixels;else assert(pixels.every((v,i)=>Math.abs(v-baseline![i]!)<=2),language+' baseline');}
    checks.push('five native language baselines compile through local services and match GPU pixels');
    for(const from of SHADER_LANGUAGES)for(const to of SHADER_LANGUAGES.filter(language=>language!==from)){
      p.app.setSource('image',sources[from]+'\n// latest '+from,from);await p.app.switchLanguage('image',to);const pixels=await render(),error=Math.max(...pixels.map((v,i)=>Math.abs(v-baseline![i]!)));assert(error<=2,from+' → '+to+' GPU pixel mismatch');conversions.push({from,to,maxChannelError:error});
      if(from==='wgsl'&&(to==='typescript'||to==='slang')){p.codePane();await screenshot(to+'-editor');}
    }
    p.app.setSource('image',sources.typescript,'typescript');p.sync();await p.app.save();const saved=(await p.store.list()).find(project=>project.id===p.app.state.project.id)!;assert(sourceOf(parseProject(JSON.stringify(saved)),'image')===sources.typescript,'native source persistence');checks.push('TypeScript source and language survive native archive serialization');
    p.app.setSource('image','export function mainImage(','typescript');const before=JSON.stringify(p.app.snapshot());let rejected=false;try{await p.app.switchLanguage('image','wgsl');}catch{rejected=true;}assert(rejected&&JSON.stringify(p.app.snapshot())===before,'invalid source conversion must be atomic');checks.push('failed conversion preserves authored source and language');
    p.app.setSource('image',sources.typescript,'typescript');p.sync();p.codePane();p.language.notify({eventName:'tap',object:p.language});await wait(()=>p.page.modal?.isLoaded,'language picker');
    const modal=p.page.modal as Page,found=new Map<string,View>();const visit=(view:View)=>{if(SHADER_LANGUAGES.some(l=>LANGUAGE_LABELS[l]===(view as Button).text)&&view.accessibilityRole==='button')found.set((view as Button).text,view);view.eachChildView(child=>{visit(child);return true;});};visit(modal);
    assert(SHADER_LANGUAGES.every(l=>found.has(LANGUAGE_LABELS[l])),'all five native picker options');await screenshot('language-options');const selected=found.get('TypeScript')!;selected.notify({eventName:'tap',object:selected});await wait(()=>!p.page.modal,'same-language selection closes');checks.push('mounted native menu exposes all five labels and selecting current language leaves source intact');
    await render();runtime.setExportSize(undefined);
    await report.writeText(JSON.stringify({status:'passed',device:{model:Device.model,os:Device.osVersion},kind:'native semantic actions, real local compiler WebView and native WebGPU readback; isolated works',checks,conversions,images},null,2));
  }catch(error){try{await screenshot('failure');}catch{}await report.writeText(JSON.stringify({status:'failed',error:String(error instanceof Error?error.stack:error),checks,conversions,images},null,2));}
}
