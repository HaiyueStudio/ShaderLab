/** Emit an expression tree without retaining redundant source parentheses.
 * Equal-precedence right operands stay grouped: floating-point arithmetic is
 * not associative, and a - (b - c) must never become a - b - c. */
export interface ShaderExpression {code:string;precedence:number;operator?:string}
export const binaryPrecedence:Readonly<Record<string,number>>={
  '||':1,'&&':2,'|':3,'^':4,'&':5,'==':6,'!=':6,'<':7,'<=':7,'>':7,'>=':7,
  '<<':8,'>>':8,'+':9,'-':9,'*':10,'/':10,'%':10,
};
export const primaryExpression=(code:string):ShaderExpression=>({code,precedence:12});
export const expressionOperand=(value:ShaderExpression,minimum:number)=>value.precedence<minimum?'('+value.code+')':value.code;
export function binaryExpression(left:ShaderExpression,operator:string,right:ShaderExpression,wgsl=false):ShaderExpression {
  const precedence=binaryPrecedence[operator]??0;
  const operand=(value:ShaderExpression,isRight:boolean)=>{
    const bitwise=['&','|','^'],logical=['&&','||'],comparison=['==','!=','<','<=','>','>='];
    const mixed=wgsl&&value.operator&&(
      (bitwise.includes(operator)||bitwise.includes(value.operator))&&value.operator!==operator
      ||logical.includes(operator)&&logical.includes(value.operator)&&value.operator!==operator
      ||comparison.includes(operator)&&comparison.includes(value.operator));
    return value.precedence<precedence||isRight&&value.precedence===precedence||mixed?'('+value.code+')':value.code;
  };
  return {code:operand(left,false)+' '+operator+' '+operand(right,true),precedence,operator};
}
export function prefixExpression(operator:string,value:ShaderExpression):ShaderExpression {
  const operand=expressionOperand(value,11),gap=['-','+','&'].includes(operator)&&operand.startsWith(operator)?' ':'';
  return {code:operator+gap+operand,precedence:11};
}
