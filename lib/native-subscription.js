import {createHash} from 'node:crypto';
export function installationIdentity(secret){
 if(typeof secret!=='string'||!/^[-_A-Za-z0-9]{43}$/.test(secret))throw Object.assign(Error('Installation nicht authentifiziert'),{statusCode:401});
 return 'md_'+createHash('sha256').update(secret).digest('hex');
}
export function subscriptionStatus(data,now=Date.now(),allowSandbox=false){
 const subscriber=data?.subscriber,ent=subscriber?.entitlements?.pro;
 const subscription=subscriber?.subscriptions?.[ent?.product_identifier];
 const expires=Date.parse(ent?.expires_date),grace=Date.parse(ent?.grace_period_expires_date||subscription?.grace_period_expires_date);
 const active=ent?.product_identifier==='matchday_pro_monthly'&&subscription?.store==='app_store'&&(!subscription.is_sandbox||allowSandbox)&&!subscription.refunded_at&&(Number.isFinite(expires)&&expires>now||Number.isFinite(grace)&&grace>now);
 return {active:!!active,expiresAt:ent?.expires_date||null,graceUntil:ent?.grace_period_expires_date||subscription?.grace_period_expires_date||null,sandbox:subscription?.is_sandbox===true};
}
export async function verifySubscription(appUserId){
 if(!process.env.REVENUECAT_SECRET_KEY)throw Object.assign(Error('Aboprüfung noch nicht eingerichtet'),{statusCode:503});
 const r=await fetch('https://api.revenuecat.com/v1/subscribers/'+encodeURIComponent(appUserId),{headers:{Authorization:'Bearer '+process.env.REVENUECAT_SECRET_KEY,Accept:'application/json'},signal:AbortSignal.timeout(10000)});
 if(r.status===404)return {active:false,expiresAt:null};
 if(!r.ok)throw Object.assign(Error('Abostatus momentan nicht prüfbar'),{statusCode:503});
 return subscriptionStatus(await r.json(),Date.now(),process.env.ALLOW_SANDBOX_SUBSCRIPTIONS==='true');
}
