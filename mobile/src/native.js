import {Capacitor,CapacitorHttp} from '@capacitor/core';
import {Purchases} from '@revenuecat/purchases-capacitor';
import {App} from '@capacitor/app';
import {installation} from './identity.js';
import {createNativePush} from './push.js';
const native=Capacitor.isNativePlatform();
const ENTITLEMENT='pro',PRODUCT='matchday_pro_monthly';
const apiKey=Capacitor.getPlatform()==='ios'?import.meta.env.VITE_REVENUECAT_IOS_PUBLIC_KEY:import.meta.env.VITE_REVENUECAT_ANDROID_PUBLIC_KEY;
const privacy=import.meta.env.VITE_PRIVACY_URL,terms=import.meta.env.VITE_TERMS_URL;
let configured;
async function configurePurchases(){
 if(!native||!apiKey)throw Error('Store-Konfiguration fehlt');
 return configured||=(async()=>{const {appUserId}=await installation();await Purchases.configure({apiKey,appUserID:appUserId})})().catch(e=>{configured=null;throw e});
}
if(native){
 const original=window.fetch.bind(window);
 window.fetch=async(input,init={})=>{
  if(input instanceof Request){init={method:input.method,headers:Object.fromEntries(input.headers),...(input.method!=='GET'&&input.method!=='HEAD'?{body:await input.text()}:{}),...init}}
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw,location.origin);
  if(![location.origin,'https://matchday-player-hub.vercel.app'].includes(url.origin)||!url.pathname.startsWith('/api/'))return original(input,init);
  const response=await CapacitorHttp.request({url:'https://matchday-player-hub.vercel.app'+url.pathname+url.search,method:init.method||'GET',headers:{'Content-Type':'application/json',...Object.fromEntries(new Headers(init.headers||{}))},...(init.body?{data:JSON.parse(init.body)}:{})});
  return new Response(typeof response.data==='string'?response.data:JSON.stringify(response.data),{status:response.status,headers:response.headers});
 };
}
const css=document.createElement('style');css.textContent=`
#native-subscription{position:fixed;inset:0;z-index:99999;background:#0c1421;color:#fff;display:grid;place-items:center;padding:22px;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;overflow:auto}
.native-offer{width:100%;max-width:400px}.native-offer h1{font-size:34px;margin:8px 0}.native-offer h1 em{color:#16c995;font-style:normal}.native-price{font-size:34px;font-weight:800;margin:22px 0 4px}.native-offer p{color:#bdc9da;line-height:1.5;font-size:14px}.native-offer ul{padding-left:20px;line-height:2;font-size:14px}.native-offer button{width:100%;border:0;border-radius:12px;padding:15px;background:#08ae80;color:white;font:700 15px inherit;margin:8px 0;cursor:pointer}.native-offer button:disabled{opacity:.4;cursor:default}.native-offer .native-restore{background:#233447}.native-offer small{display:block;font-size:11px;line-height:1.5;color:#aebed2}.native-offer a{color:#a6e9d6}.native-offer [role=status]{font-size:12px;min-height:36px;color:#f0d38b}
`;document.head.append(css);
const waitDom=()=>new Promise(resolve=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
await waitDom();
const overlay=document.createElement('section');overlay.id='native-subscription';overlay.setAttribute('aria-label','Matchday Pro Monatsabo');
overlay.innerHTML='<div class="native-offer"><small>MATCHDAY PRO · MONATSABO</small><h1>Matchday <em>PRO</em></h1><p>Dein Spiel. Alle Details.</p><ul><li>Fußball- und NHL-Spielanalysen</li><li>Spielerprofile und aktuelle Torform</li><li>Live-Ticker und Favoriten</li></ul><div class="native-price" id="native-price">9,99 € / Monat</div><small id="native-price-note">Geplanter Preis. Verbindlich ist der im Store angezeigte Preis.</small><button id="native-buy" disabled>Monatsabo wird geladen …</button><button class="native-restore" id="native-restore" disabled>Käufe wiederherstellen</button><p role="status" id="native-status">Store-Verbindung wird geprüft …</p><small>Monatlich automatisch verlängernd. Kündigung in den Store-Einstellungen; Zugang bis zum Ende des bezahlten Zeitraums.</small><p><a id="native-privacy" hidden>Datenschutz</a> <a id="native-terms" hidden>Nutzungsbedingungen</a></p><small>Keine Gewinngarantie. Statistische Analysen, keine Wettplatzierung.</small></div>';
document.body.append(overlay);
if(import.meta.env.VITE_APP_MODE==='preview'){
 const button=document.createElement('button');button.className='native-restore';button.textContent='Entwicklervorschau öffnen · keine Käufe';button.addEventListener('click',()=>{overlay.hidden=true;overlay.style.display='none';let badge=document.getElementById('native-preview-badge');if(!badge){badge=document.createElement('div');badge.id='native-preview-badge';badge.textContent='Entwicklervorschau · kein bezahlter Zugang';document.querySelector('.app-header')?.prepend(badge)}});overlay.querySelector('.native-offer').append(button);
}

function legalLink(id,value){if(!value)return false;try{const u=new URL(value);if(u.protocol!=='https:')return false;const a=document.getElementById(id);a.href=u.href;a.target='_blank';a.rel='noopener';a.hidden=false;return true}catch{return false}}
const privacyReady=legalLink('native-privacy',privacy),termsReady=legalLink('native-terms',terms),legalReady=privacyReady&&termsReady;
if(native&&(!apiKey||!legalReady))document.getElementById('native-status').textContent='Das Monatsabo wird noch eingerichtet. Aktuell ist kein Kauf möglich.';
if(!native){document.getElementById('native-status').textContent='Browser-Vorschau der Abo-Ansicht. Keine Zahlungen möglich.'}
if(native&&Capacitor.getPlatform()==='ios'){
 try{window.MatchdayNative={push:await createNativePush()};await window.MatchdayNative.push.sync()}
 catch{window.matchdayPushStatus?.('Apple Push konnte nicht gestartet werden. Bitte die App erneut öffnen.',false)}
}
if(native&&apiKey&&legalReady){
 await initializeSubscription();
}
export async function loadSubscription(){
 await configurePurchases();
 const offerings=await Purchases.getOfferings();
 const pack=offerings.current?.availablePackages?.find(p=>p.packageType==='MONTHLY'&&p.product.identifier===PRODUCT);
 if(!pack)throw Error('Monatsabo im Store nicht verfügbar');
 return pack;
}
export async function restoreSubscription(){await configurePurchases();await Purchases.restorePurchases();return verifyAccess()}
export async function purchaseSubscription(pack){await configurePurchases();await Purchases.purchasePackage({aPackage:pack});return verifyAccess()}
async function verifyAccess(){
 const {customerInfo}=await Purchases.getCustomerInfo();
 if(!customerInfo.entitlements.active[ENTITLEMENT])return false;
 const {secret}=await installation();const response=await fetch('/api/push?channel=subscription',{method:'POST',headers:{'X-Matchday-Install':secret}});
 if(!response.ok)throw Error('Abostatus kann gerade nicht geprüft werden. Bitte erneut versuchen.');
 return (await response.json()).active===true;
}
function setAccess(active){overlay.hidden=active;overlay.style.display=active?'none':'grid'}
async function initializeSubscription(){
 const buy=document.getElementById('native-buy'),restore=document.getElementById('native-restore'),status=document.getElementById('native-status');
 let pack,busy=false;
 async function action(fn){if(busy)return;busy=true;buy.disabled=restore.disabled=true;status.textContent='Abostatus wird geprüft …';try{const active=await fn();setAccess(active);status.textContent=active?'Abo aktiv':'Kein aktives Monatsabo gefunden.'}catch(e){setAccess(false);status.textContent=e.userCancelled?'Kauf abgebrochen.':e.message||'Store momentan nicht erreichbar.'}finally{busy=false;buy.disabled=!pack;restore.disabled=false}}
 try{
  await configurePurchases();restore.disabled=false;
  restore.addEventListener('click',()=>action(restoreSubscription));
  buy.addEventListener('click',()=>action(()=>purchaseSubscription(pack)));
  const accountButton=document.createElement('button');accountButton.className='secondary';accountButton.textContent='Abo verwalten / Käufe wiederherstellen';accountButton.addEventListener('click',()=>{setAccess(false);status.textContent='Käufe wiederherstellen oder dein Abo in den Apple-Account-Einstellungen verwalten.'});document.querySelector('#infoPanel .info-card')?.append(accountButton);
  await App.addListener('appStateChange',({isActive})=>{if(isActive&&!busy)action(verifyAccess)});
  if(await verifyAccess()){setAccess(true);status.textContent='Abo aktiv'}
  pack=await loadSubscription();document.getElementById('native-price').textContent=pack.product.priceString+' / Monat';document.getElementById('native-price-note').textContent='Preis laut App Store einschließlich geltender Steuern.';buy.textContent='Monatsabo abonnieren';buy.disabled=false;
  if(!overlay.hidden)status.textContent='Monatlich kündbar. Der Kauf wird im App Store bestätigt.';
 }catch(e){buy.textContent='Monatsabo momentan nicht verfügbar';status.textContent=e.message||'Store momentan nicht erreichbar.'}
}
