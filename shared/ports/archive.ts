/** Each operation commits atomically. Immutable blobs are written before the
 * record that references them; removals happen only after that record is safe. */
export interface ArchiveTransaction {
  get(key:string):Promise<unknown>;
  set(key:string,value:unknown):Promise<void>;
  remove(key:string):Promise<void>;
  keys():Promise<string[]>;
}
export interface ArchiveBackend {
  run<T>(operation:(transaction:ArchiveTransaction)=>Promise<T>):Promise<T>;
}
