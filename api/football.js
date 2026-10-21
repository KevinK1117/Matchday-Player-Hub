const LEAGUES={78:'Bundesliga',79:'2. Bundesliga',39:'Premier League',140:'La Liga',61:'Ligue 1',135:'Serie A',307:'Saudi Pro League',2:'Champions League',3:'Europa League'};
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
const fixtures=await api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key);const filtered=fixtures.filter(x=>LEAGUES[x.league?.id]);const games=filtered.map(x=>({id:x.fixture.id,league:LEAGUES[x.league.id],leagueId:x.league.id,season:x.league.season,home:x.teams.home.name,away:x.teams.away.name,homeId:x.teams.home.id,awayId:x.teams.away.id,start:x.fixture.date,status:x.fixture.status?.short,homeGoals:x.goals.home,awayGoals:x.goals.away}));if(!games.length)return res.status(200).json({configured:true,games,players:[],eligible:0,notice:'Keine Spiele am gewählten Datum.',updatedAt:new Date().toISOString()});
// Top scorers are competition-specific historical season stats, not fixture-confirmed lineups.
const sets=new Map();for(const g of games)sets.set(g.leagueId+':'+g.season,{league:g.leagueId,season:g.season});const results=await Promise.allSettled([...sets.values()].map(({league,season})=>api(`/players/topscorers?league=${league}&season=${season}`,key).then(rows=>({league,rows}))));const playerByKey=new Map();for(const result of results){if(result.status!=='fulfilled')continue;const {league,rows}=result.value;for(const item of rows){for(const stat of item.statistics||[]){const matching=games.filter(g=>g.leagueId===league&&(g.homeId===stat.team?.id||g.awayId===stat.team?.id));if(!matching.length)continue;const played=Number(stat.games?.appearences||0),minutes=Number(stat.games?.minutes||0),goals=Number(stat.goals?.total||0),shots=stat.shots?.on==null?null:Number(stat.shots.on),penalties=Number(stat.penalty?.scored||0);if(!played)continue;for(const g of matching){const k=g.id+':'+item.player.id;const player={id:item.player.id,name:item.player.name,team:stat.team.name,teamId:stat.team.id,opponent:g.homeId===stat.team.id?g.away:g.home,fixtureId:g.id,league:g.league,goals,appearances:played,minutes,minutesPerGame:minutes/played,goalsPerGame:goals/played,shotsPerGame:shots===null?null:shots/played,penaltyGoals:penalties,xG:null,xG90:null,participation:'Nicht bestätigt',photo:item.player.photo,score:(goals/played)*5+(shots===null?0:shots/played)*1.7+(minutes/played)/90+penalties*.04};playerByKey.set(k,player)}}}}
// Official lineups are returned only when the provider has published them.
const lineupResults=await Promise.allSettled(games.map(async g=>{
  const rows=await api('/fixtures/lineups?fixture='+g.id,key);
  const ids=new Set();
  for(const side of rows){for(const e of side.startXI||[])if(e.player?.id)ids.add(e.player.id)}
  return {fixtureId:g.id,ids,published:rows.some(side=>(side.startXI||[]).length>0)};
}));
const lineups=new Map(lineupResults.filter(x=>x.status==='fulfilled').map(x=>[x.value.fixtureId,x.value]));
for(const p of playerByKey.values()){
  const l=lineups.get(p.fixtureId);
  p.participation=l?.published?(l.ids.has(p.id)?'Startelf bestätigt':'Nicht in bestätigter Startelf'):'Startelf nicht veröffentlicht';
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
for(const p of playerByKey.values()){
  const lineup=lineups.get(p.fixtureId);
  if(lineup?.published && !lineup.ids.has(p.id)){p.score=-Infinity;p.exclusionReason='Nicht in bestätigter Startelf'}
  else {
    const minutesFactor=Math.min(1,Math.max(0,(p.minutesPerGame||0)/85));
    const involvement=p.shotsPerGame==null?0:Math.min(4,p.shotsPerGame);
    p.score=(p.goalsPerGame*4+involvement*1.4+(p.penaltyGoals>0?0.25:0))*minutesFactor;
    if(p.xG90!=null)p.score+=Math.min(1.5,p.xG90)*2;
    p.exclusionReason=(p.minutesPerGame||0)<35?'Zu geringe durchschnittliche Einsatzzeit':null;
  }
}
let players=[...playerByKey.values()].filter(p=>!p.exclusionReason&&Number.isFinite(p.score)).sort((a,b)=>b.score-a.score||b.minutesPerGame-a.minutesPerGame);if(confirmedOnly){ // Upcoming games have no officially confirmed lineup in this API response.
players=players.filter(p=>p.participation==='Startelf bestätigt');}
// Spread initial candidates across matches, then fill any remaining places globally.
const picked=[];const seen=new Set();for(const g of games){const p=players.find(p=>p.fixtureId===g.id&&!seen.has(p.id));if(p&&picked.length<count){picked.push(p);seen.add(p.id)}}for(const p of players){if(picked.length>=count)break;if(!seen.has(p.id)){picked.push(p);seen.add(p.id)}}
const failed=results.filter(r=>r.status==='rejected').length;res.status(200).json({configured:true,games,eligible:players.length,players:picked,requested:count,updatedAt:new Date().toISOString(),notice:`Fußball: Kandidaten nur aus tatsächlich angesetzten Teams. Topscorer-Endpunkt liefert keine vollständigen Kader. Spieler außerhalb veröffentlichter Startelf und Spieler mit durchschnittlich weniger als 35 Minuten werden aus Kandidaten ausgeschlossen. Dieser Filter ist kein Nachweis für einen kommenden Einsatz. ${failed?'Einige Ligen konnten nicht geladen werden. ':''}${xgInfo}. Startelf wird ausschließlich bei veröffentlichten Aufstellungen bestätigt. Ohne verfügbare Quelle werden keine xG- oder Einsatzprognosen erfunden.`});
}catch(e){res.status(502).json({error:'Football API nicht erreichbar',detail:String(e.message)})}}
