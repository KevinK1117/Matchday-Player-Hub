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
test('partial analysis exposes real candidates without claiming a complete combo',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.API_SPORTS_KEY;process.env.API_SPORTS_KEY='test-only';
 const fixture={fixture:{id:990001,date:'2099-10-22T18:00:00Z',status:{short:'NS'}},league:{id:78,name:'Bundesliga',country:'Germany',season:2026},teams:{home:{id:1,name:'Home'},away:{id:2,name:'Away'}}};
 globalThis.fetch=async input=>{const url=new URL(input);let rows=[];
 if(url.pathname==='/standings')rows=[{league:{standings:[[{team:{id:1},rank:3,points:15,all:{played:5}},{team:{id:2},rank:4,points:14,all:{played:5}}]]}}];
 else if(url.pathname.includes('headtohead'))rows=[];
 else if(url.searchParams.has('team')){const id=Number(url.searchParams.get('team'));rows=Array.from({length:5},(_,i)=>({fixture:{id:100+id*10+i,date:`2026-10-${10+i}T12:00:00Z`,status:{short:'FT'}},league:fixture.league,teams:{home:{id},away:{id:99}},goals:{home:1,away:1}}))}
 else rows=[fixture];
 return {ok:true,json:async()=>({response:rows})};
 };
 let body,code=200;const res={setHeader(){},status(n){code=n;return this},json(d){body=d}};
 try{await handler({query:{date:'2099-10-22',count:'6'}},res);assert.equal(code,200);assert.equal(body.complete,false);assert.equal(body.picks.length,0);assert.equal(body.candidates.length,1);assert.equal(body.candidates[0].fixtureId,990001);assert.equal(body.diagnostics.providerErrors,0);assert.match(body.notice,/1 von 6/)}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.API_SPORTS_KEY;else process.env.API_SPORTS_KEY=oldKey}
});
