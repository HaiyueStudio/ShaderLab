import {test} from 'node:test';
import assert from 'node:assert/strict';
import {codeLineStarts,codeLineAt,codeIndent} from '../src/platform/code-lines.ts';
test('gutter offsets agree with native UTF-16 selection across emoji, CRLF and trailing empty lines',()=>{
 const source='// 🌙\r\n    color\n',starts=codeLineStarts(source);assert.deepEqual(starts,[0,7,17]);
 assert.equal(codeLineAt(starts,4),0);assert.equal(codeLineAt(starts,7),1);assert.equal(codeLineAt(starts,source.length),2);assert.deepEqual(codeLineStarts(''),[0]);
});
test('indent columns retain two-space indentation and align tabs to four-column stops',()=>{
 for(const [source,levels] of [['    x',4],['  \tx',4],['\t    x',8],['   x',3],['\n    x',0]])assert.equal(codeIndent(source,0),levels);
});
