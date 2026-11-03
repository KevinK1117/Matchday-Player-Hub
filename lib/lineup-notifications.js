export function confirmedLineupTeams(game,sport,payload){
 if(sport==='football')return (payload.response||[]).filter(s=>(s.startXI||[]).length===11&&[game.teams.home.id,game.teams.away.id].some(id=>String(id)===String(s.team?.id))).map(s=>({id:String(s.team.id),name:s.team.name}));
 // The NHL boxscore confirms the dressed roster once live, not tactical lines.
 if(sport!=='nhl'||!['LIVE','CRIT','FINAL','OFF'].includes(payload.gameState))return [];
 return ['home','away'].flatMap(side=>{const stats=payload.playerByGameStats?.[side+'Team'];const count=['forwards','defense','goalies'].reduce((n,k)=>n+(stats?.[k]?.length||0),0);return count>=16?[{id:String(game.teams[side].id),name:game.teams[side].name}]:[]});
}
export function lineupSignals(teams,known=[],sport){return teams.filter(t=>!known.includes(t.id)).map(t=>({id:'lineup:'+t.id,type:'lineup',label:(sport==='football'?'Aufstellung bestätigt':'Spielkader bestätigt')+' · '+t.name}));}
