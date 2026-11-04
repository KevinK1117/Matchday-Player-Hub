import test from 'node:test';import assert from 'node:assert/strict';
import {confirmedLineupTeams,lineupSignals} from '../lib/lineup-notifications.js';
import {favoriteSignals} from '../lib/favorite-push.js';
import {eventMessage} from '../lib/push-message.js';
const game={fixture:{id:5,date:new Date(Date.now()+900000).toISOString(),status:{short:'NS'}},teams:{home:{id:1,name:'Home'},away:{id:2,name:'Away'}},goals:{home:null,away:null}};
test('only a published full XI is a confirmed football lineup',()=>{const teams=confirmedLineupTeams(game,'football',{response:[{team:{id:1,name:'Home'},startXI:Array(11).fill({})},{team:{id:2},startXI:Array(10).fill({})}]});assert.equal(teams.length,1);assert.equal(lineupSignals(teams,['1'],'football').length,0);assert.match(eventMessage(game,'football',lineupSignals(teams,[],'football')[0]).body,/Startelf bestätigt/)});
test('NHL previews are not confirmations and dressed rosters never confirm lines',()=>{const side={forwards:Array(12).fill({}),defense:Array(6).fill({}),goalies:Array(2).fill({})};const box={gameState:'PRE',playerByGameStats:{homeTeam:side}};assert.equal(confirmedLineupTeams(game,'nhl',box).length,0);box.gameState='LIVE';const teams=confirmedLineupTeams(game,'nhl',box);assert.equal(teams.length,1);const message=eventMessage(game,'nhl',lineupSignals(teams,[],'nhl')[0]);assert.equal(message.title,'Home – Away');assert.match(message.body,/Spielkader bestätigt.*Reihen offen/)});
test('pregame lineup confirmations never fetch providers or create push messages',async t=>{
 t.mock.method(globalThis,'fetch',async()=>{throw Error('Pregame lineup must not be fetched')});
 const memory=new Map();const redis=async(cmd,key,value)=>{if(cmd==='GET')return memory.get(key);if(cmd==='SET')memory.set(key,value);return 1};
 const args={sport:'football',games:[game],subscribers:[{key:'subscriber',preferences:{favoriteEvents:true,games:[{sport:'football',id:'5'}]}}],redis,budgetUntil:Date.now()+5000};
 assert.equal((await favoriteSignals(args)).signals.length,0);
 assert.equal(globalThis.fetch.mock.callCount(),0);
});
test('NHL play-by-play score becomes the baseline and confirmed rosters are not refetched',async t=>{
 const live={...game,fixture:{...game.fixture,status:{short:'LIVE'}},goals:{home:0,away:0}};
 const payload={homeTeam:{score:0},awayTeam:{score:1},rosterSpots:[],plays:[{eventId:42,typeDescKey:'goal',periodDescriptor:{number:1},timeInPeriod:'16:36',details:{eventOwnerTeamId:2,homeScore:0,awayScore:1}}]};
 t.mock.method(globalThis,'fetch',async url=>{assert.match(url,/play-by-play$/);return {ok:true,json:async()=>payload}});
 const state=new Map([['matchday:event-state:nhl:5',JSON.stringify({status:'LIVE',score:{home:0,away:0},events:[],lineups:['1','2']})]]);
 const redis=async(cmd,key,value)=>{if(cmd==='GET')return state.get(key);if(cmd==='SET')state.set(key,value);return 1};
 const args={sport:'nhl',games:[live],subscribers:[{key:'device',preferences:{favoriteEvents:true,games:[{sport:'nhl',id:'5'}]}}],redis,budgetUntil:Date.now()+5000};
 assert.equal((await favoriteSignals(args)).signals.length,1);
 assert.deepEqual(JSON.parse(state.get('matchday:event-state:nhl:5')).score,{home:0,away:1});
 assert.equal((await favoriteSignals(args)).signals.length,0);
});
