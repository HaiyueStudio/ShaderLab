import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runEditorBrowserScenario } from '../../scripts/editor-e2e/browserDriver.mjs';
import { examples } from '../dist/examples.js';
const root = resolve(import.meta.dirname, '../..'),
  out = resolve(root, 'web/artifacts/hlsl-conversion');
mkdirSync(out, { recursive: true });
const report = await runEditorBrowserScenario({
  root,
  route: 'web/app-dist/index.html#editor',
  downloadDirectory: out,
  timeoutMs: 90000,
  failureScreenshotPath: resolve(out, 'failure.png'),
  readinessExpression:
    'shaderEditor.getStatus()?.ready && shaderEditor.getApplicationState().compile.status==="ready"',
  scenario: async ({
    evaluate,
    click: rawClick,
    waitFor,
    nextPaint,
    cdp,
    assertNoBrowserErrors,
  }) => {
    const click = async (expression) => {
      await evaluate(
        `(${expression}).scrollIntoView({block:"center",inline:"nearest"})`,
      );
      await nextPaint();
      await rawClick(expression);
    };
    const call = async (operation, params = {}) => {
      const r = await evaluate(
        '(async()=>{const d=haiyueEditor.listDocuments().documents[0];return haiyueEditor.execute({apiVersion:"1",requestId:crypto.randomUUID(),documentId:d.identity.id,expectedRevision:d.revision,operation:' +
          JSON.stringify(operation) +
          ',params:' +
          JSON.stringify(params) +
          '});})()',
      );
      assert.equal(r.status, 'completed', JSON.stringify(r));
      return r.value;
    };
    const source = (pass, code, language = 'wgsl') =>
      call('shader.source.set', { pass, code, language });
    const choose = async (pass, language) => {
      await click(
        'document.querySelector("#pass-tabs [data-pass=\\"' + pass + '\\"]")',
      );
      await evaluate(
        '(()=>{const s=document.getElementById("code-language").shadowRoot.querySelector("select");s.value=' +
          JSON.stringify(language) +
          ';s.dispatchEvent(new Event("change",{bubbles:true}));})()',
      );
      await waitFor(
        () =>
          evaluate(
            '!document.getElementById("code-language").disabled && shaderEditor.getProject().editorLanguages?.[' +
              JSON.stringify(pass) +
              ']===' +
              JSON.stringify(language),
          ),
        pass + ' converts to ' + language,
      );
      assert.equal(
        await evaluate(
          'document.querySelector("#code-editor .cm-content").getAttribute("aria-label")',
        ),
        language.toUpperCase() + ' 代码编辑器',
      );
    };
    const render = async () => {
      const r = await call('shader.compile');
      if (!r.compiled)
        writeFileSync(
          resolve(out, 'failure-project.json'),
          JSON.stringify(await evaluate('shaderEditor.getProject()'), null, 2),
        );
      assert.equal(r.compiled, true, JSON.stringify(r));
      await waitFor(
        () => evaluate('shaderEditor.getStatus()?.frame>2'),
        'converted shader frames',
      );
    };
    const pixel = async () => {
      const r = await call('shader.image.read');
      return evaluate(
        '(()=>{const b=haiyueEditor.readResource(' +
          JSON.stringify(r.resourceId) +
          ');const i=(' +
          r.width +
          '*Math.floor(' +
          r.height +
          '/2)+Math.floor(' +
          r.width +
          '/2))*4;const p=Array.from(b.slice(i,i+4));haiyueEditor.releaseResource(' +
          JSON.stringify(r.resourceId) +
          ');return p;})()',
      );
    };
    const near = (p, e) =>
      p.forEach((v, i) =>
        assert.ok(Math.abs(v - e[i]) < 3, JSON.stringify({ p, e })),
      );
    const common = 'fn gain(x:f32)->f32{return x*0.5;}';
    await source('common', common);
    await source(
      'buffer-a',
      '// preserve matrix palette\nfn mainImage(p:vec2f)->vec4f{let m=mat2x2f(.1,.2,.3,.4);let c=m*vec2f(.2,.4);return vec4f(c,gain(.8),1.0);}',
    );
    await call('shader.pass.enable', { pass: 'buffer-a', enabled: true });
    await source(
      'image',
      'fn mainImage(p:vec2f)->vec4f{return channel0(p/iResolution.xy);}',
    );
    await call('shader.channel.set', {
      pass: 'image',
      index: 0,
      channel: { kind: 'buffer', pass: 'buffer-a' },
    });
    await source(
      'sound',
      'fn mainSound(s:i32,t:f32)->vec2f{return vec2f(gain(sin(t*440.0*6.2831853)));}',
    );
    await call('shader.pass.enable', { pass: 'sound', enabled: true });
    await call('shader.sound.configure', { duration: 1 });
    await render();
    near(await pixel(), [36, 51, 102, 255]);
    for (const pass of ['buffer-a', 'image', 'sound'])
      await choose(pass, 'hlsl');
    await render();
    near(await pixel(), [36, 51, 102, 255]);
    const hlsl = await evaluate('shaderEditor.getProject()');
    assert.equal(hlsl.common, common);
    assert.match(
      hlsl.passes.find((p) => p.id === 'buffer-a').hlsl,
      /preserve matrix palette/,
    );
    assert.doesNotMatch(
      hlsl.passes.find((p) => p.id === 'buffer-a').hlsl,
      /float slCommonX/,
    );
    await source('common', common.replace('0.5', '0.75'));
    await render();
    near(await pixel(), [36, 51, 153, 255]);
    const audio = await call('shader.sound.export');
    assert.ok(
      await evaluate(
        '(()=>{const b=haiyueEditor.readResource(' +
          JSON.stringify(audio.resourceId) +
          ');const ok=b.length>44100&&b.slice(44).some(v=>v!==0);haiyueEditor.releaseResource(' +
          JSON.stringify(audio.resourceId) +
          ');return ok;})()',
      ),
    );
    for (const language of ['glsl', 'wgsl', 'hlsl']) {
      for (const pass of ['buffer-a', 'image', 'sound'])
        await choose(pass, language);
      await render();
      near(await pixel(), [36, 51, 153, 255]);
    }
    const saved = await call('shader.project.export');
    await call('shader.project.open', { resourceId: saved.resourceId });
    await waitFor(
      () =>
        evaluate('shaderEditor.getApplicationState().compile.status==="ready"'),
      'converted project reopens',
    );
    near(await pixel(), [36, 51, 153, 255]);
    const reopened = await evaluate('shaderEditor.getProject()');
    for (const pass of ['buffer-a', 'image', 'sound'])
      assert.equal(reopened.editorLanguages[pass], 'hlsl');
    writeFileSync(
      resolve(out, 'project.hyshader'),
      JSON.stringify(reopened, null, 2) + '\n',
    );
    await click('document.querySelector("#pass-tabs [data-pass=\\"image\\"]")');
    await source(
      'image',
      'float4 mainImage(float2 p){return missing;}',
      'hlsl',
    );
    const before = await evaluate(
      'shaderEditor.getApplicationState().revision',
    );
    await evaluate(
      '(()=>{const s=document.getElementById("code-language").shadowRoot.querySelector("select");s.value="wgsl";s.dispatchEvent(new Event("change",{bubbles:true}));})()',
    );
    await waitFor(
      () => evaluate('!document.getElementById("code-language").disabled'),
      'invalid HLSL conversion settles',
    );
    assert.equal(
      await evaluate('shaderEditor.getApplicationState().revision'),
      before,
    );
    assert.equal(
      await evaluate('shaderEditor.getProject().editorLanguages.image'),
      'hlsl',
    );
    assert.match(
      await evaluate(
        'document.querySelector("#code-editor .cm-content").textContent',
      ),
      /missing/,
    );
    near(await pixel(), [36, 51, 153, 255]);
    await source(
      'image',
      reopened.passes.find((p) => p.id === 'image').hlsl,
      'hlsl',
    );
    await render();
    await nextPaint();
    const shot = await cdp.call('Page.captureScreenshot', { format: 'png' });
    writeFileSync(
      resolve(out, 'editor.png'),
      Buffer.from(shot.result.data, 'base64'),
    );
    const gallery = [];
    for (const example of examples()) {
      await evaluate(
        'shaderEditor.open(' + JSON.stringify(example.project) + ')',
      );
      await waitFor(
        () =>
          evaluate(
            'shaderEditor.getApplicationState().compile.status==="ready"',
          ),
        'open ' + example.id,
      );
      for (const pass of example.project.passes.filter((p) => p.enabled))
        await choose(pass.id, 'hlsl');
      await render();
      const r = await call('shader.image.read');
      const colors = await evaluate(
        '(()=>{const b=haiyueEditor.readResource(' +
          JSON.stringify(r.resourceId) +
          ');const colors=new Set();for(let i=0;i<b.length;i+=4)colors.add(b[i]+","+b[i+1]+","+b[i+2]);haiyueEditor.releaseResource(' +
          JSON.stringify(r.resourceId) +
          ');return colors.size;})()',
      );
      assert.ok(
        colors > 8,
        example.id + ' must render visible content after HLSL conversion',
      );
      gallery.push({ id: example.id, status: 'passed', colors });
    }
    assertNoBrowserErrors();
    return {
      status: 'passed',
      pixel: [36, 51, 153, 255],
      gallery,
      checks: [
        'real UI selects HLSL and converts current Image / Buffer / Sound',
        'non-symmetric matrix and Buffer texture pixels retain their values across WGSL / HLSL / GLSL',
        'Common stays independent and edits update HLSL without reconverting Passes',
        'converted HLSL Sound produces PCM',
        'conversion metadata and current sources survive export/reopen',
        'invalid HLSL preserves source, language, revision and the last GPU image',
        'all eight Gallery examples convert through the real language menu and render visible GPU pixels',
      ],
    };
  },
});
writeFileSync(
  resolve(out, 'report.json'),
  JSON.stringify(report, null, 2) + '\n',
);
console.log(report);
