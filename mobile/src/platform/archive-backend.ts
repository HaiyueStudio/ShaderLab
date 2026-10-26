import {File,Folder,path,isAndroid} from '@nativescript/core';
import type {ArchiveBackend,ArchiveTransaction} from '../../../shared/dist/ports/archive.js';

/** Atomic replacement retains a complete old or new manifest across process exit. */
export class NativeArchiveBackend implements ArchiveBackend {
  private pending:Promise<unknown>=Promise.resolve();
  constructor(private readonly folder:Folder){}
  private file(key:string){return path.join(this.folder.path,encodeURIComponent(key)+'.json');}
  run<T>(operation:(tx:ArchiveTransaction)=>Promise<T>):Promise<T>{
    const task=this.pending.then(async()=>{
      const writes=new Map<string,unknown>(),removed=new Set<string>();
      const tx:ArchiveTransaction={
        get:async key=>{if(removed.has(key))return undefined;if(writes.has(key))return writes.get(key);const file=this.file(key);if(!File.exists(file))return undefined;return JSON.parse(await File.fromPath(file).readText());},
        set:async(key,value)=>{writes.set(key,value);removed.delete(key);},remove:async key=>{writes.delete(key);removed.add(key);},
        keys:async()=>{const keys=(await this.folder.getEntities()).filter(file=>file instanceof File&&file.name.endsWith('.json')).map(file=>decodeURIComponent(file.name.slice(0,-5)));return[...new Set([...keys,...writes.keys()])].filter(key=>!removed.has(key));},
      };
      const result=await operation(tx);
      for(const[key,value]of writes){const file=this.file(key),encoded=JSON.stringify(value);
        if(isAndroid){const temporary=file+'.pending';await File.fromPath(temporary).writeText(encoded);if(!new java.io.File(temporary).renameTo(new java.io.File(file)))throw Error('无法原子保存作品；旧版本仍已保留。');}
        else {const error=new interop.Reference<NSError>();if(!NSString.stringWithString(encoded).writeToFileAtomicallyEncodingError(file,true,NSUTF8StringEncoding,error))throw Error(String(error.value?.localizedDescription??'无法保存作品。'));}
      }
      for(const key of removed){const file=this.file(key);if(File.exists(file))await File.fromPath(file).remove();}
      return result;
    });this.pending=task.catch(()=>{});return task;
  }
}
