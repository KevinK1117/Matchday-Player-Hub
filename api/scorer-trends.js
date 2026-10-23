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
 const parts=String(raw||'').split(',').slice(0,8);
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
  if(!teams.has(k)&&teams.size<4)teams.set(k,{...p,players:[]});
  if(teams.has(k))teams.get(k).players.push(p);
 }
 const values=[...teams.values()],results=[];
 // Four teams × (one fixture list + up to three player box scores) maximum.
 for(const t of values){
  try{
   const games=(await api('/fixtures?team='+t.team+'&league='+t.league+'&season='+t.season+'&last=8',key))
    .filter(g=>['FT','AET','PEN'].includes(g.fixture?.status?.short)&&String(g.fixture?.date||'').slice(0,10)<date)
    .sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).slice(0,3);
   const stats=await Promise.allSettled(games.map(g=>api('/fixtures/players?fixture='+g.fixture.id+'&team='+t.team,key)));
   const byPlayer=new Map(t.players.map(p=>[p.id,{playerId:p.id,teamId:p.team,fixtureCount:0,minutes:0,goals:0,shotsOnTarget:0,shotDataCount:0}]));
   for(const item of stats){
    if(item.status!=='fulfilled')continue;
    const rows=item.value||[];
    for(const side of rows)for(const entry of side.players||[]){
     const r=byPlayer.get(Number(entry.player?.id));if(!r)continue;
     const st=entry.statistics?.[0]||{},minutes=Number(st.games?.minutes)||0;
     if(minutes<=0)continue;
     r.fixtureCount++;r.minutes+=minutes;
     r.goals+=Number(st.goals?.total)||0;
     if(st.shots?.on!=null){r.shotsOnTarget+=Number(st.shots.on)||0;r.shotDataCount++}
    }
   }
   results.push(...byPlayer.values().filter(x=>x.fixtureCount>=2));
  }catch{}
 }
 return res.status(200).json({configured:true,players:results,coveredTeams:values.length,source:'API-Sports: Einzelstatistiken abgeschlossener Spiele',updatedAt:new Date().toISOString(),notice:'Bis zu drei vergangene Spiele pro ausgewähltem Team. Begrenzte Abdeckung; keine Ausfall- oder Trefferprognose.'});
}
