import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MobileSession} from '../src/session.ts';
import {mobileLayout} from '../src/layout.ts';
import {shaderSpans} from '../src/highlight-tokens.ts';
import {createProject,parseProject,passOf} from '../../web/dist/model.js';
import {examples} from '../../web/dist/examples.js';
import {TUTORIAL_CHAPTERS} from '../../web/dist/tutorialContent.js';
import {tutorialProject} from '../../web/dist/tutorialLabs.js';
import {refreshProjectGlsl} from '../../web/dist/glslProject.js';
test('phone, tablet, rotation and keyboard bounds keep both editor panes usable',()=>{
 for(const [w,h] of [[320,480],[390,550],[640,280]]){const p=mobileLayout(w,h,'code');assert.equal(p.split,false);assert.equal(p.code,true);assert.equal(p.preview,false);}
 for(const [w,h] of [[768,800],[1194,650]]){const p=mobileLayout(w,h);assert.equal(p.split,true);assert.equal(p.code,true);assert.equal(p.preview,true);}
 assert.equal(mobileLayout(1194,300,'code').split,false);assert.equal(mobileLayout(500,900).galleryColumns,1);assert.equal(mobileLayout(800,900).galleryColumns,2);
});
test('opening examples stays unsaved, each language keeps its draft and buffers remain portable',()=>{
 const session=new MobileSession();session.open(examples()[0].project,true);assert.equal(session.dirty,false);assert.notEqual(session.project.id,examples()[0].project.id);
 const original=session.source;session.paste('void mainImage(out vec4 color,in vec2 coord){color=vec4(1.0);}');assert.equal(session.language,'glsl');assert.equal(session.dirty,true);session.switchLanguage('wgsl');assert.equal(session.source,original);session.switchLanguage('glsl');assert.match(session.source,/void mainImage/);
 session.add('buffer-a');session.channel(0,{kind:'buffer',pass:'buffer-b'});assert.ok(session.tabs.includes('buffer-b'));assert.equal(passOf(session.project,'buffer-b').enabled,true);
 session.enable('buffer-b',false);assert.equal(passOf(session.project,'buffer-a').channels[0].kind,'none');session.add('sound');assert.equal(session.project.sound.enabled,true);
 const restored=parseProject(JSON.stringify(session.project));assert.deepEqual(restored,session.project);
});
test('the shared mobile source path can link every Gallery and all progressive tutorials',()=>{
 for(const project of [...examples().map(e=>e.project),...TUTORIAL_CHAPTERS.map(c=>tutorialProject(c.id))]){const session=new MobileSession();session.open(project);assert.deepEqual(refreshProjectGlsl(session.project),[]);parseProject(JSON.stringify(session.project));}
});
test('GLSL and WGSL highlights preserve UTF-16 offsets and color directives, comments and language tokens',()=>{
 for(const [language,source] of [['glsl','// 中文\n#define PI 3.14\nvec3 color = sin(vec3(iTime));'],['wgsl','@fragment fn mainImage(p: vec2f) -> vec4f { return vec4f(1.0); }']]){const spans=shaderSpans(source,language);assert.ok(spans.length>5);assert.ok(spans.every(s=>s.start>=0&&s.end<=source.length&&s.start<s.end));assert.ok(spans.some(s=>source.slice(s.start,s.end)===(language==='glsl'?'vec3':'fn')));}
});
