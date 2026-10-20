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

// Native blocks must not root their JS Canvas. A module-level factory also
// avoids sharing the constructor's lexical `this` with cached ObjC methods.
export const appleCanvasCallbacks = `function hyCanvasCallbacks(ref) {
    return {
        background: () => ref.deref()?.__native__context?.__stopRaf(),
        active: () => ref.deref()?.__native__context?.__startRaf(),
        touch: (event) => ref.deref()?._handleEvents(event),
    };
}
`;
export const appleReadyFactory = `let hyReadyListenerClass;
function hyGetReadyListenerClass() {
    if (!hyReadyListenerClass) hyReadyListenerClass = NSObject.extend({
        contextReady() {
            if (this._isReady) return;
            const owner = this.hyOwner?.deref();
            if (owner) { owner._readyEvent(); this._isReady = true; }
        },
    }, { protocols: [NSCCanvasListener] });
    return hyReadyListenerClass;
}
function hyCreateReadyListener(ref) {
    const listener = hyGetReadyListenerClass().new();
    listener.hyOwner = ref;
    return listener;
}
`;
const appleOriginalReady = `            const listener = NSObject.extend({
                contextReady() {
                    if (!this._isReady) {
                        const owner = ref.get();
                        if (owner) {
                            owner._readyEvent();
                            this._isReady = true;
                        }
                    }
                },
            }, {
                protocols: [NSCCanvasListener],
            });
            this._readyListener = listener.new();`;
const appleFixedReady = '            this._readyListener = hyCreateReadyListener(ref);';
const appleOriginalCallbacks = `            this._canvas.enterBackgroundListener = () => {
                if (!this.__native__context) {
                    return;
                }
                this.__native__context.__stopRaf();
            };
            global.__canvasLoaded = true;
            this._canvas.becomeActiveListener = () => {
                if (!this.__native__context) {
                    return;
                }
                this.__native__context.__startRaf();
            };
            this._canvas.touchEventListener = (event, recognizer) => {
                this._handleEvents(event);
            };`;
const appleFixedCallbacks = `            const callbacks = hyCanvasCallbacks(ref);
            this._canvas.enterBackgroundListener = callbacks.background;
            global.__canvasLoaded = true;
            this._canvas.becomeActiveListener = callbacks.active;
            this._canvas.touchEventListener = callbacks.touch;`;
const appleOriginalDispose = `        this._canvas?.setListener?.(null);`;
const appleFixedDispose = `        if (this._canvas) {
            this._canvas.enterBackgroundListener = null;
            this._canvas.becomeActiveListener = null;
            this._canvas.touchEventListener = null;
        }
        this._canvas?.setListener?.(null);`;
export function patchAppleCanvasSource(source){
 const pristine=source.replace(appleCanvasCallbacks,'').replace(appleReadyFactory,'').replace(appleFixedReady,appleOriginalReady).replace(appleFixedCallbacks,appleOriginalCallbacks).replace(appleFixedDispose,appleOriginalDispose);
 if(createHash('sha256').update(pristine).digest('hex')!=='05b21aa70bd4fe0fa0808ddd29d6296e39daaa86b12227e7c563cbe994c37fc1')throw Error('Canvas iOS view binding differs from audited 2.1.18.');
 return appleCanvasCallbacks+appleReadyFactory+pristine.replace(appleOriginalReady,appleFixedReady).replace(appleOriginalCallbacks,appleFixedCallbacks).replace(appleOriginalDispose,appleFixedDispose);
}

/** The iOS C++ binding unconditionally casts data to v8::TypedArray. */
export function patchQueueSource(source) {
  if (source.includes(fixedTextureCall)) return source;
  if (source.split(originalTextureCall).length !== 2) throw new Error('Canvas queue source differs from the audited 2.1.18 binding.');
  return source.replace(originalTextureCall, fixedTextureCall);
}

// Canvas 2.1.18 Android AsyncCallback::prepare creates a second callback
// owner; completing deletes only that owner. Cut the retained JS callback after
// first invocation, including synchronous/throwing completion.
const nativeOnce = `function hyNativeOnce(callback) {
    return (...args) => {
        const invoke = callback;
        callback = undefined;
        return invoke?.(...args);
    };
}
`;
export function patchOneShotSource(source, methods) {
  let result = source;
  for (const method of methods) {
    const marker = '.' + method + '(';
    const start = result.indexOf(marker);
    if (start < 0 || result.indexOf(marker, start + marker.length) >= 0) throw new Error('Canvas async source differs from the audited 2.1.18 binding: ' + method);
    const end = result.indexOf('\n            });\n        });', start);
    if (result.slice(start, start + 120).includes('hyNativeOnce(')) continue;
    if (end < 0) throw new Error('Canvas async callback ending differs: ' + method);
    const block = result.slice(start, end).replace(/, \(([^\n]+)\) => \{/, ', hyNativeOnce(($1) => {');
    if (!block.includes('hyNativeOnce(')) throw new Error('Canvas async callback signature differs: ' + method);
    result = result.slice(0, start) + block + result.slice(end).replace('\n            });', '\n            }));');
  }
  if (!result.includes(nativeOnce)) result = nativeOnce + result;
  return result;
}
function pristineOneShotSource(source) {
  return source.replace(nativeOnce, '').replace(/, hyNativeOnce\(\(([^\n]+)\) => \{([\s\S]*?)\n            \}\)\);/g, ', ($1) => {$2\n            });');
}

