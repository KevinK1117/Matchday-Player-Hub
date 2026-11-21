import {sportmonksRequest} from './sportmonks-client.js';
import {sportmonksForApiSports} from './football-provider-routing.js';

const norm=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^a-z0-9]/gi,'').toLowerCase();
const num=v=>v===null||v===undefined||v===''?null:Number.isFinite(Number(v))?Number(v):null;
const metric=(row,names)=>{
 const detail=(row?.details||[]).find(d=>names.includes(String(d.type?.developer_name||d.type?.name||'').toUpperCase()));
 return num(detail?.value?.total??detail?.value?.value??detail?.value);
};
// Sportmonks is strictly supplemental. Never join records by cross-provider numeric IDs.
export async function supplementPlayerProfile(profiles,apiTeamId,season){
 const original=profiles?.[0],name=original?.player?.name;
 const stats=original?.statistics||[];
 const selected=stats.find(s=>Number(s.team?.id)===Number(apiTeamId))||(!apiTeamId&&stats.length===1?stats[0]:null);
 const leagueId=selected?.league?.id,smLeague=sportmonksForApiSports(leagueId);
 if(!name||!selected?.team?.name||!smLeague||!process.env.SPORTMONKS_API_TOKEN)return {profiles,source:'API-Sports',supplemented:[]};
 try{
  const body=await sportmonksRequest('/players/search/'+encodeURIComponent(name),{include:'statistics.details.type;statistics.participant;statistics.season;teams'},180000);
  const candidates=Array.isArray(body.data)?body.data:[body.data].filter(Boolean);
  const exact=candidates.filter(p=>norm(p.display_name||p.name)===norm(name));
  if(exact.length!==1)return {profiles,source:'API-Sports',supplemented:[],reason:'Sportmonks-Spieler nicht eindeutig'};
  const player=exact[0];
  const matching=(player.statistics||[]).filter(s=>Number(s.league_id)===Number(smLeague)&&
   (norm(s.participant?.name||s.team?.name)===norm(selected.team.name))&&
   (!season||String(s.season?.starting_at||'').startsWith(String(season))||Number(s.season?.name?.slice(0,4))===Number(season)));
  if(matching.length!==1)return {profiles,source:'API-Sports',supplemented:[],reason:'Sportmonks-Team/Saison nicht eindeutig'};
  const row=matching[0],g=selected.games||(selected.games={}),goals=selected.goals||(selected.goals={}),shots=selected.shots||(selected.shots={}),supplemented=[];
  const fill=(obj,key,value,label)=>{if((obj[key]===null||obj[key]===undefined)&&value!==null&&value>=0){obj[key]=value;supplemented.push(label)}};
  fill(g,'minutes',metric(row,['MINUTES_PLAYED','MINUTES']), 'minutes');
  fill(g,'appearences',metric(row,['APPEARANCES','APPEARANCES_TOTAL']), 'appearances');
  fill(goals,'total',metric(row,['GOALS','GOALS_SCORED']), 'goals');
  fill(shots,'total',metric(row,['SHOTS_TOTAL','TOTAL_SHOTS']), 'shots');
  return {profiles,source:supplemented.length?'API-Sports + Sportmonks':'API-Sports',supplemented};
 }catch(e){return {profiles,source:'API-Sports',supplemented:[],reason:'Sportmonks-Zusatzdaten nicht verfügbar'}}
}
