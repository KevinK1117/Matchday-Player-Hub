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

// Football uses rates per 90 minutes and an explicit playing-time estimate.
export function footballThreeFactorScorer(player){
 const minutes=number(player.minutes),appearances=number(player.appearances),goals=number(player.goals),shotsPerGame=number(player.shotsPerGame);
 if(minutes==null||minutes<600||appearances==null||appearances<10||goals==null||goals<0||shotsPerGame==null||shotsPerGame<=0)return null;
 const shots=shotsPerGame*appearances;
 if(goals>shots+1e-6)return null;
 const averageMinutes=minutes/appearances;
 const suppliedMinutes=player.externalExpectedMinutes!=null;
 const estimate=suppliedMinutes?number(player.externalExpectedMinutes):averageMinutes;
 if(estimate==null||estimate<=0||suppliedMinutes&&estimate>90)return null;
 const expectedMinutes=Math.min(90,estimate);
 const shotsOnTarget90=shots*90/minutes;
 const goals90=goals*90/minutes;
 // Stabilize small samples with 20 baseline shots on target at 25% conversion.
 const conversion=Math.min(.60,(goals+5)/(shots+20));
 const expectedGoals=shotsOnTarget90*expectedMinutes/90*conversion;
 if(!Number.isFinite(expectedGoals)||expectedGoals<0||expectedGoals>3)return null;
 return {version:'football-three-factor-v1',expectedGoals,probability:100*(1-Math.exp(-expectedGoals)),shotsOnTarget90,goals90,expectedMinutes,minutesSource:suppliedMinutes?'Zusatzquelle':'Saisonschnitt',conversion,calibrated:false};
}
