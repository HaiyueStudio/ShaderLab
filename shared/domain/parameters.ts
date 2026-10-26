/** Eight stable vec4 slots are shared by WGSL, GLSL and HLSL as iParams[0…7]. */
export type ParameterValue = number | boolean | string;
export interface ShaderParameter { slot:number; name:string; kind:'float'|'color'|'bool'; value:ParameterValue; initial:ParameterValue; min?:number; max?:number; step?:number }
export interface ParameterPreset { name:string; values:Record<string,ParameterValue> }
export const PARAMETER_SLOTS=8, FRAME_FLOATS=68, FRAME_BYTES=FRAME_FLOATS*4;
export function validateParameters(parameters:unknown,presets:unknown){
 const assert=(v:unknown,m:string)=>{if(!v)throw Error(m);};
 assert(parameters===undefined||Array.isArray(parameters)&&parameters.length<=8,'最多定义 8 个参数。');
 const slots=new Set<number>();
 for(const p of (parameters??[]) as ShaderParameter[]){
  assert(p&&Number.isInteger(p.slot)&&p.slot>=0&&p.slot<8&&!slots.has(p.slot),'参数槽位无效或重复。');slots.add(p.slot);
  assert(typeof p.name==='string'&&p.name.trim()&&p.name.length<=60,'参数名称长度须为 1–60。');
  assert(['float','color','bool'].includes(p.kind),'参数类型无效。');
  if(p.kind==='float')assert([p.min,p.max,p.step].every(v=>typeof v==='number'&&Number.isFinite(v))&&p.min!<p.max!&&p.step!>0,'参数范围无效。');
  for(const v of [p.value,p.initial])assert(validValue(p,v),'参数数值无效。');
 }
 assert(presets===undefined||Array.isArray(presets)&&presets.length<=20,'最多保存 20 个参数预设。');
 const names=new Set<string>();
 for(const preset of (presets??[]) as ParameterPreset[]){
  assert(preset&&typeof preset.name==='string'&&preset.name.trim()&&preset.name.length<=60&&!names.has(preset.name),'预设名称无效或重复。');names.add(preset.name);
  assert(preset.values&&typeof preset.values==='object'&&!Array.isArray(preset.values),'预设内容无效。');
  for(const [slot,v] of Object.entries(preset.values)){const p=(parameters as ShaderParameter[]|undefined)?.find(p=>String(p.slot)===slot);assert(p&&validValue(p,v),'预设引用了无效参数。');}
 }
}
export function validValue(p:ShaderParameter,v:unknown):v is ParameterValue{return p.kind==='bool'?typeof v==='boolean':p.kind==='color'?typeof v==='string'&&/^#[0-9a-f]{6}$/i.test(v):typeof v==='number'&&Number.isFinite(v)&&v>=p.min!&&v<=p.max!;}
export function parameterData(parameters:readonly ShaderParameter[]=[]){const data=new Float32Array(32);for(const p of parameters){const at=p.slot*4;if(p.kind==='color'){const n=parseInt(String(p.value).slice(1),16);data.set([(n>>16&255)/255,(n>>8&255)/255,(n&255)/255,1],at);}else data[at]=Number(p.value);}return data;}
export function nextParameter(parameters:readonly ShaderParameter[],kind:ShaderParameter['kind']):ShaderParameter{
 const slot=Array.from({length:8},(_,i)=>i).find(i=>!parameters.some(p=>p.slot===i));if(slot===undefined)throw Error('最多定义 8 个参数。');
 const value=kind==='color'?'#3dd4b0':kind==='bool'?true:1;
 return {slot,name:'Parameter '+(slot+1),kind,value,initial:value,...(kind==='float'?{min:0,max:5,step:.01}:{})};
}
