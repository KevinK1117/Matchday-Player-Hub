import test from 'node:test';
import assert from 'node:assert/strict';
import {eventMessage,liveTipMessage} from '../lib/push-message.js';
import {nhlEvents} from '../lib/push-events.js';
const game={teams:{home:{id:1,name:'Rangers'},away:{id:2,name:'Oilers'}},goals:{home:0,away:2}};
test('lock-screen goals show the match first and highlight the event score',()=>{
 const result=eventMessage(game,'nhl',{type:'goal',scorer:'Leon Draisaitl',teamId:2,time:'1. Drittel · 06:19',score:{home:0,away:1}});
 assert.equal(result.title,'Rangers – Oilers');
 assert.equal(result.body,'🏒 06:19 (1. D.) · Tor! 0 – [1] · L. Draisaitl');
 assert.equal(result.body.includes('\n'),false);
});
test('unknown goal scores are explicitly current scores and unknown scorers stay unknown',()=>{
 const message=eventMessage(game,'football',{type:'goal',teamId:2,time:'12′'});
 assert.equal(message.title,'Rangers – Oilers');
 assert.equal(message.body,'⚽ 12′ · Tor! Aktuell 0 – 2 · Torschütze offen');
 assert.equal(message.body.includes('['),false);
 assert.deepEqual(eventMessage(game,'nhl',{type:'finished'}),{title:'Rangers – Oilers',body:'🏒 Endstand 0 – 2'});
});
test('two goals received together retain their distinct official event scores',()=>{
 const plays=[{eventId:1,typeDescKey:'goal',details:{homeScore:0,awayScore:1,eventOwnerTeamId:2}},{eventId:2,typeDescKey:'goal',details:{homeScore:0,awayScore:2,eventOwnerTeamId:2}}];
 const rows=nhlEvents(game,{plays});
 assert.match(eventMessage(game,'nhl',rows[0]).body,/0 – \[1\]/);
 assert.match(eventMessage(game,'nhl',rows[1]).body,/0 – \[2\]/);
 assert.equal(nhlEvents(game,{plays:[{...plays[0],details:{homeScore:null,awayScore:1}}]})[0].score,undefined);
});
test('live tips clearly identify market, minute and current score',()=>{
 assert.deepEqual(liveTipMessage(game,'football','Spätes Tor · 83. Minute · Über 2,5 Tore Gesamtspiel'),{title:'Rangers – Oilers',body:'⚽ Live-Tipp · 83. Minute · Über 2,5 Tore Gesamtspiel · Stand 0 – 2'});
});
