// Position-based orientation only; a boxscore does not prove real combinations.
export function buildNhlLines(forwards=[],defense=[]){
 const used=new Set();
 const unique=rows=>rows.filter(p=>{const id=String(p.playerId||p.id||'');if(!id||used.has(id))return false;used.add(id);return true});
 const f=unique(forwards),d=unique(defense),pos=p=>String(p.position||p.positionCode||'').toUpperCase();
 const centers=f.filter(p=>pos(p)==='C'),wings=f.filter(p=>['L','R','LW','RW'].includes(pos(p)));
 const takeWing=side=>{const i=wings.findIndex(p=>[side,side+'W'].includes(pos(p)));return wings.splice(i<0?0:i,1)[0]||null};
 return Array.from({length:4},(_,i)=>({forwards:[takeWing('L'),centers[i]||null,takeWing('R')],defense:[d[i*2]||null,d[i*2+1]||null]}));
}
