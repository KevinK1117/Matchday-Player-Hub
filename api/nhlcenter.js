import {delAnalysis,delDetail,delFirstGoal,delLive,delLiveForm,delStandings} from '../lib/del-data.js';
import {officialDelDay} from '../lib/del-schedule.js';
import {analyzeNhlDraws} from '../lib/nhl-draws.js';
import {recentScorerForm} from '../lib/scorer-analysis.js';
import {nhlTeamHistory} from '../lib/player-history.js';
import {nhlReference} from '../lib/lineup-reference.js';
import {nhlClock} from '../public/match-clock.js';
import {getPlayerXg,summarizeLastFive} from '../lib/player-metrics.js';
import {fetchJson,value,fetchBerlinSchedule} from './nhl.js';
const ended=g=>['FINAL','OFF'].includes(g.gameState);
export function normalizeGame(g){const team=t=>({id:t?.id,name:value(t?.placeName)&&value(t?.commonName)?value(t.placeName)+' '+value(t.commonName):value(t?.name)||t?.abbrev||'Team',logo:t?.abbrev?`https://assets.nhle.com/logos/nhl/svg/${t.abbrev}_light.svg`:null,abbrev:t?.abbrev});return {fixture:{id:g.id,date:g.startTimeUTC,status:{short:ended(g)?'FT':['LIVE','CRIT'].includes(g.gameState)?'LIVE':['FUT','PRE'].includes(g.gameState)?'NS':g.gameState,elapsed:null,clock:nhlClock(g)},venue:{name:value(g.venue)}},league:{id:10000,name:'NHL',country:'USA / Kanada',season:Number(String(g.season||'').slice(0,4))||new Date(g.startTimeUTC).getUTCFullYear()},teams:{home:team(g.homeTeam),away:team(g.awayTeam)},goals:{home:g.homeTeam?.score??null,away:g.awayTeam?.score??null},sport:'nhl'};}
export default async function handler(req,res){
 res.setHeader('Cache-Control',String(req.query?.action||'')==='lineups'?'no-store, max-age=0':'s-maxage=60, stale-while-revalidate=60');const q=req.query||{},a=q.action||'fixtures';
 if(!['fixtures','draws','clock','detail','table','player','player-form','squad','scorers','lineup-reference','lineups','del','del-detail','ice-del-detail','del-analysis','del-live','del-live-form','del-standings','h2h-first-goal','del-first-goal'].includes(a))return res.status(400).json({error:'Unbekannte NHL-Abfrage'});
 if(['fixtures','draws','del','ice-del-detail','del-analysis','del-live','del-live-form','del-standings','del-first-goal'].includes(a)&&!/^\d{4}-\d{2}-\d{2}$/.test(String(q.date||'')))return res.status(400).json({error:'Ungültiges Datum'});
 if(['clock','detail','lineup-reference','lineups','player','player-form','del-detail','h2h-first-goal'].includes(a)&&!/^\d{1,12}$/.test(String(q.id||'')))return res.status(400).json({error:'Ungültige ID'});
 if(a==='squad'&&!/^[A-Z]{3}$/.test(String(q.team||'')))return res.status(400).json({error:'Ungültiges NHL-Team'});
 if(a==='player-form'&&(!/^20\d{2}$/.test(String(q.season||''))||!/^20\d{2}-\d{2}-\d{2}$/.test(String(q.date||''))))return res.status(400).json({error:'Ungültige Saison oder Spieltag'});
 try{let data;
 if(a==='player-form'){
  const season=Number(q.season);
  const log=await fetchJson('/player/'+q.id+'/game-log/'+season+(season+1)+'/2');
  data={last10Games:recentScorerForm(log.gameLog||[],String(q.date)).last10};
 }
 if(a==='clock')data=normalizeGame(await fetchJson('/gamecenter/'+q.id+'/boxscore'));
 if(a==='ice-del-detail'){
  if(!process.env.ICE_HOCKEY_API_KEY)return res.status(200).json({configured:false,matched:false,notice:'DEL-Datenzugang fehlt'});
  return res.status(200).json(await delDetail(q));
 }
 if(a==='del-first-goal'){
  const result=await delFirstGoal({date:String(q.date),home:String(q.home||''),away:String(q.away||''),start:String(q.start||'')});
  return res.status(200).json({configured:true,data:result,source:'Ice Hockey API'});
 }
 if(a==='del-standings')data=await delStandings(String(q.date));
 if(a==='del-analysis')data=await delAnalysis(String(q.date),['scorers','form'].includes(q.mode)?q.mode:'draws');
 if(a==='del-live')data=await delLive(String(q.date));
 if(a==='del-live-form')data=await delLiveForm(String(q.date),q.id);
 if(['del-standings','del-analysis','del-live','del-live-form'].includes(a))return res.status(200).json({configured:true,data,source:'Ice Hockey API'});
 if(a==='del-detail'){
  const key=process.env.API_HOCKEY_KEY||process.env.API_SPORTS_KEY;
  if(!key)return res.status(503).json({error:'API-Hockey-Zugang fehlt'});
  const response=await fetch('https://v1.hockey.api-sports.io/games?id='+encodeURIComponent(q.id),{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)});
  if(!response.ok)throw Error('Hockey HTTP '+response.status);
  const body=await response.json();
  if(body.errors&&Object.keys(body.errors).length)throw Error('API-Hockey: '+JSON.stringify(body.errors).slice(0,160));
  const g=(body.response||[])[0];if(!g)return res.status(404).json({error:'DEL-Spiel nicht gefunden'});
  let events=[];let eventsAvailable=false;
  if(g.events===true){
   try{
    const er=await fetch('https://v1.hockey.api-sports.io/games/events?game='+encodeURIComponent(q.id),{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(9000)});
    if(er.ok){const eb=await er.json();if(!eb.errors||!Object.keys(eb.errors).length){events=(eb.response||[]).slice(0,80).map(e=>({type:String(e.type||''),detail:String(e.detail||''),time:String(e.time||''),team:String(e.team?.name||''),player:String(e.player?.name||'' )}));eventsAvailable=true}}
   }catch{}
  }
  // Supplemental DEL GameStats feed: match by local date and BOTH team names, never by API-Hockey ID.
  let extra={source:'DEL GameStats',matched:false,rosters:{home:[],away:[]},h2h:[]};
  try{
   const seasonStart=Number(String(g.date).slice(0,4))-(Number(String(g.date).slice(5,7))<7?1:0);
   const base='https://s3.eu-west-1.amazonaws.com/de.hokejovyzapis.cz/';
   const getExtra=async path=>{const rr=await fetch(base+path,{signal:AbortSignal.timeout(6500)});if(!rr.ok)throw Error('GameStats '+rr.status);return rr.json()};
   const schedule=await getExtra('league-matches/'+seasonStart+'/1.json');
   const rows=Array.isArray(schedule)?schedule:Array.isArray(schedule.matches)?schedule.matches:Array.isArray(schedule.data)?schedule.data:[];
   const clean=name=>String(name||'').toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g,'').replace(/[^a-z0-9]/g,'').replace(/^(fischtown|penny)/,'');
   const date=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(g.date));
   const match=rows.find(m=>{
    const home=m.home?.name||m.home_name||m.homeName||'';
    const away=m.guest?.name||m.guest_name||m.away?.name||m.away_name||'';
    const day=String(m.startDate||m.start_date||m.date||'').slice(0,10);
    const similar=(a,b)=>{const x=clean(a),y=clean(b);return x.length>4&&y.length>4&&(x.includes(y)||y.includes(x))};
    return day===date&&similar(home,g.teams?.home?.name)&&similar(away,g.teams?.away?.name);
   });
   if(match){
    const mid=Number(match.id||match.matchId||match.match_id);
    if(Number.isInteger(mid)&&mid>0){
     extra.matched=true;
     const homeId=Number(match.home?.id||match.home_id),awayId=Number(match.guest?.id||match.guest_id||match.away?.id);
     const toPlayers=raw=>{
      const list=Array.isArray(raw)?raw:Array.isArray(raw?.players)?raw.players:Array.isArray(raw?.data)?raw.data:[];
      return list.map(p=>({id:p.playerId||p.player_id||p.id||null,name:p.fullName||[p.firstname||p.firstName||p.name,p.surname||p.lastName].filter(Boolean).join(' '),number:p.jersey??p.number??null,position:p.position||null,goals:p.goals??null,assists:p.assists??null,shots:p.shots_on_goal??p.shotsOnGoal??null,games:p.games??null,photo:null})).filter(p=>p.name&&p.games!=null).sort((a,b)=>Number(b.goals||0)-Number(a.goals||0)).slice(0,45);
     };
     if(homeId>0&&awayId>0){
      const [hs,as]=await Promise.allSettled([getExtra('league-team-stats/'+seasonStart+'/1/'+homeId+'.json'),getExtra('league-team-stats/'+seasonStart+'/1/'+awayId+'.json')]);
      if(hs.status==='fulfilled')extra.rosters.home=toPlayers(hs.value);
      if(as.status==='fulfilled')extra.rosters.away=toPlayers(as.value);
     }
    }
   }
  }catch{}
  return res.status(200).json({configured:true,game:{id:g.id,date:g.date,home:g.teams?.home?.name||'Heimteam',away:g.teams?.away?.name||'Gastteam',homeLogo:g.teams?.home?.logo||null,awayLogo:g.teams?.away?.logo||null,homeGoals:g.scores?.home??null,awayGoals:g.scores?.away??null,status:g.status?.short||'NS',periods:g.periods||null,scores:g.scores||null,venue:g.country?.name||null,events,eventsAvailable,extra},source:'API-Hockey + DEL GameStats'});
 }
 if(a==='del'){
  const key=process.env.API_HOCKEY_KEY||process.env.API_SPORTS_KEY;
  if(!key)return res.status(200).json(await officialDelDay(String(q.date)));
  try{
   const root='https://v1.hockey.api-sports.io';
   const call=async path=>{const response=await fetch(root+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)});if(!response.ok)throw Error('Hockey HTTP '+response.status);const body=await response.json();if(body.errors&&Object.keys(body.errors).length)throw Error('API-Hockey meldet: '+JSON.stringify(body.errors).slice(0,180));return body.response||[]};
   const leagues=await call('/leagues?search=DEL');
   const league=leagues.find(l=>/^DEL$/i.test(String(l.name||'')));
   if(!league)throw Error('DEL-Liga nicht gefunden');
   const season=Number(String(q.date).slice(0,4))-(Number(String(q.date).slice(5,7))<7?1:0);
   const games=await call('/games?date='+encodeURIComponent(q.date)+'&league='+league.id+'&season='+season+'&timezone=Europe%2FBerlin');
   return res.status(200).json({configured:true,games:games.map(g=>({id:g.id,date:g.date,home:g.teams?.home?.name||'Heimteam',away:g.teams?.away?.name||'Gastteam',homeLogo:g.teams?.home?.logo||null,awayLogo:g.teams?.away?.logo||null,homeGoals:g.scores?.home??null,awayGoals:g.scores?.away??null,status:g.status?.short||'NS'})),source:'API-Hockey',updatedAt:new Date().toISOString()});
  }catch{
   return res.status(200).json(await officialDelDay(String(q.date)));
  }
 }
 if(a==='fixtures'){data=(await fetchBerlinSchedule(String(q.date))).games.map(normalizeGame)}
 if(a==='draws'){
  const date=String(q.date),season=Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);
  const schedule=await fetchBerlinSchedule(date);
  const loadSeason=async(club,year)=>{
   const history=await fetchJson('/club-schedule-season/'+club+'/'+year+(year+1));
   if(!Array.isArray(history.games))throw Error('NHL-Spielhistorie fehlt');
   return history.games;
  };
  data=await analyzeNhlDraws(schedule.games.map(normalizeGame),club=>loadSeason(club,season),Date.now(),async club=>{
   const previous=await loadSeason(club,season-1);
   return previous.concat(await loadSeason(club,season-2));
  });
  if(schedule.partial)data.errors++;
 }
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
 if(a==='scorers'){
 const leaders=await fetchJson('/skater-stats-leaders/current?categories=goals&limit=30');
 const clubs=[...new Set((leaders.goals||[]).map(p=>p.teamAbbrev).filter(Boolean))],stats=new Map();let next=0;
 await Promise.all(Array.from({length:2},async()=>{while(next<clubs.length){const club=clubs[next++];try{const d=await fetchJson('/club-stats/'+club+'/now');for(const p of d.skaters||[])stats.set(String(p.playerId),{...p,club})}catch{}}}));
 data=(leaders.goals||[]).map(p=>{const st=stats.get(String(p.id)),gp=st?.gamesPlayed,goals=st?.goals??p.value,shots=st?.shots;
 return {player:{id:p.id,photo:p.headshot||null,name:value(p.firstName)+' '+value(p.lastName)},statistics:[{team:{name:p.teamAbbrev},goals:{total:goals}}],modelPlayer:{id:p.id,name:value(p.firstName)+' '+value(p.lastName),photo:p.headshot,team:p.teamAbbrev,position:st?.positionCode,GP:gp??null,goals,shots:shots??null,shotsPerGame:gp>0&&shots!=null?shots/gp:null,participation:'Saisonmodell · kein Einsatz bestätigt'}};
 }).filter(p=>['C','L','R','LW','RW'].includes(p.modelPlayer.position));
 }
 if(a==='player'){const p=await fetchJson('/player/'+q.id+'/landing');const current=(p.seasonTotals||[]).filter(x=>x.gameTypeId===2&&x.leagueAbbrev==='NHL').sort((a,b)=>Number(b.season)-Number(a.season))[0];const recent=(p.last5Games||[]).filter(g=>g.gameDate&&Date.parse(g.gameDate)<=Date.now()).slice(0,5);let last10Games=[];if(current){try{const log=await fetchJson('/player/'+q.id+'/game-log/'+current.season+'/2');last10Games=recentScorerForm(log.gameLog||[],new Date(Date.now()+86400000).toISOString().slice(0,10)).last10;}catch{last10Games=recent;}}let standings=[];try{standings=(await fetchJson('/standings/now')).standings||[]}catch{}data={...p,teamHistory:nhlTeamHistory(p,standings),last5Games:recent,last10Games,recentSummary:summarizeLastFive(recent),xg:current?await getPlayerXg(q.id,'nhl',current.season):null};}
 if(a==='lineup-reference'){
  const box=await fetchJson('/gamecenter/'+q.id+'/boxscore');
  if(![box.homeTeam?.abbrev,box.awayTeam?.abbrev].includes(q.team))return res.status(400).json({error:'Team nicht im Spiel'});
  data=await nhlReference(q.team,box.startTimeUTC,fetchJson);
 }
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
 if(a==='h2h-first-goal'){
  const box=await fetchJson('/gamecenter/'+q.id+'/boxscore');
  const g=normalizeGame(box),kickoff=Date.parse(g.fixture.date),home=box.homeTeam?.abbrev,away=box.awayTeam?.abbrev;
  const season=Number(String(box.season||'').slice(0,4));
  if(!home||!away||!Number.isInteger(season))throw Error('NHL-Teams oder Saison fehlen');
  const schedules=await Promise.allSettled([season,season-1,season-2].map(y=>fetchJson('/club-schedule-season/'+home+'/'+y+(y+1))));
  const past=schedules.filter(r=>r.status==='fulfilled').flatMap(r=>r.value.games||[])
   .filter(x=>['FINAL','OFF'].includes(x.gameState)&&Date.parse(x.startTimeUTC)<kickoff&&
    [x.homeTeam?.abbrev,x.awayTeam?.abbrev].includes(home)&&[x.homeTeam?.abbrev,x.awayTeam?.abbrev].includes(away))
   .sort((a,b)=>Date.parse(b.startTimeUTC)-Date.parse(a.startTimeUTC))[0];
  if(!past){data={fixtureId:g.fixture.id,scorer:null,reason:'Kein abgeschlossenes NHL-H2H verfügbar'};}
  else{
   const pbp=await fetchJson('/gamecenter/'+past.id+'/play-by-play');
   const seconds=x=>{const t=String(x.timeInPeriod||'').split(':');return (Number(t[0])||0)*60+(Number(t[1])||0)};
   const goals=(pbp.plays||[]).filter(x=>x.typeDescKey==='goal'&&x.periodDescriptor?.periodType!=='SO')
    .sort((a,b)=>(Number(a.periodDescriptor?.number)||0)-(Number(b.periodDescriptor?.number)||0)||seconds(a)-seconds(b));
   const first=goals[0];
   const candidates=goals.flatMap((e,i)=>{const id=e.details?.scoringPlayerId,t=e.details?.eventOwnerTeamId,abbrev=t===past.homeTeam?.id?past.homeTeam.abbrev:t===past.awayTeam?.id?past.awayTeam.abbrev:null;return id&&abbrev?[{scorer:{id,teamAbbrev:abbrev},period:e.periodDescriptor?.number??null,time:e.timeInPeriod??null,goalOrder:i+1}]:[]});
   const id=first?.details?.scoringPlayerId,teamId=first?.details?.eventOwnerTeamId;
   const side=teamId===past.homeTeam?.id?'home':teamId===past.awayTeam?.id?'away':null;
   const abbrev=side?past[side+'Team']?.abbrev:null;
   data={fixtureId:g.fixture.id,h2hFixtureId:past.id,h2hDate:past.startTimeUTC,candidates,
    scorer:id&&abbrev?{id,teamAbbrev:abbrev}:null,
    period:first?.periodDescriptor?.number??null,time:first?.timeInPeriod??null,
    reason:!first?'Kein Tor im letzten NHL-H2H':!id||!abbrev?'Torschütze nicht eindeutig zugeordnet':null,
    source:'NHL · Play-by-play'};
  }
 }
 if(a==='detail'){
 const box=await fetchJson('/gamecenter/'+q.id+'/boxscore'),g=normalizeGame(box),season=String(box.season||'');
 const recent=async team=>{try{const s=await fetchJson('/club-schedule-season/'+team+'/'+season);return {data:(s.games||[]).filter(ended).sort((a,b)=>Date.parse(b.startTimeUTC)-Date.parse(a.startTimeUTC)).map(normalizeGame),error:null}}catch{return {data:[],error:'NHL-Spielhistorie nicht verfügbar'}}};
 const [home,away,standings]=await Promise.all([recent(box.homeTeam.abbrev),recent(box.awayTeam.abbrev),q.formOnly==='1'?{standings:[]}:fetchJson('/standings/now').catch(()=>({standings:[]}))]);
 if(q.formOnly==='1')return res.status(200).json({configured:true,data:{homeRecent:{...home,data:home.data.slice(0,10)},awayRecent:{...away,data:away.data.slice(0,10)}},source:'NHL'});
 let stats=[],events=[];try{const landing=await fetchJson('/gamecenter/'+q.id+'/landing');stats=landing.summary?.teamGameStats||[];events=landing.summary?.scoring||[]}catch{}
 data={fixture:g,box,standings:standings.standings||[],nhlStats:stats,nhlEvents:events,homeRecent:{...home,data:home.data.slice(0,10)},awayRecent:{...away,data:away.data.slice(0,10)},h2h:{data:home.data.filter(x=>x.teams.home.abbrev===g.teams.away.abbrev||x.teams.away.abbrev===g.teams.away.abbrev).slice(0,10)},stats:{data:[]},table:{data:[]},events:{data:[]},lineups:{data:[]}};
 }
 return res.status(200).json({configured:true,data,source:'NHL',updatedAt:new Date().toISOString()});
 }catch(e){if(a==='del')return res.status(502).json({error:'DEL-Datenabruf fehlgeschlagen',detail:'API-Hockey und offizieller DEL-Spielplan haben keine verwertbaren Daten geliefert.'});if(a.startsWith('del-')||a==='ice-del-detail')return res.status(502).json({error:'DEL-Zusatzdaten derzeit nicht verfügbar'});return res.status(502).json({error:'NHL-Daten derzeit nicht verfügbar. Bitte später erneut versuchen.'})}
}

