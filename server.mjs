import http from 'node:http';
import fs from 'node:fs/promises';
import path from 'node:path';
import football from './api/football.js';
import nhl from './api/nhl.js';
import odds from './api/odds.js';
import form from './api/form.js';
import draws from './api/draws.js';
import matchcenter from './api/matchcenter.js';
import nhlcenter from './api/nhlcenter.js';
const handlers={football,nhl,odds,form,draws,matchcenter,nhlcenter};
const root=process.cwd();
http.createServer(async(req,res)=>{
 const u=new URL(req.url,'http://localhost');
 if(u.pathname.startsWith('/api/')){const fn=handlers[u.pathname.slice(5)];if(!fn){res.statusCode=404;return res.end('Not found')}
 const out={setHeader:(k,v)=>{res.setHeader(k,v);return out},status:n=>{res.statusCode=n;return out},json:d=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(d))}};
 try{await fn({query:Object.fromEntries(u.searchParams),headers:req.headers},out)}catch{res.statusCode=500;res.end('{"error":"Serverfehler"}')}return}
 const name=u.pathname==='/'?'index.html':u.pathname==='/matchcenter'?'public/matchcenter-advanced.html':u.pathname==='/manifest.webmanifest'?'public/manifest.webmanifest':u.pathname==='/icon.svg'?'public/icon.svg':u.pathname.slice(1);
 if(!['index.html','players.html'].includes(name)&&!name.startsWith('public/')){res.statusCode=404;return res.end('Not found')}
 const file=path.resolve(root,name);if(!file.startsWith(root+path.sep)){res.statusCode=403;return res.end()}
 try{const body=await fs.readFile(file);res.setHeader('Content-Type',file.endsWith('.css')?'text/css':file.endsWith('.js')?'text/javascript':file.endsWith('.svg')?'image/svg+xml':file.endsWith('.webmanifest')?'application/manifest+json':'text/html;charset=utf-8');res.end(body)}catch{res.statusCode=404;res.end('Not found')}
}).listen(process.env.PORT||4173,'0.0.0.0');
