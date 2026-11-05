import {readFileSync,writeFileSync} from 'node:fs';
import assert from 'node:assert/strict';
const read=relative=>JSON.parse(readFileSync(new URL(relative,import.meta.url)));
const current=read('./formal/report.json'), identity=read('./identity.json');
assert.equal(current.runs.length,8);
assert.equal(current.artifactSha256,identity.artifactSha256);
for(const r of current.runs){
 assert.equal(r.status,'passed');assert.equal(r.engineCandidate.sha256,identity.sha256);
 assert.equal(r.instrumented,false);assert.equal(r.foregroundContinuous,true);assert.equal(r.readback.nonzero,true);
 assert.equal(r.samples.length,100);assert.equal(r.idleFrameCpu.length,120);
 assert.deepEqual(r.shaderSurface,{width:512,height:288});
 assert.equal(r.samples.every(s=>s.frames.length===3),true);
}
const records=[['统一样式（10-20）','../style-unification/iphone-comparison/report.json'],['预览优化后（10-20）','../preview-cpu-20261020/formal/report.json'],['完整 Engine 0.2.3（11-02）','./formal/report.json']];
const keys={handler:'命令处理',engineFrameCpu:'操作期间引擎帧 CPU',handlerPlusSettlingFramesCpu:'命令 + 稳定前全部帧 CPU',idleFrameCpu:'持续预览引擎帧 CPU',settled:'操作至预览稳定',cadence:'持续预览帧间隔'};
const history=records.map(([name,file])=>({name,file,summary:read(file).summary}));
const metrics=Object.fromEntries(Object.entries(keys).map(([k,label])=>[k,{label,history:history.map(h=>({name:h.name,native:h.summary[k].medians.shared,gui:h.summary[k].medians.optimized})),current:current.summary[k]}]));
const cadence=Object.fromEntries(['shared','optimized'].map(arm=>{const values=current.runs.filter(r=>r.arm===arm).flatMap(r=>r.intervals);return[arm,{frames:values.length,over33_333ms:values.filter(v=>v>1000/30).length,max:Math.max(...values)}]}));
writeFileSync(new URL('./summary.json',import.meta.url),JSON.stringify({status:'measured',stabilityThreshold:1.10,metrics,cadence},null,2)+'\n');
const lines=['| 指标（ms） | 10-20 统一样式 Native | GUI | 10-20 预览优化 Native | GUI | 11-02 Native | GUI |','| --- | ---: | ---: | ---: | ---: | ---: | ---: |'];
for(const m of Object.values(metrics))lines.push('| '+m.label+' | '+m.history.flatMap(h=>[h.native.toFixed(3),h.gui.toFixed(3)]).join(' | ')+' |');
lines.push('','| 本轮指标 | Native 范围（ms） | 轮间波动 | GUI 范围（ms） | 轮间波动 |','| --- | ---: | ---: | ---: | ---: |');
for(const k of ['handlerPlusSettlingFramesCpu','idleFrameCpu','settled','cadence']){const m=current.summary[k];const range=arm=>[Math.min(...m.values[arm]),Math.max(...m.values[arm])].map(v=>v.toFixed(3)).join('–');const spread=arm=>((m.spreads[arm]-1)*100).toFixed(1)+'%（'+(m.spreads[arm]<=1.10?'通过':'未通过')+'）';lines.push(`| ${keys[k]} | ${range('shared')} | ${spread('shared')} | ${range('optimized')} | ${spread('optimized')} |`);}
writeFileSync(new URL('./tables.md',import.meta.url),lines.join('\n')+'\n');
console.log(lines.join('\n'));console.log(cadence);
