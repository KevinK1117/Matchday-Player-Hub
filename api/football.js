import {isScorerCompetition} from '../public/competitions.js';
import {getFlashscoreEvidence} from '../lib/flashscore-evidence.js';
const ROOT='https://v3.football.api-sports.io';
async function api(path,key){const r=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(16000)});if(!r.ok)throw Error('API-Sports HTTP '+r.status);const j=await r.json();if(j.errors && (Array.isArray(j.errors)?j.errors.length:Object.keys(j.errors).length))throw Error('API-Sports: '+JSON.stringify(j.errors).slice(0,140));return j.response||[]}
// Optional licensed xG provider JSON adapter; keyed by API-Sports fixture and player IDs.
// Example response: {"players":[{"fixtureId":123,"playerId":456,"xG":0.72,"minutes":80}]}
async function xgFeed(date) {
  const root=process.env.XG_FEED_URL;
  if(!root)return [];
  const u=new URL(root);
  if(u.protocol!=='https:')throw Error('XG_FEED_URL muss HTTPS verwenden');
  u.searchParams.set('date',date);
  const headers=process.env.XG_FEED_TOKEN?{Authorization:'Bearer '+process.env.XG_FEED_TOKEN}:{};
  const r=await fetch(u,{headers,signal:AbortSignal.timeout(8000)});
  if(!r.ok)throw Error('xG-Feed HTTP '+r.status);
  const data=await r.json();
  return Array.isArray(data.players)?data.players:[];
}
const safeDate=s=>/^\d{4}-\d{2}-\d{2}$/.test(s);
export default async function handler(req,res){res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=300');const key=process.env.API_SPORTS_KEY;if(!key)return res.status(200).json({configured:false,games:[],players:[],eligible:0,notice:'API_SPORTS_KEY fehlt. Bitte als verschlüsselte Vercel-Umgebungsvariable setzen. Keine Daten erfunden.'});const date=String(req.query.date||'');if(!safeDate(date))return res.status(400).json({error:'Ungültiges Datum'});const count=Math.max(6,Math.min(10,Number(req.query.count)||8));const confirmedOnly=req.query.confirmed==='1';try{
const fixtures=await api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key);const filtered=fixtures.filter(x=>isScorerCompetition(x.league));const allGames=filtered.map(x=>({id:x.fixture.id,league:x.league.name,leagueId:x.league.id,season:x.league.season,home:x.teams.home.name,away:x.teams.away.name,homeId:x.teams.home.id,awayId:x.teams.away.id,start:x.fixture.date,status:x.fixture.status?.short,homeGoals:x.goals.home,awayGoals:x.goals.away}));
if(!allGames.length)return res.status(200).json({configured:true,games:[],players:[],allPlayers:[],coverage:[],eligible:0,notice:'Keine freigeschalteten Spiele am gewählten Datum.',updatedAt:new Date().toISOString()});
const preferred=[78,79,135,39,61,140,307,2,3,1,4,5,88,94,40,136,62,141,203,179,180,113,114];
const wantedLeague=Number(req.query.league||0);
const future=allGames.filter(g=>g.status==='NS'&&Date.parse(g.start)>Date.now()+300000);
const relevant=wantedLeague?future.filter(g=>g.leagueId===wantedLeague):future;
const priorityIndex=id=>{const at=preferred.indexOf(id);return at<0?1000:at};
const leagueIds=[...new Set(relevant.map(g=>g.leagueId))].sort((a,b)=>priorityIndex(a)-priorityIndex(b)||a-b);
// Every enabled league with an upcoming fixture is considered, not just the first 16.
const chosen=new Set(leagueIds);
const games=relevant.filter(g=>chosen.has(g.leagueId));
if(!games.length)return res.status(200).json({configured:true,games:[],players:[],allPlayers:[],coverage:[],eligible:0,notice:'Keine kommenden Spiele für die ausgewählte Liga am gewählten Tag.',updatedAt:new Date().toISOString()});
// Top scorers are competition-specific historical season stats, not fixture-confirmed lineups.
const sets=new Map();for(const g of games)sets.set(g.leagueId+':'+g.season,{league:g.leagueId,season:g.season});const results=await Promise.allSettled([...sets.values()].map(({league,season})=>api(`/players/topscorers?league=${league}&season=${season}`,key).then(rows=>({league,rows}))));
const representedTeams=new Set();
for(const r of results)if(r.status==='fulfilled')for(const item of r.value.rows)for(const st of item.statistics||[])if(st.team?.id)representedTeams.add(Number(st.team.id));
// Broaden the candidate pool for clubs omitted from league-wide top scorer lists.
// Additional team-stat pages are limited and spread across selected competitions.
const missingTeams=new Map();
for(const g of games)for(const id of [g.homeId,g.awayId]){
 if(!representedTeams.has(Number(id))&&!missingTeams.has(id))missingTeams.set(id,{team:id,league:g.leagueId,season:g.season});
}
// Rotate extra squad requests across leagues rather than letting fixture order
// exhaust the allowance before major leagues are reached.
const priority=preferred;
const buckets=new Map();
for(const item of missingTeams.values()){
 if(!buckets.has(item.league))buckets.set(item.league,[]);
 buckets.get(item.league).push(item);
}
const leagueOrder=[...buckets.keys()].sort((a,b)=>{
 const ai=priority.indexOf(a),bi=priority.indexOf(b);
 return (ai<0?1000:ai)-(bi<0?1000:bi)||a-b;
});
const missingSelection=[];
// Distribute additional team-stat lookups fairly across every league; no league is excluded.
const maxTeamLookups=Math.min(40,Math.max(16,leagueOrder.length*2));
while(missingSelection.length<maxTeamLookups&&leagueOrder.some(id=>buckets.get(id).length)){
 for(const id of leagueOrder){
  const next=buckets.get(id).shift();
  if(next)missingSelection.push(next);
  if(missingSelection.length>=maxTeamLookups)break;
 }
}
if(missingSelection.length){
 const extra=await Promise.allSettled(missingSelection.map(({team,league,season})=>api(`/players?team=${team}&league=${league}&season=${season}&page=1`,key).then(rows=>({league,rows}))));
 results.push(...extra);
}
// Head-to-head is evaluated only on finished meetings between these exact clubs.
// No H2H record means no evidence of superiority, not an assumed win.
const h2hGames=games.slice(0,24);
const h2hResults=await Promise.allSettled(h2hGames.map(async g=>({id:g.id,homeId:g.homeId,awayId:g.awayId,rows:await api('/fixtures/headtohead?h2h='+g.homeId+'-'+g.awayId+'&last=8',key)})));
const h2hByFixture=new Map();
for(const result of h2hResults){
 if(result.status!=='fulfilled')continue;
 const {id,homeId,awayId,rows}=result.value;
 const finished=(Array.isArray(rows)?rows:[]).filter(x=>['FT','AET','PEN'].includes(x.fixture?.status?.short)&&Number.isFinite(Number(x.goals?.home))&&Number.isFinite(Number(x.goals?.away)));
 let homeWins=0,awayWins=0,draws=0;
 for(const x of finished){
  const homeGoals=Number(x.goals.home),awayGoals=Number(x.goals.away);
  if(homeGoals===awayGoals){draws++;continue}
  const winner=homeGoals>awayGoals?Number(x.teams?.home?.id):Number(x.teams?.away?.id);
  if(winner===Number(homeId))homeWins++;
  else if(winner===Number(awayId))awayWins++;
 }
 const superiorTeamId=finished.length>=3&&homeWins!==awayWins?(homeWins>awayWins?Number(homeId):Number(awayId)):null;
 h2hByFixture.set(id,{played:finished.length,homeWins,awayWins,draws,superiorTeamId});
}
const playerByKey=new Map();for(const result of results){if(result.status!=='fulfilled')continue;const {league,rows}=result.value;for(const item of rows){for(const stat of item.statistics||[]){const matching=games.filter(g=>g.leagueId===league&&(g.homeId===stat.team?.id||g.awayId===stat.team?.id));if(!matching.length)continue;const played=Number(stat.games?.appearences||0),minutes=Number(stat.games?.minutes||0),goals=Number(stat.goals?.total||0),shots=stat.shots?.on==null?null:Number(stat.shots.on),penalties=Number(stat.penalty?.scored||0);if(!played)continue;for(const g of matching){const k=g.id+':'+item.player.id;const player={id:item.player.id,name:item.player.name,team:stat.team.name,teamId:stat.team.id,opponent:g.homeId===stat.team.id?g.away:g.home,fixtureId:g.id,league:g.league,goals,appearances:played,minutes,minutesPerGame:minutes/played,goalsPerGame:goals/played,totalShots:stat.shots?.total??null,shotsPerGame:shots===null?null:shots/played,penaltyGoals:penalties,xG:null,xG90:null,participation:'Nicht bestätigt',photo:item.player.photo,score:(goals/played)*5+(shots===null?0:shots/played)*1.7+(minutes/played)/90+penalties*.04};playerByKey.set(k,player)}}}}
// Official lineups are returned only when the provider has published them.
const lineupCandidates=games.filter(g=>{
 const gap=Date.parse(g.start)-Date.now();
 return Number.isFinite(gap)&&gap>=-600000&&gap<=90*60000;
});
const lineupResults=await Promise.allSettled(lineupCandidates.map(async g=>{
  const rows=await api('/fixtures/lineups?fixture='+g.id,key);
  const ids=new Set(),confirmedTeams=new Set();
  for(const side of rows){
   if((side.startXI||[]).length===11)confirmedTeams.add(Number(side.team?.id));
   for(const e of side.startXI||[])if(e.player?.id)ids.add(e.player.id);
  }
  return {fixtureId:g.id,ids,confirmedTeams,published:confirmedTeams.size>0,sides:rows.map(side=>({teamId:side.team?.id,formation:side.formation||null,starters:(side.startXI||[]).map(e=>({id:e.player?.id,name:e.player?.name,number:e.player?.number,position:e.player?.pos})),bench:(side.substitutes||[]).map(e=>({id:e.player?.id,name:e.player?.name,number:e.player?.number,position:e.player?.pos}))}))};
}));
const lineups=new Map(lineupResults.filter(x=>x.status==='fulfilled').map(x=>[x.value.fixtureId,x.value]));
let injuries=[],injuriesAvailable=false,injuryError=null;
try{injuries=await api('/injuries?date='+date,key);injuriesAvailable=true;}
catch(e){injuryError=String(e.message||e).slice(0,80)}
const independent=await getFlashscoreEvidence(date,'football');
const byFixturePlayer=new Map();
for(const item of injuries){
 const fixtureId=item.fixture?.id,playerId=item.player?.id;
 if(fixtureId!=null&&playerId!=null)byFixturePlayer.set(String(fixtureId)+':'+String(playerId),item);
}

