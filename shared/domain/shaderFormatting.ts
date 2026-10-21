import type {ShaderLanguage} from './model.js';

type Token={text:string;from:number;to:number;incomplete:boolean;kind:'word'|'symbol'|'comment'|'line'|'directive'|'string'};
export interface ShaderFormatEdit {from:number;to:number;insert:string}
const compounds=/^(?:>>=|<<=|\+\+|--|->|::|&&|\|\||<<|>>|<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=)/;
const numbers=/^(?:0[xX][\da-fA-F]+(?:\.[\da-fA-F]*)?(?:[pP][+-]?\d+)?|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[fFhHuUiIlL]*/;
/** Keep opaque text intact: changing a macro, comment, or literal is not formatting. */
function tokens(source:string):Token[]{
  const result:Token[]=[];let at=0;
  while(at<source.length){
    if(/\s/.test(source[at]!)){at++;continue;}
    const from=at;let incomplete=false,kind:Token['kind']='symbol';
    if(source[at]==='#'&&/^\s*$/.test(source.slice(source.lastIndexOf('\n',at-1)+1,at))){
      kind='directive';let end=source.indexOf('\n',at);
      while(end>=0&&/\\\r?$/.test(source.slice(at,end))){at=end+1;end=source.indexOf('\n',at);}
      at=end<0?source.length:end;
    }else if(source.startsWith('//',at)){kind='line';const end=source.indexOf('\n',at);at=end<0?source.length:end;}
    else if(source.startsWith('/*',at)){
      kind='comment';let depth=1;at+=2;while(at<source.length&&depth){if(source.startsWith('/*',at)){depth++;at+=2;}else if(source.startsWith('*/',at)){depth--;at+=2;}else at++;}incomplete=depth>0;
    }else if(source[at]==='"'||source[at]==="'"){
      kind='string';const quote=source[at++];incomplete=true;while(at<source.length){if(source[at]==='\\')at=Math.min(source.length,at+2);else if(source[at++]===quote){incomplete=false;break;}}
    }else {
      const number=numbers.exec(source.slice(at)),word=/^[\p{ID_Start}_][\p{ID_Continue}_]*/u.exec(source.slice(at));
      if(number){at+=number[0].length;kind='word';}else if(word){at+=word[0].length;kind='word';}else at+=(compounds.exec(source.slice(at))?.[0].length??1);
    }
    result.push({text:source.slice(from,at),from,to:at,kind,incomplete});
  }
  return result;
}
const operator=/^(?:[+\-*/%=<>!&|^~?:]|>>=?|<<=?|&&|\|\||<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|->)$/;
const templateType=/^(?:array|binding_array|vec[234]|mat[234]x[234]|ptr|atomic|texture_\w+|bitcast|Buffer|RWBuffer|StructuredBuffer|RWStructuredBuffer|Texture\w*|RWTexture\w*|vector|matrix)$/;
const prefixContext=/^(?:\(|\[|\{|,|;|:|\?|return|case|=|\+=|-=|\*=|\/=|\+|-|\*|\/|%|&&|\|\||!|~|&|\||\^|==|!=|<|>|<=|>=|->)$/;

/** Shader-aware whitespace formatting; never rewrites source tokens or compiles the shader. */
export function formatShader(source:string,language:ShaderLanguage='wgsl'):string {
  const input=tokens(source);if(!input.length||input.some(token=>token.incomplete))return source;
  let output='',line='',depth=0,paren=0,angles=0,previous:Token|undefined,unary=false;
  const braces:Array<{paren:number;angles:number;struct:boolean}>=[];
  const newline=()=>{if(line){output+=line+'\n';line='';}};
  const append=(text:string,space=false)=>{if(!line)line='  '.repeat(depth)+text;else line+=(space?' ':'')+text;};
  for(let i=0;i<input.length;i++){
    const token=input[i]!,value=token.text,prev=previous?.text??'',next=input[i+1];
    const originalGap=source.slice(previous?.to??0,token.from);
    if(!line&&output&&/\n\s*\n/.test(originalGap)&&!output.endsWith('\n\n')&&prev!=='{'&&value!=='}')output+='\n';
    if(token.kind==='directive'){newline();output+=value+'\n';previous=token;unary=false;continue;}
    if(token.kind==='line'){
      // A standalone comment stays on its own line, including tool metadata.
      if(/[\r\n]/.test(originalGap))newline();append(value,!!line);newline();previous=token;continue;
    }
    if(token.kind==='comment'){
      if(/[\r\n]/.test(originalGap))newline();append(value,!!line);if(/[\r\n]/.test(value)||/[\r\n]/.test(source.slice(token.to,next?.from)))newline();previous=token;continue;
    }
    if(value==='{'){
      append(value,!!line&&prev!=='('&&prev!=='[');const isStruct=/\bstruct\b/.test(line);newline();braces.push({paren,angles,struct:isStruct});depth++;previous=token;unary=false;continue;
    }
    if(value==='}'){
      newline();depth=Math.max(0,depth-1);braces.pop();append(value);
      if(next&&![';',',',')',']','else','while'].includes(next.text))newline();
      previous=token;unary=false;continue;
    }
    if(value===';'){
      append(value);if(paren<=(braces.at(-1)?.paren??0))newline();previous=token;unary=false;continue;
    }
    if(value===','){
      append(value);if(braces.at(-1)?.struct&&paren===braces.at(-1)!.paren&&angles===braces.at(-1)!.angles)newline();previous=token;unary=false;continue;
    }
    if(value==='('){append(value,/^(?:if|for|while|switch|return)$/.test(prev)||operator.test(prev)&&!unary);paren++;previous=token;unary=false;continue;}
    if(value===')'){append(value);paren=Math.max(0,paren-1);previous=token;unary=false;continue;}
    if(value==='['||value===']'||value==='.'||value==='::'||value==='@'){
      append(value,value==='['&&prev==='='||value==='@'&&!!line&&prev!=='('&&prev!=='[');previous=token;unary=false;continue;
    }
    const open=language!=='glsl'&&value==='<'&&templateType.test(prev);
    const close=angles>0&&/^(?:>|>>)$/.test(value);
    if(open){angles++;append(value);previous=token;unary=false;continue;}
    if(close){angles=Math.max(0,angles-value.length);append(value,/^>$/.test(prev));previous=token;unary=false;continue;}
    const currentUnary=/^(?:!|~|\+|-|\*|&|\+\+|--)$/.test(value)&&(!previous||prefixContext.test(prev));
    let space=!!previous;
    if(prev==='('||prev==='['||prev==='.'||prev==='@'||prev==='::'||unary||open||prev==='<'&&angles>0)space=false;
    else if(value==='++'||value==='--')space=false;
    else if(value===':'&&language==='wgsl')space=false;
    else if(operator.test(value)||operator.test(prev)||prev===','||prev===';'||previous?.kind==='comment'||previous?.kind==='line')space=true;
    // Never turn two separate operators into a new operator or comment delimiter.
    if(!space&&previous&&/^[+\-*/<>=!&|^:]+$/.test(prev)&&/^[+\-*/<>=!&|^:]+$/.test(value)&&(compounds.test(prev+value)||prev+value==='/*'||prev+value==='//'))space=true;
    append(value,space);previous=token;unary=currentUnary;
  }
  newline();return output;
}

/** Only whitespace edits are applied, so CodeMirror can map selections and undo atomically. */
export function shaderFormatEdits(source:string,language:ShaderLanguage='wgsl'):ShaderFormatEdit[]{
  const formatted=formatShader(source,language);if(formatted===source)return[];
  const before=tokens(source),after=tokens(formatted);
  if(before.length!==after.length||before.some((t,i)=>t.text!==after[i]!.text||t.kind!==after[i]!.kind))return[];
  const changes:ShaderFormatEdit[]=[];let from=0,start=0;
  for(let i=0;i<=before.length;i++){
    const to=before[i]?.from??source.length,end=after[i]?.from??formatted.length,insert=formatted.slice(start,end);
    if(source.slice(from,to)!==insert)changes.push({from,to,insert});
    from=before[i]?.to??source.length;start=after[i]?.to??formatted.length;
  }
  return changes;
}
