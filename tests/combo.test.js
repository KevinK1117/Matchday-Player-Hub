import test from 'node:test';import assert from 'node:assert/strict';import {rankScorers} from '../public/combo.js';
const now=Date.now(),games=Array.from({length:10},(_,i)=>({fixture:{id:i+1,date:new Date(now+3600000).toISOString(),status:{short:'NS'}}}));
const base={name:'Player',sport:'football',lineupSource:'last',lineupPosition:'F',appearances:15,minutes:1000,minutesPerGame:75,goals:8,shotsPerGame:2,participation:'Startelf nicht veröffentlicht'};
const players=games.map((g,i)=>({...base,id:i+1,fixtureId:g.fixture.id}));
test('statistical combos accept 1–20 choices, disclose a short selection and never invent prices',()=>{
 for(const n of [1,2,3,6,8,10,20]){const r=rankScorers(games,players,n,now);assert.equal(r.picks.length,Math.min(n,10));assert.equal(r.complete,n<=10);assert.equal(r.available,10);assert.equal(r.total,undefined)}
 for(const n of [0,21,NaN])assert.throws(()=>rankScorers(games,players,n,now));
});
test('exclude missing evidence, midfielders, bench, insufficient minutes and started matches',()=>{
 for(const patch of [{lineupSource:null},{lineupPosition:'M'},{participation:'Nicht in bestätigter Startelf'},{minutes:100},{shotsPerGame:null},{unavailable:true}])assert.equal(rankScorers(games,players.map(p=>({...p,...patch})),6,now).picks.length,0);
 assert.equal(rankScorers(games.map(g=>({...g,fixture:{...g.fixture,status:{short:'1H'}}})),players,6,now).picks.length,0);
 assert.equal(rankScorers(games,players,6,now,true).picks.length,0);
 assert.equal(rankScorers(games,players.map(p=>({...p,participation:'Startelf bestätigt'})),6,now,true).picks.length,6);
});
test('up to four distinct players per fixture; duplicate rows do not inflate selections',()=>{
 const ps=games.slice(0,2).flatMap(g=>Array.from({length:8},(_,i)=>({...base,id:g.fixture.id*100+i,fixtureId:g.fixture.id})));
 const r=rankScorers(games,[...ps,...ps],10,now);assert.equal(r.picks.length,8);assert.equal(r.complete,false);assert.equal(new Set(r.picks.map(p=>p.player.id)).size,8);
 for(const g of games)assert.ok(r.picks.filter(p=>p.game.fixture.id===g.fixture.id).length<=4);
});
test('NHL combos exclude centers from current, historical and season data',()=>{
 for(const lineupSource of ['current','last','season']){
  const center={...base,id:1,fixtureId:1,sport:'nhl',GP:15,lineupSource,lineupPosition:'C'};
  const wing={...center,id:2,lineupPosition:'RW'};
  assert.deepEqual(rankScorers(games,[center,wing],6,now).picks.map(p=>p.player.id),[2]);
 }
});
