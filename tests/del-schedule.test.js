import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/nhlcenter.js';
import {parseDelSchedule} from '../lib/del-schedule.js';

const row=(day,result='')=>`<tr><td class="team-schedule__date">${day}</td><td>19:30</td><td>17</td>
<td><img src="/fileadmin/images/adler.svg"><h6>Adler Mannheim</h6></td>
<td><h6>K&ouml;lner Haie</h6></td><td></td><td>${result}</td></tr>`;
const schedule=(...rows)=>`<table class="team-schedule team-schedule--full"><thead><tr><th>Spieltag</th></tr></thead><tbody>${rows.join('')}</tbody></table>`;

test('official schedule preserves Berlin time, team names, logos and published results',()=>{
 const fixtures=parseDelSchedule(schedule(row('01.11.2026','<a href="/statistik/spieldetails/example_42">3 : 1<br>(1:0, 0:0, 2:1)</a>')),'2026-11');
 assert.equal(fixtures[0].date,'2026-11-01T19:30:00+01:00');
 assert.equal(fixtures[0].away,'Kölner Haie');
 assert.equal(fixtures[0].homeLogo,'https://www.penny-del.org/fileadmin/images/adler.svg');
 assert.deepEqual([fixtures[0].homeGoals,fixtures[0].awayGoals,fixtures[0].status],[3,1,'FT']);
 assert.equal(fixtures[0].officialUrl,'https://www.penny-del.org/statistik/spieldetails/example_42');
 assert.throws(()=>parseDelSchedule('<html/>','2026-11'));
 assert.throws(()=>parseDelSchedule(schedule(row('01.11.2026')),'2025-11'));
});

test('DEL handler falls back when the current season is outside the API plan',async()=>{
 const savedFetch=globalThis.fetch,savedKey=process.env.API_HOCKEY_KEY;
 process.env.API_HOCKEY_KEY='test';
 globalThis.fetch=async url=>{
  if(url.includes('/leagues?'))return Response.json({response:[{id:1,name:'DEL'}]});
  if(url.includes('/games?'))return Response.json({errors:{plan:'Season unavailable'}});
  assert.equal(url,'https://www.penny-del.org/spiele/monat/september');
  return new Response(schedule(row('20.09.2099')));
 };
 try{
  let status,body;
  const res={setHeader(){},status(code){status=code;return this},json(data){body=data}};
  await handler({query:{action:'del',date:'2099-09-19'}},res);
  assert.equal(status,200);
  assert.deepEqual(body.games,[]);
  assert.equal(body.nextDate,'2099-09-20');
  await handler({query:{action:'del',date:'2099-09-20'}},res);
  assert.equal(body.games[0].date,'2099-09-20T19:30:00+02:00');
  assert.equal(body.games[0].status,'NS');
  assert.equal(body.games[0].homeGoals,null);
 }finally{
  globalThis.fetch=savedFetch;
  if(savedKey===undefined)delete process.env.API_HOCKEY_KEY;
  else process.env.API_HOCKEY_KEY=savedKey;
 }
});
