import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {isNhlThirdPeriod,matchClockLabel,nhlClock} from '../public/match-clock.js';
import {liveRecentForm,teamRecentForm} from '../public/recent-form.js';
const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');

test('NHL live selection reads the period and remaining time from the normalized clock',async()=>{
 const kickoff='2026-11-11T00:00:00Z';
 const clock=nhlClock({periodDescriptor:{number:3,periodType:'REG'},clock:{timeRemaining:'04:10'}});
 const game={sport:'nhl',fixture:{id:1,date:kickoff,status:{short:'LIVE',clock}},teams:{home:{id:1,name:'Home'},away:{id:2,name:'Away'}},goals:{home:2,away:1}};
 const history=Array.from({length:5},(_,i)=>({...game,fixture:{id:i+10,date:`2026-11-0${i+1}T00:00:00Z`,status:{short:'FT'}}}));
 const elements={liveSport:{value:'nhl'},liveCount:{value:'3'},date:{value:'2026-11-11'},liveMeta:{},liveResult:{}};
 let fixture=game;
 const context=vm.createContext({$:id=>elements[id],liveBusy:false,liveLast:0,view:'combo',document:{visibilityState:'visible'},isNhlThirdPeriod,teamRecentForm,liveRecentForm,esc:String,liveTipCard:x=>matchClockLabel(x.g),get:async q=>q.action==='fixtures'?{configured:true,data:[fixture]}:{data:{homeRecent:{data:history},awayRecent:{data:history}}}});
 vm.runInContext(html.slice(html.indexOf('async function liveCombo('),html.indexOf('async function loadRecentScorers(')),context);
 await context.liveCombo(true);
 assert.match(elements.liveResult.innerHTML,/3\. Drittel · 04:10/);
 for(const replacement of [{period:2},{periodType:'OT'},{intermission:true},{remaining:null},{remaining:'00:00'}]){
  fixture={...game,fixture:{...game.fixture,status:{short:'LIVE',clock:{...clock,...replacement}}}};
  await context.liveCombo(true);
  assert.match(elements.liveResult.innerHTML,/Keine passenden Live-Torsignale/);
 }
});

test('scorer cards distinguish confirmed participation from reference and season positions',()=>{
 const context=vm.createContext({});
 vm.runInContext(html.slice(html.indexOf('function scorerStatus('),html.indexOf('function homePlayerCard(')),context);
 const label=context.scorerStatus;
 assert.equal(label({participation:'Startelf bestätigt',questionable:true},false),'Startelf bestätigt');
 assert.equal(label({participation:'Bestätigter Einsatz',lineupSource:'last'},true),'Einsatz offen · letzte Aufstellung');
 assert.equal(label({lineupSource:'current'},true),'Einsatz offen · aktueller Kader');
 assert.equal(label({lineupSource:'season'},true),'Einsatz offen · Saisonposition');
 assert.equal(label({unavailable:true},false),'Ausfall gemeldet');
});
