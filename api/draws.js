import {isTopFlight} from '../public/competitions.js';
const ROOT='https://v3.football.api-sports.io';
const cache=new Map(),pending=new Map();
let activeRequests=0;const waiters=[];
async function providerSlot(){if(activeRequests<3)activeRequests++;else await new Promise(resolve=>waiters.push(resolve));return ()=>{const next=waiters.shift();if(next)next();else activeRequests--}}
async function api(path,key){
 const cached=cache.get(path);if(cached&&cached.until>Date.now())return cached.value;
 if(pending.has(path))return pending.get(path);
 const work=(async()=>{const release=await providerSlot();try{
 const response=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('API-Sports HTTP '+response.status);
 const body=await response.json();
 if(body.errors&&(Array.isArray(body.errors)?body.errors.length:Object.keys(body.errors).length))throw Error('API-Sports Datenabruf eingeschränkt');
 const value=body.response||[];cache.set(path,{value,until:Date.now()+600000});if(cache.size>200)cache.delete(cache.keys().next().value);return value;
 }finally{release()}})();
 pending.set(path,work);try{return await work}finally{pending.delete(path)}
}


async function externalOdds(date){
 const endpoint=process.env.MATCH_ODDS_FEED_URL;
 if(!endpoint)return {available:false,byFixture:new Map(),source:null};
 try{
  const u=new URL(endpoint);if(u.protocol!=='https:')throw Error('HTTPS erforderlich');
  u.searchParams.set('date',date);
  const headers=process.env.MATCH_ODDS_FEED_TOKEN?{Authorization:'Bearer '+process.env.MATCH_ODDS_FEED_TOKEN}:{};
  const r=await fetch(u,{headers,signal:AbortSignal.timeout(7000)});
  if(!r.ok)throw Error('Odds-Feed HTTP '+r.status);
  const body=await r.json();
  const entries=Array.isArray(body)?body:Array.isArray(body.matches)?body.matches:[];
  const byFixture=new Map();
  for(const row of entries){
   const fixtureId=Number(row.fixtureId);
   const h=Number(row.homeOdds),d=Number(row.drawOdds),a=Number(row.awayOdds);
   if(!Number.isInteger(fixtureId)||![h,d,a].every(v=>Number.isFinite(v)&&v>1.01&&v<1000))continue;
   const inverse=[1/h,1/d,1/a],sum=inverse.reduce((x,y)=>x+y,0);
   byFixture.set(fixtureId,{home:inverse[0]/sum,draw:inverse[1]/sum,away:inverse[2]/sum,bookmaker:typeof row.bookmaker==='string'?row.bookmaker.slice(0,60):'Externer Anbieter'});
  }
  return {available:byFixture.size>0,byFixture,source:'Lizenzierter externer Quotenfeed'};
 }catch(e){return {available:false,byFixture:new Map(),source:null,error:String(e.message).slice(0,80)}}
}

