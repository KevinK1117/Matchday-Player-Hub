import {sportmonksFixtures,sportmonksFixtureSummary,sportmonksRequest} from '../lib/sportmonks-client.js';
import {SPORTMONKS_IDS, sportmonksForApiSports} from '../lib/football-provider-routing.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=30');
 if(!process.env.SPORTMONKS_API_TOKEN)return res.status(503).json({configured:false,provider:'Sportmonks',error:'SPORTMONKS_API_TOKEN fehlt'});
 const action=String(req.query?.action||'fixtures');
 try{
  if(action==='fixtures'){
   const date=String(req.query?.date||'');
   if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Ungültiges Datum'});
   const result=await sportmonksFixtures(date);
   return res.status(200).json({configured:true,provider:'Sportmonks',partial:result.partial,fixtures:result.fixtures.map(sportmonksFixtureSummary),updatedAt:new Date().toISOString()});
  }
  if(action==='all-fixtures'){
   const date=String(req.query?.date||'');
   if(!/^\\d{4}-\\d{2}-\\d{2}$/.test(date))return res.status(400).json({error:'Ungültiges Datum'});
   const key=process.env.API_SPORTS_KEY;
   const [monks,sports]=await Promise.allSettled([
    sportmonksFixtures(date),
    key?fetch('https://v3.football.api-sports.io/fixtures?date='+encodeURIComponent(date)+'&timezone=Europe%2FBerlin',{
     headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)
    }).then(async r=>{if(!r.ok)throw Error('API-Sports HTTP '+r.status);const body=await r.json();if(body.errors&&Object.keys(body.errors).length)throw Error('API-Sports Datenfehler');return body.response||[]}):Promise.resolve([])
   ]);
   const errors=[];
   if(monks.status==='rejected')errors.push('Sportmonks: '+String(monks.reason?.message||monks.reason));
   if(sports.status==='rejected')errors.push('API-Sports: '+String(sports.reason?.message||sports.reason));
   const subscribed=monks.status==='fulfilled'?monks.value.fixtures.map(sportmonksFixtureSummary):[];
   const other=sports.status==='fulfilled'?sports.value.filter(f=>!sportmonksForApiSports(f.league?.id)).map(f=>({
    id:f.fixture.id,leagueId:f.league.id,league:f.league.name,
    home:f.teams.home.name,away:f.teams.away.name,homeId:f.teams.home.id,awayId:f.teams.away.id,
    start:f.fixture.date,status:f.fixture.status?.short||null,
    homeGoals:f.goals?.home??null,awayGoals:f.goals?.away??null,provider:'API-Sports'
   })):[];
   return res.status(errors.length===2?502:200).json({
    configured:errors.length<2,provider:'mixed',fixtures:[...subscribed,...other].sort((a,b)=>String(a.start).localeCompare(String(b.start))),
    partial:errors.length>0||(monks.status==='fulfilled'&&monks.value.partial),
    errors,updatedAt:new Date().toISOString()
   });
  }
  if(action==='detail'){
   const id=Number(req.query?.id);
   if(!Number.isSafeInteger(id)||id<=0)return res.status(400).json({error:'Ungültige Spiel-ID'});
   const body=await sportmonksRequest('/fixtures/'+id,{include:'participants;state;league;scores;statistics;lineups;events'},20000);
   if(!SPORTMONKS_IDS.includes(Number(body.data?.league_id)))return res.status(404).json({error:'Spiel gehört nicht zu den 18 gebuchten Ligen'});
   return res.status(200).json({configured:true,provider:'Sportmonks',data:body.data,updatedAt:new Date().toISOString()});
  }
  return res.status(400).json({error:'Unbekannte Abfrage'});
 }catch(e){
  const message=String(e.message||e);
  return res.status(/HTTP 401|HTTP 403/.test(message)?403:502).json({provider:'Sportmonks',error:message});
 }
}
