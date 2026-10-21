const ROOT='https://api-web.nhle.com/v1';
const cache=new Map();
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const fetchJson=async(path)=>{const now=Date.now();const stored=cache.get(path);if(stored&&stored.expires>now)return stored.data;let r=await fetch(ROOT+path,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});if(r.status===429){if(stored)return stored.data;const err=new Error('NHL API 429: temporäre Anfragelimitierung');err.rateLimited=true;throw err}if(!r.ok){if(stored)return stored.data;throw Error(`NHL API ${r.status}`)}const data=await r.json();cache.set(path,{data,expires:now+(path.startsWith('/score/')?300000:1800000)});if(cache.size>300)cache.delete(cache.keys().next().value);return data};
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
  // A large parallel fan-out caused NHL API 429. Enrich only selected top-ranked players, sequentially.
  const shortlist=players.slice(0,Math.min(count,players.length));
  const yr=Number(date.slice(0,4))-(Number(date.slice(5,7))<7?1:0);
  let stoppedForRateLimit=false;
  for(const p of shortlist){
    if(stoppedForRateLimit)break;
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
    }catch(err){p.participation='Einsatz nicht bestätigt';p.last5=[];p.toiLast5=null;p.ppToiLast5=null;if(err.rateLimited)stoppedForRateLimit=true;}
    if(!stoppedForRateLimit)await pause(120);
  }
  // Re-rank with recent verified form and usage; unavailable detail adds no imaginary advantage.
  for(const p of players){
    if(p.last5?.length>=3){
      const n=p.last5.length;
      const shots=p.last5Shots==null?null:p.last5Shots/n;
      const goals=p.last5Goals==null?null:p.last5Goals/n;
      p.score = p.score*0.62 + (shots==null?0:Math.min(7,shots)*0.09) + (goals==null?0:goals*0.17);
      if(p.toiLast5!=null)p.score += Math.min(25,p.toiLast5/60)*0.006;
      if(p.ppToiLast5!=null)p.score += Math.min(8,p.ppToiLast5/60)*0.025;
    }
  }
  players.sort((a,b)=>b.score-a.score||b.goals-a.goals);
  for(const p of players){
    if(!p.participation)p.participation='Einsatz nicht bestätigt';
    const match=games.find(g=>g.home===p.team||g.away===p.team);
    p.opponent=match?(match.home===p.team?match.away:match.home):null;p.fixtureId=match?.id??null;
  }
  const eligiblePlayers=req.query.confirmed==='1'?players.filter(p=>p.participation==='Bestätigter Einsatz'):players;

  // Diversity is soft: first ensure each game is represented when possible, then fill by rank.
  const picked=[];const seen=new Set();
  for(const g of games){const p=eligiblePlayers.find(p=>(p.team===g.home||p.team===g.away)&&!seen.has(p.id));if(p&&picked.length<count){picked.push(p);seen.add(p.id)}}
  for(const p of eligiblePlayers){if(picked.length>=count)break;if(!seen.has(p.id)){picked.push(p);seen.add(p.id)}}
  return res.status(200).json({date,games,players:picked,allPlayers:players,eligible:eligiblePlayers.length,requested:count,method:'Aggressive ranking: Saison-Tore/Spiel, Schüsse/Spiel und PP-Tore; bei verfügbaren Protokollen zusätzlich Schüsse, Tore und Eiszeit der letzten fünf Spiele. Keine kalibrierte Torwahrscheinlichkeit.',sources:['NHL Score API','NHL Club Stats API'],notice:'Teilnahme vor Spielbeginn nicht bestätigt. Letzte fünf Spiele nur soweit NHL API verfügbar; bei Limitierung fehlen einzelne Detailwerte. xG nicht verfügbar. Saisondurchschnitt ist aktueller API-Stand.',issues:clubStats.filter(s=>s.status==='rejected').length,updatedAt:new Date().toISOString()});
 }catch(e){const limited=!!e.rateLimited;res.setHeader('Retry-After',limited?'180':'30');return res.status(limited?503:502).json({error:limited?'NHL API Anfragelimit erreicht':'NHL-Daten konnten nicht geladen werden',detail:limited?'NHL hat vorübergehend zu viele Anfragen registriert. Bitte in einigen Minuten erneut laden.':String(e.message||e)})}
}
