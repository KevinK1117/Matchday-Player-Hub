const ROOT='https://v1.hockey.api-sports.io';
const cache=new Map();
async function hockey(path,key){
 const hit=cache.get(path);if(hit&&hit.until>Date.now())return hit.rows;
 const response=await fetch(ROOT+path,{headers:{'x-apisports-key':key},signal:AbortSignal.timeout(12000)});
 if(!response.ok)throw Error('Hockey-Daten HTTP '+response.status);
 const body=await response.json();
 if(body.errors&&(Array.isArray(body.errors)?body.errors.length:Object.keys(body.errors).length))throw Error('Hockey-API-Zugriff oder Tarif prüfen');
 const rows=body.response||[];cache.set(path,{rows,until:Date.now()+(path.startsWith('/games?')?30000:86400000)});return rows;
}
export default async function handler(req,res){
 res.setHeader('Cache-Control','s-maxage=30, stale-while-revalidate=30');
 const date=String(req.query?.date||'');
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date))return res.status(400).json({error:'Ungültiges Datum'});
 const key=process.env.API_HOCKEY_KEY||process.env.API_SPORTS_KEY;
 if(!key)return res.status(200).json({configured:false,games:[],notice:'API-Hockey-Key fehlt'});
 try{
  const leagues=await hockey('/leagues?search=DEL',key);
  const league=leagues.find(x=>/^(DEL|Deutsche Eishockey Liga)$/i.test(String(x.name||''))&&/germany|deutschland/i.test(String(x.country?.name||x.country||'Germany')))||leagues.find(x=>/^DEL$/i.test(String(x.name||'')));
  if(!league)return res.status(200).json({configured:true,games:[],notice:'DEL-Liga beim Datenanbieter nicht gefunden'});
  const rows=await hockey('/games?date='+date+'&league='+league.id+'&timezone=Europe%2FBerlin',key);
  const games=rows.map(g=>({id:g.id,date:g.date,home:g.teams?.home?.name||'Heimteam',away:g.teams?.away?.name||'Gastteam',homeLogo:g.teams?.home?.logo||null,awayLogo:g.teams?.away?.logo||null,homeGoals:g.scores?.home??null,awayGoals:g.scores?.away??null,status:g.status?.short||'NS',period:g.periods||null})); 
  return res.status(200).json({configured:true,games,source:'API-Hockey',league:league.name,updatedAt:new Date().toISOString()});
 }catch(e){return res.status(502).json({error:'DEL-Daten nicht verfügbar: '+String(e.message||e).slice(0,120)})}
}
