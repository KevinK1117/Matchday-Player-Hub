// Odds from a licensed normalized feed, API-Sports football, or optional The Odds API.
// Never infer sportsbook prices or turn a different betting market into "anytime scorer".
const SPORTS=new Set(['nhl','football']);
const cache=new Map();
const cacheGet=k=>{const v=cache.get(k);return v&&v.until>Date.now()?v.data:null};
const cacheSet=(k,data,minutes=10)=>{cache.set(k,{data,until:Date.now()+minutes*60000});if(cache.size>60)cache.delete(cache.keys().next().value);return data};
const validQuote=q=>q&&typeof q.bookmaker==='string'&&q.bookmaker.trim()&&typeof q.market==='string'&&q.market.trim()&&q.fixtureId!=null&&(q.selection!=null||q.playerId!=null||typeof q.playerName==='string'&&q.playerName.trim())&&Number.isFinite(Number(q.decimal))&&Number(q.decimal)>1&&Number(q.decimal)<1000;
const clean=qs=>qs.filter(validQuote).map(q=>({fixtureId:Number.isInteger(Number(q.fixtureId))?Number(q.fixtureId):String(q.fixtureId),playerId:q.playerId==null?null:String(q.playerId),playerName:q.playerName?String(q.playerName).trim():null,bookmaker:q.bookmaker.trim(),market:String(q.market).trim(),selection:q.selection==null?null:String(q.selection),outcome:q.outcome==null?null:String(q.outcome),line:q.line!=null&&Number.isFinite(Number(q.line))?Number(q.line):null,marketLabel:q.marketLabel?String(q.marketLabel):null,decimal:Number(q.decimal),updatedAt:q.updatedAt||null}));
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
// Pre-match markets. Use exact market categories to avoid mislabelling corners,
 // halves or player props as full-time markets.
function footballMarket(name){
 const n=String(name||'').trim().toLowerCase();
 if(/^(match winner|fulltime result|full time result|1x2)$/.test(n))return 'match_winner';
 if(n==='double chance')return 'double_chance';
 if(/^(both teams (to )?score|both teams to score)$/.test(n))return 'both_teams_to_score';
 if(/^(goals over\/under|total goals|over\/under goals)$/.test(n))return 'total_goals';
 if(/^(anytime goal ?scorer|player to score anytime|to score at any time)$/.test(n))return 'anytime_goalscorer';
 return null;
}
function footballSelection(market,raw){
 const v=String(raw||'').trim(),n=v.toLowerCase();
 if(market==='match_winner')return /^(home|1)$/.test(n)?'home':/^(away|2)$/.test(n)?'away':/^(draw|x)$/.test(n)?'draw':null;
 if(market==='double_chance')return /^(home\/draw|1x|1\/x)$/.test(n)?'1x':/^(home\/away|12|1\/2)$/.test(n)?'12':/^(draw\/away|x2|x\/2)$/.test(n)?'x2':null;
 if(market==='both_teams_to_score')return n==='yes'?'yes':n==='no'?'no':null;
 if(market==='total_goals')return /^over\s*\d+(?:\.\d+)?$/i.test(v)?'over':/^under\s*\d+(?:\.\d+)?$/i.test(v)?'under':null;
 if(market==='anytime_goalscorer')return v? 'yes':null;
 return null;
}
async function footballOdds(date){
 const key=process.env.API_SPORTS_KEY;if(!key)return null;
 const headers={'x-apisports-key':key,Accept:'application/json'};
 const root='https://v3.football.api-sports.io';
 const quotes=[];let pages=0,otherMarkets=new Set();
 // The provider paginates by fixture (10/page), not by individual selection.
 for(let page=1;page<=4;page++){
  const d=await json(root+'/odds?date='+encodeURIComponent(date)+'&page='+page,headers);
  pages++;
  for(const game of d.response||[]){
   if(!game.fixture?.id)continue;
   for(const book of game.bookmakers||[]){
    for(const bet of book.bets||[]){
     const market=footballMarket(bet.name);
     if(!market){if(otherMarkets.size<80)otherMarkets.add(String(bet.name));continue;}
     for(const pick of bet.values||[]){
      const selected=footballSelection(market,pick.value),decimal=Number(pick.odd);
      if(!selected||!Number.isFinite(decimal)||decimal<=1||decimal>=1000)continue;
      const line=market==='total_goals'?Number(String(pick.value).match(/\d+(?:\.\d+)?/)?.[0]):null;
      if(market==='total_goals'&&(!Number.isFinite(line)||line<0.5||line>8.5))continue;
      quotes.push({fixtureId:game.fixture.id,bookmaker:book.name,market,selection:market==='anytime_goalscorer'?String(pick.value).trim():selected,playerName:market==='anytime_goalscorer'?String(pick.value).trim():null,decimal,line,updatedAt:game.update||null,marketLabel:bet.name});
     }
    }
   }
  }
  if(!d.paging||page>=Number(d.paging.total||1))break;
 }
 return {source:'API-Sports · Pre-Match Buchmacher',quotes:clean(quotes),notice:quotes.length?'Fußball-Vormarktquoten für '+pages+' Ergebnisseiten; pro Tipp ist eine getrennte Datenanalyse nötig.':'Keine verfügbaren Fußball-Vormarktquoten im abgefragten Datum.',otherMarkets:[...otherMarkets].slice(0,15)};
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
 const result={configured:qs.length>0,source:providers.map(p=>p.source).join(' + ')||null,bookmakers:bookies,quotes:qs,updatedAt:new Date().toISOString(),availableOtherMarkets:providers.flatMap(p=>p.otherMarkets||[]).slice(0,15),notice:providers.map(p=>p.notice).filter(Boolean).join(' ')||(!providers.length?'Kein Quotenanbieter konfiguriert. Für NHL optional THE_ODDS_API_KEY hinterlegen.':'Keine geprüften Torschützenquoten vorhanden.'),issues:errors};
 cacheSet(k,result,10);return res.status(200).json(result);
}
