import clone from 'core-js-pure/actual/structured-clone';
import { isAndroid } from '@nativescript/core';
if (!globalThis.structuredClone)
    Object.defineProperty(globalThis, 'structuredClone', { value: clone, configurable: true });
if (!globalThis.crypto?.randomUUID)
    Object.defineProperty(globalThis, 'crypto', { value: { randomUUID: () => isAndroid ? java.util.UUID.randomUUID().toString() : NSUUID.UUID().UUIDString.toLowerCase() }, configurable: true });
