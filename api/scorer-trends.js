// Additional football scorer evidence: real recent fixture-by-fixture player statistics.
// Only queried when a user requests the scorer analysis; strict limits protect API quota.
const ROOT='https://v3.football.api-sports.io';
const cache=new Map();
async function api(path,key){
 const v=cache.get(path);if(v&&v.until>Date.now())return v.rows;
 const r=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(9000)});
 if(!r.ok)throw Error('API Sports HTTP '+r.status);
 const body=await r.json();
 if(body.errors&&(Array.isArray(body.errors)?body.errors.length:Object.keys(body.errors).length))throw Error('API Sports Zusatzstatistiken eingeschränkt');
 const rows=body.response||[];
 cache.set(path,{rows,until:Date.now()+60*60000});if(cache.size>120)cache.delete(cache.keys().next().value);
 return rows;
}
function parsePairs(raw){
 const parts=String(raw||'').split(',').slice(0,40);
 const seen=new Set(),out=[];
 for(const part of parts){
  const match=/^(\d{1,10}):(\d{1,10}):(\d{1,10}):(20\d{2})$/.exec(part);
  if(!match)continue;
  const [id,team,league,season]=match.slice(1).map(Number),key=id+':'+team;
  if(!seen.has(key)&&id>0&&team>0&&league>0){seen.add(key);out.push({id,team,league,season})}
 }
 return out;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=3600, stale-while-revalidate=3600');
 const date=String(req.query?.date||''),players=parsePairs(req.query?.players);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!players.length)return res.status(400).json({error:'Datum oder Spieler fehlen'});
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,players:[],notice:'API-Sports-Key fehlt'});
 const teams=new Map();
 for(const p of players){
  const k=p.team+':'+p.league+':'+p.season;
  if(!teams.has(k)&&teams.size<1)teams.set(k,{...p,players:[]});
  if(teams.has(k))teams.get(k).players.push(p);
 }
 const values=[...teams.values()],results=[];
 // A single team history serves up to 40 players in the same request.
 for(const t of values){
  try{
   const games=(await api('/fixtures?team='+t.team+'&last=16',key))
    .filter(g=>['FT','AET','PEN'].includes(g.fixture?.status?.short)&&String(g.fixture?.date||'').slice(0,10)<date)
    .sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).slice(0,10);
   const stats=new Array(games.length);let next=0;await Promise.all(Array.from({length:2},async()=>{while(next<games.length){const i=next++;try{stats[i]={status:'fulfilled',value:await api('/fixtures/players?fixture='+games[i].fixture.id+'&team='+t.team,key)}}catch{stats[i]={status:'rejected'}}}}));
   const byPlayer=new Map(t.players.map(p=>[p.id,{playerId:p.id,teamId:p.team,fixtureCount:0,minutes:0,goals:0,shotsOnTarget:0,shotDataCount:0,recentAppearances:[],complete:stats.every(x=>x.status==='fulfilled')}]));
   for(const [index,item] of stats.entries()){
    if(item.status!=='fulfilled')continue;
    const rows=item.value||[];
    for(const side of rows)for(const entry of side.players||[]){
     const r=byPlayer.get(Number(entry.player?.id));if(!r)continue;
     const st=entry.statistics?.[0]||{},minutes=Number(st.games?.minutes)||0;
     if(minutes<=0)continue;
     if(st.goals?.total==null){r.complete=false;continue;}
     r.recentAppearances.push({fixtureId:games[index].fixture.id,date:games[index].fixture.date,goals:Number(st.goals.total),minutes});r.fixtureCount++;r.minutes+=minutes;
     r.goals+=Number(st.goals?.total)||0;
     if(st.shots?.on!=null){r.shotsOnTarget+=Number(st.shots.on)||0;r.shotDataCount++}
    }
   }
   results.push(...byPlayer.values().filter(x=>x.fixtureCount>=2));
  }catch{}
 }
 return res.status(200).json({configured:true,players:results,coveredTeams:values.length,source:'API-Sports: Einzelstatistiken abgeschlossener Spiele',updatedAt:new Date().toISOString(),notice:'Bis zu zehn vergangene Teamspiele je Abruf. Nur belegte Einsätze; bei fehlenden Einzelstatistiken keine Formauswahl.'});
}
