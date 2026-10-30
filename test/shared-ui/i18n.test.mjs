import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {APP_LOCALES,LOCALE_OPTIONS,systemLocale} from '../../shared/dist/domain/locales.js';
import {parsePreferences} from '../../shared/dist/domain/preferences.js';
import {t,setLocale,getLocale,onLocaleChange,localizeText,localizeProps,messageSource} from '../../shared/dist/views/i18n.js';
import {nativeEnglish} from '../../shared/dist/views/native-english.js';
import {nativeMessages} from '../../shared/dist/views/native-messages.js';
import {tutorialMessages} from '../../shared/dist/views/tutorial-messages.js';
import {PRACTICE_CHALLENGES} from '../../shared/dist/domain/practice.js';
import {LEARNING_PATHS,extensionTask} from '../../shared/dist/domain/learning.js';

test('three languages retain explicit preferences and match regional system languages on first launch',()=>{
  assert.deepEqual(LOCALE_OPTIONS.map(v=>v.label),['中文','English','日本語']);
  for(const locale of APP_LOCALES){const original={locale,msaa:true,shaderLanguage:'slang'};assert.deepEqual(parsePreferences(JSON.stringify(original),'en-US'),original);}
  for(const tag of ['ja','ja-JP','ja_JP'])assert.equal(systemLocale(tag),'ja');
  assert.equal(parsePreferences(null,'ja-JP').locale,'ja');
  assert.equal(parsePreferences('{}','zh-Hant-TW').locale,'zh-CN');
  assert.equal(parsePreferences('{}','de-DE').locale,'en');
  assert.equal(parsePreferences('{broken','ja-JP').locale,'ja');
  assert.equal(parsePreferences('{"locale":"ja"}').locale,'ja');
  assert.equal(parsePreferences('{"locale":"zh-CN"}','ja-JP').locale,'zh-CN');
});
test('locale switches notify once, ignore invalid values, and support unsubscribing',()=>{
  setLocale('zh-CN');let changes=0;const off=onLocaleChange(()=>changes++);
  setLocale('ja');setLocale('ja');setLocale('invalid');assert.equal(getLocale(),'ja');assert.equal(changes,1);
  off();setLocale('en');assert.equal(changes,1);setLocale('zh-CN');
});
test('Japanese UI preserves placeholders, identifiers and user content',()=>{
  setLocale('ja');
  assert.equal(t('设置'),'設定');assert.equal(t('作品名称'),'作品名');
  assert.equal(t('示例 · {count} 个 · 打开即可编辑',{count:8}),'サンプル · 8件 · 開いて編集');
  assert.equal(t('已转换为 HLSL'),'HLSLに変換しました');
  assert.equal(t('保存失败：disk full'),'保存に失敗しました：disk full');
  assert.equal(t('原生 WebGPU 已呈现 120 帧'),'ネイティブ WebGPU：120 フレームを描画');
  setLocale('en');assert.equal(t('原生 WebGPU 已呈现 120 帧'),'Native WebGPU rendered 120 frames');setLocale('ja');
  assert.match(t('选择 iChannel{index} 素材',{index:2}),/iChannel2/);
  assert.equal(t('My shader / 私の作品 / 我的作品'),'My shader / 私の作品 / 我的作品');
  for(const name of ['constructor','__proto__','toString'])assert.equal(t(name),name);
  for(const [source,en]of Object.entries(nativeEnglish))if(/[\u3400-\u9fff]/u.test(source)&&!['中文','English','OK'].includes(en))assert.notEqual(localizeText(source,en),en,'Missing Japanese UI: '+source);
  for(const [source,[en,ja]]of Object.entries(nativeMessages)){assert.equal(localizeText(source,en),ja,source);}
  setLocale('zh-CN');
});
test('every practice title, topic, goal, hint and extension task has three-language text without changing shaders',()=>{
  const original=JSON.stringify(PRACTICE_CHALLENGES);
  for(const c of PRACTICE_CHALLENGES){
    for(const pair of [c.title,c.topic,c.goal,c.hint,extensionTask(c)]){
      setLocale('zh-CN');assert.equal(localizeText(...pair),pair[0]);
      setLocale('en');assert.equal(localizeText(...pair),pair[1]);
      setLocale('ja');const ja=localizeText(...pair);assert.ok(ja.trim(),c.id);assert.notEqual(ja,pair[1],c.id);
    }
  }
  for(const path of LEARNING_PATHS){setLocale('ja');assert.notEqual(localizeText(...path.title),path.title[1]);}
  assert.equal(JSON.stringify(PRACTICE_CHALLENGES),original);setLocale('zh-CN');
});
test('tutorial navigation has English and Japanese while authored article text is preserved',()=>{
  for(const [source,[en,ja]]of Object.entries(tutorialMessages)){setLocale('en');assert.equal(t(source),en);setLocale('ja');assert.equal(t(source),ja);}
  const article='把画布想象成同时求值的许多个问题：这个位置应该是什么颜色？';assert.equal(t(article),article);
  assert.equal(t('本文语言：简体中文'),'本文の言語：簡体字中国語');setLocale('zh-CN');
});
test('shared control localization updates labels and accessibility without mutating its input',()=>{
  const props={text:'保存作品',a11y:{label:'保存作品'},options:[{value:'cube',label:'立方体'}]};const original=JSON.stringify(props);
  setLocale('ja');const ja=localizeProps(props);assert.equal(ja.text,'作品を保存');assert.equal(ja.a11y.label,'作品を保存');assert.equal(ja.options[0].label,'立方体');assert.equal(localizeProps(props),ja);
  setLocale('en');assert.equal(localizeProps(props).text,'Save project');assert.equal(t(messageSource('作品を保存')),'Save project');
  assert.equal(JSON.stringify(props),original);setLocale('zh-CN');assert.equal(localizeProps(props),props);
});
test('iOS advertises three languages with localized camera and photo purpose strings',()=>{
  const info=readFileSync(new URL('../../mobile/App_Resources/iOS/Info.plist',import.meta.url),'utf8');assert.match(info,/CFBundleLocalizations/);
  for(const locale of ['zh-Hans','en','ja']){assert.ok(info.includes('<string>'+locale+'</string>'));const strings=readFileSync(new URL('../../mobile/App_Resources/iOS/'+locale+'.lproj/InfoPlist.strings',import.meta.url),'utf8');assert.match(strings,/NSCameraUsageDescription/);assert.match(strings,/NSPhotoLibraryAddUsageDescription/);assert.match(strings,/CFBundleDisplayName.*ShaderLab/);}
});
