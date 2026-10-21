import {createProject,passOf,type ShaderLanguage,type ShaderProject} from './model.js';

export type PracticeText = readonly [string,string];
export interface PracticeChallenge {id:string;title:PracticeText;level:1|2|3;topic:PracticeText;goal:PracticeText;hint:PracticeText;reference:string}
export const PRACTICE_SIZE=256;
export const PRACTICE_HELPERS=`const BG = vec3f(0.03, 0.04, 0.08);
const INK = vec3f(0.24, 0.83, 0.69);
const GOLD = vec3f(1.0, 0.55, 0.28);
const PI = 3.14159265359;
fn mask(d: f32) -> f32 { return 1.0-smoothstep(-0.008,0.008,d); }
fn box(p: vec2f,b: vec2f) -> f32 { let q=abs(p)-b; return length(max(q,vec2f(0.0)))+min(max(q.x,q.y),0.0); }
fn segment(p: vec2f,a: vec2f,b: vec2f) -> f32 {let q=p-a; let v=b-a; return length(q-v*clamp(dot(q,v)/dot(v,v),0.0,1.0));}
fn rotate(p: vec2f,a: f32) -> vec2f {return vec2f(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y);}
`;
const wrap=(body:string)=>PRACTICE_HELPERS+`fn mainImage(fragCoord: vec2f) -> vec4f {
  let uv = fragCoord / iResolution.xy;
  let p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  ${body}
}`;
const fill=(distance:string)=>`return vec4f(mix(BG, INK, mask(${distance})),1.0);`;
const definitions: Array<[string,PracticeText,1|2|3,PracticeText,PracticeText,PracticeText,string]> = [
  ["first-color", ["第一抹颜色", "First color"], 1, ["颜色", "Color"], ["所有像素输出 INK，Alpha 为 1。", "Output INK at every pixel with alpha 1."], ["直接返回一个四维颜色。", "Return a four-component color."], "return vec4f(INK,1.0);"],
  ["uv-map", ["坐标画布", "UV canvas"], 1, ["颜色", "Color"], ["输出 RGB = (uv.x, uv.y, 0.25)。", "Output RGB = (uv.x, uv.y, 0.25)."], ["uv 已按分辨率归一化。", "uv is already normalized."], "return vec4f(uv,0.25,1.0);"],
  ["horizontal-gradient", ["水平渐变", "Horizontal gradient"], 1, ["颜色", "Color"], ["由 BG 向 GOLD 线性插值，权重为 uv.x。", "Linearly blend BG to GOLD using uv.x."], ["使用 mix，注意权重范围 0–1。", "Use mix with a weight from 0 to 1."], "return vec4f(mix(BG,GOLD,uv.x),1.0);"],
  ["vertical-gradient", ["垂直渐变", "Vertical gradient"], 1, ["颜色", "Color"], ["由 BG 向 GOLD 线性插值，权重为 uv.y。", "Linearly blend BG to GOLD using uv.y."], ["使用 mix，注意权重范围 0–1。", "Use mix with a weight from 0 to 1."], "return vec4f(mix(BG,GOLD,uv.y),1.0);"],
  ["diagonal-gradient", ["对角渐变", "Diagonal gradient"], 1, ["颜色", "Color"], ["由 BG 向 GOLD 线性插值，权重为 (uv.x + uv.y) / 2。", "Linearly blend BG to GOLD using (uv.x + uv.y) / 2."], ["使用 mix，注意权重范围 0–1。", "Use mix with a weight from 0 to 1."], "return vec4f(mix(BG,GOLD,(uv.x+uv.y)*0.5),1.0);"],
  ["quadrants", ["四个象限", "Four quadrants"], 1, ["颜色", "Color"], ["输出 RGB = (step(0.5,uv.x), step(0.5,uv.y), 0.25)。", "Output RGB = (step(0.5,uv.x), step(0.5,uv.y), 0.25)."], ["step 可生成 0 或 1。", "step produces either 0 or 1."], "return vec4f(step(0.5,uv.x),step(0.5,uv.y),0.25,1.0);"],
  ["stripes", ["条纹节奏", "Stripe rhythm"], 1, ["图案", "Patterns"], ["将 uv.x 重复 8 次，每段后半部分为 INK，前半为 BG；硬边。", "Repeat uv.x 8 times. Use INK in the second half of each cell, BG in the first; hard edges."], ["fract 保留小数，step 做分界。", "Use fract and step."], "return vec4f(mix(BG,INK,step(0.5,fract(uv.x*8.0))),1.0);"],
  ["checkerboard", ["棋盘", "Checkerboard"], 1, ["图案", "Patterns"], ["8×8 棋盘，左下角为 BG，相邻格为 INK；硬边。", "Make an 8×8 checkerboard with BG in the bottom-left cell, alternating INK; hard edges."], ["对格子行列索引之和取模。", "Use the parity of the cell indices."], "let k=(floor(uv.x*8.0)+floor(uv.y*8.0))%2.0; return vec4f(mix(BG,INK,k),1.0);"],
  ["disc", ["居中的圆", "Centered disc"], 1, ["几何", "Geometry"], ["半径 0.55 的圆。", "A circle of radius 0.55."], ["距离为负时在图形内部，用 mask(distance) 混合 BG 与 INK。", "Negative distances are inside; blend BG and INK with mask(distance)."], "@fill:length(p)-0.55"],
  ["ring", ["圆环", "Ring"], 1, ["几何", "Geometry"], ["半径 0.55、半厚度 0.06 的圆环。", "A ring of radius 0.55 and half-thickness 0.06."], ["距离为负时在图形内部，用 mask(distance) 混合 BG 与 INK。", "Negative distances are inside; blend BG and INK with mask(distance)."], "@fill:abs(length(p)-0.55)-0.06"],
  ["rectangle", ["矩形", "Rectangle"], 1, ["几何", "Geometry"], ["半宽 0.65、半高 0.35 的矩形。", "A box with half-width 0.65 and half-height 0.35."], ["距离为负时在图形内部，用 mask(distance) 混合 BG 与 INK。", "Negative distances are inside; blend BG and INK with mask(distance)."], "@fill:box(p,vec2f(0.65,0.35))"],
  ["cross", ["十字", "Cross"], 1, ["几何", "Geometry"], ["两个矩形的并集，半尺寸分别为 (0.65,0.15) 和 (0.15,0.65)。", "Union of boxes with half-sizes (0.65,0.15) and (0.15,0.65)."], ["距离为负时在图形内部，用 mask(distance) 混合 BG 与 INK。", "Negative distances are inside; blend BG and INK with mask(distance)."], "@fill:min(box(p,vec2f(0.65,0.15)),box(p,vec2f(0.15,0.65)))"],
  ["ellipse", ["椭圆", "Ellipse"], 2, ["几何", "Geometry"], ["椭圆半轴 (0.75,0.4)，使用缩放坐标后的圆距离。", "Ellipse axes (0.75,0.4), using the circle distance in scaled coordinates."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:length(p/vec2f(0.75,0.4))-1.0"],
  ["rounded-box", ["圆角卡片", "Rounded card"], 2, ["几何", "Geometry"], ["矩形半尺寸 (0.5,0.3)，距离减去圆角半径 0.15。", "Box half-size (0.5,0.3), subtract radius 0.15 from its distance."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:box(p,vec2f(0.5,0.3))-0.15"],
  ["capsule", ["胶囊", "Capsule"], 2, ["几何", "Geometry"], ["端点 (−0.5,−0.3) 与 (0.5,0.3)，半径 0.18。", "Endpoints (−0.5,−0.3), (0.5,0.3), radius 0.18."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:segment(p,vec2f(-0.5,-0.3),vec2f(0.5,0.3))-0.18"],
  ["diamond", ["菱形", "Diamond"], 2, ["几何", "Geometry"], ["四个顶点在坐标轴 ±0.7，距离为 (|x|+|y|−0.7)/√2。", "Vertices at ±0.7 on each axis; distance (|x|+|y|−0.7)/√2."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:(abs(p.x)+abs(p.y)-0.7)/sqrt(2.0)"],
  ["triangle", ["等边三角形", "Equilateral triangle"], 2, ["几何", "Geometry"], ["三条边的距离为 −y−0.35、0.8660254x+0.5y−0.35、−0.8660254x+0.5y−0.35；取最大值。", "Take the maximum of −y−0.35, 0.8660254x+0.5y−0.35, −0.8660254x+0.5y−0.35."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:max(-p.y-0.35,max(0.8660254*p.x+0.5*p.y-0.35,-0.8660254*p.x+0.5*p.y-0.35))"],
  ["hexagon", ["蜂巢单元", "Hexagon"], 2, ["几何", "Geometry"], ["正六边形，距离 max(|y|,0.8660254|x|+0.5|y|)−0.55。", "Hexagon distance max(|y|,0.8660254|x|+0.5|y|)−0.55."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:max(abs(p.y),0.8660254*abs(p.x)+0.5*abs(p.y))-0.55"],
  ["star", ["五角星光", "Five-point star"], 2, ["几何", "Geometry"], ["极坐标轮廓半径 r=0.5+0.18cos(5θ)，θ=atan2(y,x)。", "Polar radius r=0.5+0.18cos(5θ), θ=atan2(y,x)."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:length(p)-(0.5+0.18*cos(5.0*atan2(p.y,p.x)))"],
  ["union", ["两个圆的并集", "Circle union"], 2, ["几何", "Geometry"], ["两个半径 0.4 的圆，圆心 (±0.25,0)，取并集。", "Union of radius-0.4 circles centered at (±0.25,0)."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:min(length(p+vec2f(0.25,0.0))-0.4,length(p-vec2f(0.25,0.0))-0.4)"],
  ["intersection", ["两个圆的交集", "Circle intersection"], 2, ["几何", "Geometry"], ["两个半径 0.5 的圆，圆心 (±0.25,0)，取交集。", "Intersection of radius-0.5 circles centered at (±0.25,0)."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:max(length(p+vec2f(0.25,0.0))-0.5,length(p-vec2f(0.25,0.0))-0.5)"],
  ["cutout", ["月牙", "Crescent"], 2, ["几何", "Geometry"], ["从原点半径 0.6 的圆减去圆心 (0.28,0.12)、半径 0.5 的圆。", "Subtract the circle at (0.28,0.12), radius 0.5, from the centered circle of radius 0.6."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:max(length(p)-0.6,-(length(p-vec2f(0.28,0.12))-0.5))"],
  ["rotation", ["旋转方块", "Rotated box"], 2, ["几何", "Geometry"], ["半尺寸 (0.5,0.3) 的矩形逆时针旋转 π/4。", "Rotate a box of half-size (0.5,0.3) counterclockwise by π/4."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:box(rotate(p,-PI/4.0),vec2f(0.5,0.3))"],
  ["tiles", ["重复圆点", "Repeated discs"], 2, ["图案", "Patterns"], ["5×5 单元，每格局部坐标 fract(uv×5)−0.5，圆半径 0.3；mask 用局部距离。", "5×5 cells; local coordinates fract(uv×5)−0.5, radius 0.3; apply mask to the local distance."], ["组合距离场，最后用统一的 mask 函数绘制。", "Combine distance fields, then use the supplied mask function."], "@fill:length(fract(uv*5.0)-vec2f(0.5))-0.3"],
  ["wave", ["正弦曲线", "Sine wave"], 3, ["图案", "Patterns"], ["绘制 y=0.35sin(6x)，距离 |y−0.35sin(6x)|−0.025；BG 与 INK。", "Draw y=0.35sin(6x), distance |y−0.35sin(6x)|−0.025; BG and INK."], ["将曲线当作随 x 改变位置的细带。", "Treat the curve as a narrow band."], "@fill:abs(p.y-0.35*sin(p.x*6.0))-0.025"],
  ["rays", ["放射条纹", "Radial rays"], 3, ["图案", "Patterns"], ["θ=atan2(y,x)，权重 step(0,sin(12θ))，混合 BG 和 GOLD。", "θ=atan2(y,x); blend BG and GOLD using step(0,sin(12θ))."], ["使用极坐标角度。", "Use the polar angle."], "return vec4f(mix(BG,GOLD,step(0.0,sin(12.0*atan2(p.y,p.x)))),1.0);"],
  ["ripples", ["同心涟漪", "Concentric ripples"], 3, ["图案", "Patterns"], ["权重 0.5+0.5cos(24|p|)，混合 BG 和 INK。", "Blend BG and INK with 0.5+0.5cos(24|p|)."], ["把径向距离作为波的相位。", "Use radial distance as phase."], "return vec4f(mix(BG,INK,0.5+0.5*cos(24.0*length(p))),1.0);"],
  ["spiral", ["螺旋", "Spiral"], 3, ["图案", "Patterns"], ["权重 0.5+0.5sin(4θ+18|p|)，混合 BG 和 GOLD。", "Blend BG and GOLD using 0.5+0.5sin(4θ+18|p|)."], ["把角度与半径一起放入相位。", "Combine angle and radius in the phase."], "return vec4f(mix(BG,GOLD,0.5+0.5*sin(4.0*atan2(p.y,p.x)+18.0*length(p))),1.0);"],
  ["flower", ["花瓣", "Petals"], 3, ["几何", "Geometry"], ["轮廓 r=0.48+0.18cos(6θ)，距离 |p|−r；BG 与 INK。", "Radius r=0.48+0.18cos(6θ), distance |p|−r; BG and INK."], ["用角度调制圆的半径。", "Modulate radius by angle."], "@fill:length(p)-(0.48+0.18*cos(6.0*atan2(p.y,p.x)))"],
  ["bricks", ["砖墙", "Brick wall"], 3, ["图案", "Patterns"], ["uv 划分 6 列 8 行，奇数行向右偏移半格；格内距四边至少 0.06 为 GOLD，其他为 BG，硬边。", "Use 6 columns and 8 rows, offset odd rows by half a cell; GOLD where local coordinates are at least 0.06 from each edge, otherwise BG; hard edges."], ["先偏移行，再取 fract。", "Offset rows before fract."], "let q=vec2f(uv.x*6.0+0.5*(floor(uv.y*8.0)%2.0),uv.y*8.0); let f=abs(fract(q)-vec2f(0.5)); return vec4f(mix(BG,GOLD,1.0-step(0.44,max(f.x,f.y))),1.0);"],
  ["halftone", ["半调圆点", "Halftone"], 3, ["图案", "Patterns"], ["10×10 单元。半径为 0.08+0.34×(列索引+0.5)/10；局部圆距离使用 mask，BG 与 INK。", "10×10 cells. Radius 0.08+0.34×(column+0.5)/10; mask the local circle distance, BG and INK."], ["半径应由格子索引决定，不是格内 x。", "Base the radius on the cell index, not local x."], "let q=uv*10.0; let r=0.08+0.34*(floor(q.x)+0.5)/10.0; return vec4f(mix(BG,INK,mask(length(fract(q)-vec2f(0.5))-r)),1.0);"],
  ["woven", ["编织", "Woven grid"], 3, ["图案", "Patterns"], ["权重 0.5+0.5sin(32uv.x)sin(32uv.y)，混合 BG 与 GOLD。", "Blend BG and GOLD with 0.5+0.5sin(32uv.x)sin(32uv.y)."], ["相乘两组一维波。", "Multiply two one-dimensional waves."], "return vec4f(mix(BG,GOLD,0.5+0.5*sin(32.0*uv.x)*sin(32.0*uv.y)),1.0);"],
  ["glow", ["柔光", "Soft glow"], 3, ["光照", "Lighting"], ["输出 RGB=BG+GOLD×exp(−5|p|)。", "Output RGB=BG+GOLD×exp(−5|p|)."], ["指数衰减可以模拟光晕。", "Use exponential falloff."], "return vec4f(BG+GOLD*exp(-5.0*length(p)),1.0);"],
  ["sphere", ["漫反射球体", "Diffuse sphere"], 3, ["光照", "Lighting"], ["半径 0.7 的球；圆内法线 normalize((p,sqrt(0.49−dot(p,p))))，光方向 normalize((−0.5,0.7,1))。球色 INK×(0.15+0.85max(dot(n,l),0))，圆外 BG；硬边。", "Radius 0.7. Inside, n=normalize((p,sqrt(0.49−dot(p,p)))), l=normalize((−0.5,0.7,1)). Color INK×(0.15+0.85max(dot(n,l),0)); BG outside, hard edge."], ["从球面方程恢复 z，再求法线。", "Recover z from the sphere equation."], "let r2=dot(p,p); if(r2>0.49){return vec4f(BG,1.0);} let n=normalize(vec3f(p,sqrt(max(0.0,0.49-r2)))); let l=normalize(vec3f(-0.5,0.7,1.0)); return vec4f(INK*(0.15+0.85*max(dot(n,l),0.0)),1.0);"],
  ["donut", ["甜甜圈光照", "Shaded donut"], 3, ["光照", "Lighting"], ["主半径 0.5、管半径 0.18。令 q=|p|−0.5，管内 n=normalize((normalize(p)×q,sqrt(0.0324−q²)))；光照同球体题，但颜色为 GOLD，外部 BG；硬边。", "Major radius 0.5, tube radius 0.18. q=|p|−0.5. Inside, n=normalize((normalize(p)×q,sqrt(0.0324−q²))). Use the sphere lighting with GOLD; BG outside, hard edge."], ["法线来自截面圆的外法线。", "Build the normal from the tube cross-section."], "let q=length(p)-0.5; if(abs(q)>0.18){return vec4f(BG,1.0);} let n=normalize(vec3f(normalize(p)*q,sqrt(max(0.0,0.0324-q*q)))); return vec4f(GOLD*(0.15+0.85*max(dot(n,normalize(vec3f(-0.5,0.7,1.0))),0.0)),1.0);"],
  ["landscape", ["山峦剪影", "Mountain silhouettes"], 3, ["图案", "Patterns"], ["天空从 BG 向 (0.3,0.4,0.65) 按 uv.y 插值；远山 y<0.1+0.18sin(4x) 为 INK×0.55，近山 y<−0.3+0.12sin(7x+1) 为 INK×0.2，x/y 均为 p，硬边，近山覆盖远山。", "Sky mixes BG to (0.3,0.4,0.65) by uv.y. Far mountains below y=0.1+0.18sin(4x) use INK×0.55; near mountains below y=−0.3+0.12sin(7x+1) use INK×0.2. x/y refer to p; hard edges, near covers far."], ["先画天空，再依次覆盖远山与近山。", "Layer sky, far mountains, then near mountains."], "var c=mix(BG,vec3f(0.3,0.4,0.65),uv.y); if(p.y<0.1+0.18*sin(4.0*p.x)){c=INK*0.55;} if(p.y< -0.3+0.12*sin(7.0*p.x+1.0)){c=INK*0.2;} return vec4f(c,1.0);"],
];
export const PRACTICE_CHALLENGES:readonly PracticeChallenge[]=definitions.map(([id,title,level,topic,goal,hint,body])=>({id,title,level,topic,goal,hint,reference:wrap(body.startsWith('@fill:')?fill(body.slice(6)):body)}));
export function findPractice(id:string){return PRACTICE_CHALLENGES.find(c=>c.id===id);}
export function practiceStarter(language:ShaderLanguage):string {
  if(language==='glsl') return `const vec3 BG=vec3(0.03,0.04,0.08), INK=vec3(0.24,0.83,0.69), GOLD=vec3(1.0,0.55,0.28);
const float PI=3.14159265359;
float mask(float d){return 1.0-smoothstep(-0.008,0.008,d);}
float box(vec2 p,vec2 b){vec2 q=abs(p)-b;return length(max(q,vec2(0.0)))+min(max(q.x,q.y),0.0);}
float segment(vec2 p,vec2 a,vec2 b){vec2 q=p-a,v=b-a;return length(q-v*clamp(dot(q,v)/dot(v,v),0.0,1.0));}
vec2 rotate(vec2 p,float a){return vec2(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y);}
// uv: 0..1; p: -1..1, origin at center
void mainImage(out vec4 fragColor, in vec2 fragCoord) {
  vec2 uv = fragCoord / iResolution.xy;
  vec2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  // TODO: draw the target
  fragColor = vec4(0.03, 0.04, 0.08, 1.0);
}`;
  if(language==='hlsl') return `static const float3 BG=float3(0.03,0.04,0.08), INK=float3(0.24,0.83,0.69), GOLD=float3(1.0,0.55,0.28);
static const float PI=3.14159265359;
float mask(float d){return 1.0-smoothstep(-0.008,0.008,d);}
float box(float2 p,float2 b){float2 q=abs(p)-b;return length(max(q,float2(0.0,0.0)))+min(max(q.x,q.y),0.0);}
float segment(float2 p,float2 a,float2 b){float2 q=p-a,v=b-a;return length(q-v*clamp(dot(q,v)/dot(v,v),0.0,1.0));}
float2 rotate(float2 p,float a){return float2(cos(a)*p.x-sin(a)*p.y,sin(a)*p.x+cos(a)*p.y);}
float4 mainImage(float2 fragCoord) {
  float2 uv = fragCoord / iResolution.xy;
  float2 p = (2.0 * fragCoord - iResolution.xy) / iResolution.y;
  // TODO: draw the target
  return float4(0.03, 0.04, 0.08, 1.0);
}`;
  return wrap('// TODO: draw the target\n  return vec4f(BG,1.0);');
}
export function practiceProject(challenge:PracticeChallenge,source:string,language:ShaderLanguage):ShaderProject {
  const p=createProject('Practice · '+challenge.title[0],{ids:{next:()=> 'practice-'+challenge.id},clock:{nowISO:()=> '2026-10-21T00:00:00.000Z'}});
  const image=passOf(p,'image');image.code=language==='wgsl'?source:practiceStarter('wgsl');
  if(language==='glsl')image.glsl=source;
  if(language==='hlsl')image.hlsl=source;
  p.editorLanguages={image:language};return p;
}
export interface PracticePixels {width:number;height:number;pixels:Uint8Array}
export function comparePractice(actual:PracticePixels,target:PracticePixels){
  if(actual.width!==target.width||actual.height!==target.height||actual.pixels.length!==target.pixels.length||actual.pixels.length!==actual.width*actual.height*4||!actual.pixels.length)throw Error('Practice image dimensions differ');
  const diff=new Uint8Array(actual.pixels.length);let squared=0,bad=0;
  for(let i=0;i<diff.length;i+=4){let error=0;for(let j=0;j<4;j++){const delta=Math.abs(actual.pixels[i+j]!-target.pixels[i+j]!);squared+=delta*delta;error=Math.max(error,delta);if(j<3)diff[i+j]=Math.min(255,delta*4);}diff[i+3]=255;if(error>12)bad++;}
  const score=Math.max(0,100*(1-Math.sqrt(squared/diff.length)/255)),mismatch=bad/(diff.length/4);
  return {score:Math.round(score*100)/100,mismatch,passed:score>=98&&mismatch<=0.02,diff:{width:actual.width,height:actual.height,pixels:diff}};
}
export interface PracticeProgress {source:string;language:ShaderLanguage;best:number;passed:boolean;reviewed?:boolean}
export type PracticeRecords=Record<string,PracticeProgress>;
export const PRACTICE_STORAGE='haiyue.shaderlab.practice.v1';
export function parsePracticeRecords(raw:string|null):PracticeRecords {
  const result:PracticeRecords={};try {const data=JSON.parse(raw??'{}');for(const c of PRACTICE_CHALLENGES){const v=data?.[c.id];if(v&&typeof v.source==='string'&&v.source.length<=100000&&['wgsl','glsl','hlsl'].includes(v.language)){result[c.id]={source:v.source,language:v.language,best:typeof v.best==='number'&&Number.isFinite(v.best)?Math.max(0,Math.min(100,v.best)):0,passed:v.passed===true,reviewed:v.reviewed===true};}}}catch{}return result;
}
