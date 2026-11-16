import {officialDelDay} from './del-schedule.js';
import {normalizeName} from './football-evidence.js';

const league='lg_k1vbdx0x';
const cache=new Map();
const waiters=[];
let active=0;
async function providerSlot(){
 if(active<6)active++;
 else await new Promise(resolve=>waiters.push(resolve));
 return ()=>{const next=waiters.shift();if(next)next();else active--;};
}
const aliases={ehcredbullmunchen:'munchen',pinguinsbremerhaven:'bremerhaven',fischtownpinguins:'bremerhaven',fischtownpinguinsbremerhaven:'bremerhaven'};
const teamKey=name=>aliases[normalizeName(name)]||normalizeName(name);
const sameTeam=(a,b)=>Boolean(a&&b&&teamKey(a)===teamKey(b));
const berlin=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'});
const timestamp=game=>Date.parse(String(game.start_time||game.date||'').replace(' Z','Z'));
const before=(rows,cutoff)=>(Array.isArray(rows)?rows:[]).filter(game=>game.status==='final'&&timestamp(game)<cutoff).sort((a,b)=>timestamp(b)-timestamp(a));
const validId=(value,prefix)=>typeof value==='string'&&new RegExp('^'+prefix+'_[a-z0-9]+$').test(value);
const positionCode=position=>({leftwing:'L',rightwing:'R',wing:'F',forward:'F',center:'C',centre:'C',defense:'D',defenseman:'D',defenceman:'D',defender:'D',goalie:'G',goaltender:'G',l:'L',r:'R',lw:'L',rw:'R',c:'C',f:'F',d:'D',g:'G'})[normalizeName(position)]||null;

async function api(path){
 const key=process.env.ICE_HOCKEY_API_KEY;
 if(!key)throw Error('DEL-Datenzugang fehlt');
 const cached=cache.get(path);
 if(cached?.until>Date.now())return cached.promise;
 if(cache.size>=400)cache.delete(cache.keys().next().value);
 const live=path.startsWith('/games?')||path.endsWith('/lineups');
 const promise=(async()=>{
  const release=await providerSlot();
  try{
   const response=await fetch('https://api.icehockeyapi.com/v1'+path,{headers:{'X-API-Key':key},signal:AbortSignal.timeout(7000)});
   if(!response.ok)throw Error('Ice Hockey API HTTP '+response.status);
   return (await response.json()).data;
  }finally{release();}
 })();
 cache.set(path,{until:Date.now()+(live?30000:300000),promise});
 try{return await promise}catch(e){cache.delete(path);throw e}
}

async function seasonFor(date){
 const year=Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);
 const rows=await api('/leagues/'+league+'/seasons?per_page=50');
 const season=rows?.find(s=>[year+'-'+String(year+1).slice(-2),year+'-'+(year+1),year+'/'+(year+1)].includes(s.label));
 if(!validId(season?.id,'ss'))throw Error('DEL-Saison nicht verfügbar');
 return season.id;
}

const fixturesFor=date=>api('/games?date='+date+'&league_id='+league+'&per_page=50');
async function context(date){
 const season=await seasonFor(date);
 const teams=await api('/seasons/'+season+'/teams?per_page=50');
 return {season,teams};
}
function findTeam(teams,name){
 const matches=(teams||[]).filter(t=>sameTeam(t.name,name)||sameTeam(t.short_name,name));
 return matches.length===1&&validId(matches[0].id,'tm')?matches[0]:null;
}
const recent=(team,season)=>api('/teams/'+team.id+'/games?season_id='+season+'&status=final&order=desc&per_page=15');
const roster=(team,season)=>api('/teams/'+team.id+'/roster?season_id='+season);
const headToHead=(home,away)=>api('/teams/'+home.id+'/head-to-head/'+away.id+'?per_page=30');
const optional=work=>work.catch(()=>null);
const gameData=(game,category)=>validId(game?.id,'gm')?optional(api('/games/'+game.id+'/'+category)):null;

function players(rows){
 return (Array.isArray(rows)?rows:[]).filter(p=>p.player?.id&&p.player?.name).map(p=>({
  id:p.player.id,name:p.player.name,position:positionCode(p.position),number:p.number??p.jersey_number??null,
  games:p.games??null,line:Number.isInteger(p.line)&&p.line>0?p.line:null,starter:p.is_starting_goalie===true
 }));
}
function sideFor(game,team){return game?.home_team?.id===team.id?'home':game?.away_team?.id===team.id?'away':null;}
function forSide(rows,side){return side?(rows||[]).filter(x=>x.side===side):[];}

