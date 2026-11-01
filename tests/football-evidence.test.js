import test from 'node:test';
import assert from 'node:assert/strict';
import {externalTeamForm,footballDataRows,sportmonksRows,getFootballEvidence} from '../lib/football-evidence.js';
test('finished regular-time scores only; missing goals never count as zero',()=>{
 const d={matches:[{status:'FINISHED',utcDate:'2026-10-01',homeTeam:{name:'A'},awayTeam:{name:'B'},score:{duration:'REGULAR',fullTime:{home:2,away:1}},competition:{name:'Bundesliga'}},{status:'IN_PLAY',score:{}},{status:'FINISHED',score:{duration:'PENALTY_SHOOTOUT'}}]};assert.equal(footballDataRows(d).length,1);assert.equal(footballDataRows(d)[0].homeGoals,2);assert.deepEqual(sportmonksRows({data:[{state:{developer_name:'INPLAY'}}]}),[]);
});
test('form excludes future games, wrong leagues, duplicates and conflicting results',()=>{
 const rows=Array.from({length:3},(_,i)=>({date:`2026-10-0${i+1}T15:00:00Z`,home:'Team A',away:'Team B',homeGoals:2,awayGoals:1,league:'Bundesliga',source:'OpenLigaDB'}));
 assert.equal(externalTeamForm({rows:[...rows,...rows]},'Team A',78,'2026-11-01').played,3);
 assert.equal(externalTeamForm({rows},'Team A',39,'2026-11-01'),null);
 assert.equal(externalTeamForm({rows},'Team',78,'2026-11-01'),null);
 assert.equal(externalTeamForm({rows},'Team A',78,'2026-10-02'),null);
 assert.equal(externalTeamForm({rows:[...rows,{...rows[0],homeGoals:5}]},'Team A',78,'2026-11-01'),null);
});
test('missing provider keys are explicit and OpenLigaDB history feeds form',async()=>{
 const old=global.fetch;const fd=process.env.FOOTBALL_DATA_TOKEN,sm=process.env.SPORTMONKS_API_TOKEN;delete process.env.FOOTBALL_DATA_TOKEN;delete process.env.SPORTMONKS_API_TOKEN;
 global.fetch=async()=>({ok:true,json:async()=>Array.from({length:3},(_,i)=>({matchID:i+1,matchDateTimeUTC:`2026-10-0${i+1}T15:00:00Z`,leagueName:'1. Fußball-Bundesliga 2026/2027',team1:{teamName:'Team A'},team2:{teamName:'Team B'},matchIsFinished:true,matchResults:[{resultTypeID:2,pointsTeam1:2,pointsTeam2:1}]}))});
 try{const d=await getFootballEvidence('2026-11-01');assert.equal(d.providers.find(p=>p.name==='football-data.org').status,'missing_key');assert.equal(externalTeamForm(d,'Team A',78,'2026-11-01').played,3)}finally{global.fetch=old;if(fd!==undefined)process.env.FOOTBALL_DATA_TOKEN=fd;if(sm!==undefined)process.env.SPORTMONKS_API_TOKEN=sm}
});
