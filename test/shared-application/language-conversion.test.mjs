import test from 'node:test';
import assert from 'node:assert/strict';
import { ShaderApplication } from '../../shared/dist/application/application.js';
import { createProject } from '../../shared/dist/domain/model.js';
import { sourceOf, languageOf } from '../../shared/dist/domain/sourceLanguage.js';
const environment = { ids: { next: () => crypto.randomUUID() }, clock: { nowISO: () => new Date().toISOString() } };
const setup = () => {
  const app = new ShaderApplication(environment), pending = [];
  app.connect({ convertSource: (snapshot, pass, target) => new Promise((resolve, reject) => pending.push({snapshot,pass,target,resolve,reject})) });
  return {app, pending};
};
test('conversion captures current draft and atomically commits only on success', async () => {
  const {app,pending} = setup(), before = app.state;
  const result = app.switchLanguage('image','glsl');
  assert.equal(app.state, before);
  assert.equal(sourceOf(pending[0].snapshot,'image'), sourceOf(before.project,'image'));
  pending[0].resolve('converted');
  assert.equal(await result,true);
  assert.equal(languageOf(app.state.project,'image'),'glsl');
  assert.equal(sourceOf(app.state.project,'image'),'converted');
  assert.equal(app.state.revision,before.revision+1);
});
test('edits, newer choices, project replacement and disposal never receive stale conversion writes', async () => {
  for (const scenario of ['edit','choice','open','dispose']) {
    const {app,pending} = setup(), conversion = app.switchLanguage('image','glsl');
    if (scenario === 'edit') app.setSource('image','new draft','wgsl');
    if (scenario === 'choice') await app.switchLanguage('image','wgsl');
    if (scenario === 'open') app.dispatch({type:'project.open',project:createProject('Next',environment)});
    if (scenario === 'dispose') app.dispose();
    const before = app.state;
    pending[0].resolve('obsolete');
    if (scenario === 'edit') await assert.rejects(conversion,/已更改/);
    else assert.equal(await conversion,false);
    assert.equal(app.state,before);
  }
});
