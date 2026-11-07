const numeric=v=>v!=null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
export function recentScorerForm(log,date){
 const seen=new Set();
 const last10=log.filter(g=>g.gameDate&&g.gameDate<date).sort((a,b)=>String(b.gameDate).localeCompare(String(a.gameDate))).filter(g=>{const key=g.gameId??g.gameDate;if(seen.has(key))return false;seen.add(key);return true}).slice(0,10);
 const total=(rows,key)=>rows.length&&rows.every(g=>numeric(g[key])!=null)?rows.reduce((sum,g)=>sum+Number(g[key]),0):null;
 return {last10,last10Games:last10.length,last10Shots:last10.length===10?total(last10,'shots'):null,last5Goals:total(last10.slice(0,5),'goals')};
}
export function stabilizedShootingRate(player,history=[],season){
 // Prior three seasons, aggregate rows preferred over team splits after transfers.
 const seasons=[...new Set(history.filter(r=>r.leagueAbbrev==='NHL'&&r.gameTypeId===2&&Number(r.season)<season).map(r=>Number(r.season)))].sort((a,b)=>b-a).slice(0,3);
 let goals=0,shots=0;
 for(const yr of seasons){const rows=history.filter(r=>Number(r.season)===yr&&r.leagueAbbrev==='NHL'&&r.gameTypeId===2);const aggregate=rows.find(r=>['TOT','Total'].includes(typeof r.teamName==='string'?r.teamName:r.teamName?.default));for(const row of aggregate?[aggregate]:rows){if(numeric(row.shots)!=null&&numeric(row.goals)!=null&&row.goals<=row.shots){goals+=Number(row.goals);shots+=Number(row.shots);}}}
 const prior=shots>0?Math.max(.04,Math.min(.20,goals/shots)):.10;
 const currentShots=numeric(player.shots),currentGoals=numeric(player.goals);
 if(!currentShots||currentGoals==null||currentGoals>currentShots)return 0;
 return Math.min(.20,(currentGoals+prior*100)/(currentShots+100));
}
