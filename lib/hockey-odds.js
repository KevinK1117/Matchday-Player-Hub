import {normalizeName} from './football-evidence.js';

const cache=new Map();
const norm=name=>normalizeName(name);
const matches=(game,home,away,kickoff)=>norm(game.home)===norm(home)&&norm(game.away)===norm(away)&&Math.abs(Date.parse(game.start)-kickoff)<=300000;
const value=raw=>Number.isFinite(Number(raw))&&Number(raw)>1?Number(raw):null;

async function cached(key,load){
 const old=cache.get(key);
 if(old?.until>Date.now())return old.promise;
 if(cache.size>=160)cache.delete(cache.keys().next().value);
 const promise=load();
 cache.set(key,{promise,until:Date.now()+60000});
 try{return await promise}catch(e){cache.delete(key);throw e}
}
async function json(url,headers){
 const response=await fetch(url,{headers,signal:AbortSignal.timeout(6500)});
 if(!response.ok)throw Error('Quotenanbieter nicht verfügbar');
 return response.json();
}
const resultNames=new Set(['matchwinner3way','winner3way','3wayresult','regular time winner'.replaceAll(' ',''),'fulltimeresult','resultofregulartime','1x2']);
const sides={home:['home','1'],draw:['draw','x'],away:['away','2']};

function resultQuote(books,selection){
 const complete=books.filter(row=>['home','draw','away'].every(side=>value(row[side])!==null)&&row.bookmaker);
 complete.sort((a,b)=>(Date.parse(b.updatedAt)||0)-(Date.parse(a.updatedAt)||0));
 const row=complete[0];
 if(!row)return null;
 if(selection==='all')return {bookmaker:row.bookmaker,updatedAt:row.updatedAt,prices:{home:value(row.home),draw:value(row.draw),away:value(row.away)}};
 return {bookmaker:row.bookmaker,updatedAt:row.updatedAt,price:value(row[selection])};
}

async function nhlOdds({home,away,kickoff,market,selection}){
 const token=process.env.THE_ODDS_API_KEY;
 if(!token)return {status:'not_configured',quote:null};
 const endpoint='https://api.the-odds-api.com/v4/sports/icehockey_nhl/';
 const fetchOdds=async(path,params)=>json(endpoint+path+'?'+new URLSearchParams({...params,apiKey:token}));
 const games=await cached('nhl-events',()=>fetchOdds('events',{}));
 const found=games.filter(g=>matches({home:g.home_team,away:g.away_team,start:g.commence_time},home,away,kickoff));
 if(found.length!==1||!/^\w+$/.test(found[0]?.id))return {status:'no_fixture',quote:null};
 const g=found[0],marketKey=market==='scorer'?'player_goal_scorer_anytime':'h2h_3_way';
 const odds=await cached('nhl-'+g.id+marketKey,()=>fetchOdds('events/'+g.id+'/odds',{regions:market==='scorer'?'us':'us,eu',markets:marketKey,oddsFormat:'decimal'}));
 const books=(odds.bookmakers||[]).flatMap(book=>(book.markets||[]).filter(m=>m.key===marketKey).map(m=>({bookmaker:book.title,updatedAt:m.last_update||book.last_update,outcomes:m.outcomes||[]})));
 if(market==='scorer'){
  const quotes=books.flatMap(b=>b.outcomes.filter(o=>norm(o.description)===norm(selection)&&norm(o.name)==='yes'&&value(o.price)).map(o=>({bookmaker:b.bookmaker,updatedAt:b.updatedAt,price:value(o.price)})));
  return {status:quotes.length?'available':'no_quote',quote:quotes.sort((a,b)=>Date.parse(b.updatedAt)-Date.parse(a.updatedAt))[0]||null};
 }
 const quote=resultQuote(books.map(b=>{
  const price=name=>b.outcomes.find(o=>norm(o.name)===norm(name))?.price;
  return {...b,home:price(g.home_team),draw:price('Draw'),away:price(g.away_team)};
 }),selection);
 return {status:quote?'available':'no_quote',quote};
}

async function delOdds({home,away,kickoff,selection}){
 const token=process.env.API_HOCKEY_KEY||process.env.API_SPORTS_KEY;
 if(!token)return {status:'not_configured',quote:null};
 const root='https://v1.hockey.api-sports.io/';
 const call=async path=>{
  const body=await json(root+path,{'x-apisports-key':token});
  if(Object.keys(body.errors||{}).length||!Array.isArray(body.response))throw Error('DEL-Quotenzugang eingeschränkt');
  return body.response;
 };
 const day=new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date(kickoff));
 const season=Number(day.slice(0,4))-(Number(day.slice(5,7))<7?1:0);
 const league=(await cached('del-league',()=>call('leagues?search=DEL'))).find(x=>x.name==='DEL'&&Number.isInteger(x.id));
 if(!league)return {status:'no_fixture',quote:null};
 const fixtures=await cached('del-'+day,()=>call('games?league='+league.id+'&season='+season+'&date='+day+'&timezone=Europe%2FBerlin'));
 const found=fixtures.filter(g=>matches({home:g.teams?.home?.name,away:g.teams?.away?.name,start:g.date},home,away,kickoff));
 if(found.length!==1||!Number.isInteger(found[0]?.id))return {status:'no_fixture',quote:null};
 const id=found[0].id,rows=await cached('del-odds-'+id,()=>call('odds?game='+id));
 const books=rows.filter(r=>r.game?.id===id).flatMap(r=>(r.bookmakers||[]).flatMap(b=>(b.bets||[]).filter(m=>resultNames.has(norm(m.name))).map(m=>{
  const sidePrice=side=>m.values?.find(v=>sides[side].includes(norm(v.value)))?.odd;
  return {bookmaker:b.name,updatedAt:r.update,home:sidePrice('home'),draw:sidePrice('draw'),away:sidePrice('away')};
 })));
 const quote=resultQuote(books,selection);
 return {status:quote?'available':'no_quote',quote};
}

export async function hockeyOdds(sport,options){
 const source=sport==='nhl'?'The Odds API':'API-Sports Hockey';
 if(!['result','scorer'].includes(options.market)||(sport==='del'&&options.market!=='result'))return {source,status:'no_quote',quote:null};
 if(options.kickoff<=Date.now())return {source,status:'no_quote',quote:null};
 try{return {source,...await (sport==='nhl'?nhlOdds(options):delOdds(options))};}
 catch{return {source,status:'provider_unavailable',quote:null};}
}