const completed=g=>['FT','AET','PEN'].includes(g.fixture?.status?.short)&&g.goals?.home!=null&&g.goals?.away!=null;
export function form(rows,id,date){
 const games=rows.filter(g=>completed(g)&&String(g.fixture?.date||'').slice(0,10)<date).sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).slice(0,10);
 const details=games.map(g=>{const home=Number(g.teams.home.id)===Number(id),scored=Number(home?g.goals.home:g.goals.away),conceded=Number(home?g.goals.away:g.goals.home);return {home,scored,conceded,points:scored>conceded?3:scored===conceded?1:0,draw:scored===conceded}});
 const avg=(arr,key)=>arr.length?arr.reduce((n,x)=>n+x[key],0)/arr.length:null;
 const home=details.filter(x=>x.home),away=details.filter(x=>!x.home);
 return {last5Points:details.slice(0,5).reduce((n,x)=>n+x.points,0),last5Played:details.slice(0,5).length,played:details.length,points:details.reduce((n,x)=>n+x.points,0),drawRate:avg(details,'draw'),scored:avg(details,'scored'),conceded:avg(details,'conceded'),homePlayed:home.length,awayPlayed:away.length,homePoints:avg(home,'points'),awayPoints:avg(away,'points'),homeScored:avg(home,'scored'),awayScored:avg(away,'scored')};
}
function ranks(standings,id){
 const groups=standings?.[0]?.league?.standings||[];
 const row=groups.flat().find(x=>Number(x.team?.id)===Number(id));
 return row?{rank:row.rank,points:row.points,played:row.all?.played,goalDiff:row.goalsDiff}:null;
}
async function evaluate(g,key,date,odds){
 const h=g.teams.home,a=g.teams.away;
 const [home,away,h2h,standings]=await Promise.allSettled([
  api('/fixtures?team='+h.id+'&league='+g.league.id+'&season='+g.league.season+'&last=20',key),
  api('/fixtures?team='+a.id+'&league='+g.league.id+'&season='+g.league.season+'&last=20',key),
  api('/fixtures/headtohead?h2h='+h.id+'-'+a.id+'&last=8',key),
  api('/standings?league='+g.league.id+'&season='+g.league.season,key)
 ]);
 if(home.status!=='fulfilled'||away.status!=='fulfilled'||standings.status!=='fulfilled')return {status:'providerError',picks:[]};
 const hf=form(home.value.filter(x=>Number(x.league?.id)===Number(g.league.id)),h.id,date),af=form(away.value.filter(x=>Number(x.league?.id)===Number(g.league.id)),a.id,date),hr=ranks(standings.value,h.id),ar=ranks(standings.value,a.id);
 const direct=(h2h.status==='fulfilled'?h2h.value:[]).filter(x=>completed(x)&&String(x.fixture.date).slice(0,10)<date).slice(0,8);
 const draws=direct.filter(x=>x.goals.home===x.goals.away).length;
 if(hf.played<5||af.played<5||!hr||!ar)return {status:'insufficientData',picks:[]};
 const homeRate=hf.last5Points/(hf.last5Played*3),awayRate=af.last5Points/(af.last5Played*3);
 const market=odds?.byFixture?.get(Number(g.fixture.id))||null;
 const drawSignal=(hf.drawRate+af.drawRate)/2;
 const closeRanks=Math.abs(hr.rank-ar.rank)<=6;
 const balanced=Math.abs(homeRate-awayRate)<0.23;
 const h2hDraw=direct.length?draws/direct.length:0;
 // H2H is a context signal, not the strongest input; older matches may have different squads.
 const drawScore=drawSignal*.45+h2hDraw*.08+(closeRanks?.08:0)+(balanced?.08:0)+Math.max(0,1-Math.abs(hf.homeScored-af.awayScored)/2)*.15+Math.max(0,1-Math.abs(hf.homePoints-af.awayPoints)/3)*.16;
 const picks=[];
 if(drawScore>=0.39&&drawSignal>=.25&&balanced&&Math.abs(hf.homeScored-af.awayScored)<1.1)picks.push({type:'Unentschieden',team:'X',score:Math.round(drawScore*100),reason:'Remisanteil '+Math.round(drawSignal*100)+' % · Heim-/Auswärtstore '+(hf.homeScored??0).toFixed(2)+'/'+(af.awayScored??0).toFixed(2)+' · H2H '+draws+'/'+direct.length+' · Tabellenplätze '+hr.rank+'/'+ar.rank});
 const homeUnderdog=hr.rank>ar.rank+2;
 const awayUnderdog=ar.rank>hr.rank+2;
 if(homeUnderdog&&hf.homePlayed>=3&&hf.homePoints>=1.65&&af.awayPlayed>=3&&af.awayPoints<=1.3&&hf.last5Points>=7){
  const strength=hf.homePoints-af.awayPoints;
  picks.push({type:'Außenseiter-Sieg',team:'1 · '+h.name,score:Math.round(Math.min(.85,.40+strength*.15+(direct.filter(x=>Number(x.teams.home.id)===Number(h.id)&&x.goals.home>x.goals.away).length/Math.max(1,direct.length))*.12)*100),reason:'Heimform '+hf.homePoints.toFixed(2)+' Pkt/Spiel · gegnerische Auswärtsform '+af.awayPoints.toFixed(2)+' · Tabellenplätze '+hr.rank+'/'+ar.rank+' · H2H '+direct.length+' Spiele'});
 }
 if(awayUnderdog&&af.awayPlayed>=3&&af.awayPoints>=1.65&&hf.homePlayed>=3&&hf.homePoints<=1.3&&af.last5Points>=7){
  const strength=af.awayPoints-hf.homePoints;
  picks.push({type:'Außenseiter-Sieg',team:'2 · '+a.name,score:Math.round(Math.min(.85,.40+strength*.15+(direct.filter(x=>Number(x.teams.away.id)===Number(a.id)&&x.goals.away>x.goals.home).length/Math.max(1,direct.length))*.12)*100),reason:'Auswärtsform '+af.awayPoints.toFixed(2)+' Pkt/Spiel · gegnerische Heimform '+hf.homePoints.toFixed(2)+' · Tabellenplätze '+hr.rank+'/'+ar.rank+' · H2H '+direct.length+' Spiele'});
 }
 return {status:picks.length?'candidate':'noSignal',picks:picks.map(p=>{
  const side=p.team==='X'?'draw':p.team.startsWith('1 ·')?'home':'away';
  const marketProbability=market?.[side]??null;
  // Odds are a separate plausibility check, never represented as a calibrated model probability.
  const score=Math.max(0,Math.min(100,p.score+(marketProbability==null?0:marketProbability<.12?-14:marketProbability<.20?-7:marketProbability>.40?3:0)));
  return {...p,score,marketProbability:marketProbability==null?null:Math.round(marketProbability*1000)/10,oddsSource:market?.bookmaker||null,fixtureId:g.fixture.id,match:h.name+' – '+a.name,league:g.league.name,kickoff:g.fixture.date,homeForm:hf,awayForm:af,table:{home:hr,away:ar},h2h:{played:direct.length,draws}};
 }).sort((x,y)=>y.score-x.score).slice(0,1)};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=300');
 const date=String(req.query?.date||''),count=Number(req.query?.count||6);
 if(!Number.isInteger(count)||count<6||count>10)return res.status(400).json({error:'6–10 Auswahlen wählen'});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Ungültiges Datum'});
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,picks:[],notice:'API-Sports-Zugang fehlt.'});
 try{
  const odds=await externalOdds(date);
  const fixtures=(await api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key)).filter(g=>isTopFlight(g.league)&&g.fixture?.status?.short==='NS'&&Date.parse(g.fixture.date)>Date.now());
  // Balance coverage across competitions rather than taking only the earliest 12 kickoffs.
  fixtures.sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
  const selected=[],included=new Set(),represented=new Set();
  for(const g of fixtures){
   if(selected.length===30)break;
   const league=String(g.league.id);
   if(represented.has(league))continue;
   represented.add(league);included.add(g.fixture.id);selected.push(g);
  }
  for(const g of fixtures){
   if(selected.length===30)break;
   if(!included.has(g.fixture.id)){included.add(g.fixture.id);selected.push(g)}
  }
  const results=[];for(let i=0;i<selected.length;i+=3){results.push(...await Promise.allSettled(selected.slice(i,i+3).map(g=>evaluate(g,key,date,odds))))}
  const diagnostics={providerErrors:results.filter(r=>r.status==='rejected'||r.value?.status==='providerError').length,insufficientData:results.filter(r=>r.status==='fulfilled'&&r.value?.status==='insufficientData').length,noSignal:results.filter(r=>r.status==='fulfilled'&&r.value?.status==='noSignal').length};
  const candidates=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value?.picks||[]).sort((a,b)=>b.score-a.score).slice(0,count);
  const complete=candidates.length>=count;
  let notice=!fixtures.length?'Keine kommenden Fußballspiele an diesem Tag. Anderen Tag wählen.':complete?count+'er-Auswahl verfügbar. Index ist keine Gewinnwahrscheinlichkeit.':candidates.length?candidates.length+' von '+count+' Kandidaten verfügbar. Noch keine vollständige Kombi.':diagnostics.providerErrors?'Analyse unvollständig: Datenabruf eingeschränkt. Bitte später erneut versuchen.':diagnostics.insufficientData?'Für die geprüften Spiele fehlen ausreichende Tabellen- oder Formdaten.':'Keine passenden Remis-/Außenseiter-Signale für diesen Tag.';
  if(candidates.length&&diagnostics.providerErrors)notice+=' Datenabruf teilweise eingeschränkt.';
  return res.status(200).json({configured:true,date,picks:complete?candidates:[],candidates,available:candidates.length,complete,count,diagnostics,externalOdds:{configured:!!process.env.MATCH_ODDS_FEED_URL,available:odds.available,matchedFixtures:odds.byFixture.size,error:odds.error||null},sources:['API-Sports: fixtures, form, standings, H2H',...(odds.available?['Lizenzierter externer Quotenfeed']:[])],considered:selected.length,totalFixtures:fixtures.length,updatedAt:new Date().toISOString(),notice});
 }catch(e){return res.status(502).json({error:'Analyse derzeit nicht verfügbar',detail:String(e.message).slice(0,120)})}
}
