import {fetchJson,value,fetchBerlinSchedule} from './nhl.js';
const ended=g=>['FINAL','OFF'].includes(g.gameState);
export function normalizeGame(g){const team=t=>({id:t?.id,name:value(t?.placeName)&&value(t?.commonName)?value(t.placeName)+' '+value(t.commonName):value(t?.name)||t?.abbrev||'Team',logo:t?.abbrev?`https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg`:null,abbrev:t?.abbrev});return {fixture:{id:g.id,date:g.startTimeUTC,status:{short:ended(g)?'FT':['LIVE','CRIT'].includes(g.gameState)?'LIVE':['FUT','PRE'].includes(g.gameState)?'NS':g.gameState,elapsed:null},venue:{name:value(g.venue)}},league:{id:10000,name:'NHL',country:'USA / Kanada',season:Number(String(g.season||'').slice(0,4))||new Date(g.startTimeUTC).getUTCFullYear()},teams:{home:team(g.homeTeam),away:team(g.awayTeam)},goals:{home:g.homeTeam?.score??null,away:g.awayTeam?.score??null},sport:'nhl'};}
export default async function handler(req,res){
 res.setHeader('Cache-Control',String(req.query?.action||'')==='lineups'?'no-store, max-age=0':'s-maxage=60, stale-while-revalidate=60');const q=req.query||{},a=q.action||'fixtures';
 if(!['fixtures','detail','table','player','squad','scorers','lineups','del'].includes(a))return res.status(400).json({error:'Unbekannte NHL-Abfrage'});
 if(['fixtures','del'].includes(a)&&!/^\d{4}-\d{2}-\d{2}$/.test(String(q.date||'')))return res.status(400).json({error:'Ungültiges Datum'});
 if(['detail','lineups','player'].includes(a)&&!/^\d{1,12}$/.test(String(q.id||'')))return res.status(400).json({error:'Ungültige ID'});
 if(a==='squad'&&!/^[A-Z]{3}$/.test(String(q.team||'')))return res.status(400).json({error:'Ungültiges NHL-Team'});
 try{let data;
 if(a==='del'){
  const key=process.env.API_HOCKEY_KEY||process.env.API_SPORTS_KEY;
  if(!key)return res.status(200).json({configured:false,games:[],notice:'API-Hockey-Zugang fehlt'});
  const root='https://v1.hockey.api-sports.io';
  const call=async path=>{const response=await fetch(root+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Hockey HTTP '+response.status);const body=await response.json();if(body.errors&&Object.keys(body.errors).length)throw Error('Hockey API nicht freigeschaltet');return body.response||[]};
  const leagues=await call('/leagues?search=DEL');
  const league=leagues.find(l=>/^DEL$/i.test(String(l.name||'')));
  if(!league)return res.status(200).json({configured:true,games:[],notice:'DEL-Liga nicht gefunden'});
  const games=await call('/games?date='+q.date+'&league='+league.id);
  return res.status(200).json({configured:true,games:games.map(g=>({id:g.id,date:g.date,home:g.teams?.home?.name||'Heimteam',away:g.teams?.away?.name||'Gastteam',homeGoals:g.scores?.home??null,awayGoals:g.scores?.away??null,status:g.status?.short||'NS'})),source:'API-Hockey'});
 }
 if(a==='fixtures'){data=(await fetchBerlinSchedule(String(q.date))).games.map(normalizeGame)}
 if(a==='table'){const rows=await fetchJson('/standings/now');data=rows.standings||[]}
 if(a==='squad'){
  // Official NHL roster includes forwards, defenders AND goalies.
  const [roster,stats]=await Promise.allSettled([fetchJson('/roster/'+q.team+'/current'),fetchJson('/club-stats/'+q.team+'/now')]);
  const people=new Map();
  if(roster.status==='fulfilled'){
   for(const p of [...(roster.value.forwards||[]),...(roster.value.defensemen||[]),...(roster.value.goalies||[])]){
    const playerId=p.id||p.playerId;if(!playerId)continue;
    const name=[value(p.firstName),value(p.lastName)].filter(Boolean).join(' ').trim();
    people.set(playerId,{playerId,name,firstName:p.firstName,lastName:p.lastName,headshot:p.headshot||null,positionCode:p.positionCode||null,jerseyNumber:p.sweaterNumber??null,goals:null,shots:null});
   }
  }
  if(stats.status==='fulfilled'){
   for(const p of [...(stats.value.skaters||[]),...(stats.value.goalies||[])]){
    const id=p.playerId||p.id;if(!id)continue;
    const existing=people.get(id)||{};
    people.set(id,{...existing,...p,playerId:id,name:existing.name||[value(p.firstName),value(p.lastName)].filter(Boolean).join(' ').trim(),headshot:existing.headshot||p.headshot||null});
   }
  }
  if(roster.status==='rejected'&&stats.status==='rejected')throw Error('NHL-Spielerkader nicht verfügbar');
  data=[...people.values()].sort((a,b)=>String(a.name||'').localeCompare(String(b.name||''),'de'));
 }
 if(a==='scorers'){const rows=await fetchJson('/skater-stats-leaders/current?categories=goals&limit=30');data=(rows.goals||[]).map(p=>({player:{id:p.id,photo:p.headshot||null,name:value(p.firstName)+' '+value(p.lastName)},statistics:[{team:{name:p.teamAbbrev},goals:{total:p.value}}]}))}
 if(a==='player')data=await fetchJson('/player/'+q.id+'/landing');
 if(a==='lineups'){
  const box=await fetchJson('/gamecenter/'+q.id+'/boxscore');
  const stats=box.playerByGameStats||{};
  const count=side=>['forwards','defense','goalies'].reduce((sum,k)=>sum+(Array.isArray(side?.[k])?side[k].length:0),0);
  const ready=['LIVE','CRIT','FINAL','OFF'].includes(box.gameState)&&count(stats.homeTeam)>=16&&count(stats.awayTeam)>=16;
  data={fixtureId:box.id,gameState:box.gameState,officialDressedRoster:ready,
    playerByGameStats:ready?stats:null,
    checkedAt:new Date().toISOString(),
    notice:ready?'Spielberechtigte Spieler aus dem NHL-Spielbericht; Reihen-Zuordnung nicht bestätigt.':'Vor Spielbeginn keine offiziell bestätigten NHL-Angriffsreihen verfügbar.'};
 }
 if(a==='detail'){
 const box=await fetchJson('/gamecenter/'+q.id+'/boxscore'),g=normalizeGame(box),season=String(box.season||'');
 const recent=async team=>{try{const s=await fetchJson('/club-schedule-season/'+team+'/'+season);return {data:(s.games||[]).filter(ended).sort((a,b)=>Date.parse(b.startTimeUTC)-Date.parse(a.startTimeUTC)).map(normalizeGame),error:null}}catch{return {data:[],error:'NHL-Spielhistorie nicht verfügbar'}}};
 const [home,away,standings]=await Promise.all([recent(box.homeTeam.abbrev),recent(box.awayTeam.abbrev),fetchJson('/standings/now').catch(()=>({standings:[]}))]);
 let stats=[],events=[];try{const landing=await fetchJson('/gamecenter/'+q.id+'/landing');stats=landing.summary?.teamGameStats||[];events=landing.summary?.scoring||[]}catch{}
 data={fixture:g,box,standings:standings.standings||[],nhlStats:stats,nhlEvents:events,homeRecent:{...home,data:home.data.slice(0,10)},awayRecent:{...away,data:away.data.slice(0,10)},h2h:{data:home.data.filter(x=>x.teams.home.abbrev===g.teams.away.abbrev||x.teams.away.abbrev===g.teams.away.abbrev).slice(0,10)},stats:{data:[]},table:{data:[]},events:{data:[]},lineups:{data:[]}};
 }
 return res.status(200).json({configured:true,data,source:'NHL',updatedAt:new Date().toISOString()});
 }catch(e){if(a==='del')return res.status(502).json({error:'DEL-Datenabruf fehlgeschlagen',detail:String(e?.message||e).slice(0,160),hint:'API-Hockey-Zugang, Tarif oder DEL-Endpunkt prüfen'});return res.status(502).json({error:'NHL-Daten derzeit nicht verfügbar. Bitte später erneut versuchen.'})}
}