for(const p of playerByKey.values()){
  const l=lineups.get(p.fixtureId);
  p.participation=l?.confirmedTeams?.has(Number(p.teamId))?(l.ids.has(p.id)?'Startelf bestätigt':'Nicht in bestätigter Startelf'):'Startelf nicht veröffentlicht';
  const injury=byFixturePlayer.get(String(p.fixtureId)+':'+String(p.id));
  if(injury){
   const type=String(injury.player?.type||injury.type||'');
   p.injuryReason=String(injury.player?.reason||injury.reason||'')||null;
   if(/missing fixture/i.test(type)){p.unavailable=true;p.participation='Ausfall gemeldet';}
   else if(/questionable/i.test(type)){p.questionable=true;p.participation=l?.confirmedTeams?.has(Number(p.teamId))&&l.ids.has(p.id)?'Startelf bestätigt':'Einsatz fraglich';}
  }

}
let xgInfo='Keine xG-Datenquelle konfiguriert';
try{
  const feed=await xgFeed(date);
  const byKey=new Map(feed.filter(x=>Number.isFinite(Number(x.fixtureId))&&Number.isFinite(Number(x.playerId))).map(x=>[String(x.fixtureId)+':'+String(x.playerId),x]));
  let populated=0;
  for(const p of playerByKey.values()){
    const row=byKey.get(String(p.fixtureId)+':'+String(p.id));
    if(row && Number.isFinite(Number(row.xG)) && row.xG!==null && Number(row.xG)>=0){
      p.xG=Number(row.xG);
      const minutes=Number(row.minutes);
      p.xG90=Number.isFinite(minutes)&&minutes>0?p.xG*90/minutes:null;
      p.xGSource='Externer xG-Feed';populated++;
    }
  }
  if(process.env.XG_FEED_URL)xgInfo=`Externer xG-Feed: ${populated} Spieler abgeglichen`;
}catch(err){xgInfo='xG-Feed nicht erreichbar: '+String(err.message).slice(0,90)}
// Only trust lineup evidence for the corresponding fixture. A known bench player is not a confirmed starter.
// Opponent defensive averages provide additional context for the highest-ranked candidate teams.
// Limit calls to avoid exhausting API-Sports daily quotas.
const likely=[...playerByKey.values()].sort((a,b)=>b.score-a.score).slice(0,15);
const opponentEntries=new Map();
for(const p of likely){
 const match=games.find(g=>g.id===p.fixtureId);if(!match)continue;
 const opponentId=match.homeId===p.teamId?match.awayId:match.homeId;
 const k=match.leagueId+':'+match.season+':'+opponentId;
 if(!opponentEntries.has(k))opponentEntries.set(k,{league:match.leagueId,season:match.season,team:opponentId});
}
const opponentStats=new Map();
const statsKeys=[...opponentEntries].slice(0,8);
const defensiveResults=await Promise.allSettled(statsKeys.map(async([id,p])=>({id,rows:await api('/teams/statistics?league='+p.league+'&season='+p.season+'&team='+p.team,key)})));
for(const r of defensiveResults){
 if(r.status!=='fulfilled')continue;
 const v=r.value.rows?.goals?.against?.average?.total;
 const goalsAgainst=v==null?null:Number(v);
 if(goalsAgainst!=null&&Number.isFinite(goalsAgainst)&&goalsAgainst>=0&&goalsAgainst<10)opponentStats.set(r.value.id,goalsAgainst);
}
for(const p of playerByKey.values()){
  const h2h=h2hByFixture.get(p.fixtureId);
  p.h2h=h2h||null;
  if(!h2h?.superiorTeamId||Number(p.teamId)!==h2h.superiorTeamId){p.exclusionReason='Kein belegter H2H-Vorteil für das Spielerteam';continue;}
  const lineup=lineups.get(p.fixtureId);
  const corroboration=independent.players.get(String(p.fixtureId)+':'+String(p.id))||null;
  if(corroboration){
    p.independentEvidence='Autorisierter Flashscore-Datenfeed';
    p.externalXG90=corroboration.xG90;
    p.externalShotsOnTarget90=corroboration.shotsOnTarget90;
    p.externalExpectedMinutes=corroboration.expectedMinutes;
    if(corroboration.status==='out'||corroboration.status==='confirmed_bench'&&lineup?.confirmedTeams?.has(Number(p.teamId)))
      {p.unavailable=true;p.participation='Extern als Ausfall/Bank gemeldet';}
    else if(corroboration.status==='doubtful'&&!lineup?.confirmedTeams?.has(Number(p.teamId))){p.questionable=true;p.participation='Einsatz fraglich';}
    if(p.xG90==null&&corroboration.xG90!=null){p.xG90=corroboration.xG90;p.xGSource='Autorisierter Flashscore-Datenfeed';}
  }
  if(p.unavailable){p.score=-Infinity;p.exclusionReason='Ausfall für diese Begegnung gemeldet'}
  else if(lineup?.confirmedTeams?.has(Number(p.teamId)) && !lineup.ids.has(p.id)){p.score=-Infinity;p.exclusionReason='Nicht in bestätigter Startelf'}
  else {
    const minutesFactor=Math.min(1,Math.max(0,(p.minutesPerGame||0)/90));
    const availabilityFactor=p.questionable?.68:1;
    const sampleFactor=.65+.35*Math.min(1,p.appearances/12);
    const involvement=p.shotsPerGame==null?0:Math.min(4,p.shotsPerGame);
    const match=games.find(g=>g.id===p.fixtureId);
    const opponentId=match?(match.homeId===p.teamId?match.awayId:match.homeId):null;
    const defensiveKey=match?match.leagueId+':'+match.season+':'+opponentId:null;
    const ga=opponentStats.get(defensiveKey);
    p.opponentGoalsAgainstPerGame=ga??null;
    const defenceFactor=ga==null?1:Math.min(1.22,Math.max(.8,.80+ga*.14));
    p.score=(p.goalsPerGame*4+involvement*1.4+(p.penaltyGoals>0?0.25:0))*minutesFactor*sampleFactor*availabilityFactor*defenceFactor;
    if(p.xG90!=null)p.score+=Math.min(1.5,p.xG90)*1.5*minutesFactor;
    if(corroboration?.shotsOnTarget90!=null&&p.minutesPerGame>0){
      const seasonShotRate90=Math.max(.2,(Number(p.shotsPerGame)||0)*90/p.minutesPerGame);
      const difference=(corroboration.shotsOnTarget90-seasonShotRate90)/seasonShotRate90;
      p.score*=1+Math.max(-.10,Math.min(.10,difference*.08));
    }
    if(corroboration?.expectedMinutes!=null){
      if(corroboration.expectedMinutes<45)p.exclusionReason='Zu geringe erwartete Einsatzzeit laut Zusatzquelle';
      else if(corroboration.expectedMinutes<65)p.score*=.78;
    }
    if((p.minutesPerGame||0)<45)p.exclusionReason='Zu geringe durchschnittliche Einsatzzeit';
    p.score=Math.max(0,p.score);
  
  }
}
let players=[...playerByKey.values()].filter(p=>!p.exclusionReason&&Number.isFinite(p.score)).sort((a,b)=>b.score-a.score||b.minutesPerGame-a.minutesPerGame);if(confirmedOnly){ // Upcoming games have no officially confirmed lineup in this API response.
players=players.filter(p=>p.participation==='Startelf bestätigt');}
// Spread initial candidates across matches, then fill any remaining places globally.
const picked=[];const seen=new Set();for(const g of games){const p=players.find(p=>p.fixtureId===g.id&&!seen.has(p.id));if(p&&picked.length<count){picked.push(p);seen.add(p.id)}}for(const p of players){if(picked.length>=count)break;if(!seen.has(p.id)){picked.push(p);seen.add(p.id)}}
const lineupDisplay=games.map(g=>({fixtureId:g.id,confirmed:!!lineups.get(g.id)?.published,teams:lineups.get(g.id)?.sides||[]}));
const failed=results.filter(r=>r.status==='rejected').length;

