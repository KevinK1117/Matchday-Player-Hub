import test from 'node:test';
import assert from 'node:assert/strict';
import {allowedPushEvent} from '../lib/push-policy.js';
test('only goals and game end survive delivery, including the old outbox format',()=>{
 const event={audience:['device'],watch:{sport:'nhl'}};
 for(const eventType of ['goal','finished'])assert.equal(allowedPushEvent({...event,eventType}),true);
 for(const eventType of ['lineup','kickoff','halftime','period','powerplay','tip',''])assert.equal(allowedPushEvent({...event,eventType}),false);
 for(const id of ['nhl:12:goal:5','football:12:score:1:0','nhl:12:finished'])assert.equal(allowedPushEvent({...event,id}),true);
 for(const id of ['nhl:12:lineup:1','nhl:12:period-start:2','nhl:12:powerplay:3','football:12:halftime','nhl:12:third-period'])assert.equal(allowedPushEvent({...event,id}),false);
 assert.equal(allowedPushEvent({id:'nhl:12:goal:1'}),false);
});
