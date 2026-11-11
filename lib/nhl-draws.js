export function regulationForm(games, club, kickoff) {
 const seen = new Set();
 const results = [...games].sort((a,b)=>Date.parse(b.startTimeUTC)-Date.parse(a.startTimeUTC)).filter(game=>{
  const period = game.gameOutcome?.lastPeriodType || game.periodDescriptor?.periodType;
  if (!game.id || seen.has(game.id) || !['FINAL','OFF'].includes(game.gameState) || !(Date.parse(game.startTimeUTC)<kickoff) || !['REG','OT','SO'].includes(period)) return false;
  if (![game.homeTeam?.abbrev,game.awayTeam?.abbrev].includes(club) || !Number.isInteger(game.homeTeam?.score) || !Number.isInteger(game.awayTeam?.score)) return false;
  seen.add(game.id);
  return true;
 }).slice(0,10);
 let draws=0,wins=0;
 for(const game of results){
  const period=game.gameOutcome?.lastPeriodType||game.periodDescriptor?.periodType;
  if(period==='OT'||period==='SO'){draws++;continue;}
  const home=game.homeTeam.abbrev===club;
  if(home?game.homeTeam.score>game.awayTeam.score:game.awayTeam.score>game.homeTeam.score)wins++;
 }
 return {played:results.length,draws,wins};
}
export async function analyzeNhlDraws(fixtures, loadHistory, now=Date.now()) {
 const games=fixtures.filter(g=>g.fixture?.status?.short==='NS'&&Date.parse(g.fixture.date)>now);
 const clubs=[...new Set(games.flatMap(g=>[g.teams.home.abbrev,g.teams.away.abbrev]).filter(Boolean))];
 const histories=new Map();
 let next=0;
 await Promise.all(Array.from({length:Math.min(4,clubs.length)},async()=>{
  while(next<clubs.length){
   const club=clubs[next++];
   try{histories.set(club,await loadHistory(club));}catch{histories.set(club,null);}
  }
 }));
 const candidates=[];
 let errors=0,insufficient=0;
 for(const g of games){
  const home=histories.get(g.teams.home.abbrev),away=histories.get(g.teams.away.abbrev);
  if(!home||!away){errors++;continue;}
  const kickoff=Date.parse(g.fixture.date);
  const homeForm=regulationForm(home,g.teams.home.abbrev,kickoff),awayForm=regulationForm(away,g.teams.away.abbrev,kickoff);
  if(homeForm.played<5||awayForm.played<5){insufficient++;continue;}
  const score=100*(homeForm.draws+awayForm.draws)/(homeForm.played+awayForm.played);
  if(score<20)continue;
  candidates.push({sport:'nhl',fixtureId:g.fixture.id,kickoff:g.fixture.date,league:'NHL',type:'Unentschieden',match:g.teams.home.name+' – '+g.teams.away.name,score,homeForm,awayForm});
 }
 return {candidates,totalFixtures:games.length,considered:games.length,errors,insufficient};
}
