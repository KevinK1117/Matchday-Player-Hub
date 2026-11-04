import {createHash,sign} from 'node:crypto';
import {connect} from 'node:http2';
export const apnsReady=()=>!!(process.env.APNS_KEY_ID&&process.env.APNS_TEAM_ID&&process.env.APNS_PRIVATE_KEY&&process.env.APNS_TOPIC);
export function nativePushPayload(payload){
 let url;try{const u=new URL(payload.url);if(u.origin==='https://matchday-player-hub.vercel.app'&&['/','/matchcenter'].includes(u.pathname))url=u.pathname+u.search}catch{}
 return {aps:{alert:{title:String(payload.title||'Matchday Pro').slice(0,150),body:String(payload.body||'').slice(0,1000)},sound:'default','thread-id':String(payload.tag||'matchday').split(':').slice(0,2).join(':')},...(url?{url}:{})};
}
export function apnsHeaders(token,payload,now=Date.now()){
 if(!/^[a-f0-9]{64,200}$/i.test(token))throw Error('Ungültiges Gerätetoken');
 const encode=o=>Buffer.from(JSON.stringify(o)).toString('base64url');
 const head=encode({alg:'ES256',kid:process.env.APNS_KEY_ID}),body=encode({iss:process.env.APNS_TEAM_ID,iat:Math.floor(now/1000)}),input=head+'.'+body;
 const signature=sign('sha256',Buffer.from(input),{key:process.env.APNS_PRIVATE_KEY.replace(/\\n/g,'\n'),dsaEncoding:'ieee-p1363'}).toString('base64url');
 return {':method':'POST',':path':'/3/device/'+token,authorization:'bearer '+input+'.'+signature,'apns-topic':process.env.APNS_TOPIC,'apns-push-type':'alert','apns-priority':'10','apns-expiration':String(Math.floor(now/1000)+3600),'apns-collapse-id':createHash('sha256').update(String(payload.tag||'matchday')).digest('hex')};
}
export async function sendNativePush(subscription,payload){
 if(!apnsReady())throw Error('Apple Push ist noch nicht eingerichtet');
 // TestFlight uses production APNs, even for sandbox in-app purchases.
 const host=process.env.APNS_ENVIRONMENT==='sandbox'?'https://api.sandbox.push.apple.com':'https://api.push.apple.com';
 const headers=apnsHeaders(subscription.token,payload),body=JSON.stringify(nativePushPayload(payload));
 if(Buffer.byteLength(body)>4096)throw Error('Push-Nachricht zu groß');
 return new Promise((resolve,reject)=>{
  const session=connect(host);let finished=false;
  const finish=(error)=>{if(finished)return;finished=true;clearTimeout(timer);session.destroy();error?reject(error):resolve()};
  const timer=setTimeout(()=>finish(Error('Apple Push Zeitüberschreitung')),10000);
  session.on('error',finish);
  const request=session.request(headers);let status=0,result='';
  request.on('response',h=>status=Number(h[':status']));request.setEncoding('utf8');request.on('data',d=>result+=d);request.on('error',finish);
  request.on('end',()=>{if(status===200)return finish();let reason;try{reason=JSON.parse(result).reason}catch{}const invalid=status===410||status===400&&['BadDeviceToken','DeviceTokenNotForTopic'].includes(reason);finish(Object.assign(Error('Apple Push: '+(reason||status)),{statusCode:invalid?410:status}))});
  request.end(body);
 });
}
