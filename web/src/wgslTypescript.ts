import {formatShader} from '../../shared/dist/domain/shaderFormatting.js';
import {preserveShaderComments} from './shaderComments.js';

type Expr={code:string;pointer?:string};
/** A structural writer for the authoring language. No source strings or eval in output. */
export function wgslToTypescript(source:string):string {
  const tokens:string[]=[];let at=0;
  while(at<source.length){
    if(/\s/.test(source[at]!)){at++;continue;}
    if(source.startsWith('//',at)){const end=source.indexOf('\n',at);at=end<0?source.length:end;continue;}
    if(source.startsWith('/*',at)){let depth=1;at+=2;while(at<source.length&&depth){if(source.startsWith('/*',at)){depth++;at+=2;}else if(source.startsWith('*/',at)){depth--;at+=2;}else at++;}if(depth)throw Error('WGSL 注释未闭合。');continue;}
    const match=/^(?:0x[\da-f]+(?:\.[\da-f]*)?(?:p[+-]?\d+)?|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[fhiu]?|^[A-Za-z_]\w*|^(?:>>=|<<=|->|&&|\|\||<<|>>|<=|>=|==|!=|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=)/i.exec(source.slice(at));
    const value=match?.[0]??source[at]!;tokens.push(value);at+=value.length;
  }
  let cursor=0,loopId=0;const structs=new Set(tokens.flatMap((v,i)=>v==='struct'?[tokens[i+1]!]:[]));
  const peek=()=>tokens[cursor]??'',take=()=>tokens[cursor++]??'',eat=(v:string)=>peek()===v?(cursor++,true):false;
  const require=(v:string)=>{if(!eat(v))throw Error('WGSL → TypeScript：预期 '+v+'，得到 '+(peek()||'文件末尾')+'。');};
  const name=()=>{const v=take();if(!/^[A-Za-z_]\w*$/.test(v))throw Error('WGSL → TypeScript：需要标识符。');return v;};
  const closeType=()=>{if(peek()==='>>'){tokens.splice(cursor,1,'>','>');}require('>');};
  const type=():string=>{
    const t=take();if(!t)throw Error('缺少 WGSL 类型。');
    if(/^[0-9]+[ui]$/.test(t))return t.slice(0,-1);
    if((t==='u32'||t==='i32')&&eat('(')){const size=take();if(!/^\d+[ui]?$/.test(size))throw Error('数组长度需要固定的整数常量。');require(')');return size.replace(/[ui]$/,'');}
    if(!eat('<'))return t==='f32'?'number':t==='bool'?'boolean':t;
    const args:string[]=[];while(peek()&&peek()!=='>'&&peek()!=='>>'){args.push(type());if(!eat(','))break;}closeType();
    if(t==='ptr'){if(args[0]!=='function')throw Error('TypeScript 只支持函数内指针。');return 'ptr<'+args[1]+'>';}
    return t+'<'+args.join(', ')+'>';
  };
  const binary:Record<string,[number,string]>={'||':[1,''],'&&':[2,''],'|':[3,'bitOr'],'^':[4,'bitXor'],'&':[5,'bitAnd'],'==':[6,'eq'],'!=':[6,'ne'],'<':[7,'lt'],'<=':[7,'le'],'>':[7,'gt'],'>=':[7,'ge'],'<<':[8,'shl'],'>>':[8,'shr'],'+':[9,'add'],'-':[9,'sub'],'*':[10,'mul'],'/':[10,'div'],'%':[10,'mod']};
  const expression=(minimum=0):Expr=>{
    let value:Expr;const first=take();
    if(first==='('){value=expression();require(')');value={...value,code:'('+value.code+')'};}
    else if(['-','!','~','*','&'].includes(first)){
      const inner=expression(11);value=first==='*'?{code:'gpu.load('+inner.code+')',pointer:inner.code}:first==='&'?{code:'gpu.addressOf('+inner.code+')'}:{code:(first==='-'?'gpu.neg(':first==='~'?'gpu.bitNot(':'!(')+inner.code+')'};
    }else if(/^\d|^\.\d/.test(first)){
      const hex=/^0x([\da-f]+)(?:\.([\da-f]*))?p([+-]?\d+)([fh])?$/i.exec(first);
      if(hex){const fraction=[...(hex[2]??'')].reduce((sum,digit,i)=>sum+parseInt(digit,16)*16**(-i-1),0),number=(parseInt(hex[1]!,16)+fraction)*2**Number(hex[3]);if(!Number.isFinite(number))throw Error('十六进制浮点数超出 TypeScript 数值范围。');const decimal=String(number),literal=/[.e]/i.test(decimal)?decimal:decimal+'.0';value={code:hex[4]?(hex[4].toLowerCase()==='h'?'f16':'f32')+'('+literal+')':literal};}
      else if(/[iufh]$/i.test(first)&&!/^0x[\da-f]+$/i.test(first)){const suffix=first.at(-1)!.toLowerCase(),base=first.slice(0,-1);value={code:({u:'u32',i:'i32',f:'f32',h:'f16'}[suffix])+'('+base+')'};}
      else value={code:first};
    }else if(/^[A-Za-z_]\w*$/.test(first)){
      let generic='';
      if(/^(?:array|vec[234]|mat[234]x[234]|bitcast)$/.test(first)&&eat('<')){const args:string[]=[];do{args.push(type());}while(eat(','));closeType();generic='<'+args.join(', ')+'>';}
      value={code:(first==='array'||first==='bitcast'?'gpu.':'')+first+generic};
      if(structs.has(first)&&peek()==='(')value={code:'gpu.construct<'+first+'>'};
    }else throw Error('WGSL → TypeScript 不支持的表达式：'+first);
    while(peek()){
      if(eat('.')){value={code:value.code+'.'+name()};continue;}
      if(eat('[')){const index=expression();require(']');value={code:value.code+'['+index.code+']'};continue;}
      if(eat('(')){const args:string[]=[];if(peek()!==')')do{args.push(expression().code);}while(eat(','));require(')');value={code:value.code+'('+args.join(', ')+')'};continue;}
      const op=peek(),info=binary[op];if(!info||info[0]<minimum)break;take();const right=expression(info[0]+1);
      value={code:info[1]?`gpu.${info[1]}(${value.code}, ${right.code})`:`(${value.code} ${op} ${right.code})`};
    }
    return value;
  };
  const variable=(global=false)=>{
    const kind=take();if(eat('<')){const address=name();if(address!=='private')throw Error('TypeScript 不支持宿主资源声明。');require('>');}
    const n=name(),t=eat(':')?type():'';const value=eat('=')?expression().code:'';
    return (kind==='var'?'let':'const')+' '+n+(t?': '+t:'')+(value?' = '+value:'');
  };
  const simple=()=>{
    if(['var','let','const'].includes(peek()))return variable();
    const left=expression(),op=peek();
    if(/^(?:=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=|<<=|>>=)$/.test(op)){
      // Expanding a compound assignment must never evaluate an authored index
      // function twice. Reject this rare form before committing any source.
      const calls=[...left.code.matchAll(/\b((?:\w+\.)*\w+)\s*\(/g)].map(match=>match[1]!);
      if(op!=='='&&calls.some(call=>!['gpu.load','i32','u32','f32'].includes(call)))throw Error('复合赋值的索引包含函数调用；请先把索引存入局部变量，再转换为 TypeScript。');
      take();const right=expression().code,call=op==='='?right:`gpu.${binary[op.slice(0,-1)]![1]}(${left.code}, ${right})`;
      return left.pointer?`gpu.store(${left.pointer}, ${call})`:left.code+' = '+call;
    }
    if(op==='++'||op==='--'){take();return left.code+op;}
    return left.code;
  };
  const block=()=>{require('{');const body:string[]=[];while(peek()!=='}'){if(!peek())throw Error('WGSL 代码块未闭合。');body.push(statement());}require('}');return '{\n'+body.join('\n')+'\n}';};
  const condition=()=>{if(eat('(')){const v=expression().code;require(')');return v;}return expression().code;};
  const statement=():string=>{
    if(peek()==='{')return block();
    if(eat(';'))return '';
    if(eat('return')){const v=peek()===';'?'':' '+expression().code;require(';');return 'return'+v+';';}
    if(eat('if')){const test=condition(),yes=block();return `if (${test}) ${yes}`+(eat('else')?' else '+(peek()==='if'?statement():block()):'');}
    if(eat('for')){require('(');const init=peek()===';'?'':simple();require(';');const test=peek()===';'?'':expression().code;require(';');const next=peek()===')'?'':simple();require(')');return `for (${init}; ${test}; ${next}) ${block()}`;}
    if(eat('while')){const test=condition();return `while (${test}) ${block()}`;}
    if(eat('loop')){
      require('{');const body:string[]=[];let continuing='';
      while(peek()!=='}'){if(!peek())throw Error('WGSL loop 未闭合。');if(eat('continuing')){continuing=block();break;}body.push(statement());}require('}');
      if(!continuing)return 'while (true) {\n'+body.join('\n')+'\n}';
      // A for head runs the continuation after both fallthrough and continue.
      // Its first-iteration guard preserves loop entry behavior.
      const key='hyTsFirst'+loopId++;
      const declared=body.join('\n').matchAll(/\b(?:let|const)\s+(\w+)/g);
      for(const m of declared)if(new RegExp('\\b'+m[1]+'\\b').test(continuing))throw Error('此 loop 的 continuing 引用了循环体局部变量；请先改为 for 循环。');
      return `for (let ${key}: boolean = true; ; ) {\nif (!${key}) ${continuing}\n${key} = false;\n${body.join('\n')}\n}`;
    }
    if(eat('break')){if(eat('if')){const test=condition();require(';');return 'if ('+test+') { break; }';}require(';');return 'break;';}
    if(eat('continue')){require(';');return 'continue;';}
    if(eat('discard')){require(';');return 'discard();';}
    if(eat('switch')){
      const test=condition();require('{');const cases:string[]=[];
      while(peek()!=='}'){
        if(eat('case')){do{cases.push('case '+expression().code+':');}while(eat(','));}else{require('default');cases.push('default:');}
        eat(':');cases.push(block()+'\nbreak;');
      }
      require('}');return 'switch ('+test+') {\n'+cases.join('\n')+'\n}';
    }
    const value=simple();require(';');return value+';';
  };
  const output:string[]=[];
  while(peek()){
    if(eat(';'))continue;
    if(eat('fn')){const n=name();require('(');const params:string[]=[];while(peek()!==')'){const p=name();require(':');params.push(p+': '+type());if(!eat(','))break;}require(')');const result=eat('->')?type():'void';output.push('export function '+n+'('+params.join(', ')+'): '+result+' '+block());}
    else if(eat('struct')){const n=name();require('{');const fields:string[]=[];while(peek()!=='}'){const f=name();require(':');fields.push(f+': '+type()+';');if(!eat(','))eat(';');}require('}');eat(';');output.push('interface '+n+' {\n'+fields.join('\n')+'\n}');}
    else if(eat('alias')){const n=name();require('=');output.push('type '+n+' = '+type()+';');require(';');}
    else if(['var','let','const'].includes(peek())){output.push(variable(true)+';');require(';');}
    else throw Error('WGSL → TypeScript 不支持此顶层语法：'+peek());
  }
  const metadata=source.match(/^\s*\/\/ @haiyue-(?:common|channel)[^\n]*/gm)?.join('\n');
  return preserveShaderComments(source,(metadata?metadata+'\n':'')+formatShader(output.join('\n\n'),'typescript'),{from:'wgsl',to:'typescript'});
}
