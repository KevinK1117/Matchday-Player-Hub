import {Preferences} from '@capacitor/preferences';
let identity;
export function installation(){return identity||=createIdentity()}
async function createIdentity(){
 let {value:secret}=await Preferences.get({key:'matchday-install-secret-v1'});
 if(!secret||!/^[-_A-Za-z0-9]{43}$/.test(secret)){
  const bytes=crypto.getRandomValues(new Uint8Array(32));secret=btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
  await Preferences.set({key:'matchday-install-secret-v1',value:secret});
 }
 const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(secret));
 return {secret,appUserId:'md_'+Array.from(new Uint8Array(digest),b=>b.toString(16).padStart(2,'0')).join('')};
}
