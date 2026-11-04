// Historical evidence is a fallback, never confirmation of the next appearance.
export async function footballReference(team,before,api){
 const rows=await api('/fixtures?team='+Number(team)+'&last=5');
 const game=rows.filter(g=>['FT','AET','PEN'].includes(g.fixture?.status?.short)&&Date.parse(g.fixture.date)<Date.parse(before)).sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date))[0];
 if(!game)return null;
 const sides=await api('/fixtures/lineups?fixture='+game.fixture.id);
 const side=sides.find(s=>String(s.team?.id)===String(team)&&(s.startXI||[]).length===11);
 return side?{source:'last',date:game.fixture.date,fixtureId:game.fixture.id,side}:null;
}
export async function nhlReference(club,before,fetchJson){
 if(!/^[A-Z]{2,3}$/.test(club||''))return null;
 const schedule=await fetchJson('/club-schedule-season/'+club+'/now');
 const game=(schedule.games||[]).filter(g=>['OFF','FINAL'].includes(g.gameState)&&Date.parse(g.startTimeUTC)<Date.parse(before)).sort((a,b)=>Date.parse(b.startTimeUTC)-Date.parse(a.startTimeUTC))[0];
 if(!game)return null;
 const box=await fetchJson('/gamecenter/'+game.id+'/boxscore');
 const side=box.playerByGameStats?.[box.homeTeam?.abbrev===club?'homeTeam':'awayTeam'];
 return side?{source:'last',date:game.startTimeUTC,fixtureId:game.id,side}:null;
}
export function scorerRole(player,sport){
 const position=String(player.lineupPosition||'').toUpperCase();
 if(!player.lineupSource)return false;
 return sport==='nhl'?['C','L','R','LW','RW'].includes(position):['F','ST','CF','FW','ATTACKER','FORWARD'].includes(position);
}

