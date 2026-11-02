import test from 'node:test';
import assert from 'node:assert/strict';
import {eventMessage,liveTipMessage} from '../lib/push-message.js';

const game={teams:{home:{id:1,name:'Rangers'},away:{id:2,name:'Oilers'}},goals:{home:0,away:2}};
test('goals separate event time, scorer and current score',()=>{
  const result=eventMessage(game,'nhl',{type:'goal',label:'Tor · Leon Draisaitl · 1. Drittel · 06:19',scorer:'Leon Draisaitl',teamId:2,time:'1. Drittel · 06:19'});
  assert.equal(result.title,'🏒 NHL · Tor · 1. Drittel · 06:19');
  assert.equal(result.body,'Rangers – Oilers\nAktuell: 0:2\nTorschütze: Leon Draisaitl (Oilers)');
});
test('unknown scorers stay unknown and final scores have a clear label',()=>{
  assert.match(eventMessage(game,'football',{type:'goal',label:'Tor · 0:2 · Torschütze noch nicht gemeldet'}).body,/Torschütze noch nicht gemeldet$/);
  assert.deepEqual(eventMessage(game,'nhl',{type:'finished',label:'Abpfiff · Spiel beendet'}),{title:'🏒 NHL · Spielende',body:'Rangers – Oilers\nEndstand: 0:2'});
});
test('live tips clearly separate market and match time',()=>{
  assert.deepEqual(liveTipMessage(game,'football','Spätes Tor · 83. Minute · Über 2,5 Tore Gesamtspiel'),{title:'⚽ Fußball · Live-Tipp',body:'Rangers – Oilers · 0:2\nÜber 2,5 Tore Gesamtspiel\n83. Minute'});
});
