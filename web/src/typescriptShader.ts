import ts from 'typescript';
import {LIMITS} from './model.js';
import type {WgslTranslationResult} from './wgsl.js';
import {preserveShaderComments} from './shaderComments.js';

/** Parses source as data. User TypeScript is never evaluated or transpiled to JS. */
export function typescriptToWgsl(source:string):WgslTranslationResult {
  if(source.length>LIMITS.code)return {code:null,diagnostics:[{line:1,column:1,message:'TypeScript 代码不能超过 100 KB。'}],warnings:[]};
  const file=ts.createSourceFile('shader.ts',source,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  const fail=(node:ts.Node,message:string):never=>{const p=file.getLineAndCharacterOfPosition(node.getStart(file));throw {line:p.line+1,column:p.character+1,message:'TypeScript: '+message};};
  const id=(node:ts.Node)=>ts.isIdentifier(node)?node.text:fail(node,'仅支持具名变量，不能使用解构。');
  const type=(node:ts.TypeNode|undefined):string=>{
    if(!node)return '';
    if(node.kind===ts.SyntaxKind.NumberKeyword)return 'f32';
    if(node.kind===ts.SyntaxKind.BooleanKeyword)return 'bool';
    if(node.kind===ts.SyntaxKind.VoidKeyword)return '';
    if(ts.isTypeReferenceNode(node)){
      if(!ts.isIdentifier(node.typeName))return fail(node,'GPU 类型不能使用命名空间。');
      const name=node.typeName.text,args=node.typeArguments?.map(type)??[];
      if(name==='ptr')return `ptr<function, ${args.join(', ')}>`;
      if(name==='Array')return fail(node,'数组需要固定长度，请使用 array<T, N>。');
      return name+(args.length?'<'+args.join(', ')+'>':'');
    }
    if(ts.isLiteralTypeNode(node)&&ts.isNumericLiteral(node.literal))return node.literal.text;
    return fail(node,'GPU 类型支持 number / boolean、f32 / i32 / u32、向量、矩阵、结构体和固定长度 array<T, N>。');
  };
  const binary:Record<string,string>={add:'+',sub:'-',mul:'*',div:'/',mod:'%',eq:'==',ne:'!=',lt:'<',le:'<=',gt:'>',ge:'>=',bitAnd:'&',bitOr:'|',bitXor:'^',shl:'<<',shr:'>>'};
  const math=new Set('abs acos acosh asin asinh atan atan2 atanh ceil cos cosh exp exp2 floor log log2 max min pow round sign sin sinh sqrt tan tanh trunc'.split(' '));
  const expr=(node:ts.Expression):string=>{
    if(ts.isIdentifier(node))return node.text;
    if(ts.isNumericLiteral(node))return node.getText(file).replace(/_/g,'');
    if(node.kind===ts.SyntaxKind.TrueKeyword)return 'true';if(node.kind===ts.SyntaxKind.FalseKeyword)return 'false';
    if(ts.isParenthesizedExpression(node))return '('+expr(node.expression)+')';
    if(ts.isPropertyAccessExpression(node)){
      if(ts.isIdentifier(node.expression)&&node.expression.text==='Math'){
        const constants:Record<string,string>={PI:'3.141592653589793',E:'2.718281828459045',SQRT2:'1.4142135623730951'};
        return constants[node.name.text]??fail(node,'不支持该 Math 常量。');
      }
      return expr(node.expression)+'.'+node.name.text;
    }
    if(ts.isElementAccessExpression(node)&&node.argumentExpression)return expr(node.expression)+'['+expr(node.argumentExpression)+']';
    if(ts.isAsExpression(node)||ts.isTypeAssertionExpression(node)){const t=type(node.type);return t?`${t}(${expr(node.expression)})`:fail(node,'转换需要 GPU 数值类型。');}
    if(ts.isPrefixUnaryExpression(node)||ts.isPostfixUnaryExpression(node)){
      const op=ts.tokenToString(node.operator)!;return ts.isPostfixUnaryExpression(node)?expr(node.operand)+op:op+'('+expr(node.operand)+')';
    }
    if(ts.isBinaryExpression(node)){
      const op=ts.tokenToString(node.operatorToken.kind)!;
      if(op==='**')return `pow(${expr(node.left)}, ${expr(node.right)})`;
      if(op==='>>>')return fail(node,'无符号右移请先转换为 u32，再使用 >>。');
      if(op===',')return fail(node,'GPU 表达式不支持逗号运算符。');
      return '('+expr(node.left)+' '+(op==='==='?'==':op==='!=='?'!=':op)+' '+expr(node.right)+')';
    }
    if(ts.isCallExpression(node)){
      const args=node.arguments.map(expr),types=node.typeArguments?.map(type)??[];
      if(ts.isPropertyAccessExpression(node.expression)&&ts.isIdentifier(node.expression.expression)){
        const owner=node.expression.expression.text,name=node.expression.name.text;
        if(owner==='Math'){if(!math.has(name))return fail(node,'该 Math 方法不属于 GPU 数值子集。');return name+'('+args.join(', ')+')';}
        if(owner==='gpu'){
          if(binary[name]){if(args.length!==2)return fail(node,'此 GPU 运算需要两个参数。');return '('+args[0]+' '+binary[name]+' '+args[1]+')';}
          if(name==='neg')return '-('+args[0]+')';if(name==='not')return '!('+args[0]+')';if(name==='bitNot')return '~('+args[0]+')';
          if(name==='addressOf')return '&'+args[0];if(name==='load')return '(*'+args[0]+')';
          if(name==='construct'){if(types.length!==1)return fail(node,'construct 需要结构体类型。');return types[0]+'('+args.join(', ')+')';}
          if(name==='array'||name==='bitcast')return name+(types.length?'<'+types.join(', ')+'>':'')+'('+args.join(', ')+')';
          return fail(node,'未知的 GPU 运算：'+name);
        }
      }
      if(!ts.isIdentifier(node.expression))return fail(node,'GPU 只支持静态函数调用，不支持对象方法或动态函数。');
      const name=node.expression.text==='Number'?'f32':node.expression.text==='Boolean'?'bool':node.expression.text;
      return name+(types.length?'<'+types.join(', ')+'>':'')+'('+args.join(', ')+')';
    }
    return fail(node,'此表达式不属于 GPU 数值子集；条件值请用 if / else 或 select 编写。');
  };
  const variables=(list:ts.VariableDeclarationList,global=false)=>list.declarations.map(d=>{
    const name=id(d.name);if(name==='gpu'||name==='Math')fail(d,'gpu 和 Math 是保留命名空间。');
    const t=type(d.type),value=d.initializer?expr(d.initializer):'';
    if(!value&&!t)return fail(d,'未初始化的变量需要类型。');
    const constant=!!(list.flags&ts.NodeFlags.Const),kind=global?(constant?'const':'var<private>'):(constant?'let':'var');
    return `${kind} ${name}${t?': '+t:''}${value?' = '+value:''}`;
  }).join('; ');
  const expressionStatement=(node:ts.Expression):string=>{
    if(ts.isCallExpression(node)&&ts.isPropertyAccessExpression(node.expression)&&node.expression.expression.getText(file)==='gpu'&&node.expression.name.text==='store'){
      if(node.arguments.length!==2)fail(node,'store 需要指针和值。');return '*'+expr(node.arguments[0]!)+' = '+expr(node.arguments[1]!);
    }
    if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&node.expression.text==='discard')return 'discard';
    if(ts.isBinaryExpression(node)&&node.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&node.operatorToken.kind<=ts.SyntaxKind.LastAssignment)return expr(node.left)+' '+ts.tokenToString(node.operatorToken.kind)+' '+expr(node.right);
    return expr(node);
  };
  const block=(node:ts.Statement):string=>ts.isBlock(node)?'{\n'+node.statements.map(statement).join('\n')+'\n}':'{\n'+statement(node)+'\n}';
  const statement=(node:ts.Statement):string=>{
    if(ts.isBlock(node))return block(node);
    if(ts.isVariableStatement(node))return variables(node.declarationList)+';';
    if(ts.isExpressionStatement(node)){if(ts.isStringLiteral(node.expression)&&node.expression.text==='use gpu')return '';return expressionStatement(node.expression)+';';}
    if(ts.isReturnStatement(node))return 'return'+(node.expression?' '+expr(node.expression):'')+';';
    if(ts.isIfStatement(node))return `if (${expr(node.expression)}) ${block(node.thenStatement)}`+(node.elseStatement?' else '+block(node.elseStatement):'');
    if(ts.isForStatement(node))return `for (${node.initializer?(ts.isVariableDeclarationList(node.initializer)?variables(node.initializer):expressionStatement(node.initializer)):''}; ${node.condition?expr(node.condition):''}; ${node.incrementor?expressionStatement(node.incrementor):''}) ${block(node.statement)}`;
    if(ts.isWhileStatement(node))return `while (${expr(node.expression)}) ${block(node.statement)}`;
    if(ts.isDoStatement(node))return 'loop {\n'+(ts.isBlock(node.statement)?node.statement.statements.map(statement).join('\n'):statement(node.statement))+`\ncontinuing { break if !(${expr(node.expression)}); }\n}`;
    if(ts.isBreakStatement(node)){if(node.label)fail(node,'不支持带标签的 break。');return 'break;';}
    if(ts.isContinueStatement(node)){if(node.label)fail(node,'不支持带标签的 continue。');return 'continue;';}
    if(ts.isSwitchStatement(node)){
      const cases:string[]=[];let labels:string[]=[];
      for(const clause of node.caseBlock.clauses){labels.push(ts.isCaseClause(clause)?expr(clause.expression):'default');if(!clause.statements.length)continue;
        const statements=[...clause.statements],last=statements.at(-1);if(last&&ts.isBreakStatement(last))statements.pop();else if(last&&!ts.isReturnStatement(last)&&!ts.isContinueStatement(last))fail(clause,'GPU switch 不支持 case 穿透，请显式 break 或 return。');
        if(labels.includes('default')&&labels.length>1)fail(clause,'default 不能与其他 case 共用代码块。');
        cases.push((labels[0]==='default'?'default':'case '+labels.join(', '))+': {\n'+statements.map(statement).join('\n')+'\n}');labels=[];
      }
      if(labels.length)cases.push((labels[0]==='default'?'default':'case '+labels.join(', '))+': {}');
      return `switch (${expr(node.expression)}) {\n${cases.join('\n')}\n}`;
    }
    if(ts.isEmptyStatement(node))return '';
    return fail(node,'不支持此语句；GPU 代码不能使用 async、异常、类、动态对象或宿主 API。');
  };
  try{
    const errors=(file as ts.SourceFile&{parseDiagnostics:readonly ts.DiagnosticWithLocation[]}).parseDiagnostics;
    if(errors.length){const e=errors[0]!,p=file.getLineAndCharacterOfPosition(e.start??0);return {code:null,diagnostics:[{line:p.line+1,column:p.character+1,message:ts.flattenDiagnosticMessageText(e.messageText,'\n')}],warnings:[]};}
    const output:string[]=[];
    for(const node of file.statements){
      if(ts.isFunctionDeclaration(node)){
        if(!node.name||!node.body||node.asteriskToken||node.typeParameters?.length||node.modifiers?.some(m=>m.kind===ts.SyntaxKind.AsyncKeyword))fail(node,'GPU 函数需要具名函数体，不能使用 async、生成器或泛型。');
        const name=id(node.name!),returns=type(node.type)||(name==='mainImage'?'vec4f':name==='mainSound'?'vec2f':'');
        const params=node.parameters.map(p=>{if(p.questionToken||p.dotDotDotToken||p.initializer)fail(p,'GPU 参数不能是可选参数、默认参数或剩余参数。');const t=type(p.type);if(!t)fail(p,'GPU 参数需要类型。');return id(p.name)+': '+t;});
        output.push(`fn ${name}(${params.join(', ')})${returns?' -> '+returns:''} ${block(node.body!)}`);
      }else if(ts.isInterfaceDeclaration(node)){
        if(node.heritageClauses?.length||node.typeParameters?.length)fail(node,'GPU 结构体不支持继承或泛型。');
        output.push('struct '+node.name.text+' {\n'+node.members.map(m=>{if(!ts.isPropertySignature(m)||!m.type||m.questionToken)fail(m,'结构体只支持有类型的必填字段。');return id(m.name!)+': '+type((m as ts.PropertySignature).type)+',';}).join('\n')+'\n}');
      }else if(ts.isTypeAliasDeclaration(node))output.push('alias '+node.name.text+' = '+type(node.type)+';');
      else if(ts.isVariableStatement(node))output.push(variables(node.declarationList,true)+';');
      else if(ts.isEmptyStatement(node))continue;
      else fail(node,'顶层只允许函数、数值变量、interface 和类型别名；不能 import 或执行宿主代码。');
    }
    const metadata=source.match(/^\s*\/\/ @haiyue-(?:common|channel)[^\n]*/gm)?.join('\n');
    return {code:preserveShaderComments(source,(metadata?metadata+'\n':'')+output.join('\n\n')+'\n',{from:'typescript',to:'wgsl'}),diagnostics:[],warnings:[]};
  }catch(error){const diagnostic=error as {line?:number;column?:number;message?:string};return {code:null,diagnostics:[{line:diagnostic.line??1,column:diagnostic.column??1,message:diagnostic.message??String(error)}],warnings:[]};}
}
