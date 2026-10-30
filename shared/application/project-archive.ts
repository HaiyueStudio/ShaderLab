import {validateProject,codeTabs,type ShaderProject,type TextureAsset,type CodeId} from '../domain/model.js';
import type {ShaderEnvironment} from '../ports/services.js';
import type {ArchiveBackend,ArchiveTransaction} from '../ports/archive.js';

export type VersionReason='saved'|'before-conversion'|'before-restore'|'draft-checkpoint';
interface Snapshot {project:Omit<ShaderProject,'assets'>;assets:string[]}
export interface VersionEntry {id:string;createdAt:string;reason:VersionReason;pass:CodeId;name:string}
interface Version extends VersionEntry {snapshot:Snapshot}
interface RecordEntry {format:1;id:string;name:string;modifiedAt:string;thumbnail:string;saved?:Snapshot;draft?:{snapshot:Snapshot;pass:CodeId;at:string;owner?:string};versions:Version[];deletedAt?:string;assetRefs:Record<string,string>;blobs:string[]}
export interface DraftEntry {id:string;name:string;modifiedAt:string;pass:CodeId;saved:boolean}
export interface TrashEntry {id:string;name:string;deletedAt:string}
export interface ArchivedWork {project:ShaderProject;thumbnail:string;savedAt:string}
const key=(id:string)=>'record:'+id;
const same=(a:Snapshot,b:Snapshot)=>JSON.stringify({...a.project,updatedAt:''})===JSON.stringify({...b.project,updatedAt:''})&&JSON.stringify(a.assets)===JSON.stringify(b.assets);
const equalAsset=(a:TextureAsset,b:TextureAsset)=>a.id===b.id&&a.name===b.name&&a.kind===b.kind&&(a.kind==='cubemap'&&b.kind==='cubemap'?Object.keys(a.faces).every(k=>a.faces[k as keyof typeof a.faces]===b.faces[k as keyof typeof b.faces]):a.kind!=='cubemap'&&b.kind!=='cubemap'&&a.dataUrl===b.dataUrl);
const equalData=(a:unknown,b:unknown):boolean=>{if(a===b)return true;if(!a||!b||typeof a!=='object'||typeof b!=='object'||Array.isArray(a)!==Array.isArray(b))return false;const keys=Object.keys(a);return keys.length===Object.keys(b).length&&keys.every(key=>Object.prototype.hasOwnProperty.call(b,key)&&equalData((a as Record<string,unknown>)[key],(b as Record<string,unknown>)[key]));};

/** Shared local recovery/history semantics; assets are immutable, deduplicated
 * blobs so saving thirty versions does not duplicate videos thirty times. */
