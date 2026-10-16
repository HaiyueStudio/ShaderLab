import {File,Folder,knownFolders,path} from '@nativescript/core';
import {parseProject,type ShaderProject} from '../../web/dist/model.js';
export class MobileProjects {
 private root=Folder.fromPath(path.join(knownFolders.documents().path,'ShaderLab'));
 private works=this.root.getFolder('works');
 private pending:Promise<unknown>=Promise.resolve();
 private async records(){const entries:{file:File;project:ShaderProject}[]=[];for(const file of await this.works.getEntities()){if(!(file instanceof File)||!file.name.endsWith('.hyshader'))continue;try{entries.push({file,project:parseProject(await file.readText())});}catch{const backup=file.path+'.backup';if(File.exists(backup))try{entries.push({file,project:parseProject(await File.fromPath(backup).readText())});}catch{/* Keep both damaged files for manual recovery. */}}}return entries;}
 async list(){return(await this.records()).map(r=>r.project).sort((a,b)=>b.updatedAt.localeCompare(a.updatedAt));}
 private serial<T>(operation:()=>Promise<T>){const next=this.pending.then(operation,operation);this.pending=next.catch(()=>{});return next;}
 save(project:ShaderProject){const encoded=JSON.stringify(project),snapshot=parseProject(encoded);return this.serial(async()=>{const record=(await this.records()).find(r=>r.project.id===snapshot.id);const file=record?.file??this.works.getFile(crypto.randomUUID()+'.hyshader');if(record)await File.fromPath(file.path+'.backup').writeText(JSON.stringify(record.project));await file.writeText(encoded);});}
 remove(id:string){return this.serial(async()=>{for(const {file,project}of await this.records())if(project.id===id){await file.remove();if(File.exists(file.path+'.backup'))await File.fromPath(file.path+'.backup').remove();}});}
 async draft(project:ShaderProject,pass:string){const encoded=JSON.stringify({project,pass});return this.serial(()=>this.root.getFile('draft.json').writeText(encoded));}
 async restoreDraft():Promise<{project:ShaderProject;pass:string}|null>{const file=path.join(this.root.path,'draft.json');if(!File.exists(file))return null;try{const data=JSON.parse(await File.fromPath(file).readText());return{project:parseProject(JSON.stringify(data.project)),pass:data.pass};}catch{return null;}}
 async export(project:ShaderProject){const encoded=JSON.stringify(project,null,2);parseProject(encoded);const file=this.root.getFile('ShaderLab-export.hyshader');await file.writeText(encoded);return file.path;}
}