export async function delStandings(date){
 return api('/seasons/'+await seasonFor(date)+'/standings');
}

export async function delDetail({date,home,away,start}){
 const [{season,teams},fixtures]=await Promise.all([context(date),optional(fixturesFor(date))]);
 const h=findTeam(teams,home),a=findTeam(teams,away);
 if(!h||!a)return {configured:true,matched:false,source:'Ice Hockey API',notice:'DEL-Teams nicht eindeutig zugeordnet'};
 const kickoff=Number.isFinite(Date.parse(start))?Date.parse(start):Date.parse(date+'T00:00:00Z');
 const game=(fixtures||[]).find(g=>g.home_team?.id===h.id&&g.away_team?.id===a.id);
 const [hs,as,hr,ar,duels,standings,lineup,teamStats]=await Promise.all([
  optional(recent(h,season)),optional(recent(a,season)),optional(roster(h,season)),optional(roster(a,season)),
  optional(headToHead(h,a)),optional(api('/seasons/'+season+'/standings')),gameData(game,'lineups'),gameData(game,'team-stats')
 ]);
 const homeRecent=before(hs,kickoff).slice(0,10),awayRecent=before(as,kickoff).slice(0,10);
 const makeLineup=async(team,side,history,fullRoster)=>{
  let rows=players(forSide(lineup,side)),source=rows.length?'current':'season',date=null;
  if(!rows.length&&history.length){
   const last=history[0];
   rows=players(forSide(await gameData(last,'lineups'),sideFor(last,team)));
   if(rows.length){source='last';date=last.date;}
  }
  rows=rows.map(p=>({...p,position:p.position||fullRoster.find(r=>r.id===p.id)?.position||null}));
  return {rows,source,date,roster:fullRoster};
 };
 const homeRoster=players(hr),awayRoster=players(ar);
 const lineups=await Promise.all([makeLineup(h,'home',homeRecent,homeRoster),makeLineup(a,'away',awayRecent,awayRoster)]);
 return {configured:true,matched:true,source:'Ice Hockey API',homeRoster,awayRoster,homeRecent,awayRecent,h2h:before(duels,kickoff).slice(0,10),standings,lineups,teamStats};
}

function normalizeFixture(game,home,away){
 return {sport:'del',fixture:{id:game.id,date:game.date,status:{short:game.status}},league:{id:10001,name:'DEL',country:'Deutschland'},
  teams:{home:{id:home.id,name:game.home},away:{id:away.id,name:game.away}},goals:{home:game.homeGoals,away:game.awayGoals}};
}

function regulationSummary(rows,team){
 let draws=0,wins=0,played=0;
 for(const game of rows){
  if(!['regulation','overtime','shootout'].includes(game.ended_in)||!Number.isInteger(game.home_goals)||!Number.isInteger(game.away_goals))continue;
  const side=sideFor(game,team);
  if(!side)continue;
  played++;
  if(game.ended_in!=='regulation')draws++;
  else if(side==='home'?game.home_goals>game.away_goals:game.away_goals>game.home_goals)wins++;
 }
 return {played,draws,wins};
}

async function recentScorers(team,history,fullRoster,fixture){
 const skaters=await Promise.all(history.map(g=>gameData(g,'skaters')));
 if(skaters.filter(Array.isArray).length<5)return [];
 return fullRoster.filter(p=>['L','R','F','C'].includes(p.position)).map(p=>{
  const last10=history.flatMap((game,i)=>{
   const row=forSide(skaters[i],sideFor(game,team)).find(x=>x.player?.id===p.id);
   return Number.isInteger(row?.goals)?[{gameId:game.id,gameDate:game.date,goals:row.goals}]:[];
  });
  return {...p,sport:'del',fixtureId:fixture.fixture.id,team:fixture.teams.home.id===team.id?fixture.teams.home.name:fixture.teams.away.name,
   lineupPosition:p.position,lineupSource:'season',participation:'Einsatz offen · Saisonposition',last10};
 });
}

