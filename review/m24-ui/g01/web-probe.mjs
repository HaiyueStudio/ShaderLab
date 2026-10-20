import {defineSelectComponents} from '@haiyue/ui/select';
import {HYSelectionController} from './vendor/contract/selection.mjs';
defineSelectComponents();
const options=[1,.75,.5,.25].map(v=>({value:String(v),label:`${v*100}%`}));
let value='1',commits=0;const events=[];
const select=document.createElement('hy-select');select.id='controlled-select';
const controller=new HYSelectionController('scale',{value,options},event=>{
  events.push(event);
  if(event.type==='commit'){value=event.value;commits++;controller.update({value,options});}
});
controller.attach({apply:props=>{select.options=props.options;select.value=props.value;select.disabled=props.disabled;},
  listen:callback=>{const listener=e=>callback(e.detail.value,'pointer');select.addEventListener('value-change',listener);return()=>select.removeEventListener('value-change',listener);}});
document.body.append(select);
const assert=(condition,message)=>{if(!condition)throw Error(message);};
window.probeResult=(async()=>{
  assert(select.options.length===4,'options survive connection');
  const input=select.shadowRoot.querySelector('select');
  for(const next of ['0.75','0.5','0.25','1','0.75']){input.value=next;input.dispatchEvent(new Event('change',{bubbles:true}));assert(value===next&&select.value===next,'controlled roundtrip');}
  assert(commits===5,'one commit per user selection');
  controller.update({value:'0.5',options});assert(commits===5,'programmatic value never commits');
  assert(await controller.pick(async()=>null)===false,'cancel ignored');
  let answer;const pending=controller.pick(()=>new Promise(r=>answer=r));controller.dispose();answer('1');
  assert(await pending===false,'stale result ignored');
  input.value='1';input.dispatchEvent(new Event('change',{bubbles:true}));assert(commits===5,'detached listener');
  return {status:'passed',commits,events,checks:['options before connection','controlled roundtrip','silent programmatic update','cancel','dispose and late result']};
})();
