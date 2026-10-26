export function sourceMatches(source:string,query:string,caseSensitive=false){
  if(!query)return[];
  const expression=new RegExp(query.replace(/[.*+?^${}()|[\]\\]/g,'\\$&'),caseSensitive?'g':'gi');
  return[...source.matchAll(expression)].map(match=>({start:match.index!,end:match.index!+match[0].length}));
}
export function replaceSourceMatches(source:string,query:string,replacement:string,caseSensitive=false){
  const matches=sourceMatches(source,query,caseSensitive);let result='',at=0;for(const match of matches){result+=source.slice(at,match.start)+replacement;at=match.end;}return{source:result+source.slice(at),count:matches.length};
}
