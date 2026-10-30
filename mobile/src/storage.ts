import {File,Folder,knownFolders,path} from '@nativescript/core';
import {parseProject,type ShaderProject,type CodeId} from './project';
import {ProjectArchive,type VersionReason} from '../../shared/dist/application/project-archive.js';
import {NativeArchiveBackend} from './platform/archive-backend';
import {CreationLibrary} from '../../shared/dist/application/creation-library.js';
export class MobileProjects {
  private root:Folder;private works:Folder;private backend:NativeArchiveBackend;private migration:Promise<void>|undefined;
  readonly archive:ProjectArchive;
  readonly creations:CreationLibrary;
  constructor(directory='ShaderLab'){
    this.root=Folder.fromPath(path.join(knownFolders.documents().path,directory));this.works=this.root.getFolder('works');this.backend=new NativeArchiveBackend(this.root.getFolder('archive'));
    this.archive=new ProjectArchive(this.backend,{ids:{next:()=>crypto.randomUUID()},clock:{nowISO:()=>new Date().toISOString()}});
    this.creations=new CreationLibrary(this.backend,()=>crypto.randomUUID());
  }
  ready(){return this.migration??=(async()=>{
    if(await this.backend.run(tx=>tx.get('migrated')))return;
    for(const file of await this.works.getEntities())if(file instanceof File&&file.name.endsWith('.hyshader')){
      let project:ShaderProject|undefined;try{project=parseProject(await file.readText());}catch{if(File.exists(file.path+'.backup'))try{project=parseProject(await File.fromPath(file.path+'.backup').readText());}catch{/* Preserve damaged originals. */}}
      if(project&&!await this.backend.run(tx=>tx.get('record:'+project!.id)))await this.archive.save(project);
    }
    const draft=path.join(this.root.path,'draft.json');if(File.exists(draft)){
      let legacy:{project:ShaderProject;pass:CodeId}|undefined;
      try{const data=JSON.parse(await File.fromPath(draft).readText());legacy={project:parseProject(JSON.stringify(data.project)),pass:data.pass as CodeId};}catch{/* A damaged legacy draft must not block saved works; keep the original. */}
      // A storage failure must retry migration, rather than marking it complete.
      if(legacy)await this.archive.draft(legacy.project,legacy.pass);
    }
    await this.backend.run(tx=>tx.set('migrated',true));
  })().catch(error=>{this.migration=undefined;throw error;});}
  async list(){await this.ready();return(await this.archive.list()).map(item=>item.project);}
  async listWorks(){await this.ready();return this.archive.list();}
  async save(project:ShaderProject,thumbnail?:string){await this.ready();await this.archive.save(project,thumbnail);}
  async updateThumbnail(project:ShaderProject,thumbnail:string){await this.ready();return this.archive.updateThumbnail(project,thumbnail);}
  async remove(id:string){await this.ready();await this.archive.remove(id);}
  async draft(project:ShaderProject,pass:string,owner?:string){await this.ready();await this.archive.draft(project,pass as CodeId,owner);}
  async restoreDraft(id?:string){await this.ready();return this.archive.restoreDraft(id);}
  async checkpoint(project:ShaderProject,reason:VersionReason,pass:CodeId){await this.ready();await this.archive.checkpoint(project,reason,pass);}
  async export(project:ShaderProject){const encoded=JSON.stringify(project,null,2);parseProject(encoded);const file=this.root.getFile('ShaderLab-export.hyshader');await file.writeText(encoded);return file.path;}
}
