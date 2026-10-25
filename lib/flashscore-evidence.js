// Adapter ONLY for a separately licensed/authorized normalized sports-data feed.
// Does NOT access, scrape, or reverse-engineer Flashscore webpages or internal APIs.
// Configure FLASHSCORE_FEED_URL and FLASHSCORE_FEED_TOKEN on Vercel after confirming rights.
// Incoming identifiers MUST already be API-Sports fixture/player IDs; no fuzzy name matching.
const cache=new Map();
const validId=v=>Number.isSafeInteger(Number(v))&&Number(v)>0;
const number=(v,min,max)=>v!==null&&v!==undefined&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=min&&Number(v)<=max?Number(v):null;
const recent=(stamp,hours=48)=>{
 const ts=Date.parse(String(stamp||''));
 return Number.isFinite(ts)&&ts<=Date.now()+120000&&Date.now()-ts<=hours*3600000;
};
const absent=()=>({configured:false,available:false,source:null,fixtures:new Map(),players:new Map(),issue:null,updatedAt:null});
export async function getFlashscoreEvidence(date,sport='football'){
 const root=process.env.FLASHSCORE_FEED_URL,token=process.env.FLASHSCORE_FEED_TOKEN;
 if(!root||!token)return absent();
 const key=sport+':'+date,hit=cache.get(key);
 if(hit&&hit.until>Date.now())return hit.value;
 const out={...absent(),configured:true};
 try{
  const url=new URL(root);
  if(url.protocol!=='https:'||!['football','nhl'].includes(sport))throw Error('Ungültiger autorisierter Feed');
  url.searchParams.set('sport',sport);url.searchParams.set('date',date);
  const response=await fetch(url,{headers:{Authorization:'Bearer '+token,Accept:'application/json'},signal:AbortSignal.timeout(6500)});
  if(!response.ok)throw Error('Zusatzdaten HTTP '+response.status);
  const body=await response.json();
  if(body.sport!==sport||body.date!==date||!recent(body.generatedAt,48))throw Error('Zusatzdaten ohne gültigen Zeitstempel oder falschen Spieltag');
  const fixtureRows=Array.isArray(body.fixtures)?body.fixtures:[];
  for(const row of fixtureRows.slice(0,150)){
   if(!validId(row.fixtureId)||!recent(row.asOf||body.generatedAt,48))continue;
   const fixtureId=String(row.fixtureId),expectedHomeGoals=number(row.expectedHomeGoals,0,5),expectedAwayGoals=number(row.expectedAwayGoals,0,5);
   if(expectedHomeGoals===null||expectedAwayGoals===null)continue;
   out.fixtures.set(fixtureId,{expectedHomeGoals,expectedAwayGoals});
  }
  const playerRows=Array.isArray(body.players)?body.players:[];
  for(const row of playerRows.slice(0,350)){
   if(!validId(row.fixtureId)||!validId(row.playerId)||!recent(row.asOf||body.generatedAt,48))continue;
   const key=String(row.fixtureId)+':'+String(row.playerId);
   const status=['out','doubtful','fit','confirmed_starter','confirmed_bench'].includes(row.status)?row.status:null;
   out.players.set(key,{status,xG90:number(row.xG90,0,3),shotsOnTarget90:number(row.shotsOnTarget90,0,9),expectedMinutes:number(row.expectedMinutes,0,120)});
  }
  out.available=out.fixtures.size>0||out.players.size>0;
  out.source='Autorisierter Flashscore-Datenfeed (anbieterabhängig)';
  out.updatedAt=body.generatedAt;
  if(!out.available)out.issue='Keine passenden, aktuellen und eindeutig zugeordneten Daten verfügbar';
 }catch(e){out.issue=String(e.message||e).slice(0,140)}
 cache.set(key,{value:out,until:Date.now()+10*60000});
 if(cache.size>20)cache.delete(cache.keys().next().value);
 return out;
}
