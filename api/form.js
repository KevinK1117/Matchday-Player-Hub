// Recent completed team matches used to CHECK, not prove, model-based football picks.
const cache=new Map();
async function form(team,date,key){
 const cacheKey=team+':'+date,previous=cache.get(cacheKey);
 if(previous&&previous.until>Date.now())return previous.data;
 const url='https://v3.football.api-sports.io/fixtures?team='+team+'&last=16';
 const r=await fetch(url,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error('Football API '+r.status);
 const body=await r.json();
 if(body.errors&&Object.keys(body.errors).length)throw Error('Football API error');
 const recent=(body.response||[]).filter(g=>{
  const status=g.fixture?.status?.short;
  return ['FT','AET','PEN'].includes(status)&&String(g.fixture?.date||'').slice(0,10)<date&&
   g.goals?.home!=null&&g.goals?.away!=null&&
   (Number(g.teams?.home?.id)===team||Number(g.teams?.away?.id)===team);
 }).sort((a,b)=>String(b.fixture?.date).localeCompare(String(a.fixture?.date))).slice(0,10);
 const matches=recent.map(g=>{
  const atHome=Number(g.teams.home.id)===team;
  const goals=Number(atHome?g.goals.home:g.goals.away),against=Number(atHome?g.goals.away:g.goals.home);
  return {date:String(g.fixture.date).slice(0,10),home:atHome,goals,against,win:goals>against,draw:goals===against};
 });
 const n=matches.length;
 const avg=key=>n?matches.reduce((sum,x)=>sum+x[key],0)/n:null;
 const venueAvg=(atHome,stat)=>{const set=matches.filter(x=>x.home===atHome);return set.length?set.reduce((sum,x)=>sum+x[stat],0)/set.length:null};
 const result={teamId:team,sample:n,goalsFor:avg('goals'),goalsAgainst:avg('against'),homeGoalsFor:venueAvg(true,'goals'),homeGoalsAgainst:venueAvg(true,'against'),awayGoalsFor:venueAvg(false,'goals'),awayGoalsAgainst:venueAvg(false,'against'),winRate:n?matches.filter(x=>x.win).length/n:null,drawRate:n?matches.filter(x=>x.draw).length/n:null,bttsRate:n?matches.filter(x=>x.goals>0&&x.against>0).length/n:null,over25Rate:n?matches.filter(x=>x.goals+x.against>2.5).length/n:null,lastMatch:matches[0]?.date||null,homeSample:matches.filter(x=>x.home).length,awaySample:matches.filter(x=>!x.home).length};
 cache.set(cacheKey,{data:result,until:Date.now()+25*60000});if(cache.size>100)cache.delete(cache.keys().next().value);
 return result;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=300');
 const date=String(req.query?.date||'');
 const ids=[...new Set(String(req.query?.teams||'').split(',').map(x=>Number(x)).filter(x=>Number.isSafeInteger(x)&&x>0))].slice(0,24);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!ids.length)return res.status(400).json({error:'Ungültige Mannschaften oder Datum'});
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,teams:[],notice:'API_SPORTS_KEY fehlt'});
 const results=await Promise.allSettled(ids.map(id=>form(id,date,key)));
 const teams=results.filter(x=>x.status==='fulfilled').map(x=>x.value);
 return res.status(200).json({configured:true,date,teams,requested:ids.length,failed:results.length-teams.length,notice:'Letzte bis zu zehn abgeschlossene Spiele pro Team; vereinfachte Tendenz, kein kalibriertes Prognosemodell.',updatedAt:new Date().toISOString()});
}
