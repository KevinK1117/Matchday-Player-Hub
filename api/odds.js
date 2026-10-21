// Odds from a licensed normalized feed, API-Sports football, or optional The Odds API.
// Never infer sportsbook prices or turn a different betting market into "anytime scorer".
const SPORTS=new Set(['nhl','football']);
const cache=new Map();
const cacheGet=k=>{const v=cache.get(k);return v&&v.until>Date.now()?v.data:null};
const cacheSet=(k,data,minutes=10)=>{cache.set(k,{data,until:Date.now()+minutes*60000});if(cache.size>60)cache.delete(cache.keys().next().value);return data};
const validQuote=q=>q&&typeof q.bookmaker==='string'&&q.bookmaker.trim()&&typeof q.market==='string'&&q.market.trim()&&q.fixtureId!=null&&(q.selection!=null||q.playerId!=null||typeof q.playerName==='string'&&q.playerName.trim())&&Number.isFinite(Number(q.decimal))&&Number(q.decimal)>1&&Number(q.decimal)<1000;
const clean=qs=>qs.filter(validQuote).map(q=>({fixtureId:Number.isInteger(Number(q.fixtureId))?Number(q.fixtureId):String(q.fixtureId),playerId:q.playerId==null?null:String(q.playerId),playerName:q.playerName?String(q.playerName).trim():null,bookmaker:q.bookmaker.trim(),market:String(q.market).trim(),selection:q.selection==null?null:String(q.selection),decimal:Number(q.decimal),updatedAt:q.updatedAt||null}));
const respond=(res,source,quotes,notice='',updatedAt=null)=>res.status(200).json({configured:quotes.length>0,source,quotes:clean(quotes),notice,updatedAt:updatedAt||new Date().toISOString()});
async function json(url,headers={}){
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw Error('Quoten-API HTTP '+response.status);
 const data=await response.json();
 if(data?.errors&&(Array.isArray(data.errors)?data.errors.length:Object.keys(data.errors).length))throw Error('API-Fehler: '+JSON.stringify(data.errors).slice(0,130));
 return data;
}
function normalize(s){return String(s||'').normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'')}
async function licensed(date,sport){
 const endpoint=process.env.ODDS_FEED_URL;if(!endpoint)return null;
 const u=new URL(endpoint);if(u.protocol!=='https:')throw Error('ODDS_FEED_URL muss HTTPS verwenden');
 u.searchParams.set('date',date);u.searchParams.set('sport',sport);
 const h={Accept:'application/json'};if(process.env.ODDS_FEED_TOKEN)h.Authorization='Bearer '+process.env.ODDS_FEED_TOKEN;
 const d=await json(u.toString(),h);
 return {source:d.source||'Lizenzierter Quotenfeed',quotes:clean(Array.isArray(d.quotes)?d.quotes:[]),updatedAt:d.updatedAt||null};
}
async function footballOdds(date){
 const key=process.env.API_SPORTS_KEY;if(!key)return null;
 const headers={'x-apisports-key':key,Accept:'application/json'};
 const root='https://v3.football.api-sports.io';
 const catalogue=cacheGet('market-catalogue')||cacheSet('market-catalogue',await json(root+'/odds/bets?search=scorer',headers),1440);
 const markets=(catalogue.response||[]).filter(b=>/anytime\s*goal\s*scorer|any\s*time\s*scorer|to score at any time|player to score anytime/i.test(String(b.name||'')));
 if(!markets.length)return {source:'API-Sports',quotes:[],notice:'API-Sports bietet im abgefragten Vormarkt-Katalog keinen eindeutigen Anytime-Torschützenmarkt.'};
 const all=[];
 for(const market of markets.slice(0,8)){
  for(let page=1;page<=3;page++){
   const d=await json(root+'/odds?date='+date+'&bet='+market.id+'&page='+page,headers);
   for(const game of d.response||[])for(const book of game.bookmakers||[])for(const bet of book.bets||[]){
    if(Number(bet.id)!==Number(market.id))continue;
    for(const pick of bet.values||[]){
     const name=String(pick.value||'').trim(),decimal=Number(pick.odd);
     if(name&&Number.isFinite(decimal)&&decimal>1)all.push({fixtureId:game.fixture?.id,selection:name,playerName:/scor/i.test(market.name)?name:null,bookmaker:book.name,market:String(market.name),decimal,updatedAt:game.update||null});
    }
   }
   if(!d.paging||d.paging.current>=d.paging.total)break;
  }
 }
 return {source:'API-Sports · mehrere Buchmacher',quotes:clean(all),notice:all.length?'Torschützenquoten nach Namen und Spiel eindeutig abgleichen.':'In den verfügbaren API-Sports-Begegnungen derzeit keine Anytime-Torschützenquoten.'};
}
const NHL_TEAMS={ANA:'Anaheim Ducks',BOS:'Boston Bruins',BUF:'Buffalo Sabres',CAR:'Carolina Hurricanes',CBJ:'Columbus Blue Jackets',CGY:'Calgary Flames',CHI:'Chicago Blackhawks',COL:'Colorado Avalanche',DAL:'Dallas Stars',DET:'Detroit Red Wings',EDM:'Edmonton Oilers',FLA:'Florida Panthers',LAK:'Los Angeles Kings',MIN:'Minnesota Wild',MTL:'Montreal Canadiens',NJD:'New Jersey Devils',NSH:'Nashville Predators',NYI:'New York Islanders',NYR:'New York Rangers',OTT:'Ottawa Senators',PHI:'Philadelphia Flyers',PIT:'Pittsburgh Penguins',SEA:'Seattle Kraken',SJS:'San Jose Sharks',STL:'St Louis Blues',TBL:'Tampa Bay Lightning',TOR:'Toronto Maple Leafs',UTA:'Utah Mammoth',VAN:'Vancouver Canucks',VGK:'Vegas Golden Knights',WPG:'Winnipeg Jets',WSH:'Washington Capitals'};
async function nhlOdds(date){
 const key=process.env.THE_ODDS_API_KEY;if(!key)return null;
 const root='https://api.the-odds-api.com/v4/sports/icehockey_nhl',q='apiKey='+encodeURIComponent(key);
 const [schedule,events]=await Promise.all([json('https://api-web.nhle.com/v1/score/'+date),json(root+'/events?'+q)]);
 const games=(schedule.games||[]).filter(g=>g.homeTeam?.abbrev&&g.awayTeam?.abbrev);
 const matches=[];
 for(const g of games){
  const h=normalize(NHL_TEAMS[g.homeTeam.abbrev]||g.homeTeam.abbrev),a=normalize(NHL_TEAMS[g.awayTeam.abbrev]||g.awayTeam.abbrev);
  const e=events.find(x=>normalize(x.home_team)===h&&normalize(x.away_team)===a&&Math.abs(new Date(x.commence_time)-new Date(g.startTimeUTC))<5400000);
  if(e)matches.push({game:g,event:e});
 }
 const region=String(process.env.ODDS_REGIONS||'us').split(',').filter(x=>['us','uk','eu','au'].includes(x)).slice(0,2).join(',')||'us';
 const quotes=[];
 // Limit billable event-odds requests. Credit use depends on markets and regions.
 for(const {game,event} of matches.slice(0,10)){
  try{
   const data=await json(root+'/events/'+encodeURIComponent(event.id)+'/odds?'+q+'&regions='+region+'&markets=player_goal_scorer_anytime&oddsFormat=decimal');
   for(const book of data.bookmakers||[])for(const market of book.markets||[]){
    if(market.key!=='player_goal_scorer_anytime')continue;
    for(const outcome of market.outcomes||[]){
     if(String(outcome.name).toLowerCase()!=='yes'||!outcome.description)continue;
     quotes.push({fixtureId:game.id,playerName:outcome.description,bookmaker:book.title||book.key,decimal:outcome.price,market:'anytime_goalscorer',updatedAt:market.last_update||book.last_update});
    }
   }
  }catch(e){if(/401|403|429/.test(String(e.message)))break;}
 }
 return {source:'The Odds API · NHL-Buchmacher',quotes:clean(quotes),notice:quotes.length?'NHL-Märkte des angebundenen Odds-API-Tarifs.':'Keine NHL-Torschützenquoten verfügbar. Markt- und Tarifabdeckung können eingeschränkt sein.'};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=600, stale-while-revalidate=120');
 const date=String(req.query?.date||''),sport=String(req.query?.sport||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!SPORTS.has(sport))return res.status(400).json({error:'Ungültiges Datum oder Sport'});
 const k=sport+':'+date;const saved=cacheGet(k);if(saved)return res.status(200).json(saved);
 const providers=[];const errors=[];
 const tasks=[licensed(date,sport)];
 if(sport==='football')tasks.push(footballOdds(date));else tasks.push(nhlOdds(date));
 const outcomes=await Promise.allSettled(tasks);
 for(const result of outcomes){
  if(result.status==='fulfilled'&&result.value)providers.push(result.value);
  else if(result.status==='rejected')errors.push(String(result.reason?.message||result.reason).slice(0,120));
 }
 const qs=clean(providers.flatMap(p=>p.quotes||[]));
 const bookies=[...new Set(qs.map(q=>q.bookmaker))];
 const result={configured:qs.length>0,source:providers.map(p=>p.source).join(' + ')||null,bookmakers:bookies,quotes:qs,updatedAt:new Date().toISOString(),notice:providers.map(p=>p.notice).filter(Boolean).join(' ')||(!providers.length?'Kein Quotenanbieter konfiguriert. Für NHL optional THE_ODDS_API_KEY hinterlegen.':'Keine geprüften Torschützenquoten vorhanden.'),issues:errors};
 cacheSet(k,result,10);return res.status(200).json(result);
}
