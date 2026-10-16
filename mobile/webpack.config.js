const webpack=require('@nativescript/webpack');
const path=require('node:path');
module.exports=env=>{
 webpack.init(env);
 webpack.chainWebpack(config=>{ config.resolve.modules.prepend(path.resolve(__dirname,'../node_modules')); config.resolve.set('conditionNames',['require','import','default']); config.plugin('ShaderLabCompilerIsolation').use(require('webpack').ContextExclusionPlugin,[/[\\/]compiler[\\/]/]); });
 webpack.Utils.addCopyRule({from:path.resolve(__dirname,'src/assets'),to:'assets',noErrorOnMissing:false});
 webpack.Utils.addCopyRule({from:path.resolve(__dirname,'generated/compiler'),to:'compiler',noErrorOnMissing:false});
 return webpack.resolveConfig();
};
