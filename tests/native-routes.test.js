import test from 'node:test';
import assert from 'node:assert/strict';
import handler from '../api/push.js';
function response(){return {code:0,body:null,setHeader(){},status(code){this.code=code;return this},json(body){this.body=body;return this},end(){return this}}}
test('native subscription route rejects unauthenticated installation',async()=>{const res=response();await handler({method:'POST',query:{channel:'subscription'},headers:{}},res);assert.equal(res.code,401);assert.match(res.body.error,/authentifiziert/)});
test('native push update cannot modify another installation without its credential',async()=>{const res=response();await handler({method:'DELETE',query:{channel:'ios'},headers:{}},res);assert.equal(res.code,401)});
test('iOS availability does not require VAPID and exposes no keys',async()=>{const res=response();await handler({method:'GET',query:{channel:'ios'},headers:{}},res);assert.equal(res.code,200);assert.deepEqual(Object.keys(res.body),['enabled'])});
