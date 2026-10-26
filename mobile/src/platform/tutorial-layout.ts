/** Native logical points; keep text readable on a landscape tablet. */
export function tutorialLayout(width:number,reader=false){
 const contentWidth=Math.min(reader?860:1120,Math.max(0,width));
 return{contentWidth,padding:width<600?18:28,gap:width<600?10:12,stageColumns:contentWidth<340?1:contentWidth<700?2:contentWidth<1000?3:4,compact:width<600};
}
