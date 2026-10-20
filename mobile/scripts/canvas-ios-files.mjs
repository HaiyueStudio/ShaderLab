import {createHash} from 'node:crypto';
import {readdirSync,readFileSync,lstatSync} from 'node:fs';
import {join} from 'node:path';
export const sha=bytes=>createHash('sha256').update(bytes).digest('hex');
export function fingerprint(root){
 const files={};
 function walk(relative=''){
  for(const name of readdirSync(join(root,relative)).sort()){
   const path=join(relative,name),stat=lstatSync(join(root,path));
   if(stat.isSymbolicLink())throw Error('Unexpected link in iOS device framework: '+path);
   if(stat.isDirectory())walk(path);else files[path]=sha(readFileSync(join(root,path)));
  }
 }
 walk();return {files,sha256:sha(JSON.stringify(files))};
}
