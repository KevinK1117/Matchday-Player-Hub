import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
const source=html.slice(html.indexOf('const scorerProfiles=new Map();'),html.indexOf('let liveBusy='));
test('compact scorer card highlights only key statistics while profile retains secondary evidence',()=>{
 const context=vm.createContext({esc:v=>String(v??''),profileMetrics:rows=>rows.map(([k,v])=>k+': '+v).join('\n'),shotConversion:()=> '25 %'});
 vm.runInContext(source,context);
 const p={id:1,GP:20,goals:8,shotsPerGame:3,last5Goals:4,last5:[{},{},{},{},{}],last10Games:10,last10Shots:30,xGPerGame:0,highDangerChancesPerGame:null,ppgoals:2,opponentGoalsAgainstPerGame:3.1,toiLast5:1200};context.p=p;
 const card=vm.runInContext('scorerKeyMetrics(p,true)',context);
 for(const label of ['Tore / Spiel','Aufs Tor / Spiel','Tore · letzte 5','Schüsse · letzte 10','xG / Spiel','iHDCF / Spiel'])assert.ok(card.includes(label));
 for(const label of ['PP-Tore','Schussquote','Gegentore','Eiszeit'])assert.ok(!card.includes(label));
 assert.match(card,/0,00/);assert.match(card,/Nicht verfügbar/);
 vm.runInContext("scorerProfiles.set('nhl:1',p)",context);
 const profile=vm.runInContext('scorerProfileDetails(1,true)',context);
 for(const label of ['Powerplay-Tore','Schussquote','Gegner · Gegentore','Ø Eiszeit'])assert.ok(profile.includes(label));
});
test('all inline module scripts parse before bundling',()=>{
 const scripts=[...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/g)].filter(x=>!x[1].includes('src='));
 for(const [,attrs,code] of scripts){const cleaned=code.replace(/^import .*?;\s*$/mg,'');assert.doesNotThrow(()=>new vm.Script(cleaned));}
});
