const ROOT='https://api-web.nhle.com/v1';
const fetchJson=async(path)=>{const r=await fetch(ROOT+path,{headers:{'Accept':'application/json'},signal:AbortSignal.timeout(12000)});if(!r.ok)throw Error(`NHL API ${r.status}`);return r.json()};
const value=o=>typeof o==='string'?o:o?.default||o?.en||'';
const sec=v=>{if(typeof v==='number')return v;const m=/^(\d+):(\d\d)$/.exec(String(v||''));return m?+m[1]*60 + +m[2]:null};
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=1200');
 const count=Math.min(10,Math.max(6,Number.parseInt(req.query.count,10)||8));const date=String(req.query.date||'');if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Ungültiges Datum'});
 try{
  const schedule=await fetchJson('/score/'+date);const games=(schedule.games||[]).map(g=>({id:g.id, start:g.startTimeUTC, state:g.gameState, away:g.awayTeam?.abbrev,home:g.homeTeam?.abbrev,awayName:value(g.awayTeam?.name)||g.awayTeam?.abbrev,homeName:value(g.homeTeam?.name)||g.homeTeam?.abbrev,awayScore:g.awayTeam?.score,homeScore:g.homeTeam?.score}));
  const clubs=[...new Set(games.flatMap(g=>[g.home,g.away]))].filter(Boolean);
  const clubStats=await Promise.allSettled(clubs.map(async club=>({club,data:await fetchJson('/club-stats/'+club+'/now')})));
  const players=[];
  for (let i=0;i<clubStats.length;i++){
   let r=clubStats[i];if(r.status!=='fulfilled')continue; const club=r.value.club;
   for(const p of r.value.data.skaters||[]){const gp=Number(p.gamesPlayed)||0,goals=Number(p.goals)||0,shots=p.shots==null?null:Number(p.shots);const ppgoals=p.powerPlayGoals==null?null:Number(p.powerPlayGoals);
    if(gp<1)continue;
    const goalsPerGame=goals/gp, shotsPerGame=shots==null?null:shots/gp;
    const score=goalsPerGame*0.58+(shotsPerGame??0)*0.11 + (ppgoals??0)/gp*0.20;
    players.push({id:p.playerId,firstName:value(p.firstName),lastName:value(p.lastName),name:[value(p.firstName),value(p.lastName)].filter(Boolean).join(' '),team:club,position:p.positionCode,GP:gp,goals,shots,ppgoals,goalsPerGame,shotsPerGame,score, xg:null,ppToi:null,toi:null});
   }
  }
  players.sort((a,b)=>b.score-a.score || b.goals-a.goals);
  const shortlist=players.slice(0,Math.min(24,players.length));
  const yr=Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);
  await Promise.allSettled(shortlist.map(async p=>{
    try{
      const log=await fetchJson(`/player/${p.id}/game-log/${yr}${yr+1}/2`);
      const entries=(log.gameLog||[]).filter(g=>g.gameDate && g.gameDate<date).sort((a,b)=>String(b.gameDate).localeCompare(String(a.gameDate))).slice(0,5);
      p.last5=entries.map(g=>({date:g.gameDate,goals:g.goals??null,shots:g.shots??null,toi:g.toi??null,powerPlayToi:g.powerPlayToi??null}));
      const times=entries.map(g=>sec(g.toi)).filter(v=>v!==null);
      p.toiLast5=times.length?times.reduce((a,b)=>a+b,0)/times.length:null;
      const power=entries.map(g=>sec(g.powerPlayToi)).filter(v=>v!==null);
      p.ppToiLast5=power.length?power.reduce((a,b)=>a+b,0)/power.length:null;
      p.last5Shots=entries.length&&entries.every(g=>g.shots!=null)?entries.reduce((a,g)=>a+Number(g.shots),0):null;
      p.last5Goals=entries.length&&entries.every(g=>g.goals!=null)?entries.reduce((a,g)=>a+Number(g.goals),0):null;
      p.participation=(log.gameLog||[]).some(g=>games.some(m=>String(m.id)===String(g.gameId)))?'Bestätigter Einsatz':'Einsatz nicht bestätigt';
    }catch{p.participation='Einsatz nicht bestätigt';p.last5=[];p.toiLast5=null;p.ppToiLast5=null;}
  }));
  for(const p of players){
    if(!p.participation)p.participation='Einsatz nicht bestätigt';
    const match=games.find(g=>g.home===p.team||g.away===p.team);
    p.opponent=match?(match.home===p.team?match.away:match.home):null;
  }
  const eligiblePlayers=req.query.confirmed==='1'?players.filter(p=>p.participation==='Bestätigter Einsatz'):players;

  // Diversity is soft: first ensure each game is represented when possible, then fill by rank.
  const picked=[];const seen=new Set();
  for(const g of games){const p=eligiblePlayers.find(p=>(p.team===g.home||p.team===g.away)&&!seen.has(p.id));if(p&&picked.length<count){picked.push(p);seen.add(p.id)}}
  for(const p of eligiblePlayers){if(picked.length>=count)break;if(!seen.has(p.id)){picked.push(p);seen.add(p.id)}}
  return res.status(200).json({date,games,players:picked,allPlayers:players,eligible:eligiblePlayers.length,requested:count,method:'Aggressive: Goals/GP × 0.58 + Shots/GP × 0.11 + Powerplay Goals/GP × 0.20. Ranking-Score, keine Torwahrscheinlichkeit.',sources:['NHL Score API','NHL Club Stats API'],notice:'Teilnahme vor Spielbeginn nicht bestätigt. Letzte fünf Spiele vor dem gewählten Datum. xG nicht verfügbar. Saisondurchschnitt ist aktueller API-Stand.',issues:clubStats.filter(s=>s.status==='rejected').length,updatedAt:new Date().toISOString()});
 }catch(e){return res.status(502).json({error:'NHL-Daten konnten nicht geladen werden',detail:String(e.message||e)})}
}
