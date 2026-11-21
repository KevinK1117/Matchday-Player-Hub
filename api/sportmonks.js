import {sportmonksFixtures,sportmonksFixtureSummary,sportmonksRequest} from '../lib/sportmonks-client.js';
import {SPORTMONKS_IDS} from '../lib/football-provider-routing.js';
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
