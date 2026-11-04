import {liveTipMessage} from '../lib/push-message.js';
import {watches,wantsLiveTip} from '../lib/push-events.js';
import {favoriteSignals} from '../lib/favorite-push.js';
import {redis,anyPushReady,sendPush} from './push.js';
const berlinDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
async function fixtures(base,date){const url=new URL(base);url.searchParams.set('action','fixtures');url.searchParams.set('date',date);const r=await fetch(url,{signal:AbortSignal.timeout(20000),headers:{'Cache-Control':'no-cache'}});if(!r.ok)throw Error('Live API HTTP '+r.status);const d=await r.json();if(!Array.isArray(d.data))throw Error('Keine gültigen Spieldaten');return d.data}
async function nhlPeriod(id){const r=await fetch('https://api-web.nhle.com/v1/gamecenter/'+encodeURIComponent(id)+'/boxscore',{signal:AbortSignal.timeout(10000)});if(!r.ok)throw Error('NHL-Detail HTTP '+r.status);const g=await r.json();return Number(g.periodDescriptor?.number||g.period||0)}
export default async function handler(req,res){
 if(!process.env.CRON_SECRET||req.headers.authorization!=='Bearer '+process.env.CRON_SECRET)return res.status(401).end();
 if(!anyPushReady())return res.status(503).json({error:'Push nicht konfiguriert'});
 const budgetUntil=Date.now()+45000;
 const origin='https://matchday-player-hub.vercel.app',date=berlinDate(),signals=[],errors=[];
 let keys;try{keys=await redis('SMEMBERS','matchday:push:keys')||[]}catch(e){return res.status(503).json({error:'Push-Speicher nicht verfügbar'})}
 if(!keys.length)return res.status(200).json({signals:0,sent:0,subscribers:0,notice:'Noch keine Push-Abonnenten'});
 const subscribers=[];for(const key of keys){try{const raw=await redis('GET',key);if(!raw){await redis('SREM','matchday:push:keys',key);continue}const record=JSON.parse(raw);subscribers.push({key,subscription:record.subscription||record,preferences:record.preferences||{liveTips:true,favoriteEvents:false}})}catch{}}
 if(req.query?.test==='1'){
  let sent=0,failed=0;const details=[];
  for(const key of keys){try{const raw=await redis('GET',key);if(!raw)continue;await sendPush((JSON.parse(raw).subscription||JSON.parse(raw)),{title:'Matchday PRO · Push-Test',body:'Testnachricht vom Matchday-Server',url:origin+'/matchcenter',tag:'matchday-push-test'});sent++}catch(e){failed++;details.push({status:e.statusCode||null,message:String(e.message||e).slice(0,130)})}}
  return res.status(200).json({test:true,subscribers:keys.length,sent,failed,details});
 }

 for(const [sport,path] of [['football','matchcenter'],['nhl','nhlcenter']]){
  try{
   const previousDate=new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);const rows=await Promise.allSettled([fixtures(origin+'/api/'+path,date),fixtures(origin+'/api/'+path,previousDate)]);const allGames=[...new Map(rows.filter(r=>r.status==='fulfilled').flatMap(r=>r.value).map(g=>[g.fixture.id,g])).values()];
   const favorite=await favoriteSignals({sport,games:allGames,subscribers,redis,budgetUntil});signals.push(...favorite.signals);errors.push(...favorite.errors);
   for(const g of allGames){
    const status=String(g.fixture?.status?.short||'').toUpperCase(),home=g.teams?.home?.name,away=g.teams?.away?.name,score=g.goals,id=g.fixture?.id;
    if(!id||!home||!away||score?.home==null||score?.away==null)continue;
    let signal=false,label='';
    if(sport==='football'){const minute=Number(g.fixture?.status?.elapsed);signal=Number.isFinite(minute)&&((minute>=40&&minute<=45&&['1H','LIVE','IN'].includes(status))||(minute>=80&&minute<=88&&['2H','LIVE','IN'].includes(status)));label=(minute>=80?'Spätes Tor':'Weiteres Tor')+' · '+minute+'. Minute · Über '+(Number(score.home)+Number(score.away))+',5 Tore'+(minute<80?' 1. HZ':' Gesamtspiel')}
    else if(status==='LIVE'){const period=await nhlPeriod(id).catch(()=>0);signal=period===3;label='Spätes Tor · 3. Drittel · Über '+(Number(score.home)+Number(score.away))+',5 Tore'}
    if(!signal)continue;
    signals.push({sport,id:sport+':'+id+':'+(sport==='football'?(Number(g.fixture?.status?.elapsed)<80?'first-half':'late-game'):'third-period'),...liveTipMessage(g,sport,label),url:origin+'/matchcenter'});
   }
  }catch(e){errors.push(sport+': '+e.message)}
 }
 // Persist favorite events before delivery so transient push failures retry on the next scan.
 for(const signal of signals.filter(s=>s.audience)){await redis('SET','matchday:push:event:'+signal.id,JSON.stringify({...signal,createdAt:Date.now()}),'EX',3600);await redis('SADD','matchday:push:outbox',signal.id)}
 const queued=await redis('SMEMBERS','matchday:push:outbox')||[];
 for(const id of queued.slice(0,100)){const raw=await redis('GET','matchday:push:event:'+id);if(!raw){await redis('SREM','matchday:push:outbox',id);continue}const event=JSON.parse(raw);if(!signals.some(s=>s.id===event.id))signals.push(event)}
 let sent=0,failed=0;
 for(const signal of signals){
  for(const {key,subscription,preferences} of subscribers){
   if(signal.audience?(!signal.audience.includes(key)||!preferences.favoriteEvents||(signal.watch&&!watches(preferences,signal.watch.sport,signal.watch.game))):!wantsLiveTip(preferences,signal.sport))continue;
   const deliveredKey='matchday:push:delivered:'+signal.id+':'+key;
   if(await redis('EXISTS',deliveredKey))continue;
   const raw=await redis('GET',key);if(!raw)continue;
   try{
    const {audience,watch,createdAt,...payload}=signal;await sendPush(subscription,{...payload,tag:signal.id});
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
  if(signal.audience){const targets=subscribers.filter(s=>signal.audience.includes(s.key)&&(!signal.watch||watches(s.preferences,signal.watch.sport,signal.watch.game)));const complete=(await Promise.all(targets.map(s=>redis('EXISTS','matchday:push:delivered:'+signal.id+':'+s.key)))).every(Boolean);if(complete){await redis('DEL','matchday:push:event:'+signal.id);await redis('SREM','matchday:push:outbox',signal.id)}}
 }
 return res.status(200).json({signals:signals.length,subscribers:keys.length,sent,failed,errors});
}
