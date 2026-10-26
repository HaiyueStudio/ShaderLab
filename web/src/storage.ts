import type {ShaderProject,CodeId} from './model.js';
import {ProjectArchive,type VersionReason} from '../../shared/dist/application/project-archive.js';
import type {ArchiveTransaction} from '../../shared/dist/ports/archive.js';
import {CreationLibrary} from '../../shared/dist/application/creation-library.js';
export interface GalleryItem {project:ShaderProject;thumbnail:string;savedAt:string}
export class GalleryStore {
  private connection:Promise<IDBDatabase>|undefined;private migration:Promise<void>|undefined;
  readonly archive:ProjectArchive;
  readonly creations:CreationLibrary;
  constructor(){const backend={run:<T>(operation:(tx:ArchiveTransaction)=>Promise<T>)=>this.transaction(operation)};this.archive=new ProjectArchive(backend,{ids:{next:()=>crypto.randomUUID()},clock:{nowISO:()=>new Date().toISOString()}});this.creations=new CreationLibrary(backend,()=>crypto.randomUUID());}
  private db(){return this.connection??=new Promise<IDBDatabase>((resolve,reject)=>{
    const request=indexedDB.open('haiyue.shader-editor.v1',2);let blocked=false;
    request.onupgradeneeded=()=>{const db=request.result;if(!db.objectStoreNames.contains('projects'))db.createObjectStore('projects',{keyPath:'project.id'});if(!db.objectStoreNames.contains('archive'))db.createObjectStore('archive');};
    request.onsuccess=()=>{if(blocked){request.result.close();return;}request.result.onversionchange=()=>{request.result.close();this.connection=undefined;};resolve(request.result);};
    request.onerror=()=>{this.connection=undefined;reject(request.error);};request.onblocked=()=>{blocked=true;this.connection=undefined;reject(Error('请关闭其他旧版 ShaderLab 页面后重试存储升级。'));};
  });}
  private async transaction<T>(operation:(tx:ArchiveTransaction)=>Promise<T>):Promise<T>{
    const db=await this.db();return new Promise<T>((resolve,reject)=>{
      const tx=db.transaction('archive','readwrite'),store=tx.objectStore('archive');let result:T,error:unknown;
      const request=<V>(req:IDBRequest<V>)=>new Promise<V>((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error);});
      tx.oncomplete=()=>resolve(result);tx.onabort=tx.onerror=()=>reject(error??tx.error??Error('本地存储事务失败。'));
      void operation({get:key=>request(store.get(key)),set:async(key,value)=>{await request(store.put(value,key));},remove:async key=>{await request(store.delete(key));},keys:async()=>(await request(store.getAllKeys())).map(String)}).then(value=>{result=value;},failure=>{error=failure;try{tx.abort();}catch{reject(failure);}});
    });
  }
  ready(){return this.migration??=(async()=>{
    if(await this.transaction(tx=>tx.get('migrated')))return;
    const db=await this.db();const legacy=await new Promise<GalleryItem[]>((resolve,reject)=>{const request=db.transaction('projects').objectStore('projects').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});
    for(const item of legacy){const exists=await this.transaction(tx=>tx.get('record:'+item.project.id));if(!exists)await this.archive.save(item.project,item.thumbnail);}
    await this.transaction(tx=>tx.set('migrated',true));
  })().catch(error=>{this.migration=undefined;throw error;});}
  async list(){await this.ready();return this.archive.list();}
  async save(project:ShaderProject,thumbnail:string){await this.ready();await this.archive.save(project,thumbnail);}
  async delete(id:string){await this.ready();await this.archive.remove(id);}
  async draft(project:ShaderProject,pass:CodeId,owner?:string){await this.ready();await this.archive.draft(project,pass,owner);}
  async checkpoint(project:ShaderProject,reason:VersionReason,pass:CodeId){await this.ready();await this.archive.checkpoint(project,reason,pass);}
  async close(){if(this.connection)(await this.connection).close();this.connection=undefined;}
}
