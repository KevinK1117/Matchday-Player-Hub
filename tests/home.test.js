import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
const fn=(name,end)=>html.slice(html.indexOf('function '+name),html.indexOf(end,html.indexOf('function '+name)));
test('missing scorer goals never turn into a zero-percent probability',()=>{
 const context=vm.createContext({});vm.runInContext(fn('scorerChance','function homePlayerCard'),context);
 const chance=context.scorerChance,base={GP:20,minutes:900,minutesPerGame:75};
 for(const nhl of [true,false])for(const goals of [null,undefined,''])assert.equal(chance({...base,goals},nhl),null);
 assert.equal(chance({...base,goals:0},false),0);
 assert.ok(chance({...base,goals:8},false)>0);
});
test('home and combo cards disclose cup replacement statistics',()=>{
 const context=vm.createContext({sport:'football',league:78,leagueSeason:()=>2026,playerKey:p=>'football:'+p.id,scorerChance:()=>null,homeProfiles:new Map(),favoritePlayers:new Map(),portrait:()=>'',positionBadge:()=>'',esc:s=>String(s).replaceAll('<','&lt;'),time:()=>'',fmt:v=>v??'–'});
 vm.runInContext(fn('summaryKickoff','async function renderHome'),context);
 const card=context.homePlayerCard({player:{id:1,name:'Player',statisticsSource:'Ligastatistik als Pokal-/Europapokal-Grundlage'},game:{league:{name:'Champions League',season:2026},fixture:{date:'2026-11-04'},teams:{away:{name:'Away'}}}},0);
 assert.match(card,/Ligastatistik als Pokal-/);
 assert.match(html.slice(html.indexOf('function renderScorerSelection'),html.indexOf('async function generate')),/statisticsSource/);
});
test('a scorer provider failure remains an error and can be retried',async()=>{
 let dashboardData,painted=false;const elements={homePlayers:{},homeSubtitle:{},date:{value:'2026-11-04'}};
 const context=vm.createContext({homeToken:0,homeKey:()=> 'key',homeCache:new Map(),dashboard:d=>{dashboardData=d},$:id=>elements[id],games:[{fixture:{date:new Date(Date.now()+3600000).toISOString(),status:{short:'NS'}},league:{id:78}}],league:78,sport:'football',demoMode:false,view:'home',fetch:async()=>({ok:false,json:async()=>({error:'Anbieterlimit erreicht'})}),URLSearchParams,paintHome:()=>{painted=true},esc:s=>s});
 const start=html.indexOf('async function renderHome()'),end=html.indexOf('async function seasonHome',start);
 vm.runInContext(html.slice(start,end),context);await context.renderHome();
 assert.equal(painted,false);assert.equal(dashboardData.error,true);assert.match(elements.homePlayers.innerHTML,/Anbieterlimit erreicht/);assert.match(elements.homePlayers.innerHTML,/retryHome/);assert.equal(context.homeCache.size,0);
});
test('home season fallback includes centers but never excluded players',async()=>{
 let painted;const elements={homePlayers:{},homeSubtitle:{},date:{value:'2026-11-05'}};
 const context=vm.createContext({homeToken:0,homeKey:()=> 'key',homeCache:new Map(),dashboard:()=>{},$:id=>elements[id],games:[{fixture:{id:1,date:new Date(Date.now()+3600000).toISOString(),status:{short:'NS'}},league:{id:10000}}],league:10000,sport:'nhl',demoMode:false,view:'home',fetch:async()=>({ok:true,json:async()=>({allPlayers:[{id:1,fixtureId:1,position:'R',lineupPosition:'C',goals:10},{id:2,fixtureId:1,position:'L',goals:5,exclusionReason:'Nicht im Spielkader'},{id:3,fixtureId:1,position:'R',lineupPosition:'R',goals:4}]})}),rankScorers:()=>({picks:[]}),URLSearchParams,paintHome:data=>{painted=data},esc:s=>s});
 const start=html.indexOf('async function renderHome()'),end=html.indexOf('async function seasonHome',start);
 vm.runInContext(html.slice(start,end),context);await context.renderHome();assert.deepEqual(Array.from(painted.rows,r=>r.player.id),[1,3]);assert.equal(painted.statisticsOnly,true);
});

test('NHL displayed chance uses the same expected goal rate as ranking',()=>{const c=vm.createContext({});vm.runInContext(fn('scorerChance','function homePlayerCard'),c);assert.equal(c.scorerChance({goals:10,GP:20},true),null);assert.ok(Math.abs(c.scorerChance({goals:10,GP:20,score:.3},true)-100*(1-Math.exp(-.3)))<1e-9)});

test('kickoff labels use German time across midnight and daylight saving and preserve missing times',()=>{
 const c=vm.createContext({esc:v=>String(v),time:v=>new Date(v).toLocaleTimeString('de-DE',{timeZone:'Europe/Berlin',hour:'2-digit',minute:'2-digit'})});
 vm.runInContext(fn('summaryKickoff','function homePlayerCard'),c);
 const label=date=>c.summaryKickoff({fixture:{date}});
 assert.match(label('2026-11-07T23:30:00Z'),/08\.11\. · 00:30 Uhr/);
 assert.match(label('2026-07-07T18:30:00Z'),/07\.07\. · 20:30 Uhr/);
 for(const value of [undefined,'','bad-date'])assert.match(label(value),/Uhrzeit offen/);
});
