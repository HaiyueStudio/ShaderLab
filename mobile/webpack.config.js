const webpack=require('@nativescript/webpack');
const path=require('node:path');
module.exports=env=>{
 webpack.init(env);
 webpack.chainWebpack(config=>{ if(process.env.SHADERLAB_GUI_ENGINE_PATCH === '1') config.module.rule('gui-engine-experiment').test(/GuiSystem-BkLsoHWL\.js$/).use('gui-engine-experiment').loader(path.resolve(__dirname,'scripts/gui-engine-experiment-loader.cjs')); config.resolve.modules.prepend(path.resolve(__dirname,'../node_modules')); config.resolve.set('extensionAlias',{'.js':['.ts','.js']}); config.resolve.set('conditionNames',['require','import','default']); config.plugin('ShaderLabCompilerIsolation').use(require('webpack').ContextExclusionPlugin,[/[\\/]compiler[\\/]/]); });
 webpack.Utils.addCopyRule({from:path.resolve(__dirname,'src/assets'),to:'assets',noErrorOnMissing:false});
 webpack.Utils.addCopyRule({from:path.resolve(__dirname,'generated/compiler'),to:'compiler',noErrorOnMissing:false});
 return webpack.resolveConfig();
};
