import {execFileSync} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const resources=fileURLToPath(new URL('../App_Resources/iOS/',import.meta.url));
const read=file=>JSON.parse(execFileSync('plutil',['-convert','json','-o','-',file],{encoding:'utf8'}));
export function verifyIOSLocalizations(app){
  const info=read(path.join(app,'Info.plist'));
  for(const locale of ['zh-Hans','en','ja']){
    if(!info.CFBundleLocalizations?.includes(locale))throw Error('Built app does not declare '+locale);
    const name=locale+'.lproj/InfoPlist.strings',expected=read(path.join(resources,name)),actual=read(path.join(app,name));
    for(const key of ['CFBundleDisplayName','NSCameraUsageDescription','NSPhotoLibraryAddUsageDescription']){
      if(!expected[key]||actual[key]!==expected[key])throw Error('Missing or overwritten '+locale+' '+key+' in built app');
    }
  }
  console.log('Verified Chinese, English and Japanese purpose strings in the built iOS app.');
}
