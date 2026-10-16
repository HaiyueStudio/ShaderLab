import { createRequire } from 'node:module';
import { pathToFileURL } from 'node:url';
import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';

const originalCall = 'this[native_].setBindGroup(index, group, dynamicOffsetsData, dynamicOffsetsDataStart, dynamicOffsetsDataLength);';
const fixedCall = 'this[native_].setBindGroup(index, group, dynamicOffsetsData, dynamicOffsetsDataStart ?? 0, dynamicOffsetsDataLength ?? (dynamicOffsetsData.length - (dynamicOffsetsDataStart ?? 0)));';

/** Canvas 2.1.18 forwards undefined typed-array range values as zero native offsets. */
export function patchRenderPassSource(source) {
  if (source.includes(fixedCall)) return source;
  if (source.split(originalCall).length !== 2) throw new Error('Canvas render-pass source differs from the audited 2.1.18 binding.');
  return source.replace(originalCall, fixedCall);
}

const originalTextureCall = 'this[native_].writeTexture(dst, data, dataLayout, ext);';
const fixedTextureCall = 'this[native_].writeTexture(dst, ArrayBuffer.isView(data) ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength) : new Uint8Array(data), dataLayout, ext);';

/** The iOS C++ binding unconditionally casts data to v8::TypedArray. */
export function patchQueueSource(source) {
  if (source.includes(fixedTextureCall)) return source;
  if (source.split(originalTextureCall).length !== 2) throw new Error('Canvas queue source differs from the audited 2.1.18 binding.');
  return source.replace(originalTextureCall, fixedTextureCall);
}

export function patchCanvas() {
  const root = new URL('./', pathToFileURL(createRequire(import.meta.url).resolve('@nativescript/canvas/package.json')));
  const version = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version;
  if (version !== '2.1.18') throw new Error(`Re-audit Canvas dynamic offset patch for version ${version}.`);
  const file = new URL('WebGPU/GPURenderPassEncoder.js', root);
  const before = readFileSync(file, 'utf8');
  const pristine = before.replace(fixedCall, originalCall);
  if (createHash('sha256').update(pristine).digest('hex') !== 'd1053bf48b3b097a21a1ae5fa900ee97520a0e1d9ce77c947695e3a39b662401') throw new Error('Canvas binding hash changed; refusing an unaudited patch.');
  const after = patchRenderPassSource(before);
  if (before !== after) writeFileSync(file, after);
  const queueFile = new URL('WebGPU/GPUQueue.js', root);
  const queueBefore = readFileSync(queueFile, 'utf8');
  const queuePristine = queueBefore.replace(fixedTextureCall, originalTextureCall);
  if (createHash('sha256').update(queuePristine).digest('hex') !== 'c9275fddae10e4371baa4e5e4b6092b0476808fa7ec56ea30323cc37513b0123') throw new Error('Canvas queue binding hash changed; refusing an unaudited patch.');
  const queueAfter = patchQueueSource(queueBefore);
  if (queueBefore !== queueAfter) writeFileSync(queueFile, queueAfter);
  return { version, queueSha256: createHash('sha256').update(queueAfter).digest('hex'), file: 'WebGPU/GPURenderPassEncoder.js', sha256: createHash('sha256').update(after).digest('hex') };
}
