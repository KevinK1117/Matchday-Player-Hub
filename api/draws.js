import {isDrawFixture} from '../public/competitions.js';
import {getFootballEvidence,externalTeamForm} from '../lib/football-evidence.js';
import {getFlashscoreEvidence} from '../lib/flashscore-evidence.js';
const ROOT='https://v3.football.api-sports.io';
const cache=new Map(),pending=new Map(),failed=new Map();
let activeRequests=0,providerCooldownUntil=0;const waiters=[];
async function providerSlot(){
 if(activeRequests<2)activeRequests++;
 else await new Promise(resolve=>waiters.push(resolve));
 return ()=>{const next=waiters.shift();if(next)next();else activeRequests--};
}
const failureMessage=errors=>JSON.stringify(errors).slice(0,220);
function blockProvider(message,seconds){
 const until=Date.now()+seconds*1000;
 providerCooldownUntil=Math.max(providerCooldownUntil,until);
 return message;
}
async function api(path,key){
 const now=Date.now();
 const cached=cache.get(path);
 if(cached&&cached.until>now)return cached.value;
 const blocked=failed.get(path);
 if(blocked&&blocked.until>now)throw Error(blocked.message);
 if(pending.has(path))return pending.get(path);
 if(providerCooldownUntil>now)throw Error('API_PAUSED: Anbieter-Anfragen vorübergehend pausiert');
 const work=(async()=>{
  const release=await providerSlot();
  try{
   if(providerCooldownUntil>Date.now())throw Error('API_PAUSED: Anbieter-Anfragen vorübergehend pausiert');
   const response=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)});
   if(!response.ok){
    const message='API-Sports HTTP '+response.status;
    if(response.status===429)blockProvider(message,90);
    if([401,403,429].includes(response.status))failed.set(path,{message,until:Date.now()+(response.status===429?90000:300000)});
    throw Error(message);
   }
   const body=await response.json();
   if(body.errors&&(Array.isArray(body.errors)?body.errors.length:Object.keys(body.errors).length)){
    const errorText=failureMessage(body.errors),message='API-Sports Antwortfehler: '+errorText;
    if(/rate.limit|too many|quota|requests.limit/i.test(errorText))blockProvider(message,90);
    failed.set(path,{message,until:Date.now()+120000});
    throw Error(message);
   }
   const value=body.response||[];
   // Historical team results rarely change. Upcoming fixtures require fresher updates.
   const ttl=/^\/fixtures\?date=/.test(path)?120000:/^\/fixtures\?team=/.test(path)?3600000:/^\/standings\?/.test(path)?1800000:/^\/predictions\?/.test(path)?900000:600000;
   cache.set(path,{value,until:Date.now()+ttl});
   if(cache.size>750)cache.delete(cache.keys().next().value);
   if(failed.has(path))failed.delete(path);
   return value;
  }finally{release()}
 })();
 pending.set(path,work);
 try{return await work}finally{pending.delete(path)}
}

function providerPercent(value){
 if(value==null)return null;
 const n=Number(String(value).replace('%','').trim());
 return Number.isFinite(n)&&n>=0&&n<=100?n/100:null;
}
async function enrichCandidates(candidates){return {candidates:candidates.map(p=>({...p,dataQuality:'Vorläufig – nicht unabhängig bestätigt',providerPrediction:null,injuriesAvailable:false,qualityFlags:['Nur jüngste Form aus 5–10 Spielen; keine Quoten-, Tabellen- oder Ausfallgewichtung']})),screened:0,rejected:0,injuriesAvailable:false,predictionsAvailable:0};}

