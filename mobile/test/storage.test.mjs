import {pathToFileURL} from 'node:url';
import {test,after} from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,mkdirSync,readFileSync,writeFileSync,readdirSync,rmSync,existsSync,copyFileSync} from 'node:fs';import {tmpdir} from 'node:os';import {resolve,sep} from 'node:path';import {build} from 'esbuild';
const dir=mkdtempSync(resolve(tmpdir(),'shaderlab-storage-')),out=resolve(import.meta.dirname,'../artifacts/storage-tests.mjs');mkdirSync(resolve(import.meta.dirname,'../artifacts'),{recursive:true});
await build({entryPoints:[resolve(import.meta.dirname,'../src/storage.ts')],outfile:out,bundle:true,format:'esm',platform:'node',plugins:[{name:'native-files-test-port',setup(b){b.onResolve({filter:/^@nativescript\/core$/},()=>({path:'files',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({loader:'js',contents:
'import fs from "node:fs";import p from "node:path";export const isAndroid=true;export const path={join:p.join};export const knownFolders={documents:()=>({path:'+JSON.stringify(dir)+'})};export class File{constructor(path){this.path=path;this.name=p.basename(path);}static fromPath(path){return new File(path);}static exists(path){return fs.existsSync(path);}async readText(){return fs.readFileSync(this.path,"utf8");}async writeText(value){fs.writeFileSync(this.path,value);}async remove(){fs.rmSync(this.path);}async copy(to){fs.copyFileSync(this.path,to);}}export class Folder{constructor(path){this.path=path;fs.mkdirSync(path,{recursive:true});}static fromPath(path){return new Folder(path);}getFolder(name){return new Folder(p.join(this.path,name));}getFile(name){return new File(p.join(this.path,name));}async getEntities(){return fs.readdirSync(this.path).filter(n=>fs.statSync(p.join(this.path,n)).isFile()).map(n=>new File(p.join(this.path,n)));}}'}));}}]});
const {MobileProjects}=await import(pathToFileURL(out).href),{createProject}=await import('../../web/dist/model.js');
let failRename=false;
globalThis.java={io:{File:class{constructor(path){this.path=path;}renameTo(to){if(failRename){failRename=false;return false;}try{const fs=globalThis.p0Files;fs.renameSync(this.path,to.path);return true;}catch{return false;}}}}};
globalThis.p0Files=await import('node:fs');
after(()=>{if(!dir.startsWith(resolve(tmpdir())+sep))throw Error('Unexpected test directory');rmSync(dir,{recursive:true,force:true});delete globalThis.java;delete globalThis.p0Files;});
test('native atomic files separate drafts, saved works, versions and trash across store restart',async()=>{
 const store=new MobileProjects(),a=createProject('A'),b=createProject('B');a.id='x'.repeat(79)+'A';b.id='x'.repeat(79)+'B';a.preview.scale=0.75;
 await store.draft(a,'image');assert.deepEqual(await store.list(),[]);await Promise.all([store.save(a),store.save(b)]);assert.equal((await store.list()).length,2);assert.equal(await store.restoreDraft(a.id),null);
 assert.equal(JSON.parse(readFileSync(await store.export(a),'utf8')).preview.scale,0.75);
 a.name='A unsaved';await store.draft(a,'image');const restart=new MobileProjects();assert.equal((await restart.restoreDraft(a.id)).project.name,'A unsaved');assert.equal((await restart.list()).find(p=>p.id===a.id).name,'A');
 await restart.remove(a.id);assert.equal((await restart.list()).length,1);assert.equal(await restart.restoreDraft(a.id),null);await assert.rejects(restart.draft(a),/回收站/);
 await restart.archive.recover(a.id);assert.equal((await restart.restoreDraft(a.id)).project.name,'A unsaved');assert.equal((await restart.archive.history(a.id)).length,1);
});
test('native legacy files and backup/draft migrate once without destroying originals',async()=>{
 const base=resolve(dir,'legacy'),works=resolve(base,'works');mkdirSync(works,{recursive:true});const a=createProject('Legacy'),draft=structuredClone(a);draft.name='Legacy unsaved';writeFileSync(resolve(works,'a.hyshader'),'damaged');writeFileSync(resolve(works,'a.hyshader.backup'),JSON.stringify(a));writeFileSync(resolve(base,'draft.json'),JSON.stringify({project:draft,pass:'image'}));
 const store=new MobileProjects('legacy');assert.equal((await store.list())[0].name,'Legacy');assert.equal((await store.restoreDraft(a.id)).project.name,'Legacy unsaved');assert.equal(readFileSync(resolve(works,'a.hyshader'),'utf8'),'damaged');
 a.name='New archive save';await store.save(a);const restarted=new MobileProjects('legacy');assert.equal((await restarted.list())[0].name,'New archive save');
});
test('failed atomic replacement retains the complete previous draft after restarting',async()=>{
 const store=new MobileProjects('failure'),a=createProject('old');await store.draft(a);a.name='new';failRename=true;await assert.rejects(store.draft(a),/原子保存/);
 const restarted=new MobileProjects('failure');assert.equal((await restarted.restoreDraft(a.id)).project.name,'old');await restarted.draft(a);assert.equal((await new MobileProjects('failure').restoreDraft(a.id)).project.name,'new');
});
