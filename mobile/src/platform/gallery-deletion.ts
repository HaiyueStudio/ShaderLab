export interface GalleryDeletionTarget { readonly id:string; readonly name:string; }
/** Keep the entire confirmation/delete/refresh transaction single-flight. */
export function createGalleryDeleteAction(ports:{
  confirm(target:GalleryDeletionTarget):Promise<boolean>;
  remove(id:string):Promise<void>;
  refresh():Promise<void>;
}) {
  let pending=false;
  return async(target:GalleryDeletionTarget):Promise<void>=>{
    if(pending)return;
    pending=true;
    const captured={id:target.id,name:target.name};
    try {
      if(!await ports.confirm(captured))return;
      await ports.remove(captured.id);
      await ports.refresh();
    } finally { pending=false; }
  };
}
