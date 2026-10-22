import {isTopFlight} from '../public/competitions.js';
const ROOT='https://v3.football.api-sports.io';
const cache=new Map();
async function api(path,key){
 const cached=cache.get(path);if(cached&&cached.until>Date.now())return cached.value;
 const response=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('API-Sports HTTP '+response.status);
 const body=await response.json();
 if(body.errors&&(Array.isArray(body.errors)?body.errors.length:Object.keys(body.errors).length))throw Error('API-Sports Datenlimit');
 const value=body.response||[];
 cache.set(path,{value,until:Date.now()+600000});if(cache.size>200)cache.delete(cache.keys().next().value);
 return value;
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
async function evaluate(g,key,date){
 const h=g.teams.home,a=g.teams.away;
 const [home,away,h2h,standings]=await Promise.allSettled([
  api('/fixtures?team='+h.id+'&last=20',key),
  api('/fixtures?team='+a.id+'&last=20',key),
  api('/fixtures/headtohead?h2h='+h.id+'-'+a.id+'&last=8',key),
  api('/standings?league='+g.league.id+'&season='+g.league.season,key)
 ]);
 if(home.status!=='fulfilled'||away.status!=='fulfilled'||standings.status!=='fulfilled'||h2h.status!=='fulfilled')return null;
 const hf=form(home.value.filter(x=>Number(x.league?.id)===Number(g.league.id)),h.id,date),af=form(away.value.filter(x=>Number(x.league?.id)===Number(g.league.id)),a.id,date),hr=ranks(standings.value,h.id),ar=ranks(standings.value,a.id);
 const direct=h2h.value.filter(x=>completed(x)&&String(x.fixture.date).slice(0,10)<date).slice(0,8);
 const draws=direct.filter(x=>x.goals.home===x.goals.away).length;
 if(hf.played<7||af.played<7||!hr||!ar||direct.length<2)return null;
 const homeRate=hf.last5Points/(hf.last5Played*3),awayRate=af.last5Points/(af.last5Played*3);
 const drawSignal=(hf.drawRate+af.drawRate)/2;
 const closeRanks=Math.abs(hr.rank-ar.rank)<=6;
 const balanced=Math.abs(homeRate-awayRate)<0.23;
 const h2hDraw=draws/direct.length;
 // H2H is a context signal, not the strongest input; older matches may have different squads.
 const drawScore=drawSignal*.65+h2hDraw*.15+(closeRanks?.1:0)+(balanced?.1:0);
 const picks=[];
 if(drawScore>=0.37&&drawSignal>=.25&&balanced)picks.push({type:'Unentschieden',team:'X',score:Math.round(drawScore*100),reason:'Remisquote Form '+Math.round(drawSignal*100)+' % · H2H '+draws+'/'+direct.length+' · Tabellenplätze '+hr.rank+'/'+ar.rank});
 const homeUnderdog=hr.rank>ar.rank+2&&homeRate<awayRate;
 const awayUnderdog=ar.rank>hr.rank+2&&awayRate<homeRate;
 if(homeUnderdog&&hf.homePlayed>=3&&hf.homePoints>=1.65&&af.awayPlayed>=3&&af.awayPoints<=1.3){
  const strength=hf.homePoints-af.awayPoints;
  picks.push({type:'Außenseiter-Sieg',team:'1 · '+h.name,score:Math.round(Math.min(.85,.40+strength*.15+(direct.filter(x=>Number(x.teams.home.id)===Number(h.id)&&x.goals.home>x.goals.away).length/direct.length)*.12)*100),reason:'Heimform '+hf.homePoints.toFixed(2)+' Pkt/Spiel · gegnerische Auswärtsform '+af.awayPoints.toFixed(2)+' · Tabellenplätze '+hr.rank+'/'+ar.rank+' · H2H '+direct.length+' Spiele'});
 }
 if(awayUnderdog&&af.awayPlayed>=3&&af.awayPoints>=1.65&&hf.homePlayed>=3&&hf.homePoints<=1.3){
  const strength=af.awayPoints-hf.homePoints;
  picks.push({type:'Außenseiter-Sieg',team:'2 · '+a.name,score:Math.round(Math.min(.85,.40+strength*.15+(direct.filter(x=>Number(x.teams.away.id)===Number(a.id)&&x.goals.away>x.goals.home).length/direct.length)*.12)*100),reason:'Auswärtsform '+af.awayPoints.toFixed(2)+' Pkt/Spiel · gegnerische Heimform '+hf.homePoints.toFixed(2)+' · Tabellenplätze '+hr.rank+'/'+ar.rank+' · H2H '+direct.length+' Spiele'});
 }
 return picks.sort((x,y)=>y.score-x.score).slice(0,1).map(p=>({...p,fixtureId:g.fixture.id,match:h.name+' – '+a.name,league:g.league.name,kickoff:g.fixture.date,homeForm:hf,awayForm:af,table:{home:hr,away:ar},h2h:{played:direct.length,draws}}));
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=900, stale-while-revalidate=300');
 const date=String(req.query?.date||''),count=Number(req.query?.count||6);
 if(!Number.isInteger(count)||count<6||count>10)return res.status(400).json({error:'6–10 Auswahlen wählen'});
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Ungültiges Datum'});
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,picks:[],notice:'API-Sports-Zugang fehlt.'});
 try{
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
  const results=await Promise.allSettled(selected.map(g=>evaluate(g,key,date)));
  const picks=results.filter(x=>x.status==='fulfilled'&&x.value).flatMap(x=>x.value).sort((a,b)=>b.score-a.score).slice(0,count);
  return res.status(200).json({configured:true,date,picks:picks.length>=count?picks:[],available:picks.length,complete:picks.length>=count,count,considered:selected.length,totalFixtures:fixtures.length,updatedAt:new Date().toISOString(),notice:(picks.length<count?'Nur '+picks.length+' geeignete Spiele. Keine vollständige '+count+'er-Kombi verfügbar. ':'')+'Tägliche Vorauswahl aus Tabellenstand, aktueller Form und H2H. Der Analyse-Index ist keine kalibrierte Gewinnwahrscheinlichkeit; das H2H ist nur ein schwaches Zusatzsignal. Fehlende Daten führen zum Ausschluss.'});
 }catch(e){return res.status(502).json({error:'Analyse derzeit nicht verfügbar',detail:String(e.message).slice(0,120)})}
}
