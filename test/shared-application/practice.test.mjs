import assert from 'node:assert/strict';
import {test} from 'node:test';
import {legacyPracticeStarters} from '../../shared/dist/domain/practice-legacy-starters.js';
import {PRACTICE_CHALLENGES,practiceStarter,practiceProject,parsePracticeRecords,comparePractice} from '../../shared/dist/domain/practice.js';
test('36 distinct, graded practice challenges have complete bilingual specifications',()=>{assert.equal(PRACTICE_CHALLENGES.length,36);assert.equal(new Set(PRACTICE_CHALLENGES.map(c=>c.id)).size,36);assert.equal(new Set(PRACTICE_CHALLENGES.map(c=>c.reference)).size,36);for(const level of [1,2,3])assert.equal(PRACTICE_CHALLENGES.filter(c=>c.level===level).length,12);for(const c of PRACTICE_CHALLENGES)for(const pair of [c.title,c.topic,c.goal,c.hint]){assert.equal(pair.length,2);assert.ok(pair.every(t=>t.trim().length));}});
test('starters never contain an answer and retain all language drafts independently',()=>{for(const language of ['wgsl','glsl','hlsl']){const source=practiceStarter(language);assert.equal(source.split('\n').length,3);assert.doesNotMatch(source,/\b(?:const|static|let|var|uv|BG|INK|GOLD|PI|mask|box|segment|rotate)\b/);assert.match(source,/0\.03, 0\.04, 0\.08, 1\.0/);const p=practiceProject(PRACTICE_CHALLENGES[0],source,language);assert.equal(p.editorLanguages.image,language);assert.equal(p.passes.find(p=>p.id==='image')[language==='wgsl'?'code':language],source);assert.equal(p.assets.length,0);}});
test('judging accepts equivalent pixels but rejects blank images, localized mistakes, transparency and dimensions',()=>{const image=value=>({width:10,height:10,pixels:new Uint8Array(400).fill(value)});const target=image(128);assert.equal(comparePractice(image(128),target).passed,true);assert.equal(comparePractice(image(129),target).passed,true);assert.equal(comparePractice(image(0),target).passed,false);const sparse=image(128);for(let i=0;i<16;i+=4)sparse.pixels[i]=200;assert.equal(comparePractice(sparse,target).passed,false);const alpha=image(128);for(let i=3;i<400;i+=4)alpha.pixels[i]=0;assert.equal(comparePractice(alpha,target).passed,false);assert.throws(()=>comparePractice({...image(128),width:9},target));});
test('malformed or outdated local progress cannot replace challenges or inject invalid drafts',()=>{assert.deepEqual(parsePracticeRecords('{broken'),{});assert.deepEqual(parsePracticeRecords('null'),{});assert.deepEqual(parsePracticeRecords('{"constructor":{},"first-color":{"source":"a","language":"bad"}}'),{});const parsed=parsePracticeRecords(JSON.stringify({'first-color':{source:'my draft',language:'glsl',best:999,passed:true},'uv-map':{source:'x',language:'wgsl',best:'90',passed:'true'},unknown:{source:'x',language:'wgsl'}}));assert.deepEqual(parsed['first-color'],{source:'my draft',language:'glsl',best:100,passed:true,reviewed:false});assert.equal(parsed['uv-map'].best,0);assert.equal(parsed['uv-map'].passed,false);assert.equal(parsed.unknown,undefined);});

test('reference solutions only declare constants, helpers and coordinates used by that challenge',()=>{
  for(const c of PRACTICE_CHALLENGES){
    for(const [,name] of c.reference.matchAll(/^(?:const|fn) (\w+)/gm)){
      if(name==='mainImage')continue;
      assert.ok([...c.reference.matchAll(new RegExp('\\b'+name+'\\b','g'))].length>1,c.id+': unused '+name);
    }
    const main=c.reference.slice(c.reference.indexOf('fn mainImage'));
    for(const name of ['uv','p'])if(main.includes('let '+name+' ='))assert.ok([...main.matchAll(new RegExp('\\b'+name+'\\b','g'))].length>1,c.id+': unused coordinate '+name);
  }
  const color=PRACTICE_CHALLENGES.find(c=>c.id==='first-color').reference;
  assert.equal(color.split('\n').length,4);assert.doesNotMatch(color,/\b(?:BG|GOLD|PI|uv|p|mask|box|segment|rotate)\b/);
  const uv=PRACTICE_CHALLENGES.find(c=>c.id==='uv-map').reference;
  assert.doesNotMatch(uv,/^(?:const|fn (?!mainImage))/m);
});
test('exact untouched old defaults become solid-color starters, while edits, language and progress survive',()=>{
  for(const language of ['wgsl','glsl','hlsl']){
    const old=legacyPracticeStarters[language];
    const records=parsePracticeRecords(JSON.stringify({'first-color':{source:old,language,best:42,passed:false,reviewed:true},'uv-map':{source:old+'\n// my own code',language,best:99,passed:true,reviewed:true}}));
    assert.deepEqual(records['first-color'],{source:practiceStarter(language),language,best:42,passed:false,reviewed:true});
    assert.deepEqual(records['uv-map'],{source:old+'\n// my own code',language,best:99,passed:true,reviewed:true});
  }
});
