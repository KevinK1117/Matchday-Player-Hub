import test from 'node:test';import assert from 'node:assert/strict';
import {confirmedLineupTeams,lineupSignals} from '../lib/lineup-notifications.js';
import {favoriteSignals} from '../lib/favorite-push.js';
import {eventMessage} from '../lib/push-message.js';
const game={fixture:{id:5,date:new Date(Date.now()+900000).toISOString(),status:{short:'NS'}},teams:{home:{id:1,name:'Home'},away:{id:2,name:'Away'}},goals:{home:null,away:null}};
test('only a published full XI is a confirmed football lineup',()=>{const teams=confirmedLineupTeams(game,'football',{response:[{team:{id:1,name:'Home'},startXI:Array(11).fill({})},{team:{id:2},startXI:Array(10).fill({})}]});assert.equal(teams.length,1);assert.equal(lineupSignals(teams,['1'],'football').length,0);assert.match(eventMessage(game,'football',lineupSignals(teams,[],'football')[0]).body,/Startelf veröffentlicht/)});
test('NHL previews are not confirmations and dressed rosters never confirm lines',()=>{const side={forwards:Array(12).fill({}),defense:Array(6).fill({}),goalies:Array(2).fill({})};const box={gameState:'PRE',playerByGameStats:{homeTeam:side}};assert.equal(confirmedLineupTeams(game,'nhl',box).length,0);box.gameState='LIVE';const teams=confirmedLineupTeams(game,'nhl',box);assert.equal(teams.length,1);const message=eventMessage(game,'nhl',lineupSignals(teams,[],'nhl')[0]);assert.match(message.title,/Spielkader bestätigt/);assert.match(message.body,/Reihen weiterhin offen/)});
test('confirmation is queued once and survives a later empty provider response',async()=>{
 const original=global.fetch;let published=true;global.fetch=async()=>({ok:true,json:async()=>({response:published?[{team:{id:1,name:'Home'},startXI:Array(11).fill({})}]:[]})});
 const memory=new Map();const redis=async(cmd,key,value)=>{if(cmd==='GET')return memory.get(key);if(cmd==='SET')memory.set(key,value);return 1};
 const args={sport:'football',games:[game],subscribers:[{key:'subscriber',preferences:{favoriteEvents:true,games:[{sport:'football',id:'5'}]}}],redis,budgetUntil:Date.now()+5000};
 try{assert.equal((await favoriteSignals(args)).signals.length,1);assert.equal((await favoriteSignals(args)).signals.length,0);published=false;await favoriteSignals(args);published=true;assert.equal((await favoriteSignals(args)).signals.length,0)}finally{global.fetch=original}
});
