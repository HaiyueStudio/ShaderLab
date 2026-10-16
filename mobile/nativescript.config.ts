import type { NativeScriptConfig } from '@nativescript/core';
// This config executes in Node, while the app's type environment declares
// NativeScript's narrower require function.
const { dirname, join } = require('node:path');
const resolvePackage = (require as typeof require & { resolve(id: string): string }).resolve;

export default {
  id: 'studio.haiyue.shaderlab',
  projectName: 'ShaderLab',
  appPath: 'src',
  appResourcesPath: 'App_Resources',
  ios: {
    discardUncaughtJsExceptions: false,
    // npm workspaces may hoist Canvas outside mobile/node_modules. Resolve the
    // installed package instead of using the plugin's app-relative SPM path.
    SPMPackages: [{
      name: 'CanvasNative',
      libs: ['NativeScriptV8'],
      path: join(dirname(resolvePackage('@nativescript/canvas/package.json')), 'platforms/ios/NativeScriptV8'),
    }],
  },
  android: { v8Flags: '--expose_gc', markingMode: 'none' },
} as NativeScriptConfig;
