import {isTopFlight} from '../public/competitions.js';
// Walk-forward historical validation: uses ONLY league fixtures completed before each match date.
// This is an independently reconstructed baseline; it is NOT a replay of past live predictions.
const ROOT='https://v3.football.api-sports.io';
const iso=date=>date.toISOString().slice(0,10);
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const mean=(arr,key)=>arr.length?arr.reduce((sum,x)=>sum+x[key],0)/arr.length:null;
const poisson=(n,lambda)=>{let v=Math.exp(-lambda);for(let i=1;i<=n;i++)v*=lambda/i;return v};
const pct=arr=>arr.length?arr.filter(Boolean).length/arr.length:null;
const freshFixtures=g=>g?.fixture?.id&&g?.fixture?.date&&g?.teams?.home?.id&&g?.teams?.away?.id&&
 g?.fixture?.status?.short==='FT'&&Number.isFinite(g?.goals?.home)&&Number.isFinite(g?.goals?.away);
const actual=g=>g.goals.home>g.goals.away?'home':g.goals.home<g.goals.away?'away':'draw';
async function api(path,key){
 const response=await fetch(ROOT+path,{headers:{'x-apisports-key':key,Accept:'application/json'},signal:AbortSignal.timeout(14000)});
 if(!response.ok)throw Error('API-Sports HTTP '+response.status);
 const json=await response.json();
 if(json.errors&&(Array.isArray(json.errors)?json.errors.length:Object.keys(json.errors).length))
  throw Error('API-Sports Zugriff oder Tageslimit eingeschränkt');
 return json.response||[];
}
function teamHistory(history,teamId){
 return history.filter(g=>Number(g.teams.home.id)===teamId||Number(g.teams.away.id)===teamId).slice(-12).map(g=>{
  const home=Number(g.teams.home.id)===teamId;
  const scored=Number(home?g.goals.home:g.goals.away),conceded=Number(home?g.goals.away:g.goals.home);
  return {home,scored,conceded,points:scored>conceded?3:scored===conceded?1:0,draw:scored===conceded};
 });
}
function projection(history,fixture){
 const h=Number(fixture.teams.home.id),a=Number(fixture.teams.away.id);
 const hf=teamHistory(history,h),af=teamHistory(history,a);
 const venueH=hf.filter(x=>x.home),venueA=af.filter(x=>!x.home);
 if(hf.length<6||af.length<6||venueH.length<2||venueA.length<2)return null;
 const shrink=(venue,season,count,recent)=>{
  const base=Number.isFinite(season)?season:1.3;
  const local=count>=3&&Number.isFinite(venue)?venue:base;
  const m=.58*local+.28*base+.14*(Number.isFinite(recent)?recent:base);
  const reliability=Math.min(1,(hf.length+af.length)/28);
  return m*reliability+1.3*(1-reliability);
 };
 const hAttack=shrink(mean(venueH,'scored'),mean(hf,'scored'),venueH.length,mean(hf.slice(-5),'scored'));
 const aDefense=shrink(mean(venueA,'conceded'),mean(af,'conceded'),venueA.length,mean(af.slice(-5),'conceded'));
 const aAttack=shrink(mean(venueA,'scored'),mean(af,'scored'),venueA.length,mean(af.slice(-5),'scored'));
 const hDefense=shrink(mean(venueH,'conceded'),mean(hf,'conceded'),venueH.length,mean(hf.slice(-5),'conceded'));
 const lh=clamp((hAttack*.52+aDefense*.48)*1.06,.25,3.6);
 const la=clamp((aAttack*.52+hDefense*.48)*.95,.25,3.6);
 const probs={home:0,draw:0,away:0};
 let total=0;
 for(let x=0;x<=9;x++)for(let y=0;y<=9;y++){
  const chance=poisson(x,lh)*poisson(y,la);
  total+=chance;
  probs[x>y?'home':x<y?'away':'draw']+=chance;
 }
 if(total<.98)return null;
 for(const key of ['home','draw','away'])probs[key]/=total;
 return {probs,lambda:{home:lh,away:la},homeForm:hf,awayForm:af,homeVenue:venueH,awayVenue:venueA};
}
function historicalRanks(history,season){
 // Standings reconstructed from PRIOR completed fixtures in the same season.
 // Current-season standings from today's API must never leak into a retrospective prediction.
 const teams=new Map();
 const register=id=>{if(!teams.has(id))teams.set(id,{id,played:0,points:0,diff:0});return teams.get(id)};
 for(const g of history){
  if(Number(g.league.season)!==Number(season))continue;
  const h=register(Number(g.teams.home.id)),a=register(Number(g.teams.away.id));
  const hg=Number(g.goals.home),ag=Number(g.goals.away);
  h.played++;a.played++;h.diff+=hg-ag;a.diff+=ag-hg;
  if(hg>ag)h.points+=3;else if(hg<ag)a.points+=3;else{h.points++;a.points++}
 }
 const sorted=[...teams.values()].sort((x,y)=>(y.played?y.points/y.played:0)-(x.played?x.points/x.played:0)||y.diff-x.diff);
 return new Map(sorted.map((v,i)=>[v.id,{...v,rank:i+1,ppg:v.played?v.points/v.played:0}]));
}
function choose(fixture,projection,ranks){
 const {probs,lambda,homeForm,awayForm,homeVenue,awayVenue}=projection;
 const homeRank=ranks.get(Number(fixture.teams.home.id)),awayRank=ranks.get(Number(fixture.teams.away.id));
 const drawRate=(mean(homeForm,'draw')+mean(awayForm,'draw'))/2;
 const form=(x)=>x.slice(-5).reduce((sum,v)=>sum+v.points,0)/Math.max(1,x.slice(-5).length*3);
 const balanced=Math.abs(form(homeForm)-form(awayForm))<=.24;
 const draw=probs.draw>=.245&&drawRate>=.22&&balanced&&Math.abs(lambda.home-lambda.away)<.65;
 const homeOutsider=homeRank?.played>=5&&awayRank?.played>=5&&homeRank.rank>=awayRank.rank+3;
 const awayOutsider=homeRank?.played>=5&&awayRank?.played>=5&&awayRank.rank>=homeRank.rank+3;
 const homeMomentum=mean(homeVenue,'points')-mean(awayVenue,'points');
 const awayMomentum=mean(awayVenue,'points')-mean(homeVenue,'points');
 let outsider=null;
 if(homeOutsider&&homeVenue.length>=3&&awayVenue.length>=3&&mean(homeVenue,'points')>=1.35&&
     homeForm.slice(-5).reduce((n,x)=>n+x.points,0)>=6&&probs.home>=.21&&homeMomentum>=.1)outsider='home';
 if(awayOutsider&&awayVenue.length>=3&&homeVenue.length>=3&&mean(awayVenue,'points')>=1.35&&
     awayForm.slice(-5).reduce((n,x)=>n+x.points,0)>=6&&probs.away>=.19&&awayMomentum>=.1)outsider='away';
 const historicalOutsider=homeOutsider?'home':awayOutsider?'away':null;
 return {draw,outsider,historicalOutsider,rankHome:homeRank?.rank??null,rankAway:awayRank?.rank??null};
}
async function fetchLeague(key,id,season,from,to){
 const rows=await api('/fixtures?league='+id+'&season='+season+'&from='+from+'&to='+to,key);
 return rows.filter(g=>Number(g.league.id)===id&&isTopFlight(g.league)&&freshFixtures(g));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=21600, stale-while-revalidate=3600');
 const apiKey=process.env.API_SPORTS_KEY;
 if(!apiKey)return res.status(200).json({configured:false,notice:'API-Sports-Zugang fehlt'});
 const leagueId=Number(req.query?.league??78),days=Number(req.query?.days??30);
 if(!Number.isSafeInteger(leagueId)||leagueId<1||!Number.isInteger(days)||![14,30,45].includes(days))
  return res.status(400).json({error:'Ungültige Liga oder Zeitraum (14, 30 oder 45 Tage)'});
 const end=new Date(Date.now()-86400000),start=new Date(end.getTime()-(days-1)*86400000),
  historyStart=new Date(start.getTime()-165*86400000);
 try{
  const meta=await api('/leagues?id='+leagueId,apiKey);
  const league=meta?.[0];
  if(!league||!isTopFlight({...league.league,country:league.country?.name}))
   return res.status(400).json({error:'Rücktest nur für europäische 1. oder 2. Ligen verfügbar'});
  const seasons=[...new Set([historyStart,start,end].flatMap(d=>d.getUTCMonth()<7?[d.getUTCFullYear()-1,d.getUTCFullYear()]:[d.getUTCFullYear()]))]
   .filter(y=>y>=2015&&y<=new Date().getUTCFullYear()).sort((a,b)=>a-b).slice(-3);
  // One historical request per relevant season. Partial responses are reported as incomplete.
  const outcomes=await Promise.allSettled(seasons.map(season=>fetchLeague(apiKey,leagueId,season,iso(historyStart),iso(end))));
  const success=outcomes.filter(x=>x.status==='fulfilled');
  if(!success.length)throw Error('Keine historischen Ligadaten im API-Tarif verfügbar');
  const unique=[...new Map(success.flatMap(x=>x.value).map(g=>[String(g.fixture.id),g])).values()]
   .sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
  const records=[],previous=[];
  // Evaluate every kickoff day with data from earlier days only.
  let pos=0;
  while(pos<unique.length){
   const date=String(unique[pos].fixture.date).slice(0,10);
   let next=pos;while(next<unique.length&&String(unique[next].fixture.date).slice(0,10)===date)next++;
   const snapshot=historicalRanks(previous,unique[pos].league.season);
   for(let i=pos;i<next;i++){
    const g=unique[i],kickoff=Date.parse(g.fixture.date);
    if(kickoff<start.getTime()||kickoff>end.getTime()+86400000)continue;
    const model=projection(previous,g);if(!model)continue;
    const rank=Number(g.league.season)===Number(unique[pos].league.season)?snapshot:historicalRanks(previous,g.league.season);
    const verdict=choose(g,model,rank);
    const result=actual(g);
    const probs=model.probs;
    records.push({
     id:g.fixture.id,date,home:g.teams.home.name,away:g.teams.away.name,
     actual:result,selected:Object.entries(probs).sort((a,b)=>b[1]-a[1])[0][0],
     probabilities:probs,drawTip:verdict.draw,outsiderTip:verdict.outsider,
     historicalOutsider:verdict.historicalOutsider,rankHome:verdict.rankHome,rankAway:verdict.rankAway,
     brier:Object.entries(probs).reduce((sum,[key,value])=>sum+(value-(key===result?1:0))**2,0)/3,
     logloss:-Math.log(Math.max(1e-8,probs[result]))
    });
   }
   previous.push(...unique.slice(pos,next));pos=next;
  }
  const sample=records.length,draws=records.filter(r=>r.drawTip),
   outsider=records.filter(r=>r.outsiderTip),allOutsiders=records.filter(r=>r.historicalOutsider);
  const hits=(rows,key)=>rows.filter(r=>key==='draw'?r.actual==='draw':r.actual===r.outsiderTip).length;
  const average=key=>sample?records.reduce((n,r)=>n+r[key],0)/sample:null;
  return res.status(200).json({
   configured:true,league:{id:leagueId,name:league.league.name,country:league.country?.name},
   from:iso(start),to:iso(end),days,
   coverage:{fetched:unique.length,analyzed:sample,seasonRequests:outcomes.length,failedRequests:outcomes.length-success.length,complete:outcomes.length===success.length},
   result:sample?{
    matchWinnerAccuracy:records.filter(r=>r.actual===r.selected).length/sample,
    brier:average('brier'),logLoss:average('logloss')
   }:null,
   draw:{tips:draws.length,hits:hits(draws,'draw'),hitRate:draws.length?hits(draws,'draw')/draws.length:null,baselineRate:sample?records.filter(r=>r.actual==='draw').length/sample:null},
   outsider:{tips:outsider.length,hits:hits(outsider,'outsider'),hitRate:outsider.length?hits(outsider,'outsider')/outsider.length:null,
    baselineRate:allOutsiders.length?allOutsiders.filter(r=>r.actual===r.historicalOutsider).length/allOutsiders.length:null,baselineSample:allOutsiders.length},
   records:records.slice(-40).map(r=>({id:r.id,date:r.date,home:r.home,away:r.away,actual:r.actual,selected:r.selected,drawTip:r.drawTip,outsiderTip:r.outsiderTip,probabilities:r.probabilities,rankHome:r.rankHome,rankAway:r.rankAway})),
   sources:['API-Sports historische abgeschlossene Ligaspiele'],
   method:'Walk-forward: Mannschaftsform, Heim-/Auswärtswerte und Tabellenplätze ausschließlich aus Spielen VOR dem jeweiligen Spieltag. Vereinfachtes Tor-Modell als Baseline – kein 1:1-Replay der Live-Kombi.',
   limitations:['Frühere Torschützen-Vorhersagen sind noch nicht archiviert und deshalb nicht seriös rücktestbar.','Ausfälle, bestätigte Aufstellungen, Anbieterprognosen und alte Quoten sind nicht archiviert und fließen hier nicht ein.','Modellwahrscheinlichkeiten sind unkalibriert. Kleine Stichproben nicht überbewerten.'],
   updatedAt:new Date().toISOString()
  });
 }catch(e){return res.status(502).json({error:'Rücktest derzeit nicht verfügbar',detail:String(e.message||e).slice(0,140)})}
}
