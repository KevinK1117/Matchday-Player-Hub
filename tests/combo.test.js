import test from 'node:test';import assert from 'node:assert/strict';import {buildCombo} from '../public/combo.js';import handler from '../api/matchcenter.js';
const now=Date.now();
const games=Array.from({length:10},(_,i)=>({fixture:{id:i+1,date:new Date(now+3600000).toISOString(),status:{short:'NS'}},teams:{home:{id:i*2,name:'H'},away:{id:i*2+1,name:'A'}}}));
const players=games.map((g,i)=>({id:i+100,name:'Player '+i,fixtureId:g.fixture.id,minutes:900,minutesPerGame:80,goals:8,shotsPerGame:2,participation:'Startelf bestätigt'}));
const quotes=players.map(p=>({fixtureId:p.fixtureId,playerId:p.id,bookmaker:'Book A',market:'anytime_goalscorer',decimal:2,updatedAt:new Date(now).toISOString()}));
test('6–10 anytime scorers, one per fixture and bookmaker, correct product',()=>{for(let n=6;n<=10;n++){const r=buildCombo(games,[...quotes,...quotes],n,now,players);assert.equal(r.picks.length,n);assert.equal(new Set(r.picks.map(p=>p.fixtureId)).size,n);assert.equal(r.total,2**n);assert.ok(r.picks.every(p=>p.market==='anytime_goalscorer'))}});
test('reject stale prices, started matches, unverified players, bench, wrong markets and missing data',()=>{for(const change of [q=>({...q,updatedAt:new Date(now-7*3600000).toISOString()}),q=>({...q,market:'match_winner'}),q=>({...q,playerId:99999}),q=>({...q,outcome:'no'})])assert.equal(buildCombo(games,quotes.map(change),6,now,players).picks.length,0);assert.equal(buildCombo(games.map(g=>({...g,fixture:{...g.fixture,status:{short:'1H'}}})),quotes,6,now,players).picks.length,0);for(const change of [p=>({...p,minutes:100}),p=>({...p,participation:'Nicht in bestätigter Startelf'}),p=>({...p,shotsPerGame:null})])assert.equal(buildCombo(games,quotes,6,now,players.map(change)).picks.length,0)});
test('never fills a short combo or combines different bookmakers',()=>{const r=buildCombo(games,quotes.map((q,i)=>({...q,bookmaker:i<5?'A':'B'})),6,now,players);assert.equal(r.picks.length,0);assert.equal(r.available,5)});
test('confirmed-only option and ambiguous names',()=>{assert.equal(buildCombo(games,quotes,6,now,players.map(p=>({...p,participation:'Startelf nicht veröffentlicht'})),true).picks.length,0);const named=quotes.map(q=>({...q,playerId:null,playerName:players.find(p=>p.id===q.playerId).name}));assert.equal(buildCombo(games,named,6,now,players).picks.length,6);assert.equal(buildCombo(games,named,6,now,[...players,...players]).picks.length,0)});
test('API validates inputs and handles missing credentials',async()=>{let code,body;const res={setHeader(){},status(c){code=c;return this},json(b){body=b}};await handler({query:{action:'player',id:'evil',season:'2026'}},res);assert.equal(code,400);await handler({query:{action:'fixtures',date:'2026-10-22'}},res);assert.equal(code,200);assert.equal(body.configured,false)});

test('up to four different scorers per match; correlated total is not advertised',()=>{
 const ps=games.slice(0,3).flatMap(g=>Array.from({length:6},(_,i)=>({...players[0],id:g.fixture.id*100+i,fixtureId:g.fixture.id,name:'P '+g.fixture.id+' '+i})));
 const qs=ps.map(p=>({...quotes[0],playerId:p.id,fixtureId:p.fixtureId}));const r=buildCombo(games,qs,10,now,ps);
 assert.equal(r.picks.length,10);assert.equal(r.correlated,true);assert.equal(r.total,null);assert.equal(new Set(r.picks.map(p=>p.player.id)).size,10);
 for(const g of games)assert.ok(r.picks.filter(p=>p.fixtureId===g.fixture.id).length<=4);
 const short=buildCombo(games,qs.filter(q=>q.fixtureId===1),6,now,ps);assert.equal(short.picks.length,0);assert.equal(short.available,4);
});
test('NHL scoring uses games and shots instead of football minutes',()=>{
 const ps=games.slice(0,2).flatMap(g=>Array.from({length:4},(_,i)=>({id:g.fixture.id*100+i,fixtureId:g.fixture.id,name:'NHL '+i,sport:'nhl',GP:20,goals:7,shotsPerGame:3,ppgoals:2,participation:'Einsatz nicht bestätigt'})));
 const qs=ps.map(p=>({...quotes[0],playerId:p.id,fixtureId:p.fixtureId}));assert.equal(buildCombo(games,qs,8,now,ps).picks.length,8);assert.equal(buildCombo(games,qs,8,now,ps,true).picks.length,0);assert.equal(buildCombo(games,qs,8,now,ps.map(p=>({...p,GP:2}))).picks.length,0);
});

test('statistical player selection remains available without bookmaker prices',async()=>{
 const {rankScorers}=await import('../public/combo.js');
 const result=rankScorers(games,players,7,now);assert.equal(result.picks.length,7);assert.equal(result.complete,true);assert.equal(buildCombo(games,[],7,now,players).picks.length,0);assert(result.picks.every(p=>p.player.id!=null));
});
test('NHL analysis includes real candidates without prices and respects eligibility',async()=>{
 const {rankScorers}=await import('../public/combo.js');
 const ps=games.flatMap((g,i)=>Array.from({length:5},(_,j)=>({id:i*10+j,name:'NHL '+i+' '+j,fixtureId:g.fixture.id,sport:'nhl',GP:10,goals:4,shotsPerGame:3,ppgoals:2,participation:'Einsatz nicht bestätigt'})));
 const r=rankScorers(games,ps,10,now);assert.equal(r.picks.length,10);for(const g of games)assert(r.picks.filter(p=>p.game.fixture.id===g.fixture.id).length<=4);
 assert.equal(rankScorers(games,ps,7,now,true).picks.length,0);assert.equal(rankScorers(games,ps.map(p=>({...p,shotsPerGame:null})),7,now).picks.length,0);
 assert.equal(rankScorers(games.map(g=>({...g,fixture:{...g.fixture,status:{short:'LIVE'}}})),ps,7,now).picks.length,0);
});
