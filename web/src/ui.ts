import { defineSelectComponents, defineSplitComponents, defineCheckboxComponents, defineDropdownComponents, defineNotificationComponents, type HYSplit } from '@haiyue/ui';
import { shaderReference } from '../../shared/dist/views/shader-reference.js';

/** Use the installed UI package's public components and theme tokens. */
export function initializeUI(): () => void {
  defineSelectComponents(); defineSplitComponents(); defineCheckboxComponents(); defineDropdownComponents();
  defineNotificationComponents();
  const reference=document.getElementById('builtin-variables')!,referenceButton=document.getElementById('builtin-variables-button')!,list=reference.querySelector('dl')!;
  for(const [name,description] of shaderReference){const term=document.createElement('dt'),detail=document.createElement('dd');term.textContent=name;detail.textContent=description;list.append(term,detail);}
  const placeReference=(event:Event)=>{if((event as ToggleEvent).newState!=='open')return;const rect=referenceButton.getBoundingClientRect(),width=Math.min(500,innerWidth-24),top=Math.max(12,Math.min(rect.bottom+8,innerHeight-160));reference.style.width=width+'px';reference.style.left=Math.max(12,Math.min(rect.right-width,innerWidth-width-12))+'px';reference.style.top=top+'px';reference.style.maxHeight=(innerHeight-top-12)+'px';};
  reference.addEventListener('beforetoggle',placeReference);
  const menu = document.getElementById('add-pass-menu')!, trigger = document.getElementById('add-pass')!;
  const syncExpanded = () => trigger.setAttribute('aria-expanded', String(menu.hasAttribute('open')));
  const menuObserver = new MutationObserver(syncExpanded); menuObserver.observe(menu, { attributes: true, attributeFilter: ['open'] }); syncExpanded();
  const key = 'haiyue.shader-editor.layout.v1';
  const ratios: Record<string, number> = {};
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(key) ?? '{}');
    if (saved && typeof saved === 'object' && !Array.isArray(saved)) {
      for (const [name, ratio] of Object.entries(saved)) {
        if (typeof ratio === 'number' && Number.isFinite(ratio) && ratio >= 0 && ratio <= 1) ratios[name] = ratio;
      }
    }
  } catch { /* Layout preferences are optional when storage is unavailable. */ }
  const outer = document.getElementById('workspace-split') as HYSplit;
  const splits = [...document.querySelectorAll<HYSplit>('hy-split')];
  const mobile = matchMedia('(max-width: 800px)');
  const layoutKey = (split: HYSplit) => `${split.id}.${split.direction}`;
  const updateDirection = () => {
    outer.direction = mobile.matches ? 'vertical' : 'horizontal';
    outer.minFirst = mobile.matches ? 460 : 340;
    outer.minSecond = mobile.matches ? 420 : 360;
    outer.ratio = ratios[layoutKey(outer)] ?? (mobile.matches ? 0.5 : 0.49);
  };
  updateDirection(); mobile.addEventListener('change', updateDirection);
  const remember = (event: Event) => {
    if (event.target !== event.currentTarget) return;
    const split = event.target as HYSplit;
    ratios[layoutKey(split)] = split.ratio;
    try { localStorage.setItem(key, JSON.stringify(ratios)); } catch { /* Keep the current layout in memory. */ }
  };
  for (const split of splits) {
    split.ratio = ratios[layoutKey(split)] ?? split.ratio;
    split.addEventListener('ratio-change', remember);
  }
  return () => {
    reference.removeEventListener('beforetoggle',placeReference);
    menuObserver.disconnect();
    mobile.removeEventListener('change', updateDirection);
    for (const split of splits) split.removeEventListener('ratio-change', remember);
  };
}
