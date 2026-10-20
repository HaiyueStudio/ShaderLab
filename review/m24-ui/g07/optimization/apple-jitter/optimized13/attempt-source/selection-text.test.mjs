import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import ts from 'typescript';

function fixture() {
  const exports={},events=[],renders=[],hits=[];let suppressed=0;
  const native=()=>({titleLabel:{font:{}},title:null,
    attributedTitleForState(){return this.title;},
    setAttributedTitleForState(title){this.title=title;hits.push(title);}});
  let value='',layouts=0;
  const view={ios:native(),isLoaded:true,iosTextAnimation:'inherit',style:{fontInternal:{},color:'#fff',lineHeight:6},
    requestLayout(){layouts++;}, get text(){return value;},set text(text){value=text;renders.push(text);events.push(text);
      const font=this.style.fontInternal,color=this.style.color;
      this.ios.title={text,font,color,copy(){return {text,font,color};}};this.requestLayout();}};
  const source=ts.transpileModule(readFileSync('bridge/ui/nativescript/platform.ios.ts','utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
  const textProperty={nativeValueChange(_view,text){value=text;events.push(text);}};
  new Function('require','exports','UIView','UIControlState',source)(name=>name==='@nativescript/core/ui/text-base'?{textProperty,TextBase:{iosTextAnimationFallback:true}}:{},exports,{performWithoutAnimation:fn=>{suppressed++;fn();}},{Normal:0});
  return {view,native,events,renders,hits,writer:exports.selectionText(view),layouts:()=>layouts,suppressed:()=>suppressed};
}

test('selection titles reuse exact native typography while preserving public text notifications and layout',()=>{
 const f=fixture();for(const text of ['75%','50%','75%','75%'])f.writer.write(text);
 assert.deepEqual(f.renders,['75%','50%']);assert.deepEqual(f.events,['75%','50%','75%']);assert.equal(f.layouts(),3);
 assert.equal(f.view.text,'75%');assert.deepEqual(f.view.ios.title,{text:'75%',font:f.view.style.fontInternal,color:'#fff'});assert.equal(f.hits.length,1);
});

test('title cache invalidates for theme, Dynamic Type, native recreation, unload and formatted text',()=>{
 const f=fixture();const prime=()=>{f.writer.write('A');f.writer.write('B');};prime();
 for(const change of [()=>f.view.style.color='#000',()=>f.view.style.fontInternal={},()=>f.view.style.fontScaleInternal=1.5,()=>f.view.ios=f.native(),()=>f.writer.clear()]){
  change();const before=f.renders.length;f.writer.write('A');assert.equal(f.renders.length,before+1);assert.equal(f.view.ios.title.color,f.view.style.color);f.writer.write('B');
 }
 f.view.isLoaded=false;f.writer.write('A');f.view.isLoaded=true;f.writer.write('B');
 const before=f.renders.length;f.writer.write('A');assert.equal(f.renders.length,before+1);
 f.view.formattedText={};f.writer.write('B');f.writer.write('A');assert.equal(f.hits.length,0);
});

test('title cache is bounded and unsupported text styling stays on the normal path',()=>{
 const f=fixture();for(let i=0;i<9;i++)f.writer.write(String(i));f.writer.write('0');assert.equal(f.renders.length,10);
 f.view.style.textStroke={};f.writer.write('1');f.writer.write('0');assert.equal(f.renders.length,12);assert.equal(f.hits.length,0);
});

test('cached titles retain explicit and inherited animation behavior',()=>{
 const f=fixture();f.writer.write('A');f.writer.write('B');f.writer.write('A');assert.equal(f.suppressed(),0);
 f.view.iosTextAnimation=false;f.writer.write('B');assert.equal(f.suppressed(),1);
 f.view.iosTextAnimation=true;f.writer.write('A');assert.equal(f.suppressed(),1);
});
