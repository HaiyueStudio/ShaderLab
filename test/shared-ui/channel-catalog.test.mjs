import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {categoriesFor,channelChoices} from '../../shared/dist/views/channel-catalog.js';

test('material choices retain asset identities even with duplicate names and exclude realtime Sound inputs',()=>{
 const project=JSON.parse(readFileSync(new URL('../../review/m24-ui/g01/project.hyshader',import.meta.url)));
 project.assets=[{id:'image-a',name:'same',dataUrl:'data:image/png;base64,a'},{id:'image-b',name:'same',dataUrl:'data:image/png;base64,b'},{id:'video',kind:'video',name:'same',dataUrl:'data:video/webm;base64,a'}];
 assert.deepEqual(channelChoices(project,'image','image').map(c=>c.channel.assetId),['image-a','image-b']);
 assert.deepEqual(categoriesFor('sound').map(c=>c.value),['builtin','image','cubemap']);
 for(const category of ['video','device','buffer'])assert.deepEqual(channelChoices(project,'sound',category),[]);
 assert.equal(channelChoices(project,'image','video')[0].channel.assetId,'video');
});
