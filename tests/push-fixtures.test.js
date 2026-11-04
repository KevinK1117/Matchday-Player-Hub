import test from 'node:test';
import assert from 'node:assert/strict';
import {pushFixtures} from '../lib/push-fixtures.js';
test('push scans call the validated handler directly without an HTTP/CDN hop',async()=>{
 const games=[{fixture:{id:7}}];
 const rows=await pushFixtures('nhl','2026-11-04',{nhl:async(req,res)=>{
  assert.deepEqual(req.query,{action:'fixtures',date:'2026-11-04'});
  res.setHeader('Cache-Control','s-maxage=60');res.status(200).json({data:games});
 }});
 assert.deepEqual(rows,games);
});
test('provider errors and missing data are not silently reported as an empty schedule',async()=>{
 for(const [status,data] of [[502,{error:'unavailable'}],[200,{configured:false,data:null}]]){
  await assert.rejects(pushFixtures('football','2026-11-04',{football:async(req,res)=>res.status(status).json(data)}));
 }
 assert.deepEqual(await pushFixtures('football','2026-11-04',{football:async(req,res)=>res.status(200).json({data:[]})}),[]);
});
