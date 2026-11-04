if(process.env.VITE_APP_MODE==='production'){
 for(const key of ['VITE_REVENUECAT_IOS_PUBLIC_KEY','VITE_PRIVACY_URL','VITE_TERMS_URL'])if(!process.env[key])throw Error('Release-Konfiguration fehlt: '+key);
 for(const key of ['VITE_PRIVACY_URL','VITE_TERMS_URL'])if(new URL(process.env[key]).protocol!=='https:')throw Error('HTTPS erforderlich: '+key);
}
import {cp,mkdir,readFile,writeFile,rm} from 'node:fs/promises';
const root=new URL('../',import.meta.url),web=new URL('web/',root);
await rm(web,{recursive:true,force:true});await mkdir(web,{recursive:true});
await cp(new URL('../public/',root),new URL('public/',web),{recursive:true});
await cp(new URL('src/',root),web,{recursive:true});
let html=await readFile(new URL('../index.html',root),'utf8');
// Bundle the existing interface locally. Native HTTP talks to the existing backend.
html=html.replace('width=device-width,initial-scale=1','width=device-width,initial-scale=1,viewport-fit=cover');
html=html.replace('</head>','<link rel="stylesheet" href="/native-layout.css"><script type="module" src="/native.js"></script></head>');
await writeFile(new URL('index.html',web),html);
console.log('Bundled Matchday interface prepared');
