import {createHash} from 'node:crypto';
import {redis} from './push.js';
import {preferences} from '../lib/push-events.js';
import {apnsReady} from '../lib/native-push.js';
import {installationIdentity} from '../lib/native-subscription.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method==='GET')return res.status(200).json({enabled:apnsReady()});
 if(!['POST','DELETE'].includes(req.method))return res.status(405).end();
 try{
  const id=installationIdentity(req.headers['x-matchday-install']),key='matchday:push:ios:'+id;
  if(req.method==='DELETE'){await redis('DEL',key);await redis('SREM','matchday:push:keys',key);return res.status(200).json({ok:true})}
  if(!apnsReady())return res.status(503).json({error:'Apple Push noch nicht eingerichtet'});
  const token=req.body?.token;if(typeof token!=='string'||!/^[a-f0-9]{64,200}$/i.test(token))return res.status(400).json({error:'Ungültiges Gerätetoken'});
  const ip=String(req.headers['x-forwarded-for']||'unknown').split(',')[0],rateKey='matchday:push:rate:'+createHash('sha256').update(ip).digest('hex');
  const count=await redis('INCR',rateKey);if(count===1)await redis('EXPIRE',rateKey,60);if(count>60)return res.status(429).json({error:'Bitte kurz warten'});
  await redis('SET',key,JSON.stringify({version:3,subscription:{kind:'apns',token:token.toLowerCase()},preferences:preferences(req.body?.preferences),updatedAt:Date.now()}),'EX',7776000);
  await redis('SADD','matchday:push:keys',key);return res.status(200).json({ok:true});
 }catch(e){return res.status(e.statusCode||503).json({error:e.statusCode===401?e.message:'Push-Einstellungen momentan nicht speicherbar'})}
}