function regulationScore(game){
 const status=game.fixture?.status?.short;
 if(!['FT','AET','PEN'].includes(status))return null;
 const score=game.score?.fulltime??(status==='FT'?game.goals:null);
 return Number.isInteger(score?.home)&&Number.isInteger(score?.away)?score:null;
}
export function form(rows,id,date){
 const games=rows.filter(g=>regulationScore(g)&&String(g.fixture?.date||'').slice(0,10)<date).sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date)).slice(0,10);
 const details=games.map(g=>{
  const home=Number(g.teams.home.id)===Number(id),score=regulationScore(g);
  const scored=home?score.home:score.away,conceded=home?score.away:score.home;
  return {home,scored,conceded,points:scored>conceded?3:scored===conceded?1:0,draw:scored===conceded};
 });
 const avg=(arr,key)=>arr.length?arr.reduce((n,x)=>n+x[key],0)/arr.length:null;
 const home=details.filter(x=>x.home),away=details.filter(x=>!x.home);
 return {scoringGames:details.filter(x=>x.scored>0).length,scoringRate:avg(details.map(x=>({hit:x.scored>0})), 'hit'),winRate:avg(details.map(x=>({hit:x.points===3})), 'hit'),last5Points:details.slice(0,5).reduce((n,x)=>n+x.points,0),last5Played:details.slice(0,5).length,played:details.length,points:details.reduce((n,x)=>n+x.points,0),drawRate:avg(details,'draw'),scored:avg(details,'scored'),conceded:avg(details,'conceded'),homePlayed:home.length,awayPlayed:away.length,homePoints:avg(home,'points'),awayPoints:avg(away,'points'),homeScored:avg(home,'scored'),awayScored:avg(away,'scored'),homeConceded:avg(home,'conceded'),awayConceded:avg(away,'conceded'),last5Scored:avg(details.slice(0,5),'scored'),last5Conceded:avg(details.slice(0,5),'conceded')};
}
function ranks(standings,id){
 const groups=standings?.[0]?.league?.standings||[];
 const row=groups.flat().find(x=>Number(x.team?.id)===Number(id));
 return row?{rank:row.rank,points:row.points,played:row.all?.played,goalDiff:row.goalsDiff}:null;
}
async function evaluate(g,key,date){
 const h=g.teams.home,a=g.teams.away;
 const history=id=>api('/fixtures?team='+id+'&last=16',key);
 const [home,away]=await Promise.allSettled([history(h.id),history(a.id)]);
 if(home.status!=='fulfilled'||away.status!=='fulfilled')return {status:'providerError',picks:[],errorCode:'Formdaten nicht verfügbar'};
 const hf=form(home.value,h.id,date),af=form(away.value,a.id,date);
 if(hf.played<5||af.played<5)return {status:'insufficientData',picks:[]};
 const homeRate=(hf.scored+af.conceded)/2,awayRate=(af.scored+hf.conceded)/2;
 const poisson=(n,rate)=>{let v=Math.exp(-rate);for(let i=1;i<=n;i++)v*=rate/i;return v};
 let ph=0,pd=0,pa=0,weight=0;for(let x=0;x<=20;x++)for(let y=0;y<=20;y++){const p=poisson(x,homeRate)*poisson(y,awayRate);weight+=p;if(x>y)ph+=p;else if(x===y)pd+=p;else pa+=p;}
 if(weight<.98)return {status:'insufficientData',picks:[]};ph/=weight;pd/=weight;pa/=weight;
 const picks=[],balanced=Math.abs(hf.points/hf.played-af.points/af.played)<=.8;
 if(pd>=.22&&balanced&&(hf.drawRate+af.drawRate)/2>=.2)picks.push({type:'Unentschieden',team:'X',modelProbability:Math.round(pd*1000)/10,score:pd*100});
 if(ph<pa&&ph>=.2&&hf.scoringRate>=.6&&hf.winRate>=.2)picks.push({type:'Außenseiter-Sieg',team:'1 · '+h.name,modelProbability:Math.round(ph*1000)/10,score:ph*100});
 if(pa<ph&&pa>=.2&&af.scoringRate>=.6&&af.winRate>=.2)picks.push({type:'Außenseiter-Sieg',team:'2 · '+a.name,modelProbability:Math.round(pa*1000)/10,score:pa*100});
 return {status:picks.length?'candidate':'noSignal',picks:picks.map(p=>({...p,reason:'Nur jüngste Form: '+hf.played+'/'+af.played+' Spiele · traf in '+hf.scoringGames+'/'+hf.played+' bzw. '+af.scoringGames+'/'+af.played+' Spielen. Poisson-Schätzung aus Toren/Gegentoren der jüngsten Spiele; keine kommende Trefferhäufigkeit und nicht kalibriert.',fixtureId:g.fixture.id,teamIds:{home:h.id,away:a.id},match:h.name+' – '+a.name,league:g.league.name,kickoff:g.fixture.date,homeForm:hf,awayForm:af,table:{home:null,away:null},goalModel:{home:homeRate,away:awayRate,probabilities:{home:ph,draw:pd,away:pa}},h2h:{played:0,draws:0},formOnly:true}))};
}

