import {SPORTMONKS_IDS,SPORTMONKS_LEAGUES} from './football-provider-routing.js';

// Sportmonks IDs are never interchangeable with API-Sports fixture/team/player IDs.
const BASE='https://api.sportmonks.com/v3/football';
const cache=new Map(),inflight=new Map();
export async function sportmonksRequest(path,params={},ttl=60000){
 const token=process.env.SPORTMONKS_API_TOKEN;
 if(!token)throw Error('SPORTMONKS_API_TOKEN fehlt');
 const url=new URL(BASE+path);
 for(const [key,value] of Object.entries(params))if(value!==undefined&&value!==null)url.searchParams.set(key,String(value));
 // Never cache URLs containing the secret token or log them.
 const key=path+'?'+url.searchParams.toString();
 const hit=cache.get(key);if(hit&&hit.until>Date.now())return hit.value;
 if(inflight.has(key))return inflight.get(key);
 const job=(async()=>{
  url.searchParams.set('api_token',token);
  const response=await fetch(url,{signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Sportmonks HTTP '+response.status);
  const body=await response.json();
  if(body.error||body.errors)throw Error('Sportmonks meldet einen Datenfehler');
  cache.set(key,{value:body,until:Date.now()+ttl});
  if(cache.size>250)cache.delete(cache.keys().next().value);
  return body;
 })();
 inflight.set(key,job);
 try{return await job}finally{inflight.delete(key)}
}
export async function sportmonksPages(path,params={},maxPages=8,ttl=60000){
 const rows=[];let partial=false;
 for(let page=1;page<=maxPages;page++){
  const body=await sportmonksRequest(path,{...params,page,per_page:50},ttl);
  rows.push(...(Array.isArray(body.data)?body.data:body.data?[body.data]:[]));
  partial=!!body.pagination?.has_more;
  if(!partial)break;
 }
 return {rows,partial};
}
export async function sportmonksFixtures(date){
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))throw Error('Ungültiges Datum');
 const {rows,partial}=await sportmonksPages('/fixtures/date/'+date,{include:'participants;state;league;scores'},10,45000);
 const fixtures=rows.filter(f=>SPORTMONKS_IDS.includes(Number(f.league_id)));
 return {fixtures,partial,provider:'Sportmonks',leagueIds:SPORTMONKS_IDS};
}
export function sportmonksFixtureSummary(f){
 const home=f.participants?.find(p=>p.meta?.location==='home');
 const away=f.participants?.find(p=>p.meta?.location==='away');
 const goals=id=>f.scores?.find(s=>Number(s.participant_id)===Number(id)&&s.description==='CURRENT')?.score?.goals??null;
 return {id:f.id,leagueId:f.league_id,league:SPORTMONKS_LEAGUES[f.league_id]?.name||f.league?.name||null,
  home:home?.name||null,away:away?.name||null,homeId:home?.id||null,awayId:away?.id||null,
  start:f.starting_at||null,status:f.state?.developer_name||null,
  homeGoals:home?goals(home.id):null,awayGoals:away?goals(away.id):null,provider:'Sportmonks'};
}
