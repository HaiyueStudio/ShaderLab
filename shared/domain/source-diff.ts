export interface DiffLine {kind:'same'|'added'|'removed';text:string;before?:number;after?:number}
/** Bound quadratic work for large shader files; preserve full source in either
 * pane even when a very large changed block falls back to a coarse diff. */
export function sourceDiff(before:string,after:string){
  const a=before.split('\n'),b=after.split('\n'),lines:DiffLine[]=[];let first=0,lastA=a.length,lastB=b.length;
  while(first<lastA&&first<lastB&&a[first]===b[first]){lines.push({kind:'same',text:a[first]!,before:first+1,after:first+1});first++;}
  while(lastA>first&&lastB>first&&a[lastA-1]===b[lastB-1]){lastA--;lastB--;}
  const n=lastA-first,m=lastB-first;
  if(n*m<=250_000){
    const rows=Array.from({length:n+1},()=>new Uint32Array(m+1));
    for(let i=n-1;i>=0;i--)for(let j=m-1;j>=0;j--)rows[i]![j]=a[first+i]===b[first+j]?rows[i+1]![j+1]!+1:Math.max(rows[i+1]![j]!,rows[i]![j+1]!);
    let i=0,j=0;while(i<n||j<m){if(i<n&&j<m&&a[first+i]===b[first+j]){lines.push({kind:'same',text:a[first+i]!,before:first+i+1,after:first+j+1});i++;j++;}else if(j<m&&(i===n||rows[i]![j+1]!>=rows[i+1]![j]!)){lines.push({kind:'added',text:b[first+j]!,after:first+j+1});j++;}else{lines.push({kind:'removed',text:a[first+i]!,before:first+i+1});i++;}}
  }else{for(let i=first;i<lastA;i++)lines.push({kind:'removed',text:a[i]!,before:i+1});for(let j=first;j<lastB;j++)lines.push({kind:'added',text:b[j]!,after:j+1});}
  for(let i=lastA,j=lastB;i<a.length;i++,j++)lines.push({kind:'same',text:a[i]!,before:i+1,after:j+1});
  return {lines,added:lines.filter(l=>l.kind==='added').length,removed:lines.filter(l=>l.kind==='removed').length};
}
