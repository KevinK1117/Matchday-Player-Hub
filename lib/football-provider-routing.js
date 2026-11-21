// Sportmonks v3 league IDs from the user's subscribed 18-league plan.
// API-Sports IDs are independent; never send these IDs to API-Sports.
export const SPORTMONKS_LEAGUES = Object.freeze({
  82: {name:'Bundesliga', apiSportsId:78},
  85: {name:'2. Bundesliga', apiSportsId:79},
  109: {name:'DFB Pokal', apiSportsId:81},
  166: {name:'2. Bundesliga Play-offs', apiSportsId:null},
  301: {name:'Ligue 1', apiSportsId:61},
  1673: {name:'Ligue 1 Play-offs', apiSportsId:null},
  564: {name:'La Liga', apiSportsId:140},
  567: {name:'La Liga 2', apiSportsId:141},
  72: {name:'Eredivisie', apiSportsId:88},
  384: {name:'Serie A', apiSportsId:135},
  600: {name:'Super Lig', apiSportsId:203},
  8: {name:'Premier League', apiSportsId:39},
  968: {name:'J1 League', apiSportsId:98},
  1768: {name:'J1 League Play-offs', apiSportsId:null},
  1034: {name:'K League 1', apiSportsId:292},
  501: {name:'Premiership', apiSportsId:179},
  779: {name:'Major League Soccer', apiSportsId:253},
  944: {name:'Saudi Pro League', apiSportsId:307}
});
export const SPORTMONKS_IDS = Object.freeze(Object.keys(SPORTMONKS_LEAGUES).map(Number));
export const sportmonksForApiSports = id => SPORTMONKS_IDS.find(sm => SPORTMONKS_LEAGUES[sm].apiSportsId === Number(id)) ?? null;
export const footballProviderForLeague = apiSportsId => sportmonksForApiSports(apiSportsId) !== null ? 'Sportmonks' : 'API-Sports';
