import {execFileSync} from 'node:child_process';
import {existsSync,statSync} from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export function verifyIOSIcons(app) {
 const info=JSON.parse(execFileSync('plutil',['-convert','json','-o','-',path.join(app,'Info.plist')],{encoding:'utf8'}));
 for(const key of ['CFBundleIcons','CFBundleIcons~ipad']){
  const icon=info[key]?.CFBundlePrimaryIcon;
  if(icon?.CFBundleIconName!=='AppIcon'||!icon.CFBundleIconFiles?.length)throw Error(`Missing ${key} AppIcon declaration in built app`);
 }
 const catalog=path.join(app,'Assets.car');
 if(!existsSync(catalog)||!statSync(catalog).size)throw Error('Built app lacks compiled icon asset catalog');
 console.log('Verified iPhone/iPad AppIcon declarations and compiled asset catalog.');
}
if(process.argv[1]===fileURLToPath(import.meta.url))verifyIOSIcons(process.argv[2]??fileURLToPath(new URL('../platforms/ios/build/Debug-iphoneos/ShaderLab.xcarchive/Products/Applications/ShaderLab.app',import.meta.url)));
