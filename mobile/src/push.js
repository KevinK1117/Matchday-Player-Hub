import {PushNotifications} from '@capacitor/push-notifications';
import {App} from '@capacitor/app';
import {Preferences} from '@capacitor/preferences';
import {installation} from './identity.js';
export function safePushPath(raw){try{const u=new URL(raw,'https://matchday-player-hub.vercel.app');return u.origin==='https://matchday-player-hub.vercel.app'&&['/','/matchcenter'].includes(u.pathname)?'/'+u.search:null}catch{return null}}
export async function createNativePush(){
 let enabled=(await Preferences.get({key:'matchday-native-push-enabled'})).value==='true',deviceToken=null,running=false,dirty=false,writes=Promise.resolve();
 const status=(message)=>window.matchdayPushStatus?.(message,enabled);
 function save(method='POST'){
  writes=writes.catch(()=>{}).then(async()=>{
  const {secret}=await installation();
  const response=await fetch('/api/native-push',{method,headers:{'Content-Type':'application/json','X-Matchday-Install':secret},...(method==='POST'?{body:JSON.stringify({token:deviceToken,preferences:window.matchdayPushPreferences?.()||{}})}:{})});
  if(!response.ok)throw Error((await response.json()).error||'Push-Einstellungen konnten nicht gespeichert werden');
  });return writes;
 }
 async function sync(){
  if(!enabled||!deviceToken)return;dirty=true;if(running)return;running=true;
  try{while(dirty&&enabled){dirty=false;await save()}status('Push aktiv · Favoriten synchronisiert. Ereignisprüfung etwa alle 5 Minuten.')}
  catch{status('Push-Synchronisierung fehlgeschlagen. Beim nächsten Öffnen wird erneut versucht.')}
  finally{running=false}
 }
 await PushNotifications.addListener('registration',async({value})=>{deviceToken=value;if(enabled)await sync()});
 await PushNotifications.addListener('registrationError',()=>status('Apple Push konnte nicht registriert werden. Bitte später erneut versuchen.'));
 await PushNotifications.addListener('pushNotificationActionPerformed',event=>{const path=safePushPath(event.notification?.data?.url);if(path)location.assign(path)});
 await App.addListener('appStateChange',async({isActive})=>{if(!isActive)return;const permission=await PushNotifications.checkPermissions();if(permission.receive!=='granted'){status('Push in den iPhone-Einstellungen erlauben.');return}if(enabled)await PushNotifications.register()});
 async function toggle(){
  try{
   if(enabled){enabled=false;dirty=false;try{await save('DELETE')}catch(e){enabled=true;throw e}await Preferences.set({key:'matchday-native-push-enabled',value:'false'});await PushNotifications.unregister();status('Push-Benachrichtigungen deaktiviert');return}
   const response=await fetch('/api/native-push'),config=await response.json();if(!response.ok||!config.enabled)throw Error('Apple Push ist auf dem Server noch nicht eingerichtet.');
   let permission=await PushNotifications.checkPermissions();if(permission.receive==='prompt'||permission.receive==='prompt-with-rationale')permission=await PushNotifications.requestPermissions();
   if(permission.receive!=='granted')throw Error('Bitte Mitteilungen für Matchday Pro in den iPhone-Einstellungen erlauben.');
   enabled=true;await Preferences.set({key:'matchday-native-push-enabled',value:'true'});status('Apple Push wird verbunden …');await PushNotifications.register();
  }catch(e){status(e.message||'Push momentan nicht verfügbar')}
 }
 if(enabled&&(await PushNotifications.checkPermissions()).receive==='granted')await PushNotifications.register();
 else status('Mit Push erhältst du Spielereignisse und bestätigte Aufstellungen deiner Favoriten.');
 window.addEventListener('online',sync);return {toggle,sync};
}