const coverageLeagues=[...new Map(future.map(g=>[g.leagueId,[g.leagueId,g.league,g.season]])).values()];
const coverage=coverageLeagues.map(([league,name,season])=>{
 if(wantedLeague&&league!==wantedLeague)return null;
 const leagueGames=future.filter(g=>g.leagueId===league),teamIds=[...new Set(leagueGames.flatMap(g=>[g.homeId,g.awayId]))];
 const represented=[...new Set([...playerByKey.values()].filter(p=>leagueGames.some(g=>g.id===p.fixtureId)).map(p=>Number(p.teamId)))];
 return {leagueId:league,leagueName:leagueGames[0]?.league||'',fixtures:leagueGames.length,
  teams:teamIds.length,teamsWithPlayerData:teamIds.filter(id=>represented.includes(Number(id))).length,
  players:[...new Set([...playerByKey.values()].filter(p=>leagueGames.some(g=>g.id===p.fixtureId)).map(p=>p.id))].length,
  status:!chosen.has(league)?'not_checked':results.some(r=>r.status==='fulfilled'&&r.value.league===league)?(teamIds.length===represented.length?'covered':'partial'):'unavailable'};
}).filter(Boolean);
res.status(200).json({configured:true,games,eligible:players.length,players:picked,allPlayers:players,lineupDisplay,requested:count,dataSources:['API-Sports: direkte Duelle (H2H, mindestens 3 abgeschlossene Spiele)' ,'API-Sports: Liga-Torschützenwerte',...(missingSelection.length?['API-Sports: zusätzliche Mannschafts-Statistikseiten']:[]),'API-Sports: veröffentlichte Startelf',...(injuriesAvailable?['API-Sports: Ausfälle']:[]),...(opponentStats.size?['API-Sports: Gegner-Defensivstatistik']:[]),...(process.env.XG_FEED_URL?['Externer xG-Feed (optional)']:[]),...(independent.available?['Autorisierter Flashscore-Datenfeed']:[])],coverage,h2hChecked:h2hByFixture.size,h2hRequested:h2hGames.length,coverageComplete:coverage.every(x=>x.status==='covered'),analyzedLeagues:chosen.size,totalEligibleLeagues:coverageLeagues.length,analyzedFixtures:games.length,allEligibleFixtures:future.length,dataQuality:{injuriesAvailable,injuryError,opponentTeamsChecked:statsKeys.length,defensiveStatsAvailable:opponentStats.size,additionalTeamPages:missingSelection.length,teamsWithoutPlayerData:coverage.reduce((n,x)=>n+x.teams-x.teamsWithPlayerData,0),flashscoreFeedConfigured:independent.configured,flashscoreFeedAvailable:independent.available,flashscoreMatchedPlayers:[...playerByKey.values()].filter(p=>p.independentEvidence).length,flashscoreIssue:independent.issue||null},updatedAt:new Date().toISOString(),notice:`Fußball: Scorer nur aus dem Team mit mehr Siegen in den letzten bis zu 8 direkten Duellen (mindestens 3 abgeschlossene H2H). Ohne belastbare H2H-Daten keine Auswahl. Abdeckung wird je Liga ausgewiesen. Eine Begegnung im Kalender bedeutet nicht, dass Spieler dafür erfolgreich geprüft wurden. Spieler außerhalb veröffentlichter Startelf und Spieler mit durchschnittlich weniger als 45 Minuten werden aus Kandidaten ausgeschlossen. Dieser Filter ist kein Nachweis für einen kommenden Einsatz. ${failed?'Einige Ligen konnten nicht geladen werden. ':''}${xgInfo}. Startelf wird ausschließlich bei veröffentlichten Aufstellungen bestätigt. Ohne verfügbare Quelle werden keine xG- oder Einsatzprognosen erfunden.`});
}catch(e){res.status(502).json({error:'Football API nicht erreichbar',detail:String(e.message)})}}

