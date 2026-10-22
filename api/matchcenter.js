import {isTopFlight} from '../public/competitions.js';
const cache = new Map();
const ROOT = 'https://v3.football.api-sports.io';
async function api(path,key){
 const hit=cache.get(path);if(hit&&hit.until>Date.now())return hit.data;
 const r=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(14000)});
 if(!r.ok)throw Error('Sportdatenanbieter antwortet mit HTTP '+r.status);
 const body=await r.json();if(body.errors&&Object.keys(body.errors).length)throw Error('Sportdaten derzeit nicht verfügbar. Tarif, Tageslimit oder Anbieter prüfen.');
 const data=body.response||[];cache.set(path,{until:Date.now()+(path.startsWith('/fixtures?date')?30000:300000),data});if(cache.size>200)cache.delete(cache.keys().next().value);return data;
}
const integer=(v)=>/^\d{1,10}$/.test(String(v))&&Number(v)>0;
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=15');
 const q=req.query||{},action=q.action||'fixtures';
 if(!['fixtures','detail','table','player','squad','scorers','leagues'].includes(action))return res.status(400).json({error:'Unbekannte Abfrage'});
 const date=String(q.date||'');
 if(action==='fixtures'&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date+'T12:00:00Z'))))return res.status(400).json({error:'Ungültiges Datum'});
 if(['detail','player','squad'].includes(action)&&!integer(q.id))return res.status(400).json({error:'Ungültige ID'});
 if(['table','player','squad','scorers'].includes(action)&&!/^20\d{2}$/.test(String(q.season)))return res.status(400).json({error:'Ungültige Saison'});
 if(['table','scorers'].includes(action)&&!integer(q.league))return res.status(400).json({error:'Ungültige Liga'});
 const key=process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,data:null,notice:'Sportdaten-Zugang fehlt. API_SPORTS_KEY in Vercel einrichten; die Demo lässt sich separat öffnen.'});
 try{
 let data;
 if(action==='leagues')data=(await api('/leagues?current=true',key)).filter(c=>isTopFlight({...c.league,country:c.country?.name})).map(c=>({id:c.league.id,name:c.league.name,country:c.country?.name,logo:c.league.logo,seasons:c.seasons}));
 if(action==='fixtures')data=(await api('/fixtures?date='+date+'&timezone=Europe%2FBerlin',key)).filter(g=>isTopFlight(g.league));
 if(['table','scorers'].includes(action)){
 const competitions=await api('/leagues?id='+q.league,key);
 if(!competitions.some(c=>isTopFlight({...c.league,country:c.country?.name})))return res.status(400).json({error:'Nur nationale Erstligen sind freigeschaltet'});
 if(action==='table')data=await api('/standings?league='+q.league+'&season='+q.season,key);
 }
 if(action==='player'){
 const profiles=await api('/players?id='+q.id+'&season='+q.season,key);
 const team=profiles[0]?.statistics?.[0]?.team?.id;
 let recent=[],recentError=null;
 if(team){try{
 const fixtures=(await api('/fixtures?team='+team+'&last=5&status=FT-AET-PEN',key)).filter(g=>isTopFlight(g.league)).sort((a,b)=>Date.parse(b.fixture.date)-Date.parse(a.fixture.date));
 recent=await Promise.all(fixtures.map(async g=>{try{const sides=await api('/fixtures/players?fixture='+g.fixture.id,key);const entry=sides.flatMap(s=>s.players||[]).find(p=>Number(p.player.id)===Number(q.id));const st=entry?.statistics?.[0];return {date:g.fixture.date,home:g.teams.home.name,away:g.teams.away.name,minutes:st?.games?.minutes??null,goals:st?.goals?.total??null,shots:st?.shots?.total??null,onTarget:st?.shots?.on??null,available:!!st};}catch{return {date:g.fixture.date,home:g.teams.home.name,away:g.teams.away.name,available:false}}}));
 }catch{recentError='Letzte Spiele nicht verfügbar'}}
 let participation='Keine kommende Begegnung verfügbar';
 if(team){try{const next=(await api('/fixtures?team='+team+'&next=1',key))[0];if(next){const lineups=await api('/fixtures/lineups?fixture='+next.fixture.id,key);const side=lineups.find(s=>s.team?.id===team);participation=side?.startXI?.length?(side.startXI.some(p=>Number(p.player.id)===Number(q.id))?'Startelf bestätigt':'Nicht in bestätigter Startelf'):'Startelf noch nicht veröffentlicht';participation+=' · '+next.teams.home.name+' – '+next.teams.away.name;}}catch{participation='Startelfstatus nicht verfügbar'}}
 data={profiles,recent,recentError,participation};
 }
 if(action==='scorers')data=await api('/players/topscorers?league='+q.league+'&season='+q.season,key);
 if(action==='squad')data=await api('/players?team='+q.id+'&season='+q.season+'&page=1',key);
 if(action==='detail'){
 const fixtures=await api('/fixtures?id='+q.id,key),g=fixtures[0];if(!g||!isTopFlight(g.league))return res.status(404).json({error:'Begegnung nicht gefunden'});
 const paths={stats:'/fixtures/statistics?fixture='+q.id,events:'/fixtures/events?fixture='+q.id,lineups:'/fixtures/lineups?fixture='+q.id,h2h:'/fixtures/headtohead?h2h='+g.teams.home.id+'-'+g.teams.away.id+'&last=10',homeRecent:'/fixtures?team='+g.teams.home.id+'&last=10&status=FT-AET-PEN',awayRecent:'/fixtures?team='+g.teams.away.id+'&last=10&status=FT-AET-PEN',table:'/standings?league='+g.league.id+'&season='+g.league.season};
 const entries=await Promise.all(Object.entries(paths).map(async([name,path])=>{try{const rows=await api(path,key);return [name,{data:['h2h','homeRecent','awayRecent'].includes(name)?rows.filter(x=>isTopFlight(x.league)):rows,error:null}]}catch{return [name,{data:[],error:'Daten nicht verfügbar'}]}}));data={fixture:g,...Object.fromEntries(entries)};
 }
 return res.status(200).json({configured:true,data,source:'API-Sports',updatedAt:new Date().toISOString()});
 }catch{return res.status(502).json({error:'Sportdaten konnten nicht geladen werden. Bitte später erneut versuchen oder API-Tarif prüfen.'})}
}
