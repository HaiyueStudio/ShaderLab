const webpack=require('@nativescript/webpack');
const path=require('node:path');
module.exports=env=>{
 webpack.init(env);
 webpack.chainWebpack(config=>{
   if (!process.env.SHADERLAB_ENGINE_CANDIDATE) return;
   if (process.env.SHADERLAB_GUI_ENGINE_PATCH === '1') throw Error('Full Engine candidate cannot be combined with the legacy GUI patch');
   const candidate = require('./scripts/engine-candidate.cjs').engineCandidate(process.env.SHADERLAB_ENGINE_CANDIDATE);
   for (const [name, file] of Object.entries(candidate.aliases)) config.resolve.alias.set(name, file);
   config.plugin('ShaderLabEngineCandidate').use(require('webpack').DefinePlugin, [{'globalThis.__shaderlabEngineCandidate':JSON.stringify(candidate.identity)}]);
   console.log('ShaderLab Engine candidate:', candidate.identity);
 });
 webpack.chainWebpack(config=>{ if(process.env.SHADERLAB_GUI_ENGINE_PATCH === '1') config.module.rule('gui-engine-experiment').test(/GuiSystem-BkLsoHWL\.js$/).use('gui-engine-experiment').loader(path.resolve(__dirname,'scripts/gui-engine-experiment-loader.cjs')); config.resolve.modules.prepend(path.resolve(__dirname,'../node_modules')); config.resolve.set('extensionAlias',{'.js':['.ts','.js']}); config.resolve.set('conditionNames',['require','import','default']); config.plugin('ShaderLabCompilerIsolation').use(require('webpack').ContextExclusionPlugin,[/[\\/]compiler[\\/]/]); });
 webpack.Utils.addCopyRule({from:path.resolve(__dirname,'src/assets'),to:'assets',noErrorOnMissing:false});
 webpack.Utils.addCopyRule({from:path.resolve(__dirname,'generated/compiler'),to:'compiler',noErrorOnMissing:false});
 return webpack.resolveConfig();
};
