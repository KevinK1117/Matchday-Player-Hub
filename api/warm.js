// Vercel daily cron: pre-fetch the day's draw/underdog analysis.
// Public UI still refreshes data on every selected day; cron is a cache warmer only.
export default async function handler(req,res){
 const secret=process.env.CRON_SECRET;
 if(secret&&req.headers.authorization!==`Bearer ${secret}`)return res.status(401).json({error:'Unauthorized'});
 const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
 const date=Object.fromEntries(parts.filter(x=>x.type!=='literal').map(x=>[x.type,x.value]));
 const day=`${date.year}-${date.month}-${date.day}`;
 const domain=process.env.VERCEL_PROJECT_PRODUCTION_URL||process.env.VERCEL_URL;
 if(!domain)return res.status(200).json({ok:true,date:day,prewarmed:false,notice:'Deployment-URL nicht verfügbar; die App lädt die Analyse bei Nutzung.'});
 try{
  const host=String(domain).replace(/^https?:\/\//,'').replace(/\/$/,'');
  if(!/^[a-z0-9.-]+$/i.test(host))throw Error('Deployment-URL ungültig');
  const response=await fetch('https://'+host+'/api/draws?date='+day,{headers:{Accept:'application/json'},signal:AbortSignal.timeout(28000)});
  const d=await response.json();
  if(!response.ok||d.error)throw Error(d.error||'API HTTP '+response.status);
  return res.status(200).json({ok:true,date:day,prewarmed:true,considered:d.considered||0,picks:d.picks?.length||0,notice:'Tagesanalyse einmal abgerufen. Kein dauerhafter Speicher und keine Benachrichtigung.'});
 }catch(e){return res.status(200).json({ok:false,date:day,prewarmed:false,notice:'Analyse wird beim Öffnen der App frisch abgerufen.',detail:String(e.message||e).slice(0,140)})}
}
