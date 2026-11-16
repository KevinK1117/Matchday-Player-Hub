import test from 'node:test';
import assert from 'node:assert/strict';
import {matchFixture,selectQuote} from '../api/odds.js';

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
