import {sportmonksFixtures,sportmonksFixtureSummary} from '../lib/sportmonks-client.js';
import {sportmonksForApiSports} from '../lib/football-provider-routing.js';
import {footballTransfers} from '../lib/player-history.js';
import {footballReference} from '../lib/lineup-reference.js';
import {getPlayerXg,summarizeLastFive} from '../lib/player-metrics.js';
import {getFootballEvidence,externalTeamForm} from '../lib/football-evidence.js';
import openliga from '../lib/openliga.js';
import {isScorerCompetition} from '../public/competitions.js';
const cache = new Map();
const ROOT = 'https://v3.football.api-sports.io';
async function api(path,key){
 const hit=cache.get(path);if(hit&&hit.until>Date.now())return hit.data;
 const r=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error('Sportdatenanbieter antwortet mit HTTP '+r.status);
 const body=await r.json();if(body.errors&&Object.keys(body.errors).length)throw Error('Sportdaten derzeit nicht verfügbar. Tarif, Tageslimit oder Anbieter prüfen.');
 const data=body.response||[];
 // Official XIs may appear shortly before kickoff; do not serve a five-minute-old
 // empty lineup from the server cache during the pre-match window.
 const ttl=path.startsWith('/odds/live?')?15000:path.startsWith('/fixtures/lineups?')?20000:path.startsWith('/fixtures?id=')?20000:path.startsWith('/fixtures?date')?30000:300000;
 cache.set(path,{until:Date.now()+ttl,data});if(cache.size>200)cache.delete(cache.keys().next().value);return data;
}
const playerPending=new Map(),playerWaiters=[];let playerRequests=0;
async function playerApi(path,key){
 if(playerPending.has(path))return playerPending.get(path);
 const promise=(async()=>{if(playerRequests>=2)await new Promise(resolve=>playerWaiters.push(resolve));else playerRequests++;try{return await api(path,key)}finally{const next=playerWaiters.shift();if(next)next();else playerRequests--}})();
 playerPending.set(path,promise);try{return await promise}finally{playerPending.delete(path)}
}
const integer=(v)=>/^\d{1,10}$/.test(String(v))&&Number(v)>0;
export default async function handler(req,res){
 res.setHeader('Cache-Control',['detail','lineups'].includes(String(req.query?.action||''))?'no-store, max-age=0':'s-maxage=30, stale-while-revalidate=15');
 const q=req.query||{},action=q.action||'fixtures';
 if(action==='openliga')return openliga(req,res);
 if(!['fixtures','clock','detail','table','player','squad','scorers','leagues','lineups','lineup-reference','liveodds','h2h-first-goal'].includes(action))return res.status(400).json({error:'Unbekannte Abfrage'});
 const date=String(q.date||'');
 if(action==='fixtures'&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))))return res.status(400).json({error:'Ungültiges Datum'});
 if(['clock','detail','lineups','lineup-reference','player','squad','liveodds','h2h-first-goal'].includes(action)&&!integer(q.id))return res.status(400).json({error:'Ungültige ID'});
 if(['table','player','squad','scorers'].includes(action)&&!/^20\d{2}$/.test(String(q.season)))return res.status(400).json({error:'Ungültige Saison'});
 if(['table','scorers'].includes(action)&&!integer(q.league))return res.status(400).json({error:'Ungültige Liga'});
 if(action==='player'&&q.team!=null&&!integer(q.team))return res.status(400).json({error:'Ungültige Team-ID'});
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,data:null,notice:'Sportdaten-Zugang fehlt. API_SPORTS_KEY in Vercel einrichten; die Demo lässt sich separat öffnen.'});
 try{
 let data;
 if(action==='clock'){data=(await api('/fixtures?id='+q.id,key))[0];if(!data||!isScorerCompetition(data.league))return res.status(404).json({error:'Spiel nicht gefunden'});}
 if(action==='leagues')data=(await api('/leagues?current=true',key)).filter(c=>isScorerCompetition({...c.league,country:c.country?.name})).map(c=>({id:c.league.id,name:c.league.name,country:c.country?.name,logo:c.league.logo,seasons:c.seasons}));
 if(action==='fixtures'){
  const [sports,monks]=await Promise.allSettled([
   api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key),
   process.env.SPORTMONKS_API_TOKEN?sportmonksFixtures(date):Promise.resolve(null)
  ]);
  if(sports.status==='rejected')throw sports.reason;
  const dayFixtures=sports.value;
  const normalize=name=>String(name||'').normalize('NFKD').replace(/[\\u0300-\\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
  const smGames=monks.status==='fulfilled'&&monks.value?monks.value.fixtures.map(sportmonksFixtureSummary):[];
  const used=new Set();
  data=(q.scope==='all'?dayFixtures:dayFixtures.filter(g=>isScorerCompetition(g.league))).map(g=>{
   const smLeague=sportmonksForApiSports(g.league.id);
   if(!smLeague)return {...g,dataProvider:'API-Sports'};
   const candidates=smGames.filter(sm=>Number(sm.leagueId)===smLeague&&!used.has(sm.id)&&normalize(sm.home)===normalize(g.teams.home.name)&&normalize(sm.away)===normalize(g.teams.away.name)&&Math.abs(Date.parse(sm.start)-Date.parse(g.fixture.date))<=180000);
   if(candidates.length!==1)return {...g,dataProvider:'API-Sports',sportmonksStatus:monks.status==='rejected'?'unavailable':'not_matched'};
   const sm=candidates[0];used.add(sm.id);
   return {...g,dataProvider:'Sportmonks',sportmonksFixtureId:sm.id,sportmonksLeagueId:smLeague,
    goals:{home:sm.homeGoals??g.goals.home,away:sm.awayGoals??g.goals.away}};
  });
 }
 if(['table','scorers'].includes(action)){
 const competitions=await api('/leagues?id='+q.league,key);
 if(!competitions.some(c=>isScorerCompetition({...c.league,country:c.country?.name})))return res.status(400).json({error:'Nur Wettbewerbe aus der Matchday-Auswahlliste sind freigeschaltet'});
 if(action==='table')data=await api('/standings?league='+q.league+'&season='+q.season,key);
 }
 if(action==='player'){
 const profiles=await playerApi('/players?id='+q.id+'&season='+q.season,key);
 const stats=profiles[0]?.statistics||[];
 if(q.team!=null&&!stats.some(s=>String(s.team?.id)===String(q.team)))return res.status(404).json({error:'Für dieses Team fehlen Spielerstatistiken'});
 const team=q.team!=null?Number(q.team):stats[0]?.team?.id;
 let recent=[],recentError=null;
 if(team){try{
 const fixtures=(await playerApi('/fixtures?team='+team+'&last=5&status=FT-AET-PEN',key)).filter(g=>isScorerCompetition(g.league)&&['FT','AET','PEN'].includes(g.fixture?.status?.short)&&Date.parse(g.fixture.date)<Date.now()).sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).slice(0,5);
 recent=await Promise.all(fixtures.map(async g=>{try{const sides=await playerApi('/fixtures/players?fixture='+g.fixture.id,key);const entry=sides.flatMap(s=>s.players||[]).find(p=>Number(p.player.id)===Number(q.id));const st=entry?.statistics?.[0];return {date:g.fixture.date,home:g.teams.home.name,away:g.teams.away.name,minutes:st?.games?.minutes??null,goals:st?.goals?.total??null,shots:st?.shots?.total??null,onTarget:st?.shots?.on??null,available:!!st};}catch{return {date:g.fixture.date,home:g.teams.home.name,away:g.teams.away.name,available:false}}}));
 }catch{recentError='Letzte Spiele nicht verfügbar'}}
 let participation='Keine kommende Begegnung verfügbar';
 if(team){try{const next=(await playerApi('/fixtures?team='+team+'&next=1',key))[0];if(next){const lineups=await playerApi('/fixtures/lineups?fixture='+next.fixture.id,key);const side=lineups.find(s=>s.team?.id===team);participation=side?.startXI?.length===11?(side.startXI.some(p=>Number(p.player.id)===Number(q.id))?'Startelf bestätigt':'Nicht in bestätigter Startelf'):'Startelf noch nicht veröffentlicht';participation+=' · '+next.teams.home.name+' – '+next.teams.away.name;}}catch{participation='Startelfstatus nicht verfügbar'}}
 let transferHistory=[],transferHistoryUnavailable=false;try{transferHistory=footballTransfers(await playerApi('/transfers?player='+q.id,key))}catch{transferHistoryUnavailable=true}
 data={transferHistory,transferHistoryUnavailable,profiles,recent,recentError,participation,recentSummary:summarizeLastFive(recent),xg:await getPlayerXg(q.id,'football',q.season)};
 }
 if(action==='scorers')data=await api('/players/topscorers?league='+q.league+'&season='+q.season,key);
 if(action==='squad'){
  // The official squad endpoint lists the complete current team including bench players.
  // Season player-stat pages are used to enrich entries, not to limit membership to 20.
  const roster=new Map();
  const [squadResult,firstResult]=await Promise.allSettled([
   api('/players/squads?team='+q.id,key),
   api('/players?team='+q.id+'&season='+q.season+'&page=1',key)
  ]);
  if(squadResult.status==='fulfilled'){
   for(const squad of squadResult.value)for(const p of squad.players||[]){
    if(!p.id)continue;
    roster.set(p.id,{player:{id:p.id,name:p.name,photo:p.photo,age:p.age},statistics:[{games:{position:p.position}}]});
   }
  }
  const first=firstResult.status==='fulfilled'?firstResult.value:[];
  for(const p of first)if(p.player?.id)roster.set(p.player.id,p);
  // If the complete squad feed is unavailable, fill remaining pages of the season roster.
  if(roster.size<16&&first.length>=20){
   const pages=await Promise.allSettled([2,3,4].map(page=>api('/players?team='+q.id+'&season='+q.season+'&page='+page,key)));
   for(const page of pages)if(page.status==='fulfilled')for(const p of page.value)if(p.player?.id)roster.set(p.player.id,p);
  }
  data=[...roster.values()].sort((a,b)=>String(a.player?.name||'').localeCompare(String(b.player?.name||''),'de'));
 }
 if(action==='lineup-reference'){
  if(!integer(q.team))return res.status(400).json({error:'Ungültiges Team'});
  const g=(await api('/fixtures?id='+q.id,key))[0];
  if(!g||![g.teams.home.id,g.teams.away.id].includes(Number(q.team)))return res.status(404).json({error:'Team nicht im Spiel'});
  data=await footballReference(q.team,g.fixture.date,path=>api(path,key));
 }
 if(action==='lineups'){
  // One fixture only, no standings/players/h2h fanout. Called every ~15min
  // from 60 minutes before kickoff while the page is active.
  const fixture=(await api('/fixtures?id='+q.id,key))[0];
  if(!fixture||!isScorerCompetition(fixture.league))return res.status(404).json({error:'Spiel nicht gefunden'});
  const rows=await api('/fixtures/lineups?fixture='+q.id,key);
  const perTeam=rows.map(side=>({teamId:side.team?.id,confirmed:(side.startXI||[]).length===11}));
  data={fixtureId:fixture.fixture.id,lineups:rows,teams:perTeam,fullyConfirmed:perTeam.length>=2&&perTeam.filter(x=>x.confirmed).length>=2,source:'API-Sports: offiziell gelistete Startelf',checkedAt:new Date().toISOString()};
 }
 if(action==='liveodds'){
  const rows=await api('/odds/live?fixture='+q.id,key);
  const first=rows.find(row=>Number(row.fixture?.id)===Number(q.id));
  const offers=[];
  if(first&&!first.status?.blocked&&!first.status?.stopped&&!first.status?.finished){
   for(const bet of first.odds||[]){
    const name=String(bet.name||'');
    if(!/over.?under|total goals|goals over|goal line/i.test(name))continue;
    for(const value of bet.values||[]){
     if(value.suspended||!/^over$/i.test(String(value.value||'')))continue;
     const line=Number(value.handicap),odd=Number(value.odd);
     if(!Number.isFinite(line)||!Number.isFinite(odd)||odd<=1)continue;
     offers.push({market:name,line,odd,main:value.main===true});
    }
   }
  }
  data={fixtureId:Number(q.id),updatedAt:first?.update||null,blocked:!!first?.status?.blocked,available:!!first,offers};
 }
 if(action==='h2h-first-goal'){
  const g=(await api('/fixtures?id='+q.id,key))[0];
  if(!g||!isScorerCompetition(g.league))return res.status(404).json({error:'Begegnung nicht gefunden'});
  const kickoff=Date.parse(g.fixture.date),homeId=g.teams.home.id,awayId=g.teams.away.id;
  const history=await api('/fixtures/headtohead?h2h='+homeId+'-'+awayId+'&last=20',key);
  const last=history.filter(h=>['FT','AET','PEN'].includes(h.fixture?.status?.short)&&Date.parse(h.fixture.date)<kickoff&&
   [h.teams?.home?.id,h.teams?.away?.id].includes(homeId)&&[h.teams?.home?.id,h.teams?.away?.id].includes(awayId))
   .sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date))[0];
  if(!last){data={fixtureId:g.fixture.id,scorer:null,reason:'Kein abgeschlossener direkter Vergleich verfügbar'};}
  else{
   const events=await api('/fixtures/events?fixture='+last.fixture.id,key);
   const goals=events.map((e,i)=>({...e,_order:i})).filter(e=>String(e.type||'').toLowerCase()==='goal')
    .sort((a,b)=>(Number(a.time?.elapsed)||0)-(Number(b.time?.elapsed)||0)||
     (Number(a.time?.extra)||0)-(Number(b.time?.extra)||0)||a._order-b._order);
   const first=goals[0],own=/own goal|eigento?r/i.test(String(first?.detail||''));
   const valid=first&&!own&&first.player?.id&&first.player?.name&&[homeId,awayId].includes(first.team?.id);
   data={fixtureId:g.fixture.id,h2hFixtureId:last.fixture.id,h2hDate:last.fixture.date,
    scorer:valid?{id:first.player.id,name:first.player.name,teamId:first.team.id,teamName:first.team.name}:null,
    minute:first?.time?.elapsed??null,reason:!first?'Kein Torschussereignis im letzten H2H':own?'Erstes Tor war ein Eigentor':!valid?'Erster Torschütze nicht eindeutig zugeordnet':null,
    source:'API-Sports · Spielereignisse'};
  }
 }
 if(action==='detail'){
 const fixtures=await api('/fixtures?id='+q.id,key),g=fixtures[0];if(!g||!isScorerCompetition(g.league))return res.status(404).json({error:'Begegnung nicht gefunden'});
 const paths={stats:'/fixtures/statistics?fixture='+q.id,events:'/fixtures/events?fixture='+q.id,lineups:'/fixtures/lineups?fixture='+q.id,h2h:'/fixtures/headtohead?h2h='+g.teams.home.id+'-'+g.teams.away.id+'&last=10',homeRecent:'/fixtures?team='+g.teams.home.id+'&last=10&status=FT-AET-PEN',awayRecent:'/fixtures?team='+g.teams.away.id+'&last=10&status=FT-AET-PEN',table:'/standings?league='+g.league.id+'&season='+g.league.season};
 const formOnly=q.formOnly==='1';
 const requestedPaths=formOnly?{homeRecent:paths.homeRecent,awayRecent:paths.awayRecent}:paths;
 const entries=await Promise.all(Object.entries(requestedPaths).map(async([name,path])=>{try{const rows=await api(path,key);return [name,{data:['h2h','homeRecent','awayRecent'].includes(name)?rows.filter(x=>isScorerCompetition(x.league)):rows,error:null}]}catch{return [name,{data:[],error:'Daten nicht verfügbar'}]}}));
 if(formOnly)return res.status(200).json({configured:true,data:Object.fromEntries(entries),source:'API-Sports'});
 const evidenceDate=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(g.fixture.date));const extra=await getFootballEvidence(evidenceDate);const externalForm={home:externalTeamForm(extra,g.teams.home.name,g.league.id,evidenceDate,g.league.name,g.league.country),away:externalTeamForm(extra,g.teams.away.name,g.league.id,evidenceDate,g.league.name,g.league.country),providers:extra.providers};data={fixture:g,externalForm,...Object.fromEntries(entries)};
 }
 return res.status(200).json({configured:true,data,source:'API-Sports',updatedAt:new Date().toISOString()});
 }catch{return res.status(502).json({error:'Sportdaten konnten nicht geladen werden. Bitte später erneut versuchen oder API-Tarif prüfen.'})}
}

