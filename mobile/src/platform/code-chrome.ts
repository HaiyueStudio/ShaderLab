import {AbsoluteLayout,Application,Color,GridLayout,Label,TextView,Utils,isAndroid,type View} from '@nativescript/core';
import {shaderAppearance} from '../../../shared/dist/views/presentation.js';
import {codeLineAt,codeLineStarts,codeIndent} from './code-lines';
/** Paint behind the real native editor; never replace its delegate, text or selection.
 * Gutter positions come from native line fragments, so wrapped lines and scrolling agree. */
export class NativeCodeChrome {
  readonly view=new GridLayout();
  private marks=new AbsoluteLayout();
  private current=new GridLayout();
  private gutter=new GridLayout();
  private numbers:Label[]=[];
  private guides:GridLayout[]=[];
  private starts=[0];private source='';private errors=new Set<number>();
  private timer?:ReturnType<typeof setTimeout>;private loaded=false;private visible=true;private foreground=true;private disposed=false;
  private last='';
  constructor(private readonly editor:TextView){
    this.view.className='editor-source-surface';this.view.accessibilityIdentifier='editor-source-surface';this.view.clipToBounds=true;
    this.marks.isUserInteractionEnabled=false;this.marks.accessibilityHidden=true;
    this.current.backgroundColor=new Color('rgba(129,119,242,0.07)');this.marks.addChild(this.current);
    this.gutter.backgroundColor=new Color('#0c1029');this.gutter.width=40;this.marks.addChild(this.gutter);this.view.addChild(this.marks);
    editor.paddingLeft=48;editor.paddingTop=12;editor.paddingRight=12;editor.paddingBottom=24;editor.backgroundColor=new Color('transparent');
    editor.on('loaded',this.load);editor.on('unloaded',this.unload);editor.on('textChange',this.changed);editor.on('layoutChanged',this.refresh);
    Application.on(Application.suspendEvent,this.suspend);Application.on(Application.resumeEvent,this.resume);
  }
  mount(content:View){this.view.addChild(content);}
  setVisible(value:boolean){this.visible=value;if(value)this.start();else this.stop();}
  setErrors(lines:readonly number[]){this.errors=new Set(lines);this.refresh();}
  private changed=()=>{this.source=this.editor.text??'';this.starts=codeLineStarts(this.source);this.refresh();};
  private refresh=()=>{this.last='';this.start();};
  private load=()=>{this.loaded=true;this.changed();};
  private unload=()=>{this.loaded=false;this.stop();};
  private suspend=()=>{this.foreground=false;this.stop();};
  private resume=()=>{this.foreground=true;this.refresh();};
  private stop(){if(this.timer!==undefined)clearTimeout(this.timer);this.timer=undefined;}
  private start(){if(this.disposed||!this.loaded||!this.visible||!this.foreground||this.timer!==undefined)return;this.timer=setTimeout(()=>{this.timer=undefined;this.paint();this.start();},80);}
  private paint(){
    const size=this.view.getActualSize();if(size.width<=0||size.height<=0)return;
    let offset=0,scrollY=0,first=0,fontWidth=8,textX=48,lineHeight=18,position:(start:number)=>{y:number;height:number};
    if(isAndroid){
      const native=this.editor.android as android.widget.EditText|undefined,layout=native?.getLayout();if(!native||!layout)return;
      const dip=(value:number)=>Utils.layout.toDeviceIndependentPixels(value);offset=Math.max(0,native.getSelectionStart());scrollY=native.getScrollY();
      first=codeLineAt(this.starts,layout.getLineStart(layout.getLineForVertical(scrollY)));textX=dip(native.getTotalPaddingLeft()-native.getScrollX());fontWidth=dip(native.getPaint().measureText(' '));lineHeight=dip(native.getLineHeight());
      position=start=>{const line=layout.getLineForOffset(start);return {y:dip(layout.getLineTop(line)+native.getTotalPaddingTop()-scrollY),height:dip(layout.getLineBottom(line)-layout.getLineTop(line))};};
    }else{
      const native=this.editor.ios as UITextView|undefined;if(!native?.layoutManager)return;
      offset=native.selectedRange.location;scrollY=native.contentOffset.y;textX=native.textContainerInset.left+native.textContainer.lineFragmentPadding-native.contentOffset.x;lineHeight=native.font?.lineHeight??18;fontWidth=(native.font?.pointSize??13)*.6;
      const manager=native.layoutManager,container=native.textContainer;manager.ensureLayoutForTextContainer(container);
      const visible=manager.glyphRangeForBoundingRectInTextContainer(CGRectMake(0,Math.max(0,scrollY-native.textContainerInset.top),Math.max(1,size.width-60),size.height),container);
      if(visible.location<manager.numberOfGlyphs)first=codeLineAt(this.starts,manager.characterIndexForGlyphAtIndex(visible.location));
      position=start=>{
        if(start===this.source.length){const caret=native.caretRectForPosition(native.endOfDocument);return {y:caret.origin.y-scrollY,height:lineHeight};}
        const glyph=manager.glyphIndexForCharacterAtIndex(start),rect=manager.lineFragmentRectForGlyphAtIndexEffectiveRange(glyph,new interop.Reference<NSRange>());
        return {y:rect.origin.y+native.textContainerInset.top-scrollY,height:rect.size.height};
      };
    }
    const active=codeLineAt(this.starts,offset),signature=[offset,scrollY,size.width,size.height,this.source.length].join(':');if(signature===this.last)return;this.last=signature;
    this.gutter.height=size.height;let count=0,guideCount=0;
    for(let index=first;index<this.starts.length&&count<150;index++){
      const start=this.starts[index]!,rect=position(start);if(rect.y>size.height)break;if(rect.y+rect.height<0)continue;
      let number=this.numbers[count++];if(!number){number=new Label();number.fontFamily='monospace';number.fontSize=11;number.textAlignment='right';number.width=32;number.paddingRight=4;number.isUserInteractionEnabled=false;this.marks.addChild(number);this.numbers.push(number);}
      number.visibility='visible';number.text=this.errors.has(index+1)?'• '+(index+1):String(index+1);number.color=new Color(this.errors.has(index+1)?shaderAppearance.color.danger:index===active?shaderAppearance.color.text:'#656b96');number.height=rect.height;AbsoluteLayout.setLeft(number,2);AbsoluteLayout.setTop(number,rect.y);
      for(let level=1;level<=Math.min(16,Math.floor(codeIndent(this.source,start)/2));level++){
        let guide=this.guides[guideCount++];if(!guide){guide=new GridLayout();guide.width=1;guide.backgroundColor=new Color('rgba(169,173,212,0.12)');this.marks.addChild(guide);this.guides.push(guide);}guide.visibility='visible';guide.height=rect.height;AbsoluteLayout.setLeft(guide,textX+(level-1)*2*fontWidth);AbsoluteLayout.setTop(guide,rect.y);
      }
    }
    this.numbers.slice(count).forEach(view=>view.visibility='collapse');this.guides.slice(guideCount).forEach(view=>view.visibility='collapse');
    const line=position(Math.min(offset,this.source.length));this.current.width=Math.max(0,size.width-40);this.current.height=line.height;AbsoluteLayout.setLeft(this.current,40);AbsoluteLayout.setTop(this.current,line.y);
  }
  dispose(){if(this.disposed)return;this.disposed=true;this.stop();this.editor.off('loaded',this.load);this.editor.off('unloaded',this.unload);this.editor.off('textChange',this.changed);this.editor.off('layoutChanged',this.refresh);Application.off(Application.suspendEvent,this.suspend);Application.off(Application.resumeEvent,this.resume);}
}
