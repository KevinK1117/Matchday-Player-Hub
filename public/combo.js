const normalize=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
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
 if(p.exclusionReason||p.participation==='Nicht in bestätigter Startelf'||confirmedOnly&&!(nhl?p.participation==='Bestätigter Einsatz':p.participation==='Startelf bestätigt')||!(p.goals>0))continue;
 if(nhl?!(p.GP>=5):!(p.minutes>=270&&p.minutesPerGame>=45))continue;
 const shotRate=Number(p.shotsPerGame);if(!Number.isFinite(shotRate)||shotRate<=0)continue;
 const score=nhl?(p.goals/p.GP)*4+Math.min(7,shotRate)*.7+(p.ppgoals||0)/p.GP*.5:(p.goals*90/p.minutes)*4+Math.min(4,shotRate)*1.4+Math.min(1,p.minutesPerGame/90)+(p.xG90==null?0:Math.min(1.5,p.xG90));
 const name=String(q.bookmaker),map=groups.get(name)||new Map(),id=String(q.fixtureId)+':'+p.id,old=map.get(id);
 const pick={...q,decimal:Number(q.decimal),game,player:p,score};
 if(!old||time>Date.parse(old.updatedAt))map.set(id,pick);groups.set(name,map);
 }
 let best=[],bookmaker=null;
 for(const [name,map] of groups){const counts=new Map(),seen=new Set(),list=[];for(const p of [...map.values()].sort((a,b)=>b.score-a.score)){const id=String(p.fixtureId),pid=String(p.player.id);if((counts.get(id)||0)>=4||seen.has(pid))continue;counts.set(id,(counts.get(id)||0)+1);seen.add(pid);list.push(p)}if(list.length>best.length||list.length===best.length&&list.slice(0,count).reduce((s,p)=>s+p.score,0)>best.slice(0,count).reduce((s,p)=>s+p.score,0)){best=list;bookmaker=name}}
 if(best.length<count)return {picks:[],available:best.length,bookmaker,notice:'Nur '+best.length+' geeignete Torschützen mit aktuellen Quoten bei einem Buchmacher (maximal vier pro Spiel). Keine '+count+'er-Kombi verfügbar. Fehlende Plätze werden nicht aufgefüllt.'};
 const picks=best.slice(0,count),counts=new Map();for(const p of picks)counts.set(String(p.fixtureId),(counts.get(String(p.fixtureId))||0)+1);const correlated=[...counts.values()].some(n=>n>1);
 return {picks,bookmaker,available:best.length,correlated,total:correlated?null:picks.reduce((s,p)=>s*p.decimal,1),indicativeProduct:picks.reduce((s,p)=>s*p.decimal,1),notice:'Statistik-Ranking, keine kalibrierte Trefferwahrscheinlichkeit. Maximal vier Torschützen pro Begegnung.'+(correlated?' Mehrere Spieler aus demselben Spiel: Märkte sind abhängig. Der Buchmacher muss Kombinierbarkeit und tatsächliche Kombiquote bestätigen.':'')};
}
