const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
// Share the same minimum evidence standards between the on-screen scorer ranking
// and the actual quoted combination. Missing data means missing picks, not guessed stats.
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
export function buildCombo(games,quotes,count,now=Date.now(),players=[],confirmedOnly=false){
 if(!Number.isInteger(count)||count<6||count>10)throw Error('6–10 Torschützen wählen');
 const fixtures=new Map(games.filter(g=>g.fixture.status.short==='NS'&&Date.parse(g.fixture.date)>now+300000).map(g=>[String(g.fixture.id),g]));
 const groups=new Map();
 for(const q of quotes){
 const game=fixtures.get(String(q.fixtureId)),time=Date.parse(q.updatedAt);
 if(!game||q.market!=='anytime_goalscorer'||!q.bookmaker||!Number.isFinite(time)||time>now+60000||now-time>6*3600000||!Number.isFinite(Number(q.decimal))||Number(q.decimal)<=1||Number(q.decimal)>1000)continue;
 if(q.outcome&&!['yes','over'].includes(String(q.outcome).toLowerCase()))continue;
 const matches=players.filter(p=>String(p.fixtureId)===String(q.fixtureId)&&(q.playerId!=null?String(p.id)===String(q.playerId):normalize(p.name)===normalize(q.playerName||q.selection)));
 if(matches.length!==1)continue;const p=matches[0],nhl=p.sport==='nhl';
 if(!eligibleScorer(p,confirmedOnly))continue;
 // Football player-goalscorer bets require an actual published XI. Before that,
 // show statistical previews only, never claim a confirmed bet combination.
 if(p.sport==='football'&&p.participation!=='Startelf bestätigt')continue;
 const shotRate=Number(p.shotsPerGame);
 const score=Number.isFinite(Number(p.score))&&Number(p.score)>=0?Number(p.score):nhl?(p.goals/p.GP)*4+Math.min(7,shotRate)*.7+(p.ppgoals||0)/p.GP*.5:(p.goals*90/p.minutes)*4+Math.min(4,shotRate)*1.4+Math.min(1,p.minutesPerGame/90)+(p.xG90==null?0:Math.min(1.5,p.xG90));
 const name=String(q.bookmaker),map=groups.get(name)||new Map(),id=String(q.fixtureId)+':'+p.id,old=map.get(id);
 const pick={...q,decimal:Number(q.decimal),game,player:p,score};
 if(!old||time>Date.parse(old.updatedAt))map.set(id,pick);groups.set(name,map);
 }
 let best=[],bookmaker=null;
 for(const [name,map] of groups){const counts=new Map(),seen=new Set(),list=[];for(const p of [...map.values()].sort((a,b)=>b.score-a.score)){const id=String(p.fixtureId),pid=String(p.player.id);if((counts.get(id)||0)>=1||seen.has(pid))continue;counts.set(id,(counts.get(id)||0)+1);seen.add(pid);list.push(p)}if(list.length>best.length||list.length===best.length&&list.slice(0,count).reduce((s,p)=>s+p.score,0)>best.slice(0,count).reduce((s,p)=>s+p.score,0)){best=list;bookmaker=name}}
 if(best.length<count)return {picks:[],available:best.length,bookmaker,notice:'Nur '+best.length+' Spieler mit geprüften Quoten und (bei Fußball) bestätigter Startelf bei einem Buchmacher verfügbar (maximal ein Tipp pro Spiel). Keine '+count+'er-Kombi verfügbar. Fehlende Plätze werden nicht aufgefüllt.'};
 const picks=best.slice(0,count),counts=new Map();for(const p of picks)counts.set(String(p.fixtureId),(counts.get(String(p.fixtureId))||0)+1);const correlated=[...counts.values()].some(n=>n>1);
 return {picks,bookmaker,available:best.length,correlated,total:correlated?null:picks.reduce((s,p)=>s*p.decimal,1),indicativeProduct:picks.reduce((s,p)=>s*p.decimal,1),notice:'Statistik-Ranking, keine kalibrierte Trefferwahrscheinlichkeit. Für eine kombinierbare Auswahl wird je Begegnung nur ein Spieler berücksichtigt.'+(correlated?' Mehrere Spieler aus demselben Spiel: Märkte sind abhängig. Der Buchmacher muss Kombinierbarkeit und tatsächliche Kombiquote bestätigen.':'')};
}

// Player analysis is useful independently of whether a bookmaker offers a price.
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
