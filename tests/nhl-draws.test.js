import test from 'node:test';
import assert from 'node:assert/strict';
import {regulationForm,analyzeNhlDraws} from '../lib/nhl-draws.js';
const kickoff='2099-11-12T01:00:00Z';
const history=club=>['OT','SO','REG','REG','REG'].map((lastPeriodType,i)=>({id:i+1,startTimeUTC:`2099-11-0${i+1}T01:00:00Z`,gameState:'OFF',gameOutcome:{lastPeriodType},homeTeam:{abbrev:club,score:3},awayTeam:{abbrev:'OTH',score:2}}));
test('regulation ties count OT and shootout games once and exclude unfinished or unverified results',()=>{
 const games=history('TOR');
 assert.deepEqual(regulationForm([...games,games[0],{...games[0],id:6,gameState:'LIVE'},{...games[0],id:7,gameOutcome:{}},{...games[0],id:8,startTimeUTC:kickoff}],'TOR',Date.parse(kickoff)),{played:5,draws:2,wins:3});
});
test('upcoming NHL ties use both teams’ verified samples and distinguish a failed history fetch',async()=>{
 const game={fixture:{id:1,date:kickoff,status:{short:'NS'}},teams:{home:{abbrev:'TOR',name:'Toronto'},away:{abbrev:'COL',name:'Colorado'}}};
 const result=await analyzeNhlDraws([game],async club=>history(club),Date.parse('2099-11-11'));
 assert.equal(result.candidates[0].score,40);assert.equal(result.candidates[0].sport,'nhl');
 const partial=await analyzeNhlDraws([game],async club=>{if(club==='COL')throw Error('offline');return history(club)},Date.parse('2099-11-11'));
 assert.equal(partial.candidates.length,0);assert.equal(partial.errors,1);
});
