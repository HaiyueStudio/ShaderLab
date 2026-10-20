import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
const here=import.meta.dirname, root=resolve(here,'../../..');
const record=JSON.parse(readFileSync(resolve(here,'verification.json')));
const sha=value=>createHash('sha256').update(value).digest('hex');
assert.equal(record.status,'passed');
assert.equal(sha(JSON.stringify(record.sourceHashes)),record.sourceFingerprint);
for(const [file,expected] of Object.entries(record.sourceHashes))assert.equal(sha(readFileSync(resolve(root,file))),expected,`source changed: ${file}`);
for(const [file,expected] of Object.entries(record.artifacts))assert.equal(sha(readFileSync(resolve(here,file))),expected,`evidence changed: ${file}`);
for(const check of record.checks)assert.equal(check.status,'passed');
for(const bundle of record.bundles){assert.equal(bundle.matchesCurrentSharedApplication,true);assert.deepEqual(bundle.webDistImports,[]);}
console.log(`G02 source/evidence identity passed: ${record.sourceFingerprint}. Device/UI handoff remains with G07.`);
