import assert from 'node:assert/strict';
import { build } from 'esbuild';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { runEditorBrowserScenario } from '../../scripts/editor-e2e/browserDriver.mjs';

const root = resolve(import.meta.dirname, '../..');
const out = resolve(root, 'web/artifacts/structs-regression');
mkdirSync(out, { recursive: true });
const original = readFileSync(new URL('./fixtures/structs.glsl', import.meta.url), 'utf8');
const operation = 'adjust(hit.basis[index++][1]);';
const cases = [
  { name: 'original struct fixture', source: original, expected: [64, 128, 191, 255] },
  { name: 'comma statements with matrix component and whole-matrix updates', source: readFileSync(new URL('./fixtures/comma-statements.glsl', import.meta.url), 'utf8'), expected: [64, 128, 191, 255] },
  {
    name: 'loop continue, break and zero iterations preserve condition effects',
    source: `int probes=0;
bool check(int value,int limit) { probes++; return value<limit; }
void mainImage(out vec4 c,in vec2 p) {
  int i=99,j=99,total=0,visits=0;
  for(i=0,j=6;check(i,3);i++,j-=2,total+=i) { if(i==1)continue; visits++; }
  int skipped=0;
  for(int a=0,b=0;check(a,0);a++,b++) { skipped++; }
  int k,l;
  for(k=0,l=2;check(k,4);k++,l--) { if(k==1)break; }
  c=vec4(float(i)*0.1,float(total+visits)*0.1,float(probes)*0.1,
    j==0 && skipped==0 && k==1 && l==1 ? 1.0 : 0.0);
}`,
    expected: [77, 204, 179, 255],
  },
  ...[
    ['compound assignment', 'hit.basis[index++][1] += 1.0;'],
    ['postfix increment', 'float previous = hit.basis[index++][1]++; good = good && previous == 2.0;'],
    ['prefix increment', 'float nextValue = ++hit.basis[index++][1]; good = good && nextValue == 3.0;'],
  ].map(([name, replacement]) => ({ name, source: original.replace(operation, replacement), expected: [64, 128, 191, 255] })),
  {
    name: 'nested array index effects before snapshot, later argument after snapshot',
    source: `struct S { mat2 m[2]; };
int pick(inout S s, inout int count) { count++; s.m[1][0][1] = 4.0; return 1; }
void bump(inout float x, float ignored) { x += 1.0; }
void mainImage(out vec4 c, in vec2 p) {
  S s; int count=0, column=0, row=1;
  bump(s.m[pick(s, count)][column++][row--], s.m[1][0][1]++);
  c=vec4(s.m[1][0][1]*0.1, float(count+column)*0.1, float(row)*0.1, 1.0);
}`,
    expected: [128, 51, 0, 255],
  },
  {
    name: 'compound RHS mutation preserves unrelated matrix components',
    source: `struct S { mat2 m; };
float rhs(inout S s) { s.m[1][1]=7.0; return 1.0; }
void mainImage(out vec4 c, in vec2 p) {
  S s; s.m[0][1]=2.0; int column=0, row=1;
  s.m[column++][row--] += rhs(s);
  c=vec4(s.m[0][1]*0.1, s.m[1][1]*0.1, float(column+row)*0.1, 1.0);
}`,
    expected: [77, 179, 26, 255],
  },
];

// Exercise the actual runtime without UI registration or app state. A failing
// pixel is a failing test, unlike the historical G01 diagnostic-only probe.
const bundle = await build({
  stdin: {
    resolveDir: root,
    loader: 'js',
    contents: `
import { ShaderRuntime } from './web/dist/runtime.js';
import { createProject } from './web/dist/model.js';
import { translateGlsl } from './web/dist/glsl.js';
window.structResults = (async () => {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = 'width:256px;height:256px'; document.body.append(canvas);
  const runtime = new ShaderRuntime(canvas);
  const results = [];
  try {
    await runtime.initialize();
    for (const { name, source, expected } of ${JSON.stringify(cases)}) {
      const translated = translateGlsl(source);
      if (!translated.code || translated.diagnostics.length) throw Error(JSON.stringify(translated.diagnostics));
      const project = createProject(name); project.passes[4].code = translated.code;
      runtime.commit(await runtime.prepare(project)); runtime.step();
      const { width, height, pixels } = await runtime.readImage();
      // Cover both spatial branches and both switch cases, not just center.
      const points = [[1,1], [width-2,1], [width>>1,height>>1], [(width>>1)+1,height>>1]];
      const samples = points.map(([x,y]) => Array.from(pixels.slice((y*width+x)*4, (y*width+x)*4+4)));
      results.push({ name, expected, points, samples });
    }
  } finally { await runtime.dispose(); }
  return results;
})();`,
  },
  outfile: resolve(out, 'probe.bundle.js'),
  bundle: true,
  format: 'esm',
  metafile: true,
});
const uiModuleCount = Object.keys(bundle.metafile.inputs).filter(path => path.includes('/@haiyue/ui/')).length;
assert.equal(uiModuleCount, 0);
writeFileSync(resolve(out, 'index.html'), '<!doctype html><meta charset="utf-8"><script type="module" src="./probe.bundle.js"></script>');
const report = await runEditorBrowserScenario({
  root, route: 'web/artifacts/structs-regression/index.html', downloadDirectory: out,
  readinessExpression: 'Boolean(window.structResults)',
  scenario: async ({ evaluate, getBrowserErrors }) => ({
    results: await evaluate('structResults'), browserErrors: getBrowserErrors(),
    userAgent: await evaluate('navigator.userAgent'),
  }),
});
const failures = report.results.filter(result => result.samples.some(sample => sample.some((v, i) => Math.abs(v-result.expected[i]) > 1)));
writeFileSync(resolve(out, 'report.json'), JSON.stringify({ ...report, uiModuleCount, status: failures.length || report.browserErrors.length ? 'failed' : 'passed' }, null, 2) + '\n');
assert.deepEqual(report.browserErrors, []);
assert.deepEqual(failures, [], JSON.stringify(failures));
console.log(`Passed ${report.results.length} struct/matrix GPU cases without UI imports.`);