export async function delAnalysis(date,mode){
 const {games}=await officialDelDay(date);
 const upcoming=games.filter(g=>g.status==='NS'&&Date.parse(g.date)>Date.now());
 if(!upcoming.length)return {games:[],players:[],candidates:[],totalFixtures:0,considered:0,errors:0};
 const [{season,teams},scheduled]=await Promise.all([context(date),mode==='scorers'?optional(fixturesFor(date)):null]);
 const fixtures=[],scorers=[],candidates=[];
 let errors=0,next=0;
 await Promise.all(Array.from({length:Math.min(2,upcoming.length)},async()=>{
  while(next<upcoming.length){
   const game=upcoming[next++],home=findTeam(teams,game.home),away=findTeam(teams,game.away);
   if(!home||!away){errors++;continue}
   try{
    const fixture=normalizeFixture(game,home,away),kickoff=Date.parse(game.date);
    fixtures.push(fixture);
    const [homeRows,awayRows]=await Promise.all([recent(home,season),recent(away,season)]);
    const h=before(homeRows,kickoff).slice(0,10),a=before(awayRows,kickoff).slice(0,10);
    if(mode==='scorers'){
     const [hr,ar]=await Promise.all([roster(home,season),roster(away,season)]);
     const [hp,ap]=await Promise.all([recentScorers(home,h,players(hr),fixture),recentScorers(away,a,players(ar),fixture)]);
     const providerGame=scheduled?.find(g=>g.home_team?.id===home.id&&g.away_team?.id===away.id);
     const published=await gameData(providerGame,'lineups');
     for(const [rows,side] of [[hp,'home'],[ap,'away']]){
      const lineup=players(forSide(published,side));
      for(const player of rows){
       const placed=lineup.find(p=>p.id===player.id);
       if(placed){player.lineupSource='current';player.participation='Bestätigter Einsatz';player.lineupPosition=placed.position||player.lineupPosition;}
       else if(lineup.length>=15)player.exclusionReason='Nicht im veröffentlichten DEL-Spielkader';
      }
     }
     scorers.push(...hp,...ap);
    }else{
     const h2h=regulationSummary(before(await headToHead(home,away),kickoff).slice(0,10),home);
     const score=h2h.played?100*h2h.draws/h2h.played:0;
     if(h2h.played>=3&&score>=25)candidates.push({sport:'del',fixtureId:game.id,kickoff:game.date,league:'DEL',type:'Unentschieden',match:game.home+' – '+game.away,score,h2h,homeForm:regulationSummary(h,home),awayForm:regulationSummary(a,away)});
    }
   }catch{errors++}
  }
 }));
 return {games:fixtures,players:scorers,candidates,totalFixtures:upcoming.length,considered:upcoming.length,errors};
}

export async function delLive(date){
 const rows=await fixturesFor(date);
 return (rows||[]).flatMap(game=>{
  const time=timestamp(game),clock=game.meta?.live;
  if(!['live','in_progress'].includes(game.status)||!Number.isFinite(time)||berlin.format(new Date(time))!==date||!game.home_team?.id||!game.away_team?.id)return [];
  const entry=normalizeFixture({id:game.id,date:new Date(time).toISOString(),status:'LIVE',home:game.home_team.name,away:game.away_team.name,homeGoals:game.home_goals,awayGoals:game.away_goals},game.home_team,game.away_team);
  if(Number.isInteger(clock?.period)&&typeof clock?.clock==='string')entry.fixture.status.clock={period:clock.period,remaining:clock.clock,periodType:'REG',intermission:clock.intermission===true};
  return [entry];
 });
}

export async function delLiveForm(date,id){
 const game=(await fixturesFor(date))?.find(g=>g.id===id);
 if(!game?.home_team?.id||!game.away_team?.id||!validId(game.season?.id,'ss'))return null;
 const [home,away]=await Promise.all([recent(game.home_team,game.season.id),recent(game.away_team,game.season.id)]);
 const normalize=rows=>before(rows,timestamp(game)).slice(0,10).map(g=>({
  fixture:{id:g.id,date:new Date(timestamp(g)).toISOString(),status:{short:'FT'}},
  teams:{home:g.home_team,away:g.away_team},goals:{home:g.home_goals,away:g.away_goals}
 }));
 return {homeRecent:{data:normalize(home)},awayRecent:{data:normalize(away)}};
}
