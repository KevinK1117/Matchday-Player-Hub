import {hockeyOdds} from '../lib/hockey-odds.js';
import {normalizeName} from '../lib/football-evidence.js';

const root='https://api.sportmonks.com/v3/football/';
const cache=new Map(), pending=new Map();

function utcTime(value){
 const iso=String(value??'').replace(' ','T');
 return Date.parse(/^\d{4}-\d\d-\d\dT\d\d:\d\d(?::\d\d(?:\.\d+)?)?$/.test(iso)?iso+'Z':iso);
}

async function rows(path,params,token,ttl){
 const key=path+JSON.stringify(params);
 const cached=cache.get(key);
 if(cached?.until>Date.now())return cached.data;
 if(pending.has(key))return pending.get(key);
 const work=(async()=>{
  const data=[];
  const signal=AbortSignal.timeout(9500);
  for(let page=1;page<=8;page++){
   const url=new URL(path,root);
   url.search=new URLSearchParams({...params,per_page:50,page});
   const response=await fetch(url,{headers:{Authorization:token,Accept:'application/json'},signal});
   if(!response.ok)throw Error('Sportmonks-Quotendienst nicht verfügbar');
   const body=await response.json();
   if(!Array.isArray(body.data))throw Error('Ungültige Sportmonks-Antwort');
   data.push(...body.data);
   if(!body.pagination?.has_more)break;
  }
  cache.set(key,{data,until:Date.now()+ttl});
  if(cache.size>128)cache.delete(cache.keys().next().value);
  return data;
 })();
 pending.set(key,work);
 try{return await work;}finally{pending.delete(key);}
}

export function matchFixture(fixtures,home,away,kickoff){
 const matches=fixtures.filter(f=>{
  const time=utcTime(f.starting_at);
  const side=location=>f.participants?.find(p=>p.meta?.location===location);
  const matchesName=(p,name)=>[p?.name,p?.short_name].some(s=>s&&normalizeName(s)===normalizeName(name));
  return Number.isSafeInteger(f.id)&&Math.abs(time-kickoff)<=300000&&matchesName(side('home'),home)&&matchesName(side('away'),away);
 });
 return matches.length===1?matches[0]:null;
}

const resultMarkets=new Set(['matchwinner','fulltimeresult','1x2']);
const scorerMarkets=new Set(['anytimegoalscorer','anytimegoalscorers','goalscoreranytime','playertoscore','playertoscoreanytime','toscoreanytime']);
const totalsMarkets=new Set(['goalsoverunder','overunder','totalgoals','totalgoalsoverunder']);
const firstHalfMarkets=new Set(['firsthalfgoalsoverunder','goalsoverunderfirsthalf','goalsoverunder1sthalf','1sthalfgoalsoverunder','firsthalftotalgoals','1sthalftotalgoals','goalsoverunder1sthalftime','goalsoverunder1sthalfonly']);
const outcomes={home:['home','1'],draw:['draw','x'],away:['away','2']};

export function selectQuote(prices,market,selection,fixtureId,now=Date.now()){
 const live=market==='first-half-over'||market==='full-time-over';
 const eligible=prices.flatMap(row=>{
  if(row.fixture_id!==fixtureId||row.stopped!==false||(live&&row.suspended!==false)||row.suspended===true)return [];
  const price=Number(row.value),updated=utcTime(row.latest_bookmaker_update);
  const bookmaker=row.bookmaker?.name;
  if(!Number.isFinite(price)||price<=1||typeof bookmaker!=='string'||!bookmaker.trim())return [];
  if(live&&(!Number.isFinite(updated)||updated<now-180000||updated>now+30000))return [];
  const description=normalizeName(row.market_description);
  const labels=[row.label,row.name].map(normalizeName);
  if(market==='result'&&(!resultMarkets.has(description)||!labels.some(x=>outcomes[selection]?.includes(x))))return [];
  if(market==='scorer'&&(!scorerMarkets.has(description)||!labels.includes(normalizeName(selection))))return [];
  if(live){
   const markets=market==='first-half-over'?firstHalfMarkets:totalsMarkets;
   const line=String(row.total??'').trim();
   if(!markets.has(description)||!labels.includes('over')||!line||Number(line.replace(',','.'))!==Number(selection))return [];
  }
  return [{price,bookmaker,updatedAt:Number.isFinite(updated)?new Date(updated).toISOString():null}];
 });
 return eligible.sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0)||b.price-a.price)[0]??null;
}

export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method&&req.method!=='GET')return res.status(405).json({error:'Nur GET verfügbar'});
 const {home,away,start,market,selection,sport='football'}=req.query||{};
 const validText=s=>typeof s==='string'&&s.length<=120&&normalizeName(s).length>0;
 const live=['first-half-over','full-time-over'].includes(market);
 const validSelection=market==='result'?['home','away','draw','all'].includes(selection):market==='scorer'?validText(selection):live&&typeof selection==='string'&&/^\d{1,2}\.5$/.test(selection);
 const kickoff=typeof start==='string'&&/^\d{4}-\d\d-\d\dT/.test(start)?utcTime(start):NaN;
 if(!validText(home)||!validText(away)||!validSelection||!Number.isFinite(kickoff))return res.status(400).json({error:'Ungültiger Quotenmarkt oder Spiel'});
 if(['nhl','del'].includes(sport))return res.status(200).json(await hockeyOdds(sport,{home,away,kickoff,market,selection}));
 if(sport!=='football')return res.status(400).json({error:'Unbekannte Sportart'});
 const token=process.env.SPORTMONKS_API_TOKEN;
 const reply=(status,quote=null)=>res.status(200).json({source:'Sportmonks',status,quote});
 if(!token)return reply('not_configured');
 if(!live&&kickoff<=Date.now())return reply('no_quote');
 try{
  const date=new Date(kickoff).toISOString().slice(0,10);
  const fixtures=await rows('fixtures/date/'+date,{include:'participants'},token,300000);
  const fixture=matchFixture(fixtures,home,away,kickoff);
  if(!fixture)return reply('no_fixture');
  const type=live?'inplay':'pre-match';
  const prices=await rows('odds/'+type+'/fixtures/'+fixture.id,{include:'bookmaker'},token,live?10000:60000);
  let quote=null;
  if(market==='result'&&selection==='all'){
   const byBook=new Map();
   for(const row of prices){
    const key=row.bookmaker_id+':'+row.market_id;
    if(!byBook.has(key))byBook.set(key,[]);
    byBook.get(key).push(row);
   }
   const books=[...byBook.values()].flatMap(rows=>{
    const home=selectQuote(rows,'result','home',fixture.id),draw=selectQuote(rows,'result','draw',fixture.id),away=selectQuote(rows,'result','away',fixture.id);
    if(!home||!draw||!away)return [];
    return [{bookmaker:home.bookmaker,updatedAt:home.updatedAt,prices:{home:home.price,draw:draw.price,away:away.price}}];
   });
   quote=books.sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0))[0]||null;
  }else quote=selectQuote(prices,market,selection,fixture.id);
  return reply(quote?'available':'no_quote',quote);
 }catch{
  return reply('provider_unavailable');
 }
}
