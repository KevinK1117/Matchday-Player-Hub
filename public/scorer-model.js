const number=v=>v!=null&&v!==''&&Number.isFinite(Number(v))?Number(v):null;
// A heuristic for P(at least one goal | appearance), not an empirically calibrated forecast.
// The recent window adjusts the season shot rate; it is not a second goal signal.
export function threeFactorScorer(player){
 const games=number(player.GP),goals=number(player.goals),seasonShotsPerGame=number(player.shotsPerGame),recentShots=number(player.last10Shots);
 if(games==null||!Number.isInteger(games)||games<10||goals==null||goals<0||seasonShotsPerGame==null||seasonShotsPerGame<=0||recentShots==null||recentShots<0||!Number.isInteger(recentShots)||number(player.last10Games)!==10)return null;
 const seasonShots=seasonShotsPerGame*games;
 if(goals>seasonShots||recentShots>seasonShots+1e-6)return null;
 const recentShotsPerGame=recentShots/10;
 const effectiveShotsPerGame=.70*seasonShotsPerGame+.30*recentShotsPerGame;
 // Shrink conversion towards 10% with 100 prior shots so a hot short sample cannot dominate.
 const conversion=Math.min(.20,(goals+10)/(seasonShots+100));
 const expectedGoals=effectiveShotsPerGame*conversion;
 if(!Number.isFinite(expectedGoals)||expectedGoals<0||expectedGoals>3)return null;
 return {version:'three-factor-v1',expectedGoals,probability:100*(1-Math.exp(-expectedGoals)),seasonShotsPerGame,recentShotsPerGame,goalsPerGame:goals/games,effectiveShotsPerGame,conversion,calibrated:false};
}
