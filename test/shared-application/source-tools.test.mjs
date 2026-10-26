import test from 'node:test';
import assert from 'node:assert/strict';
import {sourceMatches,replaceSourceMatches} from '../../shared/dist/domain/source-search.js';
import {sourceDiff} from '../../shared/dist/domain/source-diff.js';

test('literal search uses UTF-16 selection offsets, escaping and case; replacement is literal',()=>{
 const code='🌙 A.x\na.x + A.x $&';
 assert.deepEqual(sourceMatches(code,'a.x'),[{start:3,end:6},{start:7,end:10},{start:13,end:16}]);
 assert.equal(sourceMatches(code,'A.x',true).length,2);
 assert.equal(replaceSourceMatches(code,'A.x','$&',true).source,'🌙 $&\na.x + $& $&');
 for(const query of ['[a]','.*','\\','(x)','${a}'])assert.equal(sourceMatches(query+' '+query,query).length,2);
 assert.deepEqual(replaceSourceMatches(code,'','x'),{source:code,count:0});
 assert.deepEqual(sourceMatches('a\nb\na\nb','a\nb'),[{start:0,end:3},{start:4,end:7}]);
});
test('bounded diff reconstructs both sources exactly, including empty and large changes',()=>{
 for(const[a,b]of [['',''],['x',''],['','y'],['a\nb\nc','a\nx\nc'],['x\n'.repeat(900),'y\n'.repeat(900)]]){
  const diff=sourceDiff(a,b);
  assert.equal(diff.lines.filter(l=>l.kind!=='added').map(l=>l.text).join('\n'),a);
  assert.equal(diff.lines.filter(l=>l.kind!=='removed').map(l=>l.text).join('\n'),b);
  assert.equal(diff.added,diff.lines.filter(l=>l.kind==='added').length);
 }
});
