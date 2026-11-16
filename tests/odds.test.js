import test from 'node:test';
import assert from 'node:assert/strict';
import handler,{matchFixture,selectQuote} from '../api/odds.js';

const now=Date.parse('2026-11-16T19:00:00Z');
const row={fixture_id:8,stopped:false,suspended:false,value:'2.15',latest_bookmaker_update:'2026-11-16 18:59:30',bookmaker:{name:'Test bookmaker'}};

test('fixture matching requires the same participants, sides and kickoff and rejects ambiguous matches',()=>{
 const fixture={id:8,starting_at:'2026-11-16 19:00:00',participants:[
  {name:'FC Köln',meta:{location:'home'}},{name:'Hamburger SV',meta:{location:'away'}}
 ]};
 assert.equal(matchFixture([fixture],'FC Koln','Hamburger SV',now),fixture);
 assert.equal(matchFixture([fixture],'Hamburger SV','FC Köln',now),null);
 assert.equal(matchFixture([fixture],'FC Köln','Hamburger SV',now+360000),null);
 assert.equal(matchFixture([fixture,{...fixture,id:9}],'FC Köln','Hamburger SV',now),null);
});

test('only the requested result or anytime scorer receives a price',()=>{
 const scorer={...row,market_description:'Anytime Goalscorer',label:'J. Šeško'};
 assert.equal(selectQuote([scorer],'scorer','J. Sesko',8,now)?.price,2.15);
 assert.equal(selectQuote([{...scorer,market_description:'First Goalscorer'}],'scorer','J. Sesko',8,now),null);
 assert.equal(selectQuote([{...row,market_description:'Match Winner',label:'Draw'}],'result','draw',8,now)?.price,2.15);
 assert.equal(selectQuote([{...row,market_description:'Match Winner',label:'Draw'}],'result','away',8,now),null);
});

test('live prices require the exact line, period and a fresh open market',()=>{
 const odds={...row,market_description:'Goals Over/Under 1st Half',label:'Over',total:'1.5'};
 assert.equal(selectQuote([odds],'first-half-over','1.5',8,now)?.price,2.15);
 for(const other of [{suspended:true},{stopped:true},{total:'2.5'},{label:'Under'},{fixture_id:9},{latest_bookmaker_update:'2026-11-16 18:56:00'}]){
  assert.equal(selectQuote([{...odds,...other}],'first-half-over','1.5',8,now),null);
 }
 assert.equal(selectQuote([odds],'full-time-over','1.5',8,now),null);
});


test('archived 1-X-2 quotes require a finished Sportmonks fixture and the explicit archive request',async()=>{
 const originalFetch=globalThis.fetch,oldKey=process.env.SPORTMONKS_API_TOKEN;
 process.env.SPORTMONKS_API_TOKEN='test';
 const fixtures=[5,1].map((state_id,i)=>({id:8+i,state_id,starting_at:'2026-01-07 14:30:00',participants:[
  {name:i?'Team C':'Team A',meta:{location:'home'}},{name:'Team B',meta:{location:'away'}}
 ]}));
 const calls=[];
 globalThis.fetch=async input=>{
  const url=new URL(input);
  calls.push(url.pathname);
  return Response.json({data:url.pathname.includes('/date/')?fixtures:['Home','Draw','Away'].map((label,i)=>({...row,market_id:1,bookmaker_id:2,market_description:'Full Time Result',label,value:String(2+i)}))});
 };
 async function request(query){
  let result;
  await handler({query:{home:'Team A',away:'Team B',start:'2026-01-07T14:30:00Z',market:'result',selection:'all',...query}},
   {setHeader(){},status(){return this},json(body){result=body}});
  return result;
 }
 try{
  assert.equal((await request({})).status,'no_quote');
  assert.equal(calls.length,0);
  assert.equal((await request({archive:'1',home:'Team C'})).status,'no_quote');
  assert.equal(calls.length,1);
  const historical=await request({archive:'1'});
  assert.equal(historical.archived,true);
  assert.deepEqual(historical.quote.prices,{home:2,draw:3,away:4});
 }finally{
  globalThis.fetch=originalFetch;
  if(oldKey===undefined)delete process.env.SPORTMONKS_API_TOKEN;
  else process.env.SPORTMONKS_API_TOKEN=oldKey;
 }
});
