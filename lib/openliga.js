// Community match results, OpenLigaDB (ODbL): https://www.openligadb.de/lizenz
const cache=new Map();
export async function getMatches(date,history=false){
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))throw Error('Ungültiges Datum');
 const season=Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);
 const results=await Promise.allSettled(['bl1','bl2','bl3'].map(async league=>{
  const key=league+season;let hit=cache.get(key);
  if(!hit||hit.until<Date.now()){
   const response=await fetch(`https://api.openligadb.de/getmatchdata/${league}/${season}`,{signal:AbortSignal.timeout(8000)});
   if(!response.ok)throw Error('OpenLigaDB HTTP '+response.status);
   const rows=await response.json();if(!Array.isArray(rows))throw Error('Ungültige Antwort');
   hit={rows,until:Date.now()+300000};cache.set(key,hit);if(cache.size>12)cache.delete(cache.keys().next().value);
  }
  return hit.rows.filter(m=>m.matchDateTimeUTC&&(history||new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(m.matchDateTimeUTC))===date)).map(m=>{
   const final=m.matchIsFinished?(m.matchResults||[]).find(r=>r.resultTypeID===2):null;
   return {id:m.matchID,home:m.team1?.teamName,away:m.team2?.teamName,date:m.matchDateTimeUTC,league:m.leagueName,finished:!!m.matchIsFinished,homeGoals:final?.pointsTeam1??null,awayGoals:final?.pointsTeam2??null};
  });
 }));
 if(results.every(r=>r.status==='rejected'))throw Error('OpenLigaDB derzeit nicht erreichbar');
 return {games:results.flatMap(r=>r.status==='fulfilled'?r.value:[]),partial:results.some(r=>r.status==='rejected')};
}
export default async function handler(req,res){
 const date=String(req.query?.date||'');
 if(!/^20\d{2}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z')))return res.status(400).json({error:'Ungültiges Datum'});
 res.setHeader('Cache-Control','s-maxage=300, stale-while-revalidate=60');
 try{return res.status(200).json({...await getMatches(date),source:'OpenLigaDB',license:'ODbL',updatedAt:new Date().toISOString()})}catch{return res.status(502).json({error:'OpenLigaDB derzeit nicht erreichbar',games:[]})}
}
