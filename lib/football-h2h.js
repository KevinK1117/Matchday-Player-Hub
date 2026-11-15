export function regulationScore(game){
 const status=game.fixture?.status?.short;
 if(!['FT','AET','PEN'].includes(status))return null;
 const score=game.score?.fulltime??(status==='FT'?game.goals:null);
 return Number.isInteger(score?.home)&&Number.isInteger(score?.away)?score:null;
}

export function footballH2h(rows,homeId,awayId,kickoff){
 const seen=new Set();
 const results=[...rows].sort((a,b)=>Date.parse(b.fixture?.date)-Date.parse(a.fixture?.date)).filter(game=>{
  const id=game.fixture?.id;
  const teams=[Number(game.teams?.home?.id),Number(game.teams?.away?.id)];
  if(id==null||seen.has(id)||!(Date.parse(game.fixture.date)<kickoff)||!teams.includes(Number(homeId))||!teams.includes(Number(awayId))||!regulationScore(game))return false;
  seen.add(id);
  return true;
 }).slice(0,8);
 let homeWins=0,awayWins=0,draws=0;
 for(const game of results){
  const score=regulationScore(game);
  if(score.home===score.away){draws++;continue;}
  const winner=score.home>score.away?game.teams.home.id:game.teams.away.id;
  if(Number(winner)===Number(homeId))homeWins++;
  else awayWins++;
 }
 const played=results.length;
 const superiorTeamId=played>=3&&homeWins!==awayWins?Number(homeWins>awayWins?homeId:awayId):null;
 return {played,homeWins,awayWins,draws,superiorTeamId};
}
