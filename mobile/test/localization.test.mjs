import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync,mkdtempSync,mkdirSync,writeFileSync,existsSync,rmSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname,join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {build} from 'esbuild';
import {setLocale,messageSource} from '../../shared/dist/views/i18n.js';

const source=new URL('../src/platform/localization.ts',import.meta.url),i18n=new URL('../../shared/dist/views/i18n.js',import.meta.url).href;
const result=await build({stdin:{contents:readFileSync(source,'utf8')+'\nexport {Button,Label} from "@nativescript/core";',resolveDir:dirname(fileURLToPath(source)),loader:'ts'},bundle:true,format:'esm',platform:'node',write:false,plugins:[{name:'native-text-fixture',setup(build){
  build.onResolve({filter:/@nativescript\/core/},()=>({path:'core',namespace:'fixture'}));
  build.onLoad({filter:/.*/,namespace:'fixture'},()=>({contents:'export class Label {text="";} export class Button extends Label {accessibilityLabel="";}'}));
  build.onResolve({filter:/dist\/views\/i18n\.js$/},()=>({path:i18n,external:true}));
}}]});
const {localizedProperty,localizedNativeText,Button}=await import('data:text/javascript;base64,'+Buffer.from(result.outputFiles[0].text).toString('base64'));

test('retained native controls update text, placeholders and accessibility in all three languages',()=>{
  setLocale('zh-CN');const button=localizedNativeText(new Button(),'保存作品'),input={text:'My shader / 私の作品',hint:''};localizedProperty(input,'hint','作品名称');
  button.accessibilityLabel='Host accessibility refresh';setLocale('en');assert.equal(button.text,'Save project');assert.equal(button.accessibilityLabel,'Save project');assert.equal(input.hint,'Name');
  setLocale('ja');assert.equal(button.text,'作品を保存');assert.equal(button.accessibilityLabel,'作品を保存');assert.equal(input.hint,'作品名');
  assert.equal(input.text,'My shader / 私の作品');setLocale('zh-CN');assert.equal(button.text,'保存作品');
});
test('dynamic text is protected and rebinding a property removes the stale translation',()=>{
  const button=localizedNativeText(new Button(),'保存作品');button.text='Dynamic project name';setLocale('en');assert.equal(button.text,'Dynamic project name');assert.equal(button.accessibilityLabel,'Save project');
  localizedNativeText(button,'运行');setLocale('ja');assert.equal(button.text,'実行');assert.equal(button.accessibilityLabel,'実行');
  const count={text:''};localizedProperty(count,'text','示例 · {count} 个 · 打开即可编辑',{count:8});assert.match(count.text,/8件/);setLocale('en');assert.equal(count.text,'Examples · 8 · Open to edit');setLocale('zh-CN');
});
test('a page created in Japanese can return to Chinese through the back stack',()=>{
  setLocale('ja');const title=localizedNativeText(new Button(),messageSource('最初の色'));
  assert.equal(title.text,'最初の色');setLocale('en');assert.equal(title.text,'First color');setLocale('zh-CN');assert.equal(title.text,'第一抹颜色');
});
test('disposed native controllers are skipped and retained pages catch up when loaded again',()=>{
  setLocale('zh-CN');let title='',loaded;
  const bar={isLoaded:true,on(event,callback){if(event==='loaded')loaded=callback;},get title(){return title;},set title(value){if(!this.isLoaded)throw Error('Disposed navigationItem');title=value;}};
  localizedProperty(bar,'title','设置');bar.isLoaded=false;
  assert.doesNotThrow(()=>setLocale('en'));assert.equal(title,'设置');
  bar.isLoaded=true;loaded();assert.equal(title,'Settings');
  setLocale('ja');assert.equal(title,'設定');setLocale('zh-CN');
});
test('clean iOS prepare replaces the empty template localization without touching Android',()=>{
  const app=mkdtempSync(join(tmpdir(),'shaderlab-locales-')),source=join(app,'App_Resources/iOS/en.lproj');
  try{
    mkdirSync(source,{recursive:true});const contents='"NSCameraUsageDescription" = "Camera purpose";';writeFileSync(join(source,'InfoPlist.strings'),contents);
    const hook=createRequire(import.meta.url)('../hooks/after-prepare/localizations.cjs');
    hook({prepareData:{platform:'android',projectDir:app}});assert.equal(existsSync(join(app,'platforms')),false);
    hook({prepareData:{platform:'ios',projectDir:app}});const target=join(app,'platforms/ios/ShaderLab/en.lproj/InfoPlist.strings');assert.equal(readFileSync(target,'utf8'),contents);
    writeFileSync(target,'/* Empty template */');hook({prepareData:{platform:'ios',projectDir:app}});assert.equal(readFileSync(target,'utf8'),contents);
  }finally{rmSync(app,{recursive:true,force:true});}
});
