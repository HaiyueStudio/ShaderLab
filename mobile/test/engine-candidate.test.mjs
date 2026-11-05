import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync, mkdirSync, writeFileSync, rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import candidate from '../scripts/engine-candidate.cjs';
test('full Engine experiment resolves every subpath and fingerprints transitive chunks', () => {
  const root = mkdtempSync(join(tmpdir(), 'shaderlab-engine-'));
  try {
    mkdirSync(join(root,'dist/chunks'),{recursive:true});
    writeFileSync(join(root,'package.json'),JSON.stringify({name:'@haiyue/engine',version:'test',exports:{'.':{import:'./dist/index.js'},'./gui':{import:'./dist/gui.js'}}}));
    for(const file of ['index.js','gui.js','chunks/internal.js']) writeFileSync(join(root,'dist',file),'export {};');
    const before = candidate.engineCandidate(root);
    assert.equal(before.aliases['@haiyue/engine/gui$'],join(root,'dist/gui.js'));
    assert.equal(before.identity.sha256,candidate.engineCandidate(root).identity.sha256);
    writeFileSync(join(root,'dist/chunks/internal.js'),'export const updated = true;');
    assert.notEqual(before.identity.sha256,candidate.engineCandidate(root).identity.sha256);
    rmSync(join(root,'dist/gui.js'));
    assert.throws(()=>candidate.engineCandidate(root),/Missing built Engine export/);
  } finally { rmSync(root,{recursive:true,force:true}); }
});
