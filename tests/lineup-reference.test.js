import test from 'node:test';import assert from 'node:assert/strict';
import {footballReference,nhlReference,scorerRole} from '../lib/lineup-reference.js';
test('football uses only the most recent finished match before kickoff',async()=>{
 const xi=Array.from({length:11},(_,id)=>({player:{id,pos:id===10?'F':'M'}}));
 const ref=await footballReference(1,'2026-11-04T12:00:00Z',async path=>path.startsWith('/fixtures?')?[{fixture:{id:3,date:'2026-11-05',status:{short:'FT'}}},{fixture:{id:2,date:'2026-11-02',status:{short:'FT'}}}]:[{team:{id:1},startXI:xi}]);
 assert.equal(ref.fixtureId,2);assert.equal(ref.source,'last');assert.equal(ref.side.startXI.length,11);
});
test('NHL uses the matching team from the last completed boxscore',async()=>{
 const ref=await nhlReference('EDM','2026-11-04',async path=>path.includes('schedule')?{games:[{id:3,gameState:'FUT',startTimeUTC:'2026-11-03'},{id:2,gameState:'OFF',startTimeUTC:'2026-11-02'}]}:{homeTeam:{abbrev:'NYR'},playerByGameStats:{awayTeam:{forwards:[{playerId:8,position:'L'}]}}});
 assert.equal(ref.side.forwards[0].playerId,8);assert.equal(ref.fixtureId,2);
});
test('scorer roles require lineup evidence and exclude centers and midfielders',()=>{
 for(const pos of ['C','D','G',''])assert.equal(scorerRole({lineupSource:'last',lineupPosition:pos},'nhl'),false);
 for(const pos of ['L','R','LW','RW'])assert.equal(scorerRole({lineupSource:'last',lineupPosition:pos},'nhl'),true);
 assert.equal(scorerRole({lineupSource:'current',lineupPosition:'F'},'football'),true);
 assert.equal(scorerRole({lineupSource:'last',lineupPosition:'M'},'football'),false);
 assert.equal(scorerRole({position:'Attacker'},'football'),false);
});
test('missing data never fabricates a lineup',async()=>{assert.equal(await footballReference(1,'2026-11-04',async()=>[]),null);assert.equal(await nhlReference('EDM','2026-11-04',async()=>({games:[]})),null)});

test('combo excludes centers even with a stronger ranking',async()=>{
 const {rankScorers}=await import('../public/combo.js');const now=Date.now();
 const games=[{fixture:{id:1,date:new Date(now+3600000).toISOString(),status:{short:'NS'}}}];
 const base={name:'Spieler',sport:'nhl',fixtureId:1,GP:20,goals:10,shotsPerGame:3,lineupSource:'last'};
 const players=[{...base,id:1,lineupPosition:'C',score:100},{...base,id:2,lineupPosition:'L',score:1},{...base,id:3,lineupPosition:'R',score:2},{...base,id:4,position:'R',lineupSource:null,score:3}];
 assert.deepEqual(rankScorers(games,players,6,now).picks.map(x=>x.player.id),[3,2]);
});
