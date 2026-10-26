// Explicit allowlist: only competitions visible in the user's screenshots plus requested international tournaments.
// Match country AND competition name; similarly named leagues in other countries are not included.
const domestic={
 Germany:'Bundesliga|2. Bundesliga|3. Liga',
 England:'Premier League',
 Spain:'La Liga|LaLiga|La Liga2|La Liga 2|LaLiga2 Hypermotion|Segunda División|Segunda Division',
 Italy:'Serie A|Serie B',
 France:'Ligue 1',
 Netherlands:'Eredivisie',
 Norway:'Eliteserien',
 Austria:'Bundesliga',
 Poland:'Ekstraklasa|Ekstraklasa|1. Liga|I Liga',
 Portugal:'Liga Portugal|Primeira Liga|Liga Portugal Betclic',
 Scotland:'Premiership|Premier League|Championship|Division 1|League One',
 Sweden:'Allsvenskan|Superettan',
 Switzerland:'Super League|Challenge League',
 Serbia:'Super Liga',
 Singapore:'Premier League',
 CzechRepublic:'Czech Liga|1. Liga|First League|1. Liga Czech',
 Czechia:'Czech Liga|1. Liga|First League|1. Liga Czech',
 Turkey:'Süper Lig|Super Lig',
 Cyprus:'1. Division|Cyprus League|Cyprus League by Stoiximan',
 Greece:'Super League|Super League 1',
 India:'Indian Super League|ISL',
 Iraq:'Stars League|Iraqi Stars League',
 Japan:'J1 League|J2 League|J3 League',
 Croatia:'HNL',
 Denmark:'Superliga',
 Belgium:'Jupiler Pro League|Jupiler League',
 Armenia:'Premier League',
 Australia:'A-League|A-League Men',
 Finland:'Ykkösliiga|Ykkosliiga',
 SouthKorea:'K League 1',
 USA:'Major League Soccer|MLS',
 UnitedStates:'Major League Soccer|MLS',
 SaudiArabia:'Pro League|Saudi Pro League|Saudi Professional League|Roshn Saudi League|Premier League'
};
const domesticCups={Germany:'DFB Pokal|DFB-Pokal|DFB-Pokal 2026/27'};
const international={
 World:'World Cup|FIFA World Cup|UEFA Champions League|Champions League|UEFA Europa League|Europa League|Euro Championship|UEFA European Championship|UEFA EURO|UEFA Nations League|Nations League',
 Europe:'UEFA Champions League|Champions League|UEFA Europa League|Europa League|Euro Championship|UEFA European Championship|UEFA EURO|UEFA Nations League|Nations League',
 UEFA:'UEFA Champions League|Champions League|UEFA Europa League|Europa League|Euro Championship|UEFA European Championship|UEFA EURO|UEFA Nations League|Nations League'
};
export const normalizeCompetition=v=>String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const makeMap=rows=>new Map(Object.entries(rows).map(([country,names])=>[normalizeCompetition(country),new Set(names.split('|').map(normalizeCompetition))]));
const allowedDomestic=makeMap(domestic),allowedDomesticCups=makeMap(domesticCups),allowedInternational=makeMap(international);
export function isInternationalCompetition(league){
 if(!league||league.type&&league.type!=='Cup')return false;
 return allowedInternational.get(normalizeCompetition(league.country))?.has(normalizeCompetition(league.name))===true;
}
export function isTopFlight(league){
 if(!league)return false;
 if(isInternationalCompetition(league))return true;
 if((!league.type||league.type==='Cup')&&allowedDomesticCups.get(normalizeCompetition(league.country))?.has(normalizeCompetition(league.name)))return true;
 if(league.type&&league.type!=='League')return false;
 return allowedDomestic.get(normalizeCompetition(league.country))?.has(normalizeCompetition(league.name))===true;
}
export function isScorerCompetition(league){return isTopFlight(league)}
export function isDrawCompetition(league){return isTopFlight(league)}
