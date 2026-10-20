import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { cpSync, mkdtempSync, readFileSync, writeFileSync, rmSync, symlinkSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
const require = createRequire(import.meta.url);
test('controlled GUI patch retains baseline and identical shape/text pixels', { skip: !existsSync(resolve(import.meta.dirname, '../../../Engine/engine/src/gui/rendering/GuiCommandCache.ts')) }, async () => {
  const root = resolve(import.meta.dirname, '../..');
  const dir = mkdtempSync(join(tmpdir(), 'shaderlab-gui-patch-'));
  try {
    cpSync(join(root, 'node_modules/@haiyue/engine'), dir, { recursive: true });
    symlinkSync(join(root, 'node_modules'), join(dir, 'node_modules'));
    const loader = require('../scripts/gui-engine-experiment-loader.cjs');
    const file = join(dir, 'dist/chunks/GuiSystem-BkLsoHWL.js');
    const source = readFileSync(file, 'utf8');
    const context = { cacheable() {}, addDependency() {} };
    assert.throws(() => loader.call(context, source + '\n'), /frozen/);
    writeFileSync(file, loader.call(context, source));
    const m = await import(pathToFileURL(join(dir, 'dist/experimental.js')));
    const font = m.buildBitmapFont({ chars: 'ABC?', fontSize: 12, atlasSize: 64, canvasFactory: (width, height) => ({width,height,getContext: () => ({ measureText: () => ({width:8,actualBoundingBoxAscent:8,actualBoundingBoxDescent:2}),clearRect(){},fillText(){} })}) }).data;
    const make = baseline => { globalThis.__shaderlabGuiBaseline = baseline; return {shape:new m.GuiBatch(),text:new m.GuiTextBatch(),image:new m.GuiImageBatch()}; };
    const baseline = make(true), optimized = make(false), textures=[{},{}];
    for (let frame=0;frame<100;frame++) {
      for (const b of [baseline,optimized]) {
        b.shape.clear(); b.text.clear(); b.image.clear();
        b.shape.addShape({x:frame%5,y:4,width:80,height:40,radius:12,strokeWidth:frame%3?1:undefined,roundedMesh:frame%2===0,color:[.1,.2,.3,frame%2?.5:1],clip:{x:1,y:2,width:300,height:400}});
        b.text.addText({text:frame%2?'AB\nC':'BCA',x:1,y:4,width:24,height:50,fontSize:12,multiline:true,wrap:true,color:[1,.5,1,1]});
        b.image.addImage({source:textures[frame%2],x:2,y:3,width:40,height:30,uv:[0,0,1,1],color:[1,1,1,1]});
        b.shape.rebuild(); b.text.rebuild(font); b.image.rebuild();
      }
      for(const kind of ['shape','text']) { assert.equal(optimized[kind].vertexCount,baseline[kind].vertexCount); assert.deepEqual(optimized[kind].vertexData.subarray(0,optimized[kind].vertexCount*(kind==='shape'?15:12)),baseline[kind].vertexData.subarray(0,baseline[kind].vertexCount*(kind==='shape'?15:12))); }
      assert.deepEqual(optimized.image.groups[0].vertexData,baseline.image.groups[0].vertexData);
    }
  } finally { delete globalThis.__shaderlabGuiBaseline; delete globalThis.__shaderlabGuiPatch; rmSync(dir,{recursive:true,force:true}); }
});
