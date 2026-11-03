import test from 'node:test';import assert from 'node:assert/strict';import {buildNhlLines} from '../public/nhl-lines.js';
const p=(id,position)=>({playerId:id,position});
test('four distinct attacks have two wings and a center; defenders never repeat',()=>{
 const forwards=Array.from({length:4},(_,i)=>[p(i*3+1,'L'),p(i*3+2,'C'),p(i*3+3,'R')]).flat();const d=Array.from({length:6},(_,i)=>p(i+20,'D'));
 const lines=buildNhlLines([...forwards,forwards[0]],d);const all=lines.flatMap(l=>[...l.forwards,...l.defense]).filter(Boolean);
 assert.equal(new Set(all.map(p=>p.playerId)).size,all.length);
 for(const line of lines)assert.deepEqual(line.forwards.map(p=>p.position),['L','C','R']);
 assert.deepEqual(lines[3].defense,[null,null]);
});
test('missing centers and wings remain empty instead of reusing or mislabeling players',()=>{const lines=buildNhlLines([p(1,'C'),p(2,'C'),p(3,'R')],[]);assert.equal(lines[0].forwards[1].playerId,1);assert.equal(lines[0].forwards[0].playerId,3);assert.equal(lines[0].forwards[2],null);assert.equal(lines[1].forwards[1].playerId,2)});
test('roster supplements fill holes once and are marked',()=>{const lines=buildNhlLines([p(1,'C'),p(2,'L')],[],[p(1,'C'),p(3,'R'),p(4,'D'),p(4,'D'),p(5,'D'),p(6,'G')]);const all=lines.flatMap(l=>[...l.forwards,...l.defense]).filter(Boolean);assert.equal(all.length,5);assert.equal(new Set(all.map(p=>p.playerId)).size,5);assert.ok(all.filter(p=>p.playerId>=3).every(p=>p.rosterSupplement));assert.ok(!all.some(p=>p.playerId===6))});
