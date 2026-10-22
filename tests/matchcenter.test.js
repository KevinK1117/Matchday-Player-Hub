import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/matchcenter.js';
const response=()=>({code:200,headers:{},setHeader(k,v){this.headers[k]=v;return this},status(n){this.code=n;return this},json(d){this.body=d}});
test('topscorers accept league and season without a player ID; unknown tiers are rejected',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.API_SPORTS_KEY;process.env.API_SPORTS_KEY='test-only';const paths=[];
 globalThis.fetch=async url=>{paths.push(String(url));return {ok:true,json:async()=>({response:String(url).includes('/leagues')?[{league:{id:78,name:'Bundesliga',type:'League'},country:{name:'Germany'}}]:[{player:{id:9,name:'Test'},statistics:[{goals:{total:7}}]}]})}};
 try{const r=response();await handler({query:{action:'scorers',league:'78',season:'2026'}},r);assert.equal(r.code,200);assert.equal(r.body.data[0].player.id,9);assert(paths.some(p=>p.includes('/players/topscorers?league=78&season=2026')));
 const invalid=response();await handler({query:{action:'scorers',league:'78',season:'oops'}},invalid);assert.equal(invalid.code,400);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.API_SPORTS_KEY;else process.env.API_SPORTS_KEY=oldKey}
});
test('league catalog includes national first divisions and excludes cups and lower tiers',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.API_SPORTS_KEY;process.env.API_SPORTS_KEY='test-only';globalThis.fetch=async()=>({ok:true,json:async()=>({response:[{league:{id:39,name:'Premier League',type:'League'},country:{name:'England'},seasons:[{year:2026,current:true}]},{league:{id:40,name:'Championship',type:'League'},country:{name:'England'}},{league:{id:45,name:'FA Cup',type:'Cup'},country:{name:'England'}}]})});
 try{const r=response();await handler({query:{action:'leagues'}},r);assert.equal(r.code,200);assert.equal(r.body.data.length,1);assert.equal(r.body.data[0].seasons[0].year,2026)}finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.API_SPORTS_KEY;else process.env.API_SPORTS_KEY=oldKey}
});
