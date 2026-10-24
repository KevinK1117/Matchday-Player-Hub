// National senior men's top divisions. Exact provider names/aliases, matched per country.
// Unknown competitions fail closed; no tier inference from the word "League".
const rows = {
 Germany:'Bundesliga|2. Bundesliga',England:'Premier League',Spain:'La Liga',Italy:'Serie A',France:'Ligue 1',Netherlands:'Eredivisie',Portugal:'Primeira Liga',Belgium:'Jupiler Pro League|First Division A',Scotland:'Premiership',Wales:'Premier League',NorthernIreland:'Premiership',Ireland:'Premier Division',Austria:'Bundesliga',Switzerland:'Super League',Turkey:'Süper Lig|Super Lig',Greece:'Super League 1|Super League',Denmark:'Superliga',Sweden:'Allsvenskan',Norway:'Eliteserien',Finland:'Veikkausliiga',Iceland:'Úrvalsdeild|Urvalsdeild|Besta deild',Poland:'Ekstraklasa',CzechRepublic:'Czech Liga',Czechia:'Czech Liga',Slovakia:'Super Liga',Hungary:'NB I',Romania:'Liga I',Bulgaria:'First League',Croatia:'HNL',Serbia:'Super Liga',Slovenia:'1. SNL',Bosnia:'Premijer Liga',BosniaHerzegovina:'Premijer Liga',BosniaAndHerzegovina:'Premijer Liga',Montenegro:'First League',Macedonia:'First League',NorthMacedonia:'First League',Albania:'Superliga',Kosovo:'Superliga',Cyprus:'1. Division',Malta:'Premier League',Luxembourg:'National Division',Andorra:'1a Divisió|Primera Divisió',SanMarino:'Campionato',Gibraltar:'Premier Division|National League',FaroeIslands:'Meistaradeildin',Estonia:'Meistriliiga',Latvia:'Virsliga',Lithuania:'A Lyga',Belarus:'Premier League',Ukraine:'Premier League',Russia:'Premier League',Moldova:'Super Liga|Superliga|Divizia Națională',Georgia:'Erovnuli Liga',Armenia:'Premier League',Azerbaijan:'Premyer Liqa',Kazakhstan:'Premier League',

};
export const normalizeCompetition = v => String(v||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
const top = new Map(Object.entries(rows).map(([country,names])=>[normalizeCompetition(country),new Set(names.split('|').map(normalizeCompetition))]));
export function isTopFlight(league){
 if(!league||league.type&&league.type!=='League')return false;
 const country=normalizeCompetition(league.country),name=normalizeCompetition(league.name);
 return top.get(country)?.has(name)===true;
}
