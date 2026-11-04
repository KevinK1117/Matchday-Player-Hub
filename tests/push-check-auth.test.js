import test from 'node:test';
import assert from 'node:assert/strict';
import {pushCheckAccess} from '../lib/push-check-auth.js';
test('a dedicated scheduler key can scan but cannot send arbitrary test pushes',()=>{
 const env={CRON_SECRET:'admin-secret',PUSH_SCHEDULER_SECRET:'limited-secret'};
 const request=(key,query={})=>({headers:{authorization:'Bearer '+key},query});
 assert.equal(pushCheckAccess(request('limited-secret'),env),'scheduler');
 assert.equal(pushCheckAccess(request('limited-secret',{test:'1'}),env),null);
 assert.equal(pushCheckAccess(request('admin-secret',{test:'1'}),env),'admin');
 for(const key of ['','wrong','undefined'])assert.equal(pushCheckAccess(request(key),env),null);
 assert.equal(pushCheckAccess(request('limited-secret'),{}),null);
});
