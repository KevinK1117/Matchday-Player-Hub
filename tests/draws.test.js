import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{form} from '../api/draws.js';
test('last-five form excludes future and unfinished fixtures',()=>{
 const rows=Array.from({length:8},(_,i)=>({fixture:{date:`2026-10-${String(20-i).padStart(2,'0')}T12:00:00Z`,status:{short:'FT'}},teams:{home:{id:1},away:{id:2}},goals:{home:i<5?2:0,away:1}}));
 rows.push({...rows[0],fixture:{date:'2026-10-23T12:00:00Z',status:{short:'FT'}}});
 rows.push({...rows[0],fixture:{date:'2026-10-21T12:00:00Z',status:{short:'NS'}}});
 const result=form(rows,1,'2026-10-22');assert.equal(result.last5Points,15);assert.equal(result.last5Played,5);assert.equal(result.played,8);
});
test('draw configurator rejects selections outside 6–20',async()=>{
 for(const count of ['5','21','NaN']){let code;const res={setHeader(){},status(n){code=n;return this},json(){}};await handler({query:{date:'2026-10-22',count}},res);assert.equal(code,400)}
});
test('partial analysis exposes real candidates without claiming a complete combo',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.API_SPORTS_KEY;process.env.API_SPORTS_KEY='test-only';
 const fixture={fixture:{id:990001,date:'2099-10-22T18:00:00Z',status:{short:'NS'}},league:{id:78,name:'Bundesliga',country:'Germany',season:2026},teams:{home:{id:1,name:'Home'},away:{id:2,name:'Away'}}};
 globalThis.fetch=async input=>{const url=new URL(input);let rows=[];
 if(url.pathname==='/standings')rows=[{league:{standings:[[{team:{id:1},rank:3,points:15,all:{played:5}},{team:{id:2},rank:4,points:14,all:{played:5}}]]}}];
 else if(url.pathname.includes('headtohead'))rows=[];
 else if(url.searchParams.has('team')){const id=Number(url.searchParams.get('team'));rows=Array.from({length:8},(_,i)=>({fixture:{id:100+id*10+i,date:`2026-10-${10+i}T12:00:00Z`,status:{short:'FT'}},league:fixture.league,teams:i%2?{home:{id},away:{id:99}}:{home:{id:99},away:{id}},goals:{home:1,away:1}}))}
 else rows=[fixture];
 return {ok:true,json:async()=>({response:rows})};
 };
 let body,code=200;const res={setHeader(){},status(n){code=n;return this},json(d){body=d}};
 try{await handler({query:{date:'2099-10-22',count:'6'}},res);assert.equal(code,200);assert.equal(body.complete,false);assert.equal(body.picks.length,0);assert.equal(body.candidates.length,1);assert.equal(body.candidates[0].fixtureId,990001);assert.equal(body.diagnostics.providerErrors,0);assert.match(body.notice,/1 vorläufige Modellkandidaten/)}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.API_SPORTS_KEY;else process.env.API_SPORTS_KEY=oldKey}
});
test('analysis bounds provider concurrency and shares league standings requests',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.API_SPORTS_KEY;process.env.API_SPORTS_KEY='test-only';let active=0,maxActive=0,standingsRequests=0;
 const games=Array.from({length:4},(_,i)=>({fixture:{id:991000+i,date:'2099-10-23T18:00:00Z',status:{short:'NS'}},league:{id:39,name:'Premier League',country:'England',season:2027},teams:{home:{id:1000+i*2,name:'Home'},away:{id:1001+i*2,name:'Away'}}}));
 globalThis.fetch=async input=>{active++;maxActive=Math.max(maxActive,active);const u=new URL(input);if(u.pathname==='/standings')standingsRequests++;await new Promise(r=>setTimeout(r,2));active--;return {ok:true,json:async()=>({response:u.pathname==='/fixtures'&&u.searchParams.has('date')?games:u.pathname==='/fixtures'&&u.searchParams.has('team')?Array.from({length:8},(_,i)=>({fixture:{id:Number(u.searchParams.get('team'))*100+i,date:'2026-10-'+String(10+i).padStart(2,'0'),status:{short:'FT'}},league:games[0].league,teams:i%2?{home:{id:Number(u.searchParams.get('team'))},away:{id:999}}:{home:{id:999},away:{id:Number(u.searchParams.get('team'))}},goals:{home:1,away:1}})):[]})}};
 const res={setHeader(){},status(){return this},json(){}};
 try{await handler({query:{date:'2099-10-23',count:'6'}},res);assert(maxActive<=3);assert.equal(standingsRequests,1)}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.API_SPORTS_KEY;else process.env.API_SPORTS_KEY=oldKey}
});


test('batched whole-matchday scan retains more than twenty signals from every supplied league',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.API_SPORTS_KEY;process.env.API_SPORTS_KEY='test-only';
 const league={id:9999,name:'Other League',country:'Other',season:2099};
 const games=Array.from({length:26},(_,i)=>({fixture:{id:800000+i,date:'2099-11-07T20:00:00Z',status:{short:'NS'}},league,teams:{home:{id:700000+i*2,name:'Home '+i},away:{id:700001+i*2,name:'Away '+i}}}));
 globalThis.fetch=async input=>{const u=new URL(input);let response=[];
 if(u.pathname==='/fixtures'&&u.searchParams.has('date'))response=games;
 else if(u.pathname==='/fixtures'&&u.searchParams.has('team')){const id=Number(u.searchParams.get('team'));response=Array.from({length:10},(_,i)=>({fixture:{id:id*100+i,date:'2099-10-'+String(10+i).padStart(2,'0'),status:{short:'FT'}},league,teams:i%2?{home:{id},away:{id:999}}:{home:{id:999},away:{id}},goals:{home:1,away:1}}))}
 return {ok:true,json:async()=>({response})};};
 try{let offset=0,finished=false,batches=0;const seen=new Set();while(!finished){let body;await handler({query:{date:'2099-11-07',count:'all',batch:'1',offset:String(offset)}},{setHeader(){},status(){return this},json(d){body=d}});assert.equal(body.totalFixtures,26);batches++;assert(body.considered<=8);assert(body.nextOffset>offset);for(const p of body.candidates){seen.add(p.fixtureId);assert.equal(p.injuriesAvailable,true);assert.deepEqual(p.lineup,{home:false,away:false});assert(p.homeForm.homeScored>0);assert(p.awayForm.awayPoints>0)}offset=body.nextOffset;finished=body.scanComplete}assert.equal(offset,26);assert.equal(seen.size,26);assert.equal(batches,4)}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.API_SPORTS_KEY;else process.env.API_SPORTS_KEY=oldKey}
});
