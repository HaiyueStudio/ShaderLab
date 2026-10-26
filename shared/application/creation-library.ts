import type {ArchiveBackend} from '../ports/archive.js';
import {validateCreation,parseCreationBundle,creationBundle,type CreationItem} from '../domain/creationLibrary.js';
import {BUILTIN_CREATIONS} from '../domain/creationSeeds.js';

const prefix='creation:item:';
/** Shares the archive transaction boundary, with a disjoint namespace. */
export class CreationLibrary {
 constructor(private readonly backend:ArchiveBackend,private readonly id:()=>string){}
 async list(){return this.backend.run(async tx=>{const all=new Map(BUILTIN_CREATIONS.map(v=>[v.id,validateCreation(v)]));for(const key of await tx.keys())if(key.startsWith(prefix)){const value=validateCreation(await tx.get(key));all.set(value.id,value);}return [...all.values()];});}
 async save(item:CreationItem){const value=validateCreation(item);return this.backend.run(async tx=>{const all=new Map(BUILTIN_CREATIONS.map(v=>[v.id,v]));for(const key of await tx.keys())if(key.startsWith(prefix)){const saved=validateCreation(await tx.get(key));all.set(saved.id,saved);}all.set(value.id,value);creationBundle([...all.values()]);await tx.set(prefix+value.id,value);});}
 async remove(id:string){if(BUILTIN_CREATIONS.some(v=>v.id===id))throw Error('内置素材可以取消收藏 / Built-in assets can be unfavorited');await this.backend.run(tx=>tx.remove(prefix+id));}
 async export(){return creationBundle(await this.list());}
 async import(source:string){const bundle=parseCreationBundle(source);return this.backend.run(async tx=>{const all=new Map(BUILTIN_CREATIONS.map(v=>[v.id,v]));for(const key of await tx.keys())if(key.startsWith(prefix)){const item=validateCreation(await tx.get(key));all.set(item.id,item);}let added=0,skipped=0,conflicts=0;const pending:CreationItem[]=[];
  for(const item of bundle.items){let value=item;const previous=all.get(value.id);if(previous){if(creationBundle([previous])===creationBundle([value])){skipped++;continue;}let id=this.id();for(let tries=0;all.has(id);tries++){if(tries>20)throw Error('无法生成素材 ID / Cannot allocate asset ID');id=this.id();}value=validateCreation({...value,id,name:(value.name+' · Imported').slice(0,120)});conflicts++;}all.set(value.id,value);pending.push(value);added++;}
  if([...all.keys()].filter(id=>!BUILTIN_CREATIONS.some(v=>v.id===id)).length>200)throw Error('素材库已满（200）/ Library is full');creationBundle([...all.values()]);for(const value of pending)await tx.set(prefix+value.id,value);return{added,skipped,conflicts};
 });}
}