export function analysisFailure(error){
 const message=String(error?.message||error);
 if(/API_PAUSED|HTTP 429|rate.limit|too many|quota|requests.limit/i.test(message))return {status:503,error:'Anbieter-Anfragelimit erreicht. Die Analyse wird nach einer Pause erneut versucht.',code:'PROVIDER_LIMIT',retryAfter:90};
 if(/HTTP 401|HTTP 403|subscription|access|plan/i.test(message))return {status:502,error:'Anbieterzugang für diesen Datenabruf nicht freigeschaltet. Zugang oder Abonnement beim Anbieter prüfen.',code:'PROVIDER_ACCESS'};
 if(/timeout|abort|HTTP 5\d\d|fetch failed/i.test(message))return {status:503,error:'Datenanbieter vorübergehend nicht erreichbar. Erneuter Versuch folgt.',code:'PROVIDER_TEMPORARY',retryAfter:15};
 return {status:502,error:'Analyse fehlgeschlagen. Bitte später erneut versuchen.',code:'ANALYSIS_FAILED'};
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=300');
 const date=String(req.query?.date||''),allTips=req.query?.count==='all',count=allTips?100000:Number(req.query?.count||6),batched=req.query?.batch==='1',offset=Number(req.query?.offset||0),scanAt=Number(req.query?.scanAt||Date.now());
 if(!Number.isFinite(scanAt)||scanAt<0||scanAt>Date.now()+60000)return res.status(400).json({error:'Ungültiger Analysezeitpunkt'});
 if(!Number.isInteger(offset)||offset<0)return res.status(400).json({error:'Ungültiger Analysefortschritt'});
 if(!allTips&&(!Number.isInteger(count)||count<6||count>20))return res.status(400).json({error:'6–20 Auswahlen wählen'});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Ungültiges Datum'});
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,picks:[],notice:'API-Sports-Zugang fehlt.'});
 try{
  const independent={configured:false,available:false,fixtures:new Map()},additional={providers:[]};
  const fixtures=(await api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key)).filter(g=>isDrawFixture(g)&&Date.parse(g.fixture?.date)>scanAt);
  // Every upcoming football fixture returned for this matchday enters the scan.
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
  // Keep each league together so adjacent batches reuse standings and histories.
  // Every returned fixture remains in the scan, including smaller competitions.
  let selected=order.flatMap(id=>groups.get(id));
  const totalOrdered=selected.length;
  if(batched)selected=selected.slice(offset,offset+8);
  // Strict server budget avoids a 60-second HTTP timeout on busy days.
  // Unchecked fixtures remain visible as 'not_checked', never reported as analyzed.
  const results=new Array(selected.length);
  const started=Date.now(),budgetMs=42000,maxWorkers=2;
  let next=0;
  await Promise.all(Array.from({length:Math.min(maxWorkers,selected.length)},async()=>{
   while(next<selected.length){
    if(Date.now()-started>budgetMs-12500||providerCooldownUntil>Date.now())break;
    const index=next++;
    try{results[index]={status:'fulfilled',value:selected[index].fixture?.status?.short!=='NS'||Date.parse(selected[index].fixture.date)<=Date.now()?{status:'noSignal',picks:[]}:await evaluate(selected[index],key,date,independent,additional)}}
    catch(reason){results[index]={status:'rejected',reason:String(reason?.message||reason).slice(0,160)}}
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
  const diagnostics={providerPaused:providerCooldownUntil>Date.now(),unprocessed:selected.length-considered,providerErrors:settledResults.filter(r=>r.status==='rejected'||r.value?.status==='providerError').length,insufficientData:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.status==='insufficientData').length,noSignal:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.status==='noSignal').length,sourceConflict:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.status==='sourceConflict').length};
  const errorGroups=new Map();
  for(const result of settledResults){
   const raw=result.status==='rejected'?String(result.reason||'Unbekannt'):result.value?.status==='providerError'?String(result.value.errorCode||'Unbekannt'):null;
   if(!raw)continue;
   const type=/API_PAUSED/i.test(raw)?'Anbieterpause (nicht erneut angefragt)':/HTTP 429|rate.limit|requests limit/i.test(raw)?'Anfragelimit (429)':/HTTP 403|HTTP 401|subscription|plan|access/i.test(raw)?'API-Zugriff/Abonnement':/timeout|abort/i.test(raw)?'Zeitüberschreitung':/HTTP 5\d\d/i.test(raw)?'Anbieter-Serverfehler':/Antwortfehler/i.test(raw)?'API-Antwortfehler':raw.slice(0,95);
   errorGroups.set(type,(errorGroups.get(type)||0)+1);
  }
  diagnostics.errorReasons=[...errorGroups].sort((a,b)=>b[1]-a[1]).slice(0,6).map(([reason,count])=>({reason,count}));
  const preliminary=settledResults.filter(r=>r.status==='fulfilled').flatMap(r=>r.value?.picks||[]).sort((a,b)=>b.score-a.score);
  const evidence=providerCooldownUntil>Date.now()?{candidates:preliminary.map(p=>({...p,dataQuality:'Vorläufig – nicht unabhängig bestätigt',providerPrediction:null,predictionsSource:null,injuriesAvailable:false,qualityFlags:['Anbieterpause: Zusatzprüfung ausgesetzt'],evidenceSources:['API-Sports: Tabelle/Form'],modelError:'Anbieterpause'})),screened:0,rejected:0,injuriesAvailable:false,predictionsAvailable:0}:await enrichCandidates(preliminary,key,date);
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
  let notice=!fixtures.length?'Keine kommenden Spiele in den unterstützten Fußballligen an diesem Tag.':complete?count+'er-Auswahl verfügbar. Index ist keine Gewinnwahrscheinlichkeit.':candidates.length?verifiedCandidates.length+' zusätzlich geprüfte und '+provisionalCandidates.length+' vorläufige Modellkandidaten. Für eine vollständige Kombi fehlen weitere geprüfte Auswahlen.':diagnostics.providerErrors?'Analyse unvollständig: Datenabruf eingeschränkt. Bitte später erneut versuchen.':diagnostics.insufficientData?'Für die geprüften Spiele fehlen ausreichende Tabellen- oder Formdaten.':'Keine passenden Remis-/Außenseiter-Signale für diesen Tag.';
  if(candidates.length&&diagnostics.providerErrors)notice+=' Datenabruf teilweise eingeschränkt.';
  if(considered<fixtures.length)notice+=' Datenanbieter-Zeitbudget: '+considered+' von '+fixtures.length+' Spielen analysiert; übrige Spiele noch nicht geprüft.';
  if(leagueCoverage.some(l=>l.leagueId===307))notice+=' Saudi Pro League im Prüfumfang enthalten.';
  if(!verifiedCandidates.length&&provisionalCandidates.length)notice+=' Vorläufige Modellkandidaten sind nicht zusätzlich bestätigt.';
  if(!preliminary.length&&considered>0)notice+=' Kein Spiel erfüllt bisher die Mindestkriterien des Form-/Tormodells.';
  return res.status(200).json({configured:true,date,nextOffset:offset+considered,scanComplete:!batched||offset+considered>=totalOrdered,additionalProviders:additional.providers,picks:complete?verifiedCandidates:[],candidates,verifiedCandidates,provisionalCandidates,available:verifiedCandidates.length,complete,count,diagnostics,extraEvidence:{predictionMatches:evidence.predictionsAvailable,injuriesAvailable:evidence.injuriesAvailable},flashscoreEvidence:{configured:independent.configured,available:independent.available,matchedFixtures:settledResults.filter(r=>r.status==='fulfilled'&&r.value?.picks?.some(p=>p.independentEvidence)).length,issue:independent.issue||null},sources:['API-Sports: Spielplan, Form, Tabelle und H2H',...(evidence.predictionsAvailable?['API-Sports: Prognosen']:[]),...(evidence.injuriesAvailable?['API-Sports: Ausfälle']:[]),...(independent.available?['Autorisierter Flashscore-Datenfeed']:[])],leagueCoverage,coverageComplete:leagueCoverage.every(x=>x.status==='covered'),considered,totalFixtures:fixtures.length,updatedAt:new Date().toISOString(),notice});
 }catch(e){const {status,...failure}=analysisFailure(e);if(failure.retryAfter)res.setHeader('Retry-After',String(failure.retryAfter));return res.status(status).json(failure)}
}
