import test from 'node:test';import assert from 'node:assert/strict';import {normalizeGame} from '../api/nhlcenter.js';import {fetchBerlinSchedule} from '../api/nhl.js';
test('NHL normalizes pregame, live and final scores without fabricated values',()=>{
 const g={id:1,season:20262027,startTimeUTC:'2026-10-21T23:00:00Z',gameState:'FUT',homeTeam:{id:22,abbrev:'EDM',placeName:{default:'Edmonton'},commonName:{default:'Oilers'}},awayTeam:{id:10,abbrev:'TOR',name:{default:'Toronto Maple Leafs'}}};const a=normalizeGame(g);assert.equal(a.fixture.status.short,'NS');assert.equal(a.teams.home.name,'Edmonton Oilers');assert.equal(a.goals.home,null);assert.equal(normalizeGame({...g,gameState:'CRIT'}).fixture.status.short,'LIVE');assert.equal(normalizeGame({...g,gameState:'OFF',homeTeam:{...g.homeTeam,score:3}}).goals.home,3);
});
test('Berlin matchday includes North American previous-day games and removes duplicates',async()=>{
 const original=globalThis.fetch,calls=[];globalThis.fetch=async url=>{calls.push(String(url));return {ok:true,status:200,json:async()=>({games:[{id:1,startTimeUTC:'2027-01-20T23:30:00Z'},{id:2,startTimeUTC:'2027-01-21T19:30:00Z'},{id:3,startTimeUTC:'2027-01-22T02:00:00Z'}]})}};
 try{const result=await fetchBerlinSchedule('2027-01-21');assert.deepEqual(result.games.map(g=>g.id),[1,2]);assert.ok(calls.some(c=>c.endsWith('/score/2027-01-20')));assert.ok(calls.some(c=>c.endsWith('/score/2027-01-21')))}finally{globalThis.fetch=original}
});
