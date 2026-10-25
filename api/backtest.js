import {isTopFlight} from '../public/competitions.js';
const ROOT='https://v3.football.api-sports.io';
const ids=[78,79,39,140,135,61,88,94,103,119,179,180,113,114];
const iso=d=>d.toISOString().slice(0,10);
const outcome=g=>g.goals.home>g.goals.away?'home':g.goals.home<g.goals.away?'away':'draw';
const clamp=(n,lo,hi)=>Math.max(lo,Math.min(hi,n));
const mean=(a,key)=>a.length?a.reduce((n,g)=>n+g[key],0)/a.length:null;
const p=(n,lambda)=>{let v=Math.exp(-lambda);for(let i=1;i<=n;i++)v*=lambda/i;return v};
function forecast(history,fixture){
 const h=fixture.teams.home.id,a=fixture.teams.away.id;
 const recent=(id)=>history.filter(g=>g.teams.home.id===id||g.teams.away.id===id).slice(-12);
 const home=recent(h),away=recent(a);
 if(home.length<6||away.length<6)return null;
 const venueHome=home.filter(g=>g.teams.home.id===h),venueAway=away.filter(g=>g.teams.away.id===a);
 if(venueHome.length<2||venueAway.length<2)return null;
 const ha=mean(venueHome,'homeGoals'),ad=mean(venueAway,'homeGoals');
 const aa=mean(venueAway,'awayGoals'),hd=mean(venueHome,'awayGoals');
 const hAll=home.map(g=>({scored:g.teams.home.id===h?g.goals.home:g.goals.away,against:g.teams.home.id===h?g.goals.away:g.goals.home}));
 const aAll=away.map(g=>({scored:g.teams.home.id===a?g.goals.home:g.goals.away,against:g.teams.home.id===a?g.goals.away:g.goals.home}));
 const lambdaHome=clamp((.5*ha+.5*ad)*.68+(.5*mean(hAll,'scored')+.5*mean(aAll,'against'))*.32,.25,3.6);
 const lambdaAway=clamp((.5*aa+.5*hd)*.68+(.5*mean(aAll,'scored')+.5*mean(hAll,'against'))*.32,.25,3.6);
 const out={home:0,draw:0,away:0};let total=0;
 for(let x=0;x<10;x++)for(let y=0;y<10;y++){const w=p(x,lambdaHome)*p(y,lambdaAway);total+=w;out[x>y?'home':x<y?'away':'draw']+=w}
 for(const key of Object.keys(out))out[key]/=total;
 return out;
}
async function fetchLeague(key,league,season,from,to){
 const url=ROOT+'/fixtures?league='+league+'&season='+season+'&from='+from+'&to='+to;
 const r=await fetch(url,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error('Sportdaten HTTP '+r.status);
 const body=await r.json();
 if(body.errors&&(Array.isArray(body.errors)?body.errors.length:Object.keys(body.errors).length))throw Error('Sportdatenanbieter: eingeschränkter Zugriff');
 return (body.response||[]).filter(g=>isTopFlight(g.league)&&['FT','AET','PEN'].includes(g.fixture?.status?.short)&&Number.isFinite(g.goals?.home)&&Number.isFinite(g.goals?.away)).sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=21600, stale-while-revalidate=3600');
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,notice:'API-Sports-Key fehlt'});
 const league=Number(req.query?.league||78),days=clamp(Number(req.query?.days)||30,14,45);
 if(!ids.includes(league))return res.status(400).json({error:'Liga nicht im begrenzten Rücktest freigegeben'});
 const now=new Date(),end=new Date(now.getTime()-86400000),start=new Date(end.getTime()-(days-1)*86400000),historyStart=new Date(start.getTime()-140*86400000);
 const years=[...new Set([historyStart.getUTCFullYear(),start.getUTCFullYear(),end.getUTCFullYear()].map(y=>start.getUTCMonth()<6?y-1:y))];
 // League seasons are July-based for most supported European competitions.
 const seasons=[...new Set([historyStart,start,end].map(d=>d.getUTCMonth()<6?d.getUTCFullYear()-1:d.getUTCFullYear()))];
 try{
  const batches=await Promise.allSettled(seasons.map(season=>fetchLeague(key,league,season,iso(historyStart),iso(end))));
  const games=batches.filter(r=>r.status==='fulfilled').flatMap(r=>r.value).sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
  const unique=[...new Map(games.map(g=>[g.fixture.id,g])).values()].sort((a,b)=>Date.parse(a.fixture.date)-Date.parse(b.fixture.date));
  const records=[],history=[];
  for(const g of unique){
   const ts=Date.parse(g.fixture.date),pred=forecast(history,g);
   if(pred&&ts>=start.getTime()&&ts<=end.getTime()+86400000){
    const actual=outcome(g),selected=Object.entries(pred).sort((a,b)=>b[1]-a[1])[0][0];
    const homeUnderdog=history.filter(x=>x.teams.home.id===g.teams.home.id||x.teams.away.id===g.teams.home.id).length>=6;
    records.push({id:g.fixture.id,date:g.fixture.date.slice(0,10),home:g.teams.home.name,away:g.teams.away.name,actual,selected,prob:pred,brier:(Object.entries(pred).reduce((sum,[k,v])=>sum+(v-(k===actual?1:0))**2,0))/3,logloss:-Math.log(Math.max(1e-8,pred[actual])),drawTip:pred.draw>=.26&&Math.abs(pred.home-pred.away)<.13,drawCorrect:actual==='draw',upsetTip:Math.min(pred.home,pred.away)>=.20&&Math.abs(pred.home-pred.away)>.1?null:null});
   }
   history.push(g);
  }
  const n=records.length,draws=records.filter(r=>r.drawTip),baselineDraw=n?records.filter(r=>r.actual==='draw').length/n:null;
  const accuracy=n?records.filter(r=>r.actual===r.selected).length/n:null;
  const avg=(arr,key)=>arr.length?arr.reduce((s,x)=>s+x[key],0)/arr.length:null;
  return res.status(200).json({configured:true,league,days,from:iso(start),to:iso(end),sample:n,accuracy,brier:avg(records,'brier'),logloss:avg(records,'logloss'),draw:{tips:draws.length,hits:draws.filter(r=>r.drawCorrect).length,hitRate:draws.length?draws.filter(r=>r.drawCorrect).length/draws.length:null,baselineRate:baselineDraw},records:records.slice(-30).map(({id,date,home,away,actual,selected,prob,drawTip})=>({id,date,home,away,actual,selected,prob,drawTip})),coverage:{fixturesFetched:unique.length,seasonsChecked:seasons.length,failedRequests:batches.filter(x=>x.status==='rejected').length},method:'Walk-forward: jedes Spiel nur mit zuvor beendeten Ligaspielen bewertet. Keine zukünftigen Ergebnisse im Modell. Vereinfachtes Poisson-Basismodell, NICHT der vollständige Live-Algorithmus. Keine rückwirkend gespeicherten Spieler-/Quoten-/Ausfalldaten.',limitations:['Kein echter Backtest früherer Torschützen-Tipps ohne archivierte Vorab-Prognosen','Kein belastbarer Außenseiter-Backtest ohne historische Vorab-Quoten oder klaren Vorab-Favoriten','Die Auswertung ist keine kalibrierte Wettwahrscheinlichkeit']});
 }catch(e){return res.status(502).json({error:'Rücktest nicht verfügbar',detail:String(e.message||e).slice(0,120)})}
}
