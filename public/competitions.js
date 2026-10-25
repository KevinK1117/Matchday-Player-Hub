// European national senior men's first and second divisions. Exact provider names/aliases, matched per country.
// Unknown competitions fail closed; no tier inference from the word "League".
const rows = {
 Germany:'Bundesliga|2. Bundesliga',England:'Premier League|Championship',Spain:'La Liga|Segunda División|Segunda Division|LaLiga2|La Liga 2',Italy:'Serie A|Serie B',France:'Ligue 1|Ligue 2',Netherlands:'Eredivisie|Eerste Divisie',Portugal:'Primeira Liga|Liga Portugal 2|Segunda Liga|LigaPro',Belgium:'Jupiler Pro League|First Division A|Challenger Pro League|First Division B',Scotland:'Premiership|Championship',Wales:'Premier League|FAW Championship|Cymru North|Cymru South',NorthernIreland:'Premiership|Championship',Ireland:'Premier Division|First Division',Austria:'Bundesliga|2. Liga',Switzerland:'Super League|Challenge League',Turkey:'Süper Lig|Super Lig|1. Lig',Greece:'Super League 1|Super League|Super League 2',Denmark:'Superliga|1st Division|1. Division',Sweden:'Allsvenskan|Superettan',Norway:'Eliteserien|1. Division|OBOS-ligaen',Finland:'Veikkausliiga|Ykkösliiga|Ykkosliiga',Iceland:'Úrvalsdeild|Urvalsdeild|Besta deild|1. Deild',Poland:'Ekstraklasa|I Liga|1. Liga',CzechRepublic:'Czech Liga|FNL|National Football League|2. Liga',Czechia:'Czech Liga|FNL|National Football League|2. Liga',Slovakia:'Super Liga|1. liga|2. Liga',Hungary:'NB I|NB II',Romania:'Liga I|Liga II|Liga 2',Bulgaria:'First League|Second League',Croatia:'HNL|Prva NL|First NL|Druga HNL',Serbia:'Super Liga|Prva Liga',Slovenia:'1. SNL|2. SNL',Bosnia:'Premijer Liga|First League',BosniaHerzegovina:'Premijer Liga|First League',BosniaAndHerzegovina:'Premijer Liga|First League',Montenegro:'First League|Second League',Macedonia:'First League|Second League',NorthMacedonia:'First League|Second League',Albania:'Superliga|1st Division|First Division|Kategoria e Parë',Kosovo:'Superliga|First League',Cyprus:'1. Division|2. Division',Malta:'Premier League|Challenge League',Luxembourg:'National Division|Division of Honour',Andorra:'1a Divisió|Primera Divisió|2a Divisió|Segona Divisió',SanMarino:'Campionato',Gibraltar:'Premier Division|National League|Intermediate League',FaroeIslands:'Meistaradeildin|1. Deild',Estonia:'Meistriliiga|Esiliiga A|Esiliiga',Latvia:'Virsliga|1. Liga',Lithuania:'A Lyga|1 Lyga|I Lyga',Belarus:'Premier League|1. Division|First League',Ukraine:'Premier League|Persha Liga|First League',Moldova:'Super Liga|Superliga|Divizia Națională|Liga 1',Georgia:'Erovnuli Liga|Erovnuli Liga 2',Armenia:'Premier League|First League',Azerbaijan:'Premyer Liqa|Birinci Dasta|First Division',Kazakhstan:'Premier League|First Division',

};
export const normalizeCompetition = v => String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const top = new Map(Object.entries(rows).map(([country,names])=>[normalizeCompetition(country),new Set(names.split('|').map(normalizeCompetition))]));
export function isTopFlight(league){
 if(!league||league.type&&league.type!=='League')return false;
 const country=normalizeCompetition(league.country),name=normalizeCompetition(league.name);
 return top.get(country)?.has(name)===true;
}

/** European first/second tiers plus Saudi Pro League for selected analysis markets. */
export function isScorerCompetition(league){
 if(isTopFlight(league))return true;
 if(!league||(league.type&&league.type!=='League'))return false;
 const country=normalizeCompetition(league.country),name=normalizeCompetition(league.name);
 return country==='saudiarabia'&&new Set(['proleague','saudiproleague','saudiprofessionalleague','roshnsaudileague']).has(name);
}

/** Draws and underdog wins now use the same eligible league scope as scorers. */
export function isDrawCompetition(league){return isScorerCompetition(league)}
