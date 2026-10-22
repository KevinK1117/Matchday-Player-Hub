import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{form} from '../api/draws.js';
test('last-five form excludes future and unfinished fixtures',()=>{
 const rows=Array.from({length:8},(_,i)=>({fixture:{date:`2026-10-${String(20-i).padStart(2,'0')}T12:00:00Z`,status:{short:'FT'}},teams:{home:{id:1},away:{id:2}},goals:{home:i<5?2:0,away:1}}));
 rows.push({...rows[0],fixture:{date:'2026-10-23T12:00:00Z',status:{short:'FT'}}});
 rows.push({...rows[0],fixture:{date:'2026-10-21T12:00:00Z',status:{short:'NS'}}});
 const result=form(rows,1,'2026-10-22');assert.equal(result.last5Points,15);assert.equal(result.last5Played,5);assert.equal(result.played,8);
});
test('draw configurator rejects selections outside 6–10',async()=>{
 for(const count of ['5','11','NaN']){let code;const res={setHeader(){},status(n){code=n;return this},json(){}};await handler({query:{date:'2026-10-22',count}},res);assert.equal(code,400)}
});
