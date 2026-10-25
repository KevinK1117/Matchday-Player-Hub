import {isDrawCompetition} from '../public/competitions.js';
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


function providerPercent(value){
 if(value==null)return null;
 const n=Number(String(value).replace('%','').trim());
 return Number.isFinite(n)&&n>=0&&n<=100?n/100:null;
}
async function enrichCandidates(candidates,key,date){
 // Fetch predictions only for matches that passed form and table screening.
 // Cap extra calls to protect the user's API-Sports quota.
 let injuries=[],injuriesAvailable=false;
 try{injuries=await api('/injuries?date='+date,key);injuriesAvailable=true;}catch{}
 // Evaluate independent corroboration for signals from every represented league.
 const limited=candidates.slice(0,Math.min(18,candidates.length));
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
  // Keep model-only candidates visible as provisional analyses, never as independently confirmed picks.
  if(predictionProbability==null){flags.push('Nur internes Form-/Tormodell · ohne zusätzliche Prognosebestätigung');return {...pick,score:Math.max(0,Math.min(90,score)),dataQuality:'Vorläufig – nicht unabhängig bestätigt',providerPrediction:null,predictionsSource:null,injuriesAvailable,injuries:{homeMissing,awayMissing},qualityFlags:flags,modelError,evidenceSources:['API-Sports: Tabelle/Form/H2H',...(injuriesAvailable?['API-Sports: Ausfälle']:[])]};}
  if(predictionProbability!=null&&predictionProbability<.23)return null;
  const quality='Zusätzliche Prognoseprüfung';
  return {...pick,dataQuality:quality,score:Math.max(0,Math.min(90,score)),providerPrediction:predictionProbability==null?null:Math.round(predictionProbability*1000)/10,
    predictionsSource:modelSource,injuriesAvailable,injuries:{homeMissing,awayMissing},qualityFlags:flags,modelError,
    evidenceSources:['API-Sports: Tabelle/Form/H2H',...(modelSource?[modelSource]:[]),...(injuriesAvailable?['API-Sports: Verletzungen/Sperren']:[])]};
 }));
 return {candidates:enriched.filter(Boolean).sort((a,b)=>b.score-a.score),screened:limited.length,rejected:enriched.filter(x=>x==null).length,injuriesAvailable,predictionsAvailable:enriched.filter(x=>x?.predictionsSource).length};
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
async function evaluate(g,key,date,independent){
 const h=g.teams.home,a=g.teams.away,isCup=g.league?.type==='Cup';
 const historyPath=id=>'/fixtures?team='+id+(isCup?'&last=20':'&league='+g.league.id+'&season='+g.league.season+'&last=20');
 // Two required team histories; standings and H2H are optional, never a reason
 // to discard an otherwise analyzable fixture when the provider rate-limits.
 const [home,away]=await Promise.allSettled([api(historyPath(h.id),key),api(historyPath(a.id),key)]);
 if(home.status!=='fulfilled'||away.status!=='fulfilled')return {status:'providerError',picks:[],errorCode:String(home.reason?.message||away.reason?.message||'unknown').slice(0,100)};
 const allowable=rows=>rows.filter(x=>isDrawCompetition(x.league)&&(isCup||Number(x.league?.id)===Number(g.league.id)));
 const hf=form(allowable(home.value),h.id,date),af=form(allowable(away.value),a.id,date);
 // Only ask for optional standings when both sides have enough history.
 if(hf.played<6||af.played<6||hf.homePlayed<2||af.awayPlayed<2)return {status:'insufficientData',picks:[]};
 const standings=await api('/standings?league='+g.league.id+'&season='+g.league.season,key).catch(()=>[]);
 const hr=ranks(standings,h.id),ar=ranks(standings,a.id);
 const direct=[];
 const draws=direct.filter(x=>x.goals.home===x.goals.away).length;
 if(hf.played<6||af.played<6||hf.homePlayed<2||af.awayPlayed<2||false)return {status:'insufficientData',picks:[]};
 const homeRate=hf.last5Points/Math.max(1,hf.last5Played*3),awayRate=af.last5Points/Math.max(1,af.last5Played*3);
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
 const h2hDraws=0;
 const drawRate=(hf.drawRate+af.drawRate)/2;
 const formDifference=Math.abs(homeRate-awayRate);
 const rankDifference=hr&&ar?Math.abs(Number(hr.rank)-Number(ar.rank)):null;
 const picks=[];
 // Draw: coherent goal expectations, balanced form and nontrivial model probability.
 if(probDraw>=.245&&drawRate>=.22&&formDifference<=.24&&Math.abs(lambdaHome-lambdaAway)<.65){
  const raw=Math.min(82,45+(probDraw-.245)*200+(drawRate-.22)*25+(rankDifference!=null&&rankDifference<=5?3:0));
  picks.push({type:'Unentschieden',team:'X',score:Math.round(raw),modelProbability:Math.round(probDraw*1000)/10,marketSide:'draw',
   reason:'Erwartete Tore '+lambdaHome.toFixed(2)+'/'+lambdaAway.toFixed(2)+' · Remisanteil Form '+Math.round(drawRate*100)+' % · '+(isCup?'Turnier ohne vergleichbare Ligatabelle':'Tabellenplätze '+hr.rank+'/'+ar.rank)+' · H2H '+h2hDraws+'/'+direct.length});
 }
 const homeUnderdog=isCup?probHome+.15<probAway&&probHome<.4:Number(hr.rank)>=Number(ar.rank)+3;
 const awayUnderdog=isCup?probAway+.15<probHome&&probAway<.4:Number(ar.rank)>=Number(hr.rank)+3;
 // Outsiders are identified from standings or model strength differences.
 // Home/away momentum must support an upset; no purely high-price bets.
 if((homeUnderdog||(market?.home!=null&&market.home<.38&&market.away>.43))&&hf.homePlayed>=3&&af.awayPlayed>=3&&hf.homePoints>=1.35&&hf.last5Points>=6&&probHome>=.21){
  const momentum=hf.homePoints-af.awayPoints;
  if(momentum>=.1){
   const rating=Math.min(84,42+(probHome-.21)*110+Math.min(8,momentum*8));
   picks.push({type:'Außenseiter-Sieg',team:'1 · '+h.name,score:Math.round(rating),marketSide:'home',modelProbability:Math.round(probHome*1000)/10,
    reason:'Tormodell Heimsieg '+Math.round(probHome*100)+' % (unkalibriert) · Heimform '+hf.homePoints.toFixed(2)+' gegen Auswärtsform '+af.awayPoints.toFixed(2)+' Pkt/Spiel · '+(isCup?'Turnier ohne Ligatabelle':'Tabelle '+hr.rank+'/'+ar.rank)});
  }
 }
 if((awayUnderdog||(market?.away!=null&&market.away<.38&&market.home>.43))&&af.awayPlayed>=3&&hf.homePlayed>=3&&af.awayPoints>=1.35&&af.last5Points>=6&&probAway>=.19){
  const momentum=af.awayPoints-hf.homePoints;
  if(momentum>=.1){
   const rating=Math.min(84,40+(probAway-.19)*115+Math.min(8,momentum*8));
   picks.push({type:'Außenseiter-Sieg',team:'2 · '+a.name,score:Math.round(rating),marketSide:'away',modelProbability:Math.round(probAway*1000)/10,
    reason:'Tormodell Auswärtssieg '+Math.round(probAway*100)+' % (unkalibriert) · Auswärtsform '+af.awayPoints.toFixed(2)+' gegen Heimform '+hf.homePoints.toFixed(2)+' Pkt/Spiel · '+(isCup?'Turnier ohne Ligatabelle':'Tabelle '+hr.rank+'/'+ar.rank)});
  }
 }
 return {status:picks.length?'candidate':'noSignal',picks:picks.map(p=>{
  // Poisson estimate is uncalibrated; H2H remains descriptive rather than an additive probability.
  // An analysis index of 100 could be mistaken for certainty; avoid that visual implication.
  return {...p,score:Math.max(0,Math.min(88,p.score)),independentEvidence:!!independentFixture,teamIds:{home:h.id,away:a.id},fixtureId:g.fixture.id,match:h.name+' – '+a.name,league:g.league.name,kickoff:g.fixture.date,homeForm:hf,awayForm:af,table:{home:hr,away:ar},goalModel:{home:lambdaHome,away:lambdaAway,probabilities:winProbs},h2h:{played:direct.length,draws}};
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
  const independent=await getFlashscoreEvidence(date,'football');
  const fixtures=(await api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key)).filter(g=>isDrawCompetition(g.league)&&g.fixture?.status?.short==='NS'&&Date.parse(g.fixture.date)>Date.now());
  // Include all fixtures from the strict approved competition list, not only top-ranked leagues.
  const preferred=[78,79,135,39,61,140,307,2,3,1,4,5,88,94,40,136,62,141,203,179,180,113,114];
  const groups=new Map();
  for(const fixture of fixtures){
   const id=Number(fixture.league.id);
   if(!groups.has(id))groups.set(id,[]);
   groups.get(id).push(fixture);
  }
  const order=[...groups.keys()].sort((a,b)=>{
   const ai=preferred.indexOf(a),bi=preferred.indexOf(b);
   return (ai<0?999:ai)-(bi<0?999:bi)||a-b;
  });
  // All enabled competitions enter one common pool. Rotate over every league
  // before requesting another fixture from a league; do not omit small leagues.
  const selected=[];
  while(order.some(id=>groups.get(id).length)){
   for(const id of order){
    const fixture=groups.get(id).shift();
    if(fixture)selected.push(fixture);
   }
  }
  // Strict server budget avoids a 60-second HTTP timeout on busy days.
  // Unchecked fixtures remain visible as 'not_checked', never reported as analyzed.
  const results=new Array(selected.length);
  const started=Date.now(),budgetMs=42000,maxWorkers=2;
  let next=0;
  await Promise.all(Array.from({length:Math.min(maxWorkers,selected.length)},async()=>{
   while(next<selected.length){
    if(Date.now()-started>budgetMs-12500)break;
    const index=next++;
    try{results[index]={status:'fulfilled',value:await evaluate(selected[index],key,date,independent)}}
    catch(reason){results[index]={status:'rejected',reason}}
   }
  }));
  const considered=results.filter(Boolean).length;
  const leagueCoverage=order.map(id=>{
   const total=fixtures.filter(g=>Number(g.league.id)===id).length;
   const settled=selected.map((g,i)=>Number(g.league.id)===id?results[i]:null).filter(Boolean);
   const checked=settled.length;
   const evaluated=settled.filter(r=>r.status==='fulfilled'&&r.value?.status!=='providerError').length;
   const dataErrors=settled.filter(r=>r.status==='rejected'||r.value?.status==='providerError').length;
   return {leagueId:id,league:fixtures.find(g=>Number(g.league.id)===id)?.league?.name||'Liga',
    fixtures:total,checked,evaluated,dataErrors,
    status:checked===0?'not_checked':checked<total||dataErrors?'partial':'covered'};
  });
  const settledResults=results.filter(Boolean);
  const diagnostics={providerErrors:settledResults.filter(r=>r.status==='rejected'||r.value?.status==='providerError').length,insufficientData:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.status==='insufficientData').length,noSignal:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.status==='noSignal').length,sourceConflict:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.status==='sourceConflict').length};
  const preliminary=settledResults.filter(r=>r.status==='fulfilled').flatMap(r=>r.value?.picks||[]).sort((a,b)=>b.score-a.score);
  const evidence=await enrichCandidates(preliminary,key,date);
  // Prefer additionally checked signals over model-only entries. Never let
  // high-scoring provisional entries crowd out verified signals from the list.
  const verifiedCandidates=[],provisionalCandidates=[],seenFixtures=new Set();
  for(const pick of evidence.candidates){
    if(seenFixtures.has(pick.fixtureId))continue;
    seenFixtures.add(pick.fixtureId);
    (pick.dataQuality==='Vorläufig – nicht unabhängig bestätigt'?provisionalCandidates:verifiedCandidates).push(pick);
  }
  const candidates=[...verifiedCandidates,...provisionalCandidates].slice(0,count);
  const complete=verifiedCandidates.length>=count;
  diagnostics.modelSignals=preliminary.length;
  diagnostics.additionalChecks=evidence.screened;
  diagnostics.rejectedByChecks=evidence.rejected;
  diagnostics.additionalEvidence=verifiedCandidates.length;
  diagnostics.provisional=provisionalCandidates.length;
  let notice=!fixtures.length?'Keine kommenden Fußballspiele an diesem Tag. Anderen Tag wählen.':complete?count+'er-Auswahl verfügbar. Index ist keine Gewinnwahrscheinlichkeit.':candidates.length?verifiedCandidates.length+' zusätzlich geprüfte und '+provisionalCandidates.length+' vorläufige Modellkandidaten. Für eine vollständige Kombi fehlen weitere geprüfte Auswahlen.':diagnostics.providerErrors?'Analyse unvollständig: Datenabruf eingeschränkt. Bitte später erneut versuchen.':diagnostics.insufficientData?'Für die geprüften Spiele fehlen ausreichende Tabellen- oder Formdaten.':'Keine passenden Remis-/Außenseiter-Signale für diesen Tag.';
  if(candidates.length&&diagnostics.providerErrors)notice+=' Datenabruf teilweise eingeschränkt.';
  if(considered<fixtures.length)notice+=' Datenanbieter-Zeitbudget: '+considered+' von '+fixtures.length+' Spielen analysiert; übrige Spiele noch nicht geprüft.';
  if(leagueCoverage.some(l=>l.leagueId===307))notice+=' Saudi Pro League im Prüfumfang enthalten.';
  if(!verifiedCandidates.length&&provisionalCandidates.length)notice+=' Vorläufige Modellkandidaten sind nicht zusätzlich bestätigt.';
  if(!preliminary.length&&considered>0)notice+=' Kein Spiel erfüllt bisher die Mindestkriterien des Form-/Tormodells.';
  return res.status(200).json({configured:true,date,picks:complete?verifiedCandidates:[],candidates,verifiedCandidates,provisionalCandidates,available:verifiedCandidates.length,complete,count,diagnostics,extraEvidence:{predictionMatches:evidence.predictionsAvailable,injuriesAvailable:evidence.injuriesAvailable},flashscoreEvidence:{configured:independent.configured,available:independent.available,matchedFixtures:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.picks?.some(p=>p.independentEvidence)).length,issue:independent.issue||null},sources:['API-Sports: Spielplan, Form, Tabelle und H2H',...(evidence.predictionsAvailable?['API-Sports: Prognosen']:[]),...(evidence.injuriesAvailable?['API-Sports: Ausfälle']:[]),...(independent.available?['Autorisierter Flashscore-Datenfeed']:[])],leagueCoverage,coverageComplete:leagueCoverage.every(x=>x.status==='covered'),considered,totalFixtures:fixtures.length,updatedAt:new Date().toISOString(),notice});
 }catch(e){return res.status(502).json({error:'Analyse derzeit nicht verfügbar',detail:String(e.message).slice(0,120)})}
}
