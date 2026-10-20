import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { execFileSync } from 'node:child_process';
import { build } from 'esbuild';
const root=resolve(import.meta.dirname,'../..'), temp=mkdtempSync(resolve(tmpdir(),'shaderlab-g02-clean-'));
try {
  // Deliberately do not copy web/, node_modules/, or any generated output.
  cpSync(resolve(root,'shared'),resolve(temp,'shared'),{recursive:true,filter:file=>!file.startsWith(resolve(root,'shared/dist'))});
  cpSync(resolve(root,'tsconfig.base.json'),resolve(temp,'tsconfig.base.json'));
  mkdirSync(resolve(temp,'mobile/src'),{recursive:true});cpSync(resolve(root,'mobile/src/session.ts'),resolve(temp,'mobile/src/session.ts'));
  writeFileSync(resolve(temp,'package.json'),'{"type":"module"}\n');
  assert.equal(existsSync(resolve(temp,'shared/dist')),false);assert.equal(existsSync(resolve(temp,'web')),false);
  execFileSync(process.execPath,[resolve(root,'node_modules/typescript/bin/tsc'),'-p',resolve(temp,'shared/tsconfig.json')],{cwd:temp,stdio:'pipe'});
  const result=await build({absWorkingDir:temp,entryPoints:[resolve(temp,'mobile/src/session.ts')],outfile:resolve(temp,'session.mjs'),bundle:true,format:'esm',platform:'neutral',metafile:true});
  const inputs=Object.keys(result.metafile.inputs);
  assert.ok(inputs.every(path=>!path.includes('/web/')));
  const {MobileSession}=await import(pathToFileURL(resolve(temp,'session.mjs')));let id=0;
  const session=new MobileSession({ids:{next:()=>`fresh-${++id}`},clock:{nowISO:()=> '2026-10-16T00:00:00.000Z'}});
  session.application.dispatch({type:'preview.scale',value:.75});session.paste('void mainImage(out vec4 c,in vec2 p){c=vec4(1.); }');
  assert.equal(session.project.preview.scale,.75);assert.equal(session.language,'glsl');assert.equal(session.dirty,true);
  const report={status:'passed',description:'fresh source-only directory, no Web directory, no platform packages, independent shared tsc build + MobileSession bundle + replay',inputs};
  mkdirSync(resolve(root,'review/m24-ui/g02/results'),{recursive:true});writeFileSync(resolve(root,'review/m24-ui/g02/results/fresh-build.json'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report,null,2));
} finally { rmSync(temp,{recursive:true,force:true}); }
