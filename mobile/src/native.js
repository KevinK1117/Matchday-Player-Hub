import {Capacitor,CapacitorHttp} from '@capacitor/core';
import {Purchases} from '@revenuecat/purchases-capacitor';
const native=Capacitor.isNativePlatform();
const ENTITLEMENT='pro',PRODUCT='matchday_pro_monthly';
const apiKey=Capacitor.getPlatform()==='ios'?import.meta.env.VITE_REVENUECAT_IOS_PUBLIC_KEY:import.meta.env.VITE_REVENUECAT_ANDROID_PUBLIC_KEY;
const privacy=import.meta.env.VITE_PRIVACY_URL,terms=import.meta.env.VITE_TERMS_URL;
// This is a development shell. Server-side user authentication/entitlement enforcement,
// native push, final legal URLs and signed store testing remain release blockers.
if(native){
 const original=window.fetch.bind(window);
 window.fetch=async(input,init={})=>{
  const raw=typeof input==='string'?input:input instanceof URL?input.href:input.url;
  const url=new URL(raw,location.origin);
  if(url.origin!==location.origin||!url.pathname.startsWith('/api/'))return original(input,init);
  const response=await CapacitorHttp.request({url:'https://matchday-player-hub.vercel.app'+url.pathname+url.search,method:init.method||'GET',headers:{'Content-Type':'application/json',...(init.headers||{})},...(init.body?{data:JSON.parse(init.body)}:{})});
  return new Response(typeof response.data==='string'?response.data:JSON.stringify(response.data),{status:response.status,headers:{'Content-Type':'application/json'}});
 };
}
const css=document.createElement('style');css.textContent=`
#native-subscription{position:fixed;inset:0;z-index:99999;background:#0c1421;color:#fff;display:grid;place-items:center;padding:22px;font-family:-apple-system,BlinkMacSystemFont,Arial,sans-serif;overflow:auto}
.native-offer{width:100%;max-width:400px}.native-offer h1{font-size:34px;margin:8px 0}.native-offer h1 em{color:#16c995;font-style:normal}.native-price{font-size:34px;font-weight:800;margin:22px 0 4px}.native-offer p{color:#bdc9da;line-height:1.5;font-size:14px}.native-offer ul{padding-left:20px;line-height:2;font-size:14px}.native-offer button{width:100%;border:0;border-radius:12px;padding:15px;background:#08ae80;color:white;font:700 15px inherit;margin:8px 0;cursor:pointer}.native-offer button:disabled{opacity:.4;cursor:default}.native-offer .native-restore{background:#233447}.native-offer small{display:block;font-size:11px;line-height:1.5;color:#aebed2}.native-offer a{color:#a6e9d6}.native-offer [role=status]{font-size:12px;min-height:36px;color:#f0d38b}
`;document.head.append(css);
const waitDom=()=>new Promise(resolve=>document.readyState==='loading'?document.addEventListener('DOMContentLoaded',resolve,{once:true}):resolve());
await waitDom();
const overlay=document.createElement('section');overlay.id='native-subscription';overlay.setAttribute('aria-label','Matchday Pro Monatsabo');
overlay.innerHTML='<div class="native-offer"><small>IOS & ANDROID · ENTWICKLUNGSVERSION</small><h1>Matchday <em>PRO</em></h1><p>Dein Spiel. Alle Details.</p><ul><li>Fußball- und NHL-Spielanalysen</li><li>Spielerprofile und aktuelle Torform</li><li>Live-Ticker und Favoriten</li></ul><div class="native-price" id="native-price">9,99 € / Monat</div><small id="native-price-note">Geplanter Preis. Verbindlich ist der im Store angezeigte Preis.</small><button id="native-buy" disabled>Monatsabo noch nicht eingerichtet</button><button class="native-restore" id="native-restore" disabled>Käufe wiederherstellen</button><p role="status" id="native-status">Store-Konten und Abo-Produkte fehlen. Hier ist aktuell kein Kauf möglich.</p><small>Monatlich automatisch verlängernd. Kündigung in den Store-Einstellungen; Zugang bis zum Ende des bezahlten Zeitraums.</small><p><a id="native-privacy" hidden>Datenschutz</a> <a id="native-terms" hidden>Nutzungsbedingungen</a></p><small>Keine Gewinngarantie. Statistische Analysen, keine Wettplatzierung.</small></div>';
document.body.append(overlay);
if(import.meta.env.VITE_APP_MODE==='preview'){
 const button=document.createElement('button');button.className='native-restore';button.textContent='Entwicklervorschau öffnen · keine Käufe';button.addEventListener('click',()=>{overlay.remove();const badge=document.createElement('div');badge.textContent='ENTWICKLERVORSCHAU · Abos und nativer Push noch nicht aktiv';badge.style.cssText='position:fixed;top:0;left:0;right:0;z-index:9999;background:#173d32;color:#fff;font:10px/1.4 Arial;text-align:center;padding:4px;pointer-events:none';document.body.append(badge)});overlay.querySelector('.native-offer').append(button);
}

function legalLink(id,value){if(!value)return false;try{const u=new URL(value);if(u.protocol!=='https:')return false;const a=document.getElementById(id);a.href=u.href;a.target='_blank';a.rel='noopener';a.hidden=false;return true}catch{return false}}
const legalReady=legalLink('native-privacy',privacy)&&legalLink('native-terms',terms);
if(!native){document.getElementById('native-status').textContent='Browser-Vorschau der Abo-Ansicht. Keine Zahlungen möglich.'}
if(native&&apiKey&&legalReady){
 // Store purchase methods are implemented but intentionally gated during preparation.
 // Enable only after authenticated backend access and native push pass release testing.
 document.getElementById('native-status').textContent='SDK-Schlüssel vorhanden. Produktionsfreigabe, serverseitiger Aboschutz und Store-Tests stehen noch aus.';
}
export async function loadSubscription(){
 if(!native||!apiKey)throw Error('Store-Konfiguration fehlt');
 await Purchases.configure({apiKey});
 const offerings=await Purchases.getOfferings();
 const pack=offerings.current?.availablePackages?.find(p=>p.packageType==='MONTHLY'&&p.product.identifier===PRODUCT);
 if(!pack)throw Error('Monatsabo im Store nicht verfügbar');
 return pack;
}
export async function restoreSubscription(){const {customerInfo}=await Purchases.restorePurchases();return !!customerInfo.entitlements.active[ENTITLEMENT]}
export async function purchaseSubscription(pack){const {customerInfo}=await Purchases.purchasePackage({aPackage:pack});return !!customerInfo.entitlements.active[ENTITLEMENT]}
// Do not expose a client-only unlock for a subscription product. The production
// release must connect purchases to an authenticated, server-verified entitlement.
