import {formatShader} from '../../shared/dist/domain/shaderFormatting.js';
import {preserveShaderComments} from './shaderComments.js';
import {primaryExpression,binaryExpression,prefixExpression,expressionOperand,type ShaderExpression} from './shaderExpressions.js';

type Expr=ShaderExpression&{pointer?:string;type?:string|undefined};
/** A structural writer for the authoring language. No source strings or eval in output. */
export function wgslToTypescript(source:string,common=''):string {
  const input=common?common+'\n'+source:source,boundary=input.length-source.length;
  const tokens:string[]=[];let at=0,authoredCursor=0;
  while(at<input.length){
    if(/\s/.test(input[at]!)){at++;continue;}
    if(input.startsWith('//',at)){const end=input.indexOf('\n',at);at=end<0?input.length:end;continue;}
    if(input.startsWith('/*',at)){let depth=1;at+=2;while(at<input.length&&depth){if(input.startsWith('/*',at)){depth++;at+=2;}else if(input.startsWith('*/',at)){depth--;at+=2;}else at++;}if(depth)throw Error('WGSL 注释未闭合。');continue;}
    const match=/^(?:0x[\da-f]+(?:\.[\da-f]*)?(?:p[+-]?\d+)?|(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?)[fhiu]?|^[A-Za-z_]\w*|^(?:>>=|<<=|->|&&|\|\||<<|>>|<=|>=|==|!=|\+\+|--|\+=|-=|\*=|\/=|%=|&=|\|=|\^=)/i.exec(input.slice(at));
    const value=match?.[0]??input[at]!;tokens.push(value);at+=value.length;if(at<=boundary)authoredCursor=tokens.length;
  }
  let cursor=0,loopId=0;const structs=new Set(tokens.flatMap((v,i)=>v==='struct'?[tokens[i+1]!]:[]));
  const peek=()=>tokens[cursor]??'',take=()=>tokens[cursor++]??'',eat=(v:string)=>peek()===v?(cursor++,true):false;
  const require=(v:string)=>{if(!eat(v))throw Error('WGSL → TypeScript：预期 '+v+'，得到 '+(peek()||'文件末尾')+'。');};
  const name=()=>{const v=take();if(!/^[A-Za-z_]\w*$/.test(v))throw Error('WGSL → TypeScript：需要标识符。');return v;};
  const closeType=()=>{if(peek()==='>>'){tokens.splice(cursor,1,'>','>');if(cursor<authoredCursor)authoredCursor++;}require('>');};
  const type=():string=>{
    const t=take();if(!t)throw Error('缺少 WGSL 类型。');
    if(/^[0-9]+[ui]$/.test(t))return t.slice(0,-1);
    if((t==='u32'||t==='i32')&&eat('(')){const size=take();if(!/^\d+[ui]?$/.test(size))throw Error('数组长度需要固定的整数常量。');require(')');return size.replace(/[ui]$/,'');}
    if(!eat('<'))return t==='f32'?'number':t==='bool'?'boolean':t;
    const args:string[]=[];while(peek()&&peek()!=='>'&&peek()!=='>>'){args.push(type());if(!eat(','))break;}closeType();
    if(t==='ptr'){if(args[0]!=='function')throw Error('TypeScript 只支持函数内指针。');return 'ptr<'+args[1]+'>';}
    return t+'<'+args.join(', ')+'>';
  };
  const aliases=new Map<string,string>(),fields=new Map<string,Map<string,string>>(),returns=new Map<string,string>();
  // Read signatures first so forward calls and aliased vector/struct fields
  // are distinguished from scalar comparisons without guessing from names.
  while(peek()){
    if(eat('fn')){const n=name();require('(');while(peek()!==')'){name();require(':');type();if(!eat(','))break;}require(')');returns.set(n,eat('->')?type():'void');}
    else if(eat('alias')){const n=name();require('=');aliases.set(n,type());require(';');continue;}
    else if(eat('struct')){const n=name(),members=new Map<string,string>();require('{');while(peek()!=='}'){const field=name();require(':');members.set(field,type());if(!eat(','))eat(';');}require('}');eat(';');fields.set(n,members);continue;}
    let braces=0;do{const token=take();if(token==='{')braces++;else if(token==='}')braces--;
      if(!braces&&(token==='}'||token===';'))break;
    }while(peek());
  }
  cursor=authoredCursor;
  const resolve=(t:string|undefined):string|undefined=>{const seen=new Set<string>();while(t&&aliases.has(t)&&!seen.has(t)){seen.add(t);t=aliases.get(t);}return t;};
  const scalar=(t:string|undefined)=>/^(?:number|boolean|f32|f16|i32|u32|bool)$/.test(resolve(t)??'');
  const vector=(t:string|undefined)=>/^vec([234])(?:[fhiu]|<.*>)?$/.exec(resolve(t)??'');
  const element=(t:string|undefined):string|undefined=>{
    t=resolve(t);if(!t)return;
    if(vector(t))return t.endsWith('i')?'i32':t.endsWith('u')?'u32':t.endsWith('h')?'f16':/^vec\d<(.+)>$/.exec(t)?.[1]??'number';
    const matrix=/^mat([234])x([234])(?:([fh])|<(.+)>)?$/.exec(t);if(matrix)return 'vec'+matrix[2]+'<'+(matrix[4]??(matrix[3]==='h'?'f16':'number'))+'>';
    const inner=/^(?:array|ptr)<(.+)>$/.exec(t)?.[1];if(!inner)return;
    let depth=0;for(let i=0;i<inner.length;i++){if(inner[i]==='<')depth++;else if(inner[i]==='>')depth--;else if(inner[i]===','&&!depth)return inner.slice(0,i).trim();}return inner.trim();
  };
  const scopes=[new Map<string,string>([['iResolution','vec3f'],['iMouse','vec4f'],['iDate','vec4f'],['iTime','number'],['iTimeDelta','number'],['iFrame','i32'],['iFrameRate','number'],['iSampleRate','number'],['iChannelTime','array<number, 4>'],['iChannelResolution','array<vec3f, 4>'],['iParams','array<vec4f, 8>']])];
  const lookup=(n:string)=>{for(let i=scopes.length-1;i>=0;i--)if(scopes[i]!.has(n))return scopes[i]!.get(n);return undefined;};
  const atom=(code:string,t?:string):Expr=>({...primaryExpression(code),type:t});
  const operationType=(left:Expr,right:Expr):string|undefined=>scalar(left.type)&&scalar(right.type)?left.type:vector(left.type)?left.type:vector(right.type)?right.type:undefined;
  const callType=(n:string,args:Expr[]):string|undefined=>{
    if(returns.has(n))return returns.get(n);if(aliases.has(n)||structs.has(n)||scalar(n)||vector(n)||/^mat[234]x[234]/.test(n))return n;
    const generic=/^gpu\.(array|bitcast|construct)<(.+)>$/.exec(n);if(generic)return generic[1]==='array'?'array<'+generic[2]+'>':generic[2];
    if(/^(?:length|distance|dot|determinant)$/.test(n))return 'number';if(/^(?:all|any)$/.test(n))return 'boolean';
    if(n==='select'&&args[0]&&args[1])return operationType(args[0],args[1]);
    if(/^channel[0-3]$/.test(n))return 'vec4f';
    if(/^(?:abs|acos|acosh|asin|asinh|atan|atan2|atanh|ceil|clamp|cos|cosh|degrees|exp|exp2|floor|fract|fma|inverseSqrt|log|log2|max|min|mix|normalize|pow|radians|reflect|refract|round|saturate|sign|sin|sinh|smoothstep|sqrt|step|tan|tanh|trunc|dpdx|dpdy|fwidth)$/.test(n))return args.find(a=>vector(a.type))?.type??args[0]?.type;
    return undefined;
  };
  const binary:Record<string,[number,string]>={'||':[1,''],'&&':[2,''],'|':[3,'bitOr'],'^':[4,'bitXor'],'&':[5,'bitAnd'],'==':[6,'eq'],'!=':[6,'ne'],'<':[7,'lt'],'<=':[7,'le'],'>':[7,'gt'],'>=':[7,'ge'],'<<':[8,'shl'],'>>':[8,'shr'],'+':[9,'add'],'-':[9,'sub'],'*':[10,'mul'],'/':[10,'div'],'%':[10,'mod']};
  const expression=(minimum=0):Expr=>{
    let value:Expr;const first=take();
    if(first==='('){value=expression();require(')');}
    else if(['-','!','~','*','&'].includes(first)){
      const inner=expression(11);value=first==='*'?{...atom('gpu.load('+inner.code+')',element(inner.type)),pointer:inner.code}:first==='&'?atom('gpu.addressOf('+inner.code+')','ptr<'+inner.type+'>'):first==='!'?{...prefixExpression('!',inner),type:inner.type}:atom((first==='-'?'gpu.neg(':'gpu.bitNot(')+inner.code+')',inner.type);
    }else if(/^\d|^\.\d/.test(first)){
      const hex=/^0x([\da-f]+)(?:\.([\da-f]*))?p([+-]?\d+)([fh])?$/i.exec(first);
      if(hex){const fraction=[...(hex[2]??'')].reduce((sum,digit,i)=>sum+parseInt(digit,16)*16**(-i-1),0),number=(parseInt(hex[1]!,16)+fraction)*2**Number(hex[3]);if(!Number.isFinite(number))throw Error('十六进制浮点数超出 TypeScript 数值范围。');const decimal=String(number),literal=/[.e]/i.test(decimal)?decimal:decimal+'.0';value=atom(hex[4]?(hex[4].toLowerCase()==='h'?'f16':'f32')+'('+literal+')':literal,'number');}
      else if(/[iufh]$/i.test(first)&&!/^0x[\da-f]+$/i.test(first)){const suffix=first.at(-1)!.toLowerCase(),base=first.slice(0,-1);value=atom(({u:'u32',i:'i32',f:'f32',h:'f16'}[suffix])+'('+base+')','number');}
      else value=atom(first,'number');
    }else if(/^[A-Za-z_]\w*$/.test(first)){
      let generic='';
      if(/^(?:array|vec[234]|mat[234]x[234]|bitcast)$/.test(first)&&eat('<')){const args:string[]=[];do{args.push(type());}while(eat(','));closeType();generic='<'+args.join(', ')+'>';}
      value=atom((first==='array'||first==='bitcast'?'gpu.':'')+first+generic,first==='true'||first==='false'?'boolean':lookup(first));
      if(structs.has(first)&&peek()==='(')value=atom('gpu.construct<'+first+'>');
    }else throw Error('WGSL → TypeScript 不支持的表达式：'+first);
    while(peek()){
      if(eat('.')){const member=name(),t=resolve(value.type);value=atom(expressionOperand(value,12)+'.'+member,vector(t)&&/^[xyzwrgba]+$/.test(member)?member.length===1?element(t):'vec'+member.length+'<'+element(t)+'>':fields.get(t??'')?.get(member));continue;}
      if(eat('[')){const index=expression();require(']');value=atom(expressionOperand(value,12)+'['+index.code+']',element(value.type));continue;}
      if(eat('(')){const args:Expr[]=[];if(peek()!==')')do{args.push(expression());}while(eat(','));require(')');value=atom(value.code+'('+args.map(a=>a.code).join(', ')+')',callType(value.code,args));continue;}
      const op=peek(),info=binary[op];if(!info||info[0]<minimum)break;take();const right=expression(info[0]+1);
      const comparison=['==','!=','<','<=','>','>='].includes(op),native=comparison&&scalar(value.type)&&scalar(right.type);
      const t=comparison?(native?'boolean':vector(value.type)?'vec'+vector(value.type)![1]+'<boolean>':undefined):operationType(value,right);
      value=info[1]&&!native?atom(`gpu.${info[1]}(${value.code}, ${right.code})`,t):{...binaryExpression(value,op,right),type:comparison||!info[1]?'boolean':t};
    }
    return value;
  };
  const variable=(global=false)=>{
    const kind=take();if(eat('<')){const address=name();if(address!=='private')throw Error('TypeScript 不支持宿主资源声明。');require('>');}
    const n=name(),t=eat(':')?type():'';const value=eat('=')?expression():undefined;
    if(t||value?.type)scopes.at(-1)!.set(n,t||value!.type!);
    return (kind==='var'?'let':'const')+' '+n+(t?': '+t:'')+(value?' = '+value.code:'');
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
  const block=()=>{require('{');scopes.push(new Map());const body:string[]=[];while(peek()!=='}'){if(!peek())throw Error('WGSL 代码块未闭合。');body.push(statement());}require('}');scopes.pop();return '{\n'+body.join('\n')+'\n}';};
  const condition=()=>{if(eat('(')){const v=expression().code;require(')');return v;}return expression().code;};
  const statement=():string=>{
    if(peek()==='{')return block();
    if(eat(';'))return '';
    if(eat('return')){const v=peek()===';'?'':' '+expression().code;require(';');return 'return'+v+';';}
    if(eat('if')){const test=condition(),yes=block();return `if (${test}) ${yes}`+(eat('else')?' else '+(peek()==='if'?statement():block()):'');}
    if(eat('for')){scopes.push(new Map());require('(');const init=peek()===';'?'':simple();require(';');const test=peek()===';'?'':expression().code;require(';');const next=peek()===')'?'':simple();require(')');const body=block();scopes.pop();return `for (${init}; ${test}; ${next}) ${body}`;}
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
    if(eat('fn')){const n=name();require('(');scopes.push(new Map());const params:string[]=[];while(peek()!==')'){const p=name();require(':');const t=type();scopes.at(-1)!.set(p,t);params.push(p+': '+t);if(!eat(','))break;}require(')');const result=eat('->')?type():'void';output.push('export function '+n+'('+params.join(', ')+'): '+result+' '+block());scopes.pop();}
    else if(eat('struct')){const n=name();require('{');const fields:string[]=[];while(peek()!=='}'){const f=name();require(':');fields.push(f+': '+type()+';');if(!eat(','))eat(';');}require('}');eat(';');output.push('interface '+n+' {\n'+fields.join('\n')+'\n}');}
    else if(eat('alias')){const n=name();require('=');output.push('type '+n+' = '+type()+';');require(';');}
    else if(['var','let','const'].includes(peek())){output.push(variable(true)+';');require(';');}
    else throw Error('WGSL → TypeScript 不支持此顶层语法：'+peek());
  }
  const metadata=source.match(/^\s*\/\/ @haiyue-(?:common|channel)[^\n]*/gm)?.join('\n');
  return preserveShaderComments(source,(metadata?metadata+'\n':'')+formatShader(output.join('\n\n'),'typescript'),{from:'wgsl',to:'typescript'});
}
