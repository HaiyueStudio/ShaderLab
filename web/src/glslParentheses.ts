import {formatShader} from '../../shared/dist/domain/shaderFormatting.js';
import {binaryPrecedence} from './shaderExpressions.js';

type Token={value:string;from:number;to:number};
type Expr={precedence:number;children:[Expr,number,boolean][];group?:[number,number];inner?:Expr};
const assignments=new Set(['=','+=','-=','*=','/=','%=','&=','|=','^=','<<=','>>=']);
const priority:Readonly<Record<string,number>>={...binaryPrecedence,'^^':1.5,',':-2,...Object.fromEntries([...assignments].map(op=>[op,-1]))};
const number=/^(?:0[xX][\da-fA-F]+|(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?)[uUfF]?/;

/** Keep comments, strings and whole preprocessor directives outside the parser. */
function tokenize(source:string):Token[]{
  const tokens:Token[]=[];let at=0;
  while(at<source.length){
    if(/\s/.test(source[at]!)){at++;continue;}
    if(source.startsWith('//',at)){const end=source.indexOf('\n',at);at=end<0?source.length:end;continue;}
    if(source.startsWith('/*',at)){const end=source.indexOf('*/',at+2);at=end<0?source.length:end+2;continue;}
    const from=at;
    if(source[at]==='#'){
      let end=source.indexOf('\n',at);while(end>=0&&/\\\r?$/.test(source.slice(at,end))){at=end+1;end=source.indexOf('\n',at);}
      at=end<0?source.length:end;tokens.push({value:'#',from,to:at});continue;
    }
    if(source[at]==='"'||source[at]==="'"){
      const quote=source[at++];while(at<source.length){if(source[at]==='\\')at+=2;else if(source[at++]===quote)break;}
      tokens.push({value:'"',from,to:at});continue;
    }
    const match=number.exec(source.slice(at))??/^[A-Za-z_]\w*|^(?:<<=|>>=|\+\+|--|&&|\|\||\^\^|<<|>>|<=|>=|==|!=|\+=|-=|\*=|\/=|%=|&=|\|=|\^=)/.exec(source.slice(at));
    const value=match?.[0]??source[at]!;at+=value.length;tokens.push({value,from,to:at});
  }
  return tokens;
}

/** Simplify generated GLSL expressions without rewriting operations or their
 * evaluation order. Unknown syntax is retained. Legacy exports bypass this.
 * Only parenthesis tokens change; opaque text and all other tokens survive. */
export function simplifyGlslParentheses(source:string):string {
  // Macro substitution may make an argument's parentheses semantically
  // necessary (e.g. NEG((a+b)) with #define NEG(x) -x).
  if(/^\s*#/m.test(source))return source;
  const tokens=tokenize(source),remove=new Set<number>();let work=tokens.length*16;
  const leaf=():Expr=>({precedence:13,children:[]});
  const precedence=(value:Expr):number=>value.inner?precedence(value.inner):value.precedence;
  const visit=(value:Expr,minimum:number,equal=false)=>{
    if(value.inner){
      const p=precedence(value.inner),needed=p<minimum||equal&&p===minimum;
      if(!needed)for(const index of value.group!)remove.add(index);
      visit(value.inner,needed?-2:minimum,needed?false:equal);
    }else for(const [child,p,same]of value.children)visit(child,p,same);
  };
  for(let start=0;start<tokens.length;start++){
    const first=tokens[start]!.value,previous=tokens[start-1]?.value??';',keyword=first==='return'||first==='case';
    if(!keyword&&!['if','while','switch'].includes(first)&&![';','{','}','else'].includes(previous)&&!assignments.has(previous))continue;
    let at=start+(keyword?1:0),depth=0;
    const peek=()=>tokens[at]?.value??'',take=()=>{if(--work<0)throw Error('Expression budget');return tokens[at++]?.value??'';};
    const require=(value:string)=>{if(take()!==value)throw Error('Expression syntax');};
    const parse=(minimum=-1):Expr=>{
      if(++depth>256)throw Error('Expression depth');
      const from=at,value=take();let node:Expr;
      if(value==='('){const inner=parse(-2),end=at;require(')');node={precedence:13,children:[],inner,group:[from,end]};}
      else if(['+','-','!','~','++','--'].includes(value))node={precedence:11,children:[[parse(11),11,false]]};
      else if(/^[A-Za-z_]\w*$/.test(value)||number.test(value))node=leaf();
      else throw Error('Expression primary');
      while(peek()){
        const op=peek();
        if(op==='('){
          take();const args:[Expr,number,boolean][]=[[node,12,false]];
          if(peek()!==')')for(;;){args.push([parse(),-1,false]);if(peek()!==',')break;take();}
          require(')');node={precedence:12,children:args};continue;
        }
        if(op==='['){take();const children:[Expr,number,boolean][]=[[node,12,false]];if(peek()!==']')children.push([parse(-2),-2,false]);require(']');node={precedence:12,children};continue;}
        if(op==='.'){take();if(!/^[A-Za-z_]\w*$/.test(take()))throw Error('Expression member');node={precedence:12,children:[[node,12,false]]};continue;}
        if(op==='++'||op==='--'){take();node={precedence:12,children:[[node,12,false]]};continue;}
        if(op==='?'&&minimum<=0){take();const yes=parse(-2);require(':');const no=parse(-1);node={precedence:0,children:[[node,0,true],[yes,-2,false],[no,0,false]]};continue;}
        const p=priority[op];if(typeof p!=='number'||p<minimum)break;
        take();const right=assignments.has(op),rhs=parse(right?p:p+.1);
        node={precedence:p,children:[[node,p,right],[rhs,p,!right]]};
      }
      depth--;return node;
    };
    try{
      const node=parse(keyword?-2:-1),end=peek();
      if(![';',',',')',']','}',':'].includes(end)&&!(['if','while','switch'].includes(first)&&end==='{'))continue;
      visit(node,keyword?-2:-1);start=at-1;
    }catch{if(work<0)break;/* Unsupported syntax remains untouched. */}
  }
  if(!remove.size)return source;
  let result='',at=0;
  for(const index of [...remove].sort((a,b)=>a-b)){const token=tokens[index]!;result+=source.slice(at,token.from)+' ';at=token.to;}
  return formatShader(result+source.slice(at),'glsl');
}
