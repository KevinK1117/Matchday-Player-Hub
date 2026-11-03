const value=x=>typeof x==='string'?x:x?.default||'';
export function footballTransfers(rows=[]){
 return rows.flatMap(row=>row.transfers||[]).filter(t=>t.teams?.in||t.teams?.out).map(t=>({date:t.date||null,type:t.type||'',from:t.teams?.out||null,to:t.teams?.in||null})).sort((a,b)=>String(b.date||'').localeCompare(String(a.date||'')));
}
export function nhlTeamHistory(player,standings=[]){
 const logos=new Map(standings.map(t=>[value(t.teamName),t.teamLogo]));
 if(player.fullTeamName&&player.teamLogo)logos.set(value(player.fullTeamName),player.teamLogo);
 const rows=(player.seasonTotals||[]).filter(r=>r.leagueAbbrev==='NHL'&&r.gameTypeId===2&&value(r.teamName)&&!['TOT','Total'].includes(value(r.teamName))).sort((a,b)=>Number(a.season)-Number(b.season)||Number(a.sequence)-Number(b.sequence));
 const history=[];
 for(const row of rows){const name=value(row.teamName),last=history.at(-1);if(last?.name===name){last.until=row.season;continue}history.push({name,since:row.season,until:row.season,logo:logos.get(name)||null})}
 return history.reverse();
}
