import {execFileSync} from 'node:child_process';
import {resolve} from 'node:path';
const root=resolve(import.meta.dirname,'../..');
const suites=['browser-smoke','pass-tabs-browser','source-language-browser','wgsl-browser','puzzle-browser','minesweeper-browser','clock-browser','common-browser','common-glsl-browser','arrays-browser','assignments-browser','sound-browser','sound-duration-browser','cubemap-browser','media-browser','tutorial-browser'];
for(const suite of process.argv.length>2?process.argv.slice(2):suites){
 if(!suites.includes(suite))throw Error('Unknown legacy suite: '+suite);
 execFileSync(process.execPath,[resolve(root,'web/test',suite+'.mjs')],{cwd:root,stdio:'inherit',env:{...process.env,SHADERLAB_TEST_UI:'legacy'}});
}
