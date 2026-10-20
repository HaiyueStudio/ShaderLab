import {ShaderRuntime} from '../../../web/dist/runtime.js';
import {createProject} from '../../../web/dist/model.js';
import {translateGlsl} from '../../../web/dist/glsl.js';
window.structResult=(async()=>{
  const source=await fetch('../../../web/test/fixtures/structs.glsl').then(r=>r.text());
  const translated=translateGlsl(source);if(!translated.code)throw Error(JSON.stringify(translated.diagnostics));
  const canvas=document.createElement('canvas');canvas.style.cssText='width:256px;height:256px';document.body.append(canvas);
  const runtime=new ShaderRuntime(canvas);await runtime.initialize();
  const project=createProject('No UI struct regression');project.passes[4].code=translated.code;
  runtime.commit(await runtime.prepare(project));runtime.step();
  const {width,height,pixels}=await runtime.readImage();const offset=((height>>1)*width+(width>>1))*4;
  const center=Array.from(pixels.slice(offset,offset+4));await runtime.dispose();
  return {center,expected:[64,128,191,255],matches:center.every((v,i)=>Math.abs(v-[64,128,191,255][i])<=1)};
})();
