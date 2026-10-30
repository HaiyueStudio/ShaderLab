const {copyFileSync,mkdirSync}=require('node:fs');
const path=require('node:path');

// NativeScript's template also compiles an empty en.lproj variant group.
// Update that input after platform creation so it cannot overwrite our English
// purpose strings in Copy Bundle Resources, including on a clean checkout.
module.exports=function(hookArgs){
  const data=hookArgs.prepareData;
  if(data?.platform?.toLowerCase()!=='ios')return;
  const app=data.projectDir;
  const target=path.join(app,'platforms/ios/ShaderLab/en.lproj');
  mkdirSync(target,{recursive:true});
  copyFileSync(path.join(app,'App_Resources/iOS/en.lproj/InfoPlist.strings'),path.join(target,'InfoPlist.strings'));
};
