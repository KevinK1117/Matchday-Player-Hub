import {fetchJson,value,fetchBerlinSchedule} from './nhl.js';
const ended=g=>['FINAL','OFF'].includes(g.gameState);
export function normalizeGame(g){const team=t=>({id:t?.id,name:value(t?.placeName)&&value(t?.commonName)?value(t.placeName)+' '+value(t.commonName):value(t?.name)||t?.abbrev||'Team',logo:t?.abbrev?`https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg`:null,abbrev:t?.abbrev});return {fixture:{id:g.id,date:g.startTimeUTC,status:{short:ended(g)?'FT':['LIVE','CRIT'].includes(g.gameState)?'LIVE':['FUT','PRE'].includes(g.gameState)?'NS':g.gameState,elapsed:null},venue:{name:value(g.venue)}},league:{id:10000,name:'NHL',country:'USA / Kanada',season:Number(String(g.season||'').slice(0,4))||new Date(g.startTimeUTC).getUTCFullYear()},teams:{home:team(g.homeTeam),away:team(g.awayTeam)},goals:{home:g.homeTeam?.score??null,away:g.awayTeam?.score??null},sport:'nhl'};}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=60, stale-while-revalidate=60');const q=req.query||{},a=q.action||'fixtures';
 if(!['fixtures','detail','table','player','squad','scorers'].includes(a))return res.status(400).json({error:'Unbekannte NHL-Abfrage'});
 if(a==='fixtures'&&!/^\d{4}-\d{2}-\d{2}$/.test(String(q.date||'')))return res.status(400).json({error:'Ungültiges Datum'});
 if(['detail','player'].includes(a)&&!/^\d{1,12}$/.test(String(q.id||'')))return res.status(400).json({error:'Ungültige ID'});
 if(a==='squad'&&!/^[A-Z]{3}$/.test(String(q.team||'')))return res.status(400).json({error:'Ungültiges NHL-Team'});
 try{let data;
 if(a==='fixtures'){data=(await fetchBerlinSchedule(String(q.date))).games.map(normalizeGame)}
 if(a==='table'){const rows=await fetchJson('/standings/now');data=rows.standings||[]}
 if(a==='squad'){const rows=await fetchJson('/club-stats/'+q.team+'/now');data=(rows.skaters||[]).map(p=>({...p,name:value(p.firstName)+' '+value(p.lastName)}))}
 if(a==='scorers'){const rows=await fetchJson('/skater-stats-leaders/current?categories=goals&limit=30');data=(rows.goals||[]).map(p=>({player:{id:p.id,photo:p.headshot||null,name:value(p.firstName)+' '+value(p.lastName)},statistics:[{team:{name:p.teamAbbrev},goals:{total:p.value}}]}))}
 if(a==='player')data=await fetchJson('/player/'+q.id+'/landing');
 if(a==='detail'){
 const box=await fetchJson('/gamecenter/'+q.id+'/boxscore'),g=normalizeGame(box),season=String(box.season||'');
 const recent=async team=>{try{const s=await fetchJson('/club-schedule-season/'+team+'/'+season);return {data:(s.games||[]).filter(ended).sort((a,b)=>Date.parse(b.startTimeUTC)-Date.parse(a.startTimeUTC)).map(normalizeGame),error:null}}catch{return {data:[],error:'NHL-Spielhistorie nicht verfügbar'}}};
 const [home,away,standings]=await Promise.all([recent(box.homeTeam.abbrev),recent(box.awayTeam.abbrev),fetchJson('/standings/now').catch(()=>({standings:[]}))]);
 let stats=[],events=[];try{const landing=await fetchJson('/gamecenter/'+q.id+'/landing');stats=landing.summary?.teamGameStats||[];events=landing.summary?.scoring||[]}catch{}
 data={fixture:g,box,standings:standings.standings||[],nhlStats:stats,nhlEvents:events,homeRecent:{...home,data:home.data.slice(0,10)},awayRecent:{...away,data:away.data.slice(0,10)},h2h:{data:home.data.filter(x=>x.teams.home.abbrev===g.teams.away.abbrev||x.teams.away.abbrev===g.teams.away.abbrev).slice(0,10)},stats:{data:[]},table:{data:[]},events:{data:[]},lineups:{data:[]}};
 }
 return res.status(200).json({configured:true,data,source:'NHL',updatedAt:new Date().toISOString()});
 }catch{return res.status(502).json({error:'NHL-Daten derzeit nicht verfügbar. Bitte später erneut versuchen.'})}
}
