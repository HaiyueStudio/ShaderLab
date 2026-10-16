import {cpSync,existsSync,mkdirSync,readFileSync,writeFileSync} from 'node:fs';
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
 run(require.resolve('typescript/bin/tsc'),['-p','web/tsconfig.json'],root);
 cpSync(path.join(root,'web/assets'),path.join(app,'src/assets'),{recursive:true});
 cpSync(path.join(app,'resources/gallery'),path.join(app,'src/assets/gallery'),{recursive:true});
 const native=path.dirname(require.resolve('@haiyue/native/package.json'));
 const java=path.join(app,'App_Resources/Android/src/main/java/org/haiyue/share');mkdirSync(java,{recursive:true});
 cpSync(path.join(native,'bridge/share/android/HaiyueShareProvider.java'),path.join(java,'HaiyueShareProvider.java'));
 const xml=path.join(app,'App_Resources/Android/src/main/res/xml');mkdirSync(xml,{recursive:true});cpSync(path.join(native,'bridge/share/android/haiyue_share_paths.xml'),path.join(xml,'haiyue_share_paths.xml'));
 const output=path.join(app,'generated/compiler');mkdirSync(output,{recursive:true});
 await build({entryPoints:[path.join(app,'scripts/compiler-entry.ts')],bundle:true,format:'iife',platform:'browser',target:['safari15','chrome100'],outfile:path.join(output,'compiler.js'),plugins:[{name:'inline-wasm',setup(b){b.onResolve({filter:/naga_bg\.wasm$/},args=>({path:require.resolve(args.path),namespace:'wasm'}));b.onLoad({filter:/.*/,namespace:'wasm'},args=>({contents:'export default '+JSON.stringify('data:application/wasm;base64,'+readFileSync(args.path).toString('base64')),loader:'js'}));}}]});
 writeFileSync(path.join(output,'index.html'),'<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><script src="compiler.js"></script>');
 console.log('Canvas compatibility:',patchCanvas());
}
if(process.argv[1]===fileURLToPath(import.meta.url))await prepare();
