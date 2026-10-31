import {redis,configurePush,sendPush} from './push.js';
const berlinDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function fixtures(base,date){const url=new URL(base);url.searchParams.set('action','fixtures');url.searchParams.set('date',date);const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error('Live API HTTP '+r.status);const d=await r.json();if(!Array.isArray(d.data))throw Error('Keine gültigen Spieldaten');return d.data}
async function nhlPeriod(id){const r=await fetch('https://api-web.nhle.com/v1/gamecenter/'+encodeURIComponent(id)+'/boxscore',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('NHL-Detail HTTP '+r.status);const g=await r.json();return Number(g.periodDescriptor?.number||g.period||0)}
export default async function handler(req,res){
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).end();
 if(!configurePush())return res.status(503).json({error:'VAPID fehlt'});
 const origin='https://matchday-player-hub.vercel.app',date=berlinDate(),signals=[],errors=[];
 let keys;try{keys=await redis('SMEMBERS','matchday:push:keys')||[]}catch(e){return res.status(503).json({error:'Push-Speicher nicht verfügbar'})}
 if(!keys.length)return res.status(200).json({signals:0,sent:0,subscribers:0,notice:'Noch keine Push-Abonnenten'});
 if(req.query?.test==='1'){
  let sent=0,failed=0;const details=[];
  for(const key of keys){try{const raw=await redis('GET',key);if(!raw)continue;await sendPush(JSON.parse(raw),{title:'Matchday PRO · Push-Test',body:'Testnachricht vom Matchday-Server',url:origin+'/matchcenter',tag:'matchday-push-test'});sent++}catch(e){failed++;details.push({status:e.statusCode||null,message:String(e.message||e).slice(0,130)})}}
  return res.status(200).json({test:true,subscribers:keys.length,sent,failed,details});
 }

 for(const [sport,path] of [['football','matchcenter'],['nhl','nhlcenter']]){
  try{
   for(const g of await fixtures(origin+'/api/'+path,date)){
    const status=String(g.fixture?.status?.short||'').toUpperCase(),home=g.teams?.home?.name,away=g.teams?.away?.name,score=g.goals,id=g.fixture?.id;
    if(!id||!home||!away||score?.home==null||score?.away==null)continue;
    let signal=false,label='';
    if(sport==='football'){const minute=Number(g.fixture?.status?.elapsed);signal=(status==='1H'&&minute>=40&&minute<=45)||(status==='2H'&&minute>=80&&minute<=88);label=(minute>=80?'Spätes Tor':'Weiteres Tor')+' · '+minute+'. Minute · Über '+(Number(score.home)+Number(score.away))+',5 Tore'+(minute<80?' 1. HZ':' Gesamtspiel')}
    else if(status==='LIVE'){const period=await nhlPeriod(id).catch(()=>0);signal=period===3;label='Spätes Tor · 3. Drittel · Über '+(Number(score.home)+Number(score.away))+',5 Tore'}
    if(!signal)continue;
    signals.push({id:sport+':'+id,title:'Matchday PRO · Live-Tipp',body:home+' – '+away+' · '+score.home+':'+score.away+' · '+label,url:origin+'/matchcenter'});
   }
  }catch(e){errors.push(sport+': '+e.message)}
 }
 let sent=0,failed=0;
 for(const signal of signals){
  for(const key of keys){
   const deliveredKey='matchday:push:delivered:'+date+':'+signal.id+':'+key;
   if(await redis('EXISTS',deliveredKey))continue;
   const raw=await redis('GET',key);if(!raw)continue;
   try{
    await sendPush(JSON.parse(raw),{...signal,tag:signal.id});
    await redis('SET',deliveredKey,'1','EX',172800);
    sent++;
   }catch(e){
    failed++;
    if([404,410].includes(e.statusCode)){
     await redis('DEL',key);
     await redis('SREM','matchday:push:keys',key);
    }
   }
  }
 }
 return res.status(200).json({signals:signals.length,subscribers:keys.length,sent,failed,errors});
}
