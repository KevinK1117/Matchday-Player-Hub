import {isTopFlight} from '../public/competitions.js';
import {getFlashscoreEvidence} from '../lib/flashscore-evidence.js';
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


function providerPercent(value){
 if(value==null)return null;
 const n=Number(String(value).replace('%','').trim());
 return Number.isFinite(n)&&n>=0&&n<=100?n/100:null;
}
async function enrichCandidates(candidates,key,date,odds){
 // Fetch predictions only for matches that passed form and table screening.
 // Cap extra calls to protect the user's API-Sports quota.
 let injuries=[],injuriesAvailable=false;
 try{injuries=await api('/injuries?date='+date,key);injuriesAvailable=true;}catch{}
 const limited=candidates.slice(0,20);
 const enriched=await Promise.all(limited.map(async pick=>{
  let model=null,modelSource=null,modelError=null;
  try{
   const result=await api('/predictions?fixture='+pick.fixtureId,key);
   const percent=result?.[0]?.predictions?.percent||{};
   const probs={home:providerPercent(percent.home),draw:providerPercent(percent.draw),away:providerPercent(percent.away)};
   if(Object.values(probs).every(x=>x!=null)){model=probs;modelSource='API-Sports Prognosemodell';}
  }catch(e){modelError='Prognosemodell nicht verfügbar';}
  const side=pick.type==='Unentschieden'?'draw':pick.team.startsWith('1 ·')?'home':'away';
  const predictionProbability=model?.[side]??null;
  const problems=injuries.filter(x=>Number(x.fixture?.id)===Number(pick.fixtureId));
  const missing=problems.filter(x=>/Missing Fixture/i.test(String(x.player?.type||x.type||'')));
  const homeMissing=missing.filter(x=>Number(x.team?.id)===Number(pick.teamIds?.home)).length;
  const awayMissing=missing.filter(x=>Number(x.team?.id)===Number(pick.teamIds?.away)).length;
  let score=pick.score,flags=[];
  const internal=pick.modelProbability==null?null:Number(pick.modelProbability)/100;
  if(predictionProbability!=null&&internal!=null){
   const disagreement=Math.abs(predictionProbability-internal);
   if(disagreement>.20)return null;
   if(disagreement>.12){score-=8;flags.push('Abweichende Prognosemodelle – Unsicherheit erhöht');}
  }
  if(pick.marketProbability!=null&&internal!=null){
   const marketDelta=Math.abs(Number(pick.marketProbability)/100-internal);
   if(marketDelta>.22)return null;
   if(marketDelta>.13){score-=6;flags.push('Markt und Tormodell weichen deutlich voneinander ab');}
  }
  if(predictionProbability!=null){
   if(predictionProbability<.13)return null;
   if(predictionProbability<.20)score-=10;
   else if(predictionProbability>=.34)score+=5;
   flags.push('Zweite Prognose '+Math.round(predictionProbability*100)+' % (Anbieter, nicht kalibriert)');
  }else flags.push('Zweite Prognose nicht verfügbar');
  if(injuriesAvailable){
   if(side==='home'&&homeMissing>=5||side==='away'&&awayMissing>=5)return null;
   if(side==='home'&&homeMissing>=3||side==='away'&&awayMissing>=3)score-=6;
   flags.push('Gemeldete Ausfälle Heim/Gast: '+homeMissing+'/'+awayMissing);
  }else flags.push('Ausfalldaten nicht verfügbar');
  if(predictionProbability==null&&pick.marketProbability==null)return null;
  if(predictionProbability!=null&&predictionProbability<.23)return null;
  if(pick.marketProbability!=null&&Number(pick.marketProbability)<18)return null;
  const quality=(predictionProbability!=null&&pick.marketProbability!=null)?'Zwei externe Prüfungen':'Eine zusätzliche Prüfung';
  return {...pick,dataQuality:quality,score:Math.max(0,Math.min(90,score)),providerPrediction:predictionProbability==null?null:Math.round(predictionProbability*1000)/10,
    predictionsSource:modelSource,injuriesAvailable,injuries:{homeMissing,awayMissing},qualityFlags:flags,modelError,
    evidenceSources:['API-Sports: Tabelle/Form/H2H',...(modelSource?[modelSource]:[]),...(injuriesAvailable?['API-Sports: Verletzungen/Sperren']:[]),...(pick.oddsSource?['Externe Marktquoten: '+pick.oddsSource]:[])]};
 }));
 return {candidates:enriched.filter(Boolean).sort((a,b)=>b.score-a.score),injuriesAvailable,predictionsAvailable:enriched.filter(x=>x?.predictionsSource).length};
}
const completed=g=>['FT','AET','PEN'].includes(g.fixture?.status?.short)&&g.goals?.home!=null&&g.goals?.away!=null;
export function form(rows,id,date){
 const games=rows.filter(g=>completed(g)&&String(g.fixture?.date||'').slice(0,10)<date).sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).slice(0,10);
 const details=games.map(g=>{const home=Number(g.teams.home.id)===Number(id),scored=Number(home?g.goals.home:g.goals.away),conceded=Number(home?g.goals.away:g.goals.home);return {home,scored,conceded,points:scored>conceded?3:scored===conceded?1:0,draw:scored===conceded}});
 const avg=(arr,key)=>arr.length?arr.reduce((n,x)=>n+x[key],0)/arr.length:null;
 const home=details.filter(x=>x.home),away=details.filter(x=>!x.home);
 return {last5Points:details.slice(0,5).reduce((n,x)=>n+x.points,0),last5Played:details.slice(0,5).length,played:details.length,points:details.reduce((n,x)=>n+x.points,0),drawRate:avg(details,'draw'),scored:avg(details,'scored'),conceded:avg(details,'conceded'),homePlayed:home.length,awayPlayed:away.length,homePoints:avg(home,'points'),awayPoints:avg(away,'points'),homeScored:avg(home,'scored'),awayScored:avg(away,'scored'),homeConceded:avg(home,'conceded'),awayConceded:avg(away,'conceded'),last5Scored:avg(details.slice(0,5),'scored'),last5Conceded:avg(details.slice(0,5),'conceded')};
}
function ranks(standings,id){
 const groups=standings?.[0]?.league?.standings||[];
 const row=groups.flat().find(x=>Number(x.team?.id)===Number(id));
 return row?{rank:row.rank,points:row.points,played:row.all?.played,goalDiff:row.goalsDiff}:null;
}
async function evaluate(g,key,date,odds,independent){
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
 if(hf.played<6||af.played<6||hf.homePlayed<2||af.awayPlayed<2||!hr||!ar)return {status:'insufficientData',picks:[]};
 const homeRate=hf.last5Points/Math.max(1,hf.last5Played*3),awayRate=af.last5Points/Math.max(1,af.last5Played*3);
 const market=odds?.byFixture?.get(Number(g.fixture.id))||null;
 // Empirical pre-match Poisson estimate. Venue splits, season form and recent games
 // are shrunk toward neutral scoring rates to guard against small samples.
 const shrunk=(venue,overall,venueCount,recent)=>{
   const base=Number.isFinite(overall)?overall:1.3;
   const local=venueCount>=3&&Number.isFinite(venue)?venue:base;
   const measured=.58*local+.28*base+.14*(Number.isFinite(recent)?recent:base);
   const reliability=Math.min(1,(hf.played+af.played)/28);
   return measured*reliability+1.3*(1-reliability);
 };
 const hAttack=shrunk(hf.homeScored,hf.scored,hf.homePlayed,hf.last5Scored);
 const aDefence=shrunk(af.awayConceded,af.conceded,af.awayPlayed,af.last5Conceded);
 const aAttack=shrunk(af.awayScored,af.scored,af.awayPlayed,af.last5Scored);
 const hDefence=shrunk(hf.homeConceded,hf.conceded,hf.homePlayed,hf.last5Conceded);
 const bound=(v,lo,hi)=>Math.max(lo,Math.min(hi,v));
 let lambdaHome=bound((hAttack*.52+aDefence*.48)*1.06,.25,3.6);
 let lambdaAway=bound((aAttack*.52+hDefence*.48)*.95,.25,3.6);
 // When a separately authorized, reliably mapped second source is configured,
 // require reasonable agreement rather than blindly increasing a prediction score.
 const independentFixture=independent?.fixtures?.get(String(g.fixture.id))||null;
 if(independentFixture){
   if(Math.abs(lambdaHome-independentFixture.expectedHomeGoals)>1.25||
      Math.abs(lambdaAway-independentFixture.expectedAwayGoals)>1.25)
     return {status:'sourceConflict',picks:[]};
   lambdaHome=bound(lambdaHome*.75+independentFixture.expectedHomeGoals*.25,.25,3.6);
   lambdaAway=bound(lambdaAway*.75+independentFixture.expectedAwayGoals*.25,.25,3.6);
 }
 const poisson=(n,lambda)=>{let p=Math.exp(-lambda);for(let k=1;k<=n;k++)p*=lambda/k;return p};
 let probHome=0,probDraw=0,probAway=0,weight=0;
 for(let x=0;x<=9;x++)for(let y=0;y<=9;y++){
  const p=poisson(x,lambdaHome)*poisson(y,lambdaAway);
  weight+=p;if(x>y)probHome+=p;else if(x===y)probDraw+=p;else probAway+=p;
 }
 if(!(weight>.98))return {status:'insufficientData',picks:[]};
 probHome/=weight;probDraw/=weight;probAway/=weight;
 const winProbs={home:probHome,draw:probDraw,away:probAway};
 const h2hDraws=direct.filter(x=>x.goals.home===x.goals.away).length;
 const drawRate=(hf.drawRate+af.drawRate)/2;
 const formDifference=Math.abs(homeRate-awayRate);
 const rankDifference=Math.abs(Number(hr.rank)-Number(ar.rank));
 const picks=[];
 // Draw: coherent goal expectations, balanced form and nontrivial model probability.
 if(probDraw>=.245&&drawRate>=.22&&formDifference<=.24&&Math.abs(lambdaHome-lambdaAway)<.65){
  const raw=Math.min(82,45+(probDraw-.245)*200+(drawRate-.22)*25+(rankDifference<=5?3:0));
  picks.push({type:'Unentschieden',team:'X',score:Math.round(raw),modelProbability:Math.round(probDraw*1000)/10,marketSide:'draw',
   reason:'Erwartete Tore '+lambdaHome.toFixed(2)+'/'+lambdaAway.toFixed(2)+' · Remisanteil Form '+Math.round(drawRate*100)+' % · Tabellenplätze '+hr.rank+'/'+ar.rank+' · H2H '+h2hDraws+'/'+direct.length});
 }
 const homeUnderdog=Number(hr.rank)>=Number(ar.rank)+3;
 const awayUnderdog=Number(ar.rank)>=Number(hr.rank)+3;
 // An outsider is a standings outsider (or objectively an outsider in connected market odds).
 // Home/away momentum must support an upset; no purely high-price bets.
 if((homeUnderdog||(market?.home!=null&&market.home<.38&&market.away>.43))&&hf.homePlayed>=3&&af.awayPlayed>=3&&hf.homePoints>=1.35&&hf.last5Points>=6&&probHome>=.21){
  const momentum=hf.homePoints-af.awayPoints;
  if(momentum>=.1){
   const rating=Math.min(84,42+(probHome-.21)*110+Math.min(8,momentum*8));
   picks.push({type:'Außenseiter-Sieg',team:'1 · '+h.name,score:Math.round(rating),marketSide:'home',modelProbability:Math.round(probHome*1000)/10,
    reason:'Tormodell Heimsieg '+Math.round(probHome*100)+' % (unkalibriert) · Heimform '+hf.homePoints.toFixed(2)+' gegen Auswärtsform '+af.awayPoints.toFixed(2)+' Pkt/Spiel · Tabelle '+hr.rank+'/'+ar.rank});
  }
 }
 if((awayUnderdog||(market?.away!=null&&market.away<.38&&market.home>.43))&&af.awayPlayed>=3&&hf.homePlayed>=3&&af.awayPoints>=1.35&&af.last5Points>=6&&probAway>=.19){
  const momentum=af.awayPoints-hf.homePoints;
  if(momentum>=.1){
   const rating=Math.min(84,40+(probAway-.19)*115+Math.min(8,momentum*8));
   picks.push({type:'Außenseiter-Sieg',team:'2 · '+a.name,score:Math.round(rating),marketSide:'away',modelProbability:Math.round(probAway*1000)/10,
    reason:'Tormodell Auswärtssieg '+Math.round(probAway*100)+' % (unkalibriert) · Auswärtsform '+af.awayPoints.toFixed(2)+' gegen Heimform '+hf.homePoints.toFixed(2)+' Pkt/Spiel · Tabelle '+hr.rank+'/'+ar.rank});
  }
 }
 return {status:picks.length?'candidate':'noSignal',picks:picks.map(p=>{
  const side=p.marketSide|| (p.team==='X'?'draw':p.team.startsWith('1 ·')?'home':'away');
  const marketProbability=market?.[side]??null;
  // Odds are a separate plausibility check, never represented as a calibrated model probability.
  const score=Math.max(0,Math.min(88,p.score+(marketProbability==null?0:marketProbability<.12?-14:marketProbability<.20?-7:marketProbability>.40?3:0)));
  // Poisson estimate is uncalibrated; H2H remains descriptive rather than an additive probability.
  // An analysis index of 100 could be mistaken for certainty; avoid that visual implication.
  return {...p,score,marketProbability:marketProbability==null?null:Math.round(marketProbability*1000)/10,oddsSource:market?.bookmaker||null,independentEvidence:!!independentFixture,teamIds:{home:h.id,away:a.id},fixtureId:g.fixture.id,match:h.name+' – '+a.name,league:g.league.name,kickoff:g.fixture.date,homeForm:hf,awayForm:af,table:{home:hr,away:ar},goalModel:{home:lambdaHome,away:lambdaAway,probabilities:winProbs},h2h:{played:direct.length,draws}};
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
  const [odds,independent]=await Promise.all([externalOdds(date),getFlashscoreEvidence(date,'football')]);
  const fixtures=(await api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key)).filter(g=>isTopFlight(g.league)&&g.fixture?.status?.short==='NS'&&Date.parse(g.fixture.date)>Date.now());
  // Balance coverage across competitions rather than taking only the earliest 12 kickoffs.
  fixtures.sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
  const maxFixtures=Math.min(24,Math.max(18,count*2+6));
  const selected=[],included=new Set(),represented=new Set();
  for(const g of fixtures){
   if(selected.length===maxFixtures)break;
   const league=String(g.league.id);
   if(represented.has(league))continue;
   represented.add(league);included.add(g.fixture.id);selected.push(g);
  }
  for(const g of fixtures){
   if(selected.length===maxFixtures)break;
   if(!included.has(g.fixture.id)){included.add(g.fixture.id);selected.push(g)}
  }
  const results=[];for(let i=0;i<selected.length;i+=3){results.push(...await Promise.allSettled(selected.slice(i,i+3).map(g=>evaluate(g,key,date,odds,independent))))}
  const diagnostics={providerErrors:results.filter(r=>r.status==='rejected'||r.value?.status==='providerError').length,insufficientData:results.filter(r=>r.status==='fulfilled'&&r.value?.status==='insufficientData').length,noSignal:results.filter(r=>r.status==='fulfilled'&&r.value?.status==='noSignal').length,sourceConflict:results.filter(r=>r.status==='fulfilled'&&r.value?.status==='sourceConflict').length};
  const preliminary=results.filter(r=>r.status==='fulfilled').flatMap(r=>r.value?.picks||[]).sort((a,b)=>b.score-a.score);
  const evidence=await enrichCandidates(preliminary,key,date,odds);
  const candidates=[],seenFixtures=new Set();
  for(const pick of evidence.candidates){
    if(seenFixtures.has(pick.fixtureId))continue;
    seenFixtures.add(pick.fixtureId);candidates.push(pick);
    if(candidates.length>=count)break;
  }
  const complete=candidates.length>=count;
  let notice=!fixtures.length?'Keine kommenden Fußballspiele an diesem Tag. Anderen Tag wählen.':complete?count+'er-Auswahl verfügbar. Index ist keine Gewinnwahrscheinlichkeit.':candidates.length?candidates.length+' von '+count+' Kandidaten verfügbar. Noch keine vollständige Kombi.':diagnostics.providerErrors?'Analyse unvollständig: Datenabruf eingeschränkt. Bitte später erneut versuchen.':diagnostics.insufficientData?'Für die geprüften Spiele fehlen ausreichende Tabellen- oder Formdaten.':'Keine passenden Remis-/Außenseiter-Signale für diesen Tag.';
  if(candidates.length&&diagnostics.providerErrors)notice+=' Datenabruf teilweise eingeschränkt.';
  if(!candidates.length&&preliminary.length)notice+=' Keine unabhängig bestätigten Tipps: zusätzliche Prognose- oder Quotendaten fehlen.';
  return res.status(200).json({configured:true,date,picks:complete?candidates:[],candidates,available:candidates.length,complete,count,diagnostics,extraEvidence:{predictionMatches:evidence.predictionsAvailable,injuriesAvailable:evidence.injuriesAvailable},flashscoreEvidence:{configured:independent.configured,available:independent.available,matchedFixtures:results.filter(r=>r.status==='fulfilled'&&r.value?.picks?.some(p=>p.independentEvidence)).length,issue:independent.issue||null},externalOdds:{configured:!!process.env.MATCH_ODDS_FEED_URL,available:odds.available,matchedFixtures:odds.byFixture.size,error:odds.error||null},sources:['API-Sports: Spielplan, Form, Tabelle und H2H',...(evidence.predictionsAvailable?['API-Sports: Prognosen']:[]),...(evidence.injuriesAvailable?['API-Sports: Ausfälle']:[]),...(odds.available?['Lizenzierter externer Quotenfeed']:[]),...(independent.available?['Autorisierter Flashscore-Datenfeed']:[])],considered:selected.length,totalFixtures:fixtures.length,updatedAt:new Date().toISOString(),notice});
 }catch(e){return res.status(502).json({error:'Analyse derzeit nicht verfügbar',detail:String(e.message).slice(0,120)})}
}
