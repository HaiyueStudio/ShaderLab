/** UTF-16 offsets match UITextView, EditText and shader diagnostics. */
export function codeLineStarts(source:string):number[]{const starts=[0];for(let i=0;i<source.length;i++)if(source.charCodeAt(i)===10)starts.push(i+1);return starts;}
export function codeLineAt(starts:readonly number[],offset:number):number{let low=0,high=starts.length;while(low+1<high){const mid=(low+high)>>>1;if(starts[mid]!<=offset)low=mid;else high=mid;}return low;}
export function codeIndent(source:string,start:number):number{let spaces=0;for(let i=start;i<source.length;i++){if(source[i]===' ')spaces++;else if(source[i]==='\t')spaces+=4-spaces%4;else break;}return spaces;}