export class ProjectArchive {
  private cacheProject='';private assets=new Map<string,TextureAsset>();
  constructor(private readonly backend:ArchiveBackend,private readonly environment:ShaderEnvironment,readonly versionLimit=30){}
  private record(value:unknown):RecordEntry|undefined {
    if(!value||typeof value!=='object')return;
    const r=value as RecordEntry;if(r.format!==1||typeof r.id!=='string'||!Array.isArray(r.versions)||!Array.isArray(r.blobs)||!r.assetRefs)throw Error('作品恢复记录损坏；原始文件已保留。');return r;
  }
  private async snapshot(tx:ArchiveTransaction,r:RecordEntry,project:ShaderProject):Promise<Snapshot>{
    if(this.cacheProject!==r.id){this.cacheProject=r.id;this.assets.clear();}
    const assets:string[]=[];
    for(const asset of project.assets){
      let blob=Object.prototype.hasOwnProperty.call(r.assetRefs,asset.id)?r.assetRefs[asset.id]:undefined;
      const cached=blob?this.assets.get(blob):undefined;
      const existing=cached??(blob?await tx.get(blob) as TextureAsset|undefined:undefined);
      if(!existing||!equalAsset(existing,asset)){
        blob='blob:'+r.id+':'+this.environment.ids.next();await tx.set(blob,asset);r.blobs.push(blob);Object.defineProperty(r.assetRefs,asset.id,{value:blob,enumerable:true,writable:true,configurable:true});
      }
      this.assets.set(blob!,asset);assets.push(blob!);
    }
    const {assets:_,...rest}=project;return {project:rest,assets};
  }
  private async materialize(tx:ArchiveTransaction,snapshot:Snapshot):Promise<ShaderProject>{
    const assets:TextureAsset[]=[];for(const blob of snapshot.assets){const asset=await tx.get(blob);if(!asset)throw Error('历史版本的素材缺失，未覆盖当前作品。');assets.push(asset as TextureAsset);}
    return validateProject({...snapshot.project,assets});
  }
  private async edit(project:ShaderProject,change:(tx:ArchiveTransaction,r:RecordEntry,s:Snapshot)=>Promise<void>):Promise<void>{
    const value=validateProject(project);
    await this.backend.run(async tx=>{
      const r=this.record(await tx.get(key(value.id)))??{format:1,id:value.id,name:value.name,modifiedAt:this.environment.clock.nowISO(),thumbnail:'',versions:[],assetRefs:{},blobs:[]};
      // Deleting a work wins over a late autosave/checkpoint from its old editor.
      if(r.deletedAt)throw Error('作品已移到回收站，请先恢复后再编辑。');
      const s=await this.snapshot(tx,r,value);await change(tx,r,s);r.name=value.name;r.modifiedAt=this.environment.clock.nowISO();
      r.versions=r.versions.slice(-this.versionLimit);
      const used=new Set([r.saved,r.draft?.snapshot,...r.versions.map(v=>v.snapshot)].flatMap(s=>s?.assets??[]));
      const unused=r.blobs.filter(blob=>!used.has(blob));r.blobs=r.blobs.filter(blob=>used.has(blob));
      r.assetRefs=Object.fromEntries(Object.entries(r.assetRefs).filter(([,blob])=>used.has(blob)));
      await tx.set(key(r.id),r);for(const blob of unused){await tx.remove(blob);this.assets.delete(blob);}
    });
  }
  async save(project:ShaderProject,thumbnail?:string){
    await this.edit(project,async(_tx,r,s)=>{if(r.draft&&(same(r.draft.snapshot,s)||Date.parse(r.draft.snapshot.project.updatedAt)<Date.parse(s.project.updatedAt))){if(!same(r.draft.snapshot,s))this.version(r,r.draft.snapshot,'draft-checkpoint',r.draft.pass);delete r.draft;}if(!r.saved||!same(r.saved,s))this.version(r,s,'saved','image');r.saved=s;if(thumbnail!==undefined)r.thumbnail=thumbnail;});
  }
  /** Attaching a rendered preview never creates history or overwrites a newer save. */
  async updateThumbnail(project:ShaderProject,thumbnail:string):Promise<boolean>{
    const expected=validateProject(project);
    return this.backend.run(async tx=>{const r=this.record(await tx.get(key(project.id)));if(!r||r.deletedAt||!r.saved)return false;
      if(!equalData(await this.materialize(tx,r.saved),expected))return false;
      r.thumbnail=thumbnail;await tx.set(key(r.id),r);return true;
    });
  }
  private version(r:RecordEntry,snapshot:Snapshot,reason:VersionReason,pass:CodeId){
    const last=r.versions.at(-1);if(last&&last.reason===reason&&same(last.snapshot,snapshot))return;
    r.versions.push({id:this.environment.ids.next(),createdAt:this.environment.clock.nowISO(),reason,pass,name:snapshot.project.name,snapshot});
  }
  async checkpoint(project:ShaderProject,reason:VersionReason,pass:CodeId='image'){await this.edit(project,async(_tx,r,s)=>{this.version(r,s,reason,pass);});}
  async draft(project:ShaderProject,pass:CodeId='image',owner?:string){await this.edit(project,async(_tx,r,s)=>{
    if(r.draft&&Date.parse(r.draft.snapshot.project.updatedAt)>Date.parse(s.project.updatedAt)){if(!same(r.draft.snapshot,s))this.version(r,s,'draft-checkpoint',pass);return;}
    if(r.saved&&same(r.saved,s)){if(!owner||!r.draft?.owner||r.draft.owner===owner)delete r.draft;return;}
    if(r.draft&&owner&&owner!==r.draft.owner&&!same(r.draft.snapshot,s))this.version(r,r.draft.snapshot,'draft-checkpoint',r.draft.pass);
    r.draft={snapshot:s,pass,at:this.environment.clock.nowISO(),...(owner?{owner}:{})};
  });}
  private async records(tx:ArchiveTransaction){const values:RecordEntry[]=[];for(const name of await tx.keys())if(name.startsWith('record:')){const r=this.record(await tx.get(name));if(r)values.push(r);}return values;}
  async list():Promise<ArchivedWork[]>{return this.backend.run(async tx=>{const result:ArchivedWork[]=[];for(const r of await this.records(tx))if(!r.deletedAt&&r.saved)result.push({project:await this.materialize(tx,r.saved),thumbnail:r.thumbnail,savedAt:r.saved.project.updatedAt});return result.sort((a,b)=>b.savedAt.localeCompare(a.savedAt));});}
  async drafts():Promise<DraftEntry[]>{return this.backend.run(async tx=>(await this.records(tx)).filter(r=>!r.deletedAt&&r.draft).map(r=>({id:r.id,name:r.draft!.snapshot.project.name,modifiedAt:r.draft!.at,pass:r.draft!.pass,saved:!!r.saved})).sort((a,b)=>b.modifiedAt.localeCompare(a.modifiedAt)));}
  async restoreDraft(id?:string):Promise<{project:ShaderProject;pass:CodeId}|null>{return this.backend.run(async tx=>{const r=id?this.record(await tx.get(key(id))):(await this.records(tx)).filter(r=>!r.deletedAt&&r.draft).sort((a,b)=>b.draft!.at.localeCompare(a.draft!.at))[0];if(!r||r.deletedAt||!r.draft)return null;const project=await this.materialize(tx,r.draft.snapshot);return{project,pass:codeTabs(project).includes(r.draft.pass)?r.draft.pass:'image'};});}
  async discardDraft(id:string,owner?:string){await this.backend.run(async tx=>{const r=this.record(await tx.get(key(id)));if(r&&!r.deletedAt&&(!owner||!r.draft?.owner||r.draft.owner===owner)){delete r.draft;await tx.set(key(id),r);}});}
  async history(id:string):Promise<VersionEntry[]>{return this.backend.run(async tx=>(this.record(await tx.get(key(id)))?.versions??[]).map(({snapshot:_,...v})=>v).reverse());}
  async loadVersion(id:string,version:string):Promise<ShaderProject>{return this.backend.run(async tx=>{const r=this.record(await tx.get(key(id))),v=r?.versions.find(v=>v.id===version);if(!r||r.deletedAt||!v)throw Error('历史版本不存在或作品已删除。');return this.materialize(tx,v.snapshot);});}
  async remove(id:string){await this.backend.run(async tx=>{const r=this.record(await tx.get(key(id)));if(r){r.deletedAt=this.environment.clock.nowISO();await tx.set(key(id),r);}});}
  async trash():Promise<TrashEntry[]>{return this.backend.run(async tx=>(await this.records(tx)).filter(r=>r.deletedAt).map(r=>({id:r.id,name:r.name,deletedAt:r.deletedAt!})).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt)));}
  async recover(id:string){await this.backend.run(async tx=>{const r=this.record(await tx.get(key(id)));if(!r?.deletedAt)throw Error('回收站中没有此作品。');delete r.deletedAt;await tx.set(key(id),r);});}
}
