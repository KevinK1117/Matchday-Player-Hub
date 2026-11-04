import {watches} from '../lib/push-events.js';
import {allowedPushEvent} from '../lib/push-policy.js';
import {favoriteSignals} from '../lib/favorite-push.js';
import {redis,anyPushReady,sendPush} from './push.js';
import {pushFixtures} from '../lib/push-fixtures.js';
import {pushCheckAccess} from '../lib/push-check-auth.js';
import {randomUUID} from 'node:crypto';
const berlinDate=()=>new Intl.DateTimeFormat('en-CA',{timeZone:'Europe/Berlin',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(!pushCheckAccess(req))return res.status(401).end();
 if(req.query?.status==='1')return res.status(200).json({lastRun:JSON.parse(await redis('GET','matchday:push:last-run')||'null')});
 if(!anyPushReady())return res.status(503).json({error:'Push nicht konfiguriert'});
 const startedAt=Date.now(),budgetUntil=startedAt+45000;
 const origin='https://matchday-player-hub.vercel.app',date=berlinDate(),signals=[],errors=[];
 let keys;try{keys=await redis('SMEMBERS','matchday:push:keys')||[]}catch(e){return res.status(503).json({error:'Push-Speicher nicht verfügbar'})}
 if(!keys.length)return res.status(200).json({signals:0,sent:0,subscribers:0,notice:'Noch keine Push-Abonnenten'});
 const subscribers=[];for(const key of keys){try{const raw=await redis('GET',key);if(!raw){await redis('SREM','matchday:push:keys',key);continue}const record=JSON.parse(raw);subscribers.push({key,subscription:record.subscription||record,preferences:record.preferences||{liveTips:true,favoriteEvents:false}})}catch{}}
 if(req.query?.test==='1')return res.status(400).json({error:'Test-Push deaktiviert: nur Tore und Spielende'});

 // A minute scheduler and the old fallback must not send the same events
 // concurrently. The short lease expires even if the invocation is interrupted.
 const lease=randomUUID();
 if(await redis('SET','matchday:push:scan-lease',lease,'NX','EX',120)!=='OK')return res.status(200).json({skipped:true,reason:'scan_in_progress'});
 try{
 await Promise.all(['football','nhl'].map(async sport=>{
  try{
   const previousDate=new Date(Date.parse(date+'T12:00:00Z')-86400000).toISOString().slice(0,10);const rows=await Promise.allSettled([pushFixtures(sport,date),pushFixtures(sport,previousDate)]);if(rows.every(r=>r.status==='rejected'))throw Error('Spielplan-Abruf fehlgeschlagen');const allGames=[...new Map(rows.filter(r=>r.status==='fulfilled').flatMap(r=>r.value).map(g=>[g.fixture.id,g])).values()];
   const favorite=await favoriteSignals({sport,games:allGames,subscribers,redis,budgetUntil});signals.push(...favorite.signals);errors.push(...favorite.errors);
  }catch(e){errors.push(sport+': '+e.message)}
 }));
 // Persist favorite events before delivery so transient push failures retry on the next scan.
 for(const signal of signals.filter(s=>s.audience)){await redis('SET','matchday:push:event:'+signal.id,JSON.stringify({...signal,createdAt:Date.now()}),'EX',3600);await redis('SADD','matchday:push:outbox',signal.id)}
 const queued=await redis('SMEMBERS','matchday:push:outbox')||[];
 for(const id of queued.slice(0,100)){const raw=await redis('GET','matchday:push:event:'+id);if(!raw){await redis('SREM','matchday:push:outbox',id);continue}const event=JSON.parse(raw);if(!allowedPushEvent(event)){await redis('DEL','matchday:push:event:'+id);await redis('SREM','matchday:push:outbox',id);continue}if(!signals.some(s=>s.id===event.id))signals.push(event)}
 let sent=0,failed=0;
 for(const signal of signals){
  if(!allowedPushEvent(signal))continue;
  for(const {key,subscription,preferences} of subscribers){
   if(!signal.audience?.includes(key)||!preferences.favoriteEvents||!signal.watch||!watches(preferences,signal.watch.sport,signal.watch.game))continue;
   const deliveredKey='matchday:push:delivered:'+signal.id+':'+key;
   if(await redis('EXISTS',deliveredKey))continue;
   const raw=await redis('GET',key);if(!raw)continue;
   try{
    const {audience,watch,createdAt,eventType,...payload}=signal;await sendPush(subscription,{...payload,tag:signal.id});
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
 const lastRun={checkedAt:new Date(startedAt).toISOString(),durationMs:Date.now()-startedAt,signals:signals.length,subscribers:keys.length,sent,failed,errors};
 await redis('SET','matchday:push:last-run',JSON.stringify(lastRun),'EX',172800);
 return res.status(200).json(lastRun);
 }finally{
  // Do not delete a newer worker's lease if this invocation outlived its TTL.
  await redis('EVAL',"if redis.call('GET', KEYS[1]) == ARGV[1] then return redis.call('DEL', KEYS[1]) else return 0 end",1,'matchday:push:scan-lease',lease).catch(()=>{});
 }
}
