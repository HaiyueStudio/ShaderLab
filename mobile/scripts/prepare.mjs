import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {build} from 'esbuild';
import {patchCanvas} from './patch-canvas.mjs';
export const app=fileURLToPath(new URL('../',import.meta.url));
export const root=path.dirname(app.slice(0,-1));
export const require=createRequire(import.meta.url);
export function run(script,args=[],cwd=app){const result=spawnSync(process.execPath,[script,...args],{cwd,stdio:'inherit'});if(result.error)throw result.error;if(result.status!==0)throw Error('Command failed: '+script);}
export async function prepare(){
 run(require.resolve('typescript/bin/tsc'),['-p','shared/tsconfig.json'],root);
 run(require.resolve('typescript/bin/tsc'),['-p','shared/tsconfig.views.json'],root);
 run(path.join(root,'scripts/build-presentation.mjs'),[],root);
 cpSync(path.join(root,'web/assets'),path.join(app,'src/assets'),{recursive:true});
 cpSync(path.join(app,'resources/gallery'),path.join(app,'src/assets/gallery'),{recursive:true});
 cpSync(path.join(app,'resources/gallery-actions'),path.join(app,'src/assets/gallery-actions'),{recursive:true});
 const validation=path.join(app,'src/assets/g07');mkdirSync(validation,{recursive:true});
 cpSync(path.join(root,'review/m24-ui/g01/project.hyshader'),path.join(validation,'project.hyshader'));
 const native=path.dirname(require.resolve('@haiyue/native/package.json'));
 const java=path.join(app,'App_Resources/Android/src/main/java/org/haiyue/share');mkdirSync(java,{recursive:true});
 cpSync(path.join(native,'bridge/share/android/HaiyueShareProvider.java'),path.join(java,'HaiyueShareProvider.java'));
 const xml=path.join(app,'App_Resources/Android/src/main/res/xml');mkdirSync(xml,{recursive:true});cpSync(path.join(native,'bridge/share/android/haiyue_share_paths.xml'),path.join(xml,'haiyue_share_paths.xml'));
 const output=path.join(app,'generated/compiler');mkdirSync(output,{recursive:true});
 for(const name of ['LICENSE.txt','ThirdPartyNoticeText.txt'])cpSync(require.resolve('typescript/'+name),path.join(output,'typescript-'+name));
 const slang=path.join(root,'vendor/slang-2026.19');
 // Embed the compiler in its lazy script: file: XHR is blocked by WebView
 // origin rules. This avoids granting file-origin access to the compiler page.
 for(const directory of [output,path.join(app,'platforms/android/app/src/main/assets/app/compiler'),path.join(app,'platforms/ios/ShaderLab/app/compiler')])rmSync(path.join(directory,'slang-wasm.wasm'),{force:true});
 cpSync(path.join(slang,'LICENSE'),path.join(output,'slang-LICENSE'));
 cpSync(path.join(slang,'LICENSES'),path.join(output,'slang-LICENSES'),{recursive:true});
 cpSync(path.join(slang,'third-party-notices'),path.join(output,'slang-third-party-notices'),{recursive:true});
 await build({entryPoints:[path.join(app,'scripts/hlsl-compiler-entry.ts')],bundle:true,format:'iife',platform:'browser',target:['safari15','chrome100'],outfile:path.join(output,'hlsl-compiler.js'),logOverride:{'empty-import-meta':'silent'},plugins:[{name:'local-slang',setup(b){
  b.onResolve({filter:/^shaderlab:slang-wasm$/},()=>({path:'slang',namespace:'slang'}));
  b.onLoad({filter:/.*/,namespace:'slang'},()=>({contents:'export default '+JSON.stringify('data:application/wasm;base64,'+readFileSync(path.join(slang,'slang-wasm.wasm')).toString('base64'))+';',loader:'js'}));
  b.onResolve({filter:/^node:module$/},()=>({path:'node-module',namespace:'slang-node'}));
  b.onLoad({filter:/.*/,namespace:'slang-node'},()=>({contents:'export function createRequire(){throw Error("Node host APIs are unavailable in the local compiler page");}',loader:'js'}));
 }}]});
 await build({entryPoints:[path.join(app,'scripts/compiler-entry.ts')],bundle:true,format:'iife',platform:'browser',target:['safari15','chrome100'],outfile:path.join(output,'compiler.js'),plugins:[{name:'inline-wasm',setup(b){b.onResolve({filter:/naga_bg\.wasm$/},args=>({path:require.resolve(args.path),namespace:'wasm'}));b.onLoad({filter:/.*/,namespace:'wasm'},args=>({contents:'export default '+JSON.stringify('data:application/wasm;base64,'+readFileSync(args.path).toString('base64')),loader:'js'}));}}]});
 writeFileSync(path.join(output,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><script src="compiler.js"></script>');
 console.log('Canvas compatibility:',patchCanvas());
}
if(process.argv[1]===fileURLToPath(import.meta.url))await prepare();