const originalErrorCallback = 'device.setuncapturederror(ret._uncapturederror.bind(ret));';
const fixedErrorCallback = 'device.setuncapturederror(ret._uncapturederror.bind({ _emitter: ret._emitter }));';

const originalLost = `            ret._lost = new Promise((resolve, reject) => {
                ret[native_].lost
                    .then((info) => {
                    const ret = new GPUDeviceLostInfo();
                    ret[native_] = info;
                    resolve(ret);
                })
                    .catch((error) => {
                    reject(error);
                });
            });`;
const fixedLost = `            ret._hyLost = hyDeviceLostRelay(device.lost);
            ret._lost = ret._hyLost.promise;`;
const originalDestroy = `    destroy() {
        this.native.destroy();
    }`;
const fixedDestroy = `    destroy() {
        const lost = this._hyLost;
        if (!lost) return;
        this.native.destroy();
        this._hyLost = undefined;
        lost.settle({ reason: 'destroyed', message: 'Device was destroyed.' });
    }`;
// Deliberately outside fromNative: pending native callbacks must not capture ret,
// adapter or a public promise after settlement. Canvas 2.1.18 keeps the native
// lost callback pending on device_destroy (audited upstream tag 1fd6ef4).
const lostRelay = `function hyDeviceLostRelay(nativeLost) {
    let resolvePublic, rejectPublic;
    const promise = new Promise((resolve, reject) => { resolvePublic = resolve; rejectPublic = reject; });
    const settle = (info, error) => {
        const resolve = resolvePublic, reject = rejectPublic;
        resolvePublic = undefined;
        rejectPublic = undefined;
        if (error) reject?.(error);
        else resolve?.(info);
    };
    nativeLost.then(info => settle({
        reason: info?.reason === 1 || info?.reason === 'destroyed' ? 'destroyed' : 'unknown',
        message: info?.message ?? ''
    }), error => settle(undefined, error));
    return { promise, settle };
}
`;

/** Break native -> JS device roots and settle loss on explicit destruction. */
export function patchDeviceSource(source) {
  let result = source;
  for (const [before, after] of [[originalErrorCallback, fixedErrorCallback], [originalLost, fixedLost], [originalDestroy, fixedDestroy]]) {
    if (result.includes(after)) continue;
    if (result.split(before).length !== 2) throw new Error('Canvas device source differs from the audited 2.1.18 binding.');
    result = result.replace(before, after);
  }
  if (!result.includes(lostRelay)) result = result.replace('export class GPUDevice extends EventTarget {', lostRelay + 'export class GPUDevice extends EventTarget {');
  return patchOneShotSource(result, ['createRenderPipelineAsync', 'createComputePipelineAsync']);
}

function pristineDeviceSource(source) {
  return pristineOneShotSource(source).replace(fixedErrorCallback, originalErrorCallback).replace(fixedLost, originalLost).replace(fixedDestroy, originalDestroy).replace(lostRelay, '');
}

export function patchCanvas() {
  const root = new URL('./', pathToFileURL(createRequire(import.meta.url).resolve('@nativescript/canvas/package.json')));
  const version = JSON.parse(readFileSync(new URL('package.json', root), 'utf8')).version;
  if (version !== '2.1.18') throw new Error(`Re-audit Canvas dynamic offset patch for version ${version}.`);
  const appleFile=new URL('Canvas/index.ios.js',root),appleBefore=readFileSync(appleFile,'utf8'),appleAfter=patchAppleCanvasSource(appleBefore);
  if(appleBefore!==appleAfter)writeFileSync(appleFile,appleAfter);
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
  const deviceFile = new URL('WebGPU/GPUDevice.js', root);
  const deviceBefore = readFileSync(deviceFile, 'utf8');
  const devicePristine = pristineDeviceSource(deviceBefore);
  if (createHash('sha256').update(devicePristine).digest('hex') !== 'a8f174d722c53d55f617cc3373ba39149c7858f18e3d6967c42285b47f7c58ce') throw new Error('Canvas device binding hash changed; refusing an unaudited patch.');
  const deviceAfter = patchDeviceSource(deviceBefore);
  if (deviceBefore !== deviceAfter) writeFileSync(deviceFile, deviceAfter);
  for (const [name, method, expected] of [
    ['GPU', 'requestAdapter', 'e38d80d7da522f27aef53e8f724d60822ca0524c57f1e758e8d1db3cf0f9bdd2'],
    ['GPUAdapter', 'requestDevice', 'b10126d6047e4a0878b416d7744a1f28c2b62f84c6abc46cb2997af56cfb038f'],
  ]) {
    const file = new URL(`WebGPU/${name}.js`, root), before = readFileSync(file, 'utf8');
    if (createHash('sha256').update(pristineOneShotSource(before)).digest('hex') !== expected) throw new Error('Canvas ' + name + ' binding hash changed; refusing an unaudited patch.');
    const after = patchOneShotSource(before, [method]);
    if (before !== after) writeFileSync(file, after);
  }
  return { version, deviceSha256: createHash('sha256').update(deviceAfter).digest('hex'), queueSha256: createHash('sha256').update(queueAfter).digest('hex'), file: 'WebGPU/GPURenderPassEncoder.js', sha256: createHash('sha256').update(after).digest('hex') };
}
