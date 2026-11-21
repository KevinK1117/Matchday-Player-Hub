import {sportmonksFixtures,sportmonksFixtureSummary,sportmonksRequest} from './sportmonks-client.js';
import {SPORTMONKS_LEAGUES} from './football-provider-routing.js';

// Independent Sportmonks ID namespace. Never feed these IDs into API-Sports endpoints.
const numeric=v=>v==null?null:Number.isFinite(Number(v))?Number(v):null;
const time=s=>/Z$|[+-]\d\d:\d\d$/.test(String(s))?String(s):String(s||'').replace(' ','T')+'Z';
const cache=new Map();
async function leaders(season){
 const hit=cache.get(season);if(hit&&hit.until>Date.now())return hit.rows;
 const body=await sportmonksRequest('/topscorers/seasons/'+season,{include:'player;participant;type'},300000);
 const rows=Array.isArray(body.data)?body.data:[];
 cache.set(season,{rows,until:Date.now()+300000});if(cache.size>80)cache.delete(cache.keys().next().value);
 return rows;
}
export async function sportmonksScorerAnalysis(date,count=8,leagueFilter=0){
 const feed=await sportmonksFixtures(date);
 const raw=feed.fixtures.filter(f=>!leagueFilter||Number(f.league_id)===Number(leagueFilter)||Number(SPORTMONKS_LEAGUES[f.league_id]?.apiSportsId)===Number(leagueFilter));
 const upcoming=raw.filter(f=>['NS','NOT_STARTED','SCHEDULED'].includes(String(f.state?.developer_name||''))&&Date.parse(time(f.starting_at))>Date.now()+300000);
 const games=upcoming.map(f=>{const s=sportmonksFixtureSummary(f);return {id:s.id,league:s.league,leagueId:s.leagueId,country:f.league?.country?.name||null,season:f.season_id,home:s.home,away:s.away,homeId:s.homeId,awayId:s.awayId,start:time(s.start),status:'NS',homeGoals:s.homeGoals,awayGoals:s.awayGoals,dataProvider:'Sportmonks',sportmonksLeagueId:s.leagueId}});
 const seasons=[...new Set(upcoming.map(f=>Number(f.season_id)).filter(Number.isFinite))];
 const results=await Promise.allSettled(seasons.map(async id=>({id,rows:await leaders(id)})));
 const players=[];
 const errors=results.filter(r=>r.status==='rejected').map(r=>String(r.reason?.message||r.reason).slice(0,100));
 for(const r of results){
  if(r.status!=='fulfilled')continue;
  for(const entry of r.value.rows){
   const kind=String(entry.type?.developer_name||entry.type?.name||'').toLowerCase();
   if(!/goal/.test(kind)||/own|conceded/.test(kind))continue;
   const player=entry.player||{},teamId=Number(entry.participant_id);
   const goals=numeric(entry.total);
   if(!player.id||!player.name||!teamId||goals==null)continue;
   for(const g of games.filter(g=>Number(g.season)===r.value.id&&(Number(g.homeId)===teamId||Number(g.awayId)===teamId))){
    // Topscorer aggregates do not prove minutes, shots, lineups or recent form.
    // Keep the candidate visible in coverage, but do not fabricate a scoring probability.
    players.push({id:player.id,name:player.display_name||player.name,team:teamId===Number(g.homeId)?g.home:g.away,teamId,position:entry.position?.name||null,opponent:teamId===Number(g.homeId)?g.away:g.home,fixtureId:g.id,league:g.league,statisticsLeagueId:g.leagueId,statisticsSource:'Sportmonks: Saison-Torschützen',goals,appearances:null,minutes:null,minutesPerGame:null,goalsPerGame:null,totalShots:null,shotsPerGame:null,penaltyGoals:null,xG:null,xG90:null,participation:'Startelf nicht veröffentlicht',photo:player.image_path||null,score:null,exclusionReason:'Einsatzminuten und Schussdaten nicht verifiziert',dataProvider:'Sportmonks'});
   }
  }
 }
 const coverage=games.reduce((acc,g)=>{let x=acc.find(x=>x.leagueId===g.leagueId);if(!x){x={leagueId:g.leagueId,leagueName:g.league,fixtures:0,teams:0,teamsWithPlayerData:0,players:0,status:'partial',provider:'Sportmonks'};acc.push(x)}x.fixtures++;x.teams+=2;x.players+=players.filter(p=>p.fixtureId===g.id).length;return acc},[]);
 return {games,players:[],allPlayers:players,coverage,eligible:0,errors,partial:feed.partial||errors.length>0,notice:'Sportmonks-Torschützen verfügbar; ohne belegte Einsatzminuten, Schüsse und Aufstellung keine belastbare Scorer-Empfehlung.'};
}
