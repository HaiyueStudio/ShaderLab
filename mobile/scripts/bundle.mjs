import {prepare,run,require} from './prepare.mjs';
const platform=process.argv[2];if(!['android','ios'].includes(platform))throw Error('Use android or ios');
await prepare();run(require.resolve('webpack/bin/webpack.js'),['--config','webpack.config.js','--env',platform,'--env','nativescriptLibPath','--env','buildPath=artifacts/bundles']);
