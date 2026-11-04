import test from 'node:test';import assert from 'node:assert/strict';import handler from '../api/matchcenter.js';
test('profile form follows the selected club, never the first national-team statistic; partial XIs do not confirm a start',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.API_SPORTS_KEY;process.env.API_SPORTS_KEY='test';const paths=[];let body,code;
 const res={setHeader(){},status(c){code=c;return this},json(d){body=d}};
 globalThis.fetch=async input=>{const u=new URL(input);paths.push(u.pathname+u.search);let rows=[];
 if(u.pathname==='/players')rows=[{player:{id:909090},statistics:[{team:{id:2}},{team:{id:1}}]}];
 if(u.pathname==='/fixtures'&&u.searchParams.has('next'))rows=[{fixture:{id:909090},teams:{home:{name:'Club'},away:{name:'Opponent'}}}];
 if(u.pathname==='/fixtures/lineups')rows=[{team:{id:1},startXI:[{player:{id:909090}}]}];
 return {ok:true,json:async()=>({response:rows})};};
 try{await handler({query:{action:'player',id:'909090',season:'2026',team:'1'}},res);assert.equal(code,200);assert.ok(paths.some(p=>p.includes('team=1&last=5')));assert.ok(!paths.some(p=>p.includes('team=2')));assert.match(body.data.participation,/noch nicht veröffentlicht/);
 await handler({query:{action:'player',id:'909090',season:'2026',team:'3'}},res);assert.equal(code,404);
 }finally{globalThis.fetch=oldFetch;if(oldKey===undefined)delete process.env.API_SPORTS_KEY;else process.env.API_SPORTS_KEY=oldKey}
});
