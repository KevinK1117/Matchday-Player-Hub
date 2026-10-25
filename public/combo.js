// Keep a strict, evidence-based scorer ranking; missing data never creates invented picks.
function eligibleScorer(p,confirmedOnly=false){
 if(!p||p.id==null||!p.name||p.exclusionReason||p.unavailable)return false;
 const state=String(p.participation||'');
 if(state==='Ausfall gemeldet'||state.startsWith('Nicht in bestätigter Startelf')||state.startsWith('Extern als Ausfall'))return false;
 const nhl=p.sport==='nhl',confirmed=nhl?state==='Bestätigter Einsatz':state==='Startelf bestätigt';
 if(confirmedOnly&&!confirmed)return false;
 if(p.questionable&&!confirmed)return false;
 if(p.externalExpectedMinutes!=null&&Number(p.externalExpectedMinutes)<50)return false;
 const goals=Number(p.goals),shots=Number(p.shotsPerGame);
 if(!Number.isFinite(goals)||goals<2||!Number.isFinite(shots))return false;
 // Strong enough season sample and regular minutes are mandatory.
 if(nhl)return Number(p.GP)>=10&&shots>=1.5&&goals>=3;
 return Number(p.appearances)>=10&&Number(p.minutes)>=600&&Number(p.minutesPerGame)>=60&&shots>=1&&goals>=3;
}
// The scorer combination is a sport-statistics ranking without bookmaker pricing.
export function rankScorers(games,players,count,now=Date.now(),confirmedOnly=false){
 if(!Number.isInteger(count)||count<6||count>10)throw Error('6–10 Spieler wählen');
 const fixtures=new Map(games.filter(g=>g.fixture.status.short==='NS'&&Date.parse(g.fixture.date)>now+300000).map(g=>[String(g.fixture.id),g]));
 const ranked=[];
 for(const p of players){
  const game=fixtures.get(String(p.fixtureId)),nhl=p.sport==='nhl';
  if(!game||!eligibleScorer(p,confirmedOnly))continue;
  const score=Number.isFinite(Number(p.score))&&Number(p.score)>=0?Number(p.score):nhl?(p.goals/p.GP)*4+Math.min(7,Number(p.shotsPerGame))*.7+(p.ppgoals||0)/p.GP*.5:(p.goals*90/p.minutes)*4+Math.min(4,Number(p.shotsPerGame))*1.4+Math.min(1,p.minutesPerGame/90)+(p.xG90==null?0:Math.min(1.5,p.xG90));
  ranked.push({player:p,game,score});
 }
 const seen=new Set(),perGame=new Map(),eligible=[];
 for(const p of ranked.sort((a,b)=>b.score-a.score)){const id=(p.player.sport||'football')+':'+p.player.id,fixture=String(p.game.fixture.id);if(seen.has(id)||(perGame.get(fixture)||0)>=4)continue;seen.add(id);perGame.set(fixture,(perGame.get(fixture)||0)+1);eligible.push(p)}
 return {picks:eligible.slice(0,count),available:eligible.length,complete:eligible.length>=count};
}
