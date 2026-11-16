export function hasNhlLineup(side){
 return side?.forwards?.length>=9&&side?.defense?.length>=4&&side?.goalies?.length>=1;
}

// Position-based orientation only; a boxscore does not prove real combinations.
export function buildNhlLines(forwards=[],defense=[],roster=[]){
 const used=new Set();
 const unique=rows=>rows.filter(p=>{const id=String(p.playerId||p.id||'');if(!id||used.has(id))return false;used.add(id);return true});
 const f=unique(forwards),d=unique(defense),pos=p=>String(p.position||p.positionCode||'').toUpperCase();
 const centers=f.filter(p=>pos(p)==='C'),wings=f.filter(p=>['L','R','LW','RW'].includes(pos(p)));
 const takeWing=side=>{const i=wings.findIndex(p=>[side,side+'W'].includes(pos(p)));return wings.splice(i<0?0:i,1)[0]||null};
 const lines=Array.from({length:4},(_,i)=>({forwards:[takeWing('L'),centers[i]||null,takeWing('R')],defense:[d[i*2]||null,d[i*2+1]||null]}));
 const assigned=new Set(lines.flatMap(l=>[...l.forwards,...l.defense]).filter(Boolean).map(p=>String(p.playerId||p.id)));
 const reserves=[...new Map(roster.filter(p=>(p.playerId||p.id)&&!assigned.has(String(p.playerId||p.id))&&pos(p)!=='G').map(p=>[String(p.playerId||p.id),p])).values()];
 for(const line of lines)for(const [key,roles] of [['forwards',['L','C','R']],['defense',['D','D']]])for(let i=0;i<line[key].length;i++){if(line[key][i])continue;let at=reserves.findIndex(p=>pos(p)===roles[i]||roles[i]!=='C'&&roles[i]!=='D'&&['L','R','LW','RW'].includes(pos(p)));if(at<0)at=reserves.findIndex(p=>roles[i]==='D'?pos(p)==='D':['L','R','LW','RW','C','F'].includes(pos(p)));if(at<0)at=0;if(!reserves.length)continue;const p=reserves.splice(at,1)[0],id=String(p.playerId||p.id);if(!id)continue;assigned.add(id);line[key][i]={...p,rosterSupplement:true};}
 return lines;
}

export function buildDelLines(published=[],roster=[]){
 const lines=Array.from({length:4},()=>({forwards:[],defense:[]}));
 const unique=rows=>[...new Map(rows.filter(p=>p.id).map(p=>[p.id,p])).values()];
 const selected=unique(published);
 const known=new Set(selected.map(p=>p.id));
 const reserves=unique(roster).filter(p=>!known.has(p.id));
 const roles=[['forwards',['L','R','LW','RW','F','C'],3],['defense',['D'],2]];
 for(const [key,positions,capacity] of roles){
  const current=selected.filter(p=>positions.includes(p.position));
  const pending=[];
  for(const player of current){
   const group=lines[player.line-1]?.[key];
   if(group&&group.length<capacity)group.push(player);
   else pending.push(player);
  }
  const extras=reserves.filter(p=>positions.includes(p.position));
  for(const line of lines)while(line[key].length<capacity){
   const player=pending.shift();
   if(player){line[key].push(player);continue;}
   const extra=extras.shift();
   if(!extra)break;
   line[key].push({...extra,rosterSupplement:selected.length>0});
  }
 }
 const goalies=selected.filter(p=>p.position==='G');
 const reserveGoalie=reserves.find(p=>p.position==='G');
 const goalie=goalies.find(p=>p.starter)||goalies[0]||(reserveGoalie?{...reserveGoalie,rosterSupplement:selected.length>0}:null);
 return {lines,goalie,unknown:[...selected,...reserves].filter(p=>!p.position)};
}
