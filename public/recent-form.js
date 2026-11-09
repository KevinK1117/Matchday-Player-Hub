// Descriptive recent form only. No season totals, market prices or H2H influence.
export function scorerRecentForm(p,cutoff=Date.now()){
 if(p.recentFormComplete===false)return null;
 const input=p.recentAppearances||p.last10||p.last5||[],seen=new Set();
 const rows=input.filter(x=>{const date=Date.parse(x.date||x.gameDate);return Number.isFinite(date)&&date<cutoff&&x.goals!=null&&Number.isInteger(Number(x.goals))&&Number(x.goals)>=0&&x.available!==false}).sort((a,b)=>Date.parse(b.date||b.gameDate)-Date.parse(a.date||a.gameDate)).filter(x=>{const id=x.gameId||x.fixtureId||x.date||x.gameDate;if(seen.has(id))return false;seen.add(id);return true}).slice(0,10);
 if(rows.length<5)return null;
 const games=rows.length,goals=rows.reduce((n,x)=>n+Number(x.goals),0),hitGames=rows.filter(x=>Number(x.goals)>0).length;
 if(hitGames<Math.ceil(games*.4))return null;
 return {version:'recent-form-v1',games,goals,hitGames,hitRate:hitGames/games,goalsPerGame:goals/games,probability:100*hitGames/games,expectedGoals:goals/games,calibrated:false};
}
export function liveRecentForm(home,away){
 if(!home||!away||home.sample<5||away.sample<5||home.scoringRate<.6||away.scoringRate<.6)return null;
 return {sample:Math.min(home.sample,away.sample),home,away,score:(home.scoringRate+away.scoringRate)/2,label:'Regelmäßige Tore · letzte 5–10',reason:'Heimteam traf in '+home.scoringGames+'/'+home.sample+' Spielen; Gastteam in '+away.scoringGames+'/'+away.sample+'. Beschreibt vergangene ganze Spiele, keine Wahrscheinlichkeit für ein spätes Tor.'};
}
export function teamRecentForm(games,teamId,before=Date.now()){
 const seen=new Set();const rows=(games||[]).filter(g=>['FT','AET','PEN','OFF','FINAL','AOT','AP'].includes(g.fixture?.status?.short)&&Date.parse(g.fixture.date)<before&&[g.teams?.home?.id,g.teams?.away?.id].some(id=>String(id)===String(teamId))).sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).filter(g=>{const id=g.fixture.id;if(seen.has(id))return false;seen.add(id);return true}).slice(0,10);
 const values=rows.map(g=>{const h=String(g.teams.home.id)===String(teamId),score=g.score?.fulltime?.home!=null&&g.score?.fulltime?.away!=null?g.score.fulltime:g.goals;return {goals:h?score?.home:score?.away,against:h?score?.away:score?.home}});
 if(values.length<5||values.some(x=>x.goals==null||x.against==null))return null;
 const n=values.length,scoringGames=values.filter(x=>x.goals>0).length;
 return {sample:n,scoringGames,scoringRate:scoringGames/n,goalsFor:values.reduce((a,x)=>a+x.goals,0)/n,goalsAgainst:values.reduce((a,x)=>a+x.against,0)/n};
}
