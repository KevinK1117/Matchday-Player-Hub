import test from 'node:test';
import assert from 'node:assert/strict';
import {recentScorerForm,stabilizedShootingRate} from '../lib/scorer-analysis.js';
import {selectSeasonXg} from '../lib/player-metrics.js';
test('ten-game shots exclude future games and duplicates and never treat partial data as ten games',()=>{
 const log=Array.from({length:12},(_,i)=>({gameId:i,gameDate:'2026-10-'+String(i+1).padStart(2,'0'),shots:3,goals:1}));
 const form=recentScorerForm([...log,log[10],{gameId:20,gameDate:'2026-12-01',shots:100}],'2026-11-07');
 assert.equal(form.last10Shots,30);assert.equal(form.last10Games,10);assert.equal(form.last5Goals,5);
 assert.equal(recentScorerForm(log.slice(0,9),'2026-11-07').last10Shots,null);
 assert.equal(recentScorerForm(log.map((g,i)=>i===11?{...g,shots:null}:g),'2026-11-07').last10Shots,null);
 assert.equal(recentScorerForm(log.map(g=>({...g,shots:0})),'2026-11-07').last10Shots,0);
});
test('long-term shot conversion tempers a small hot streak without counting transfer totals twice',()=>{
 const p={goals:10,shots:40};
 const row={leagueAbbrev:'NHL',gameTypeId:2,season:20252026};
 const history=[{...row,teamName:'TOT',goals:20,shots:200},{...row,teamName:'Team A',goals:20,shots:100},{...row,teamName:'Team B',goals:0,shots:100},{...row,season:20262027,goals:100,shots:100}];
 assert.equal(stabilizedShootingRate(p,history,20262027),20/140);
 assert.ok(stabilizedShootingRate(p,history,20262027)<.25);
 assert.equal(stabilizedShootingRate({goals:0,shots:null},history,20262027),0);
});
test('quality statistics require the exact player, sport and season and preserve missing versus zero',()=>{
 const row={playerId:1,sport:'nhl',season:'20262027',scope:'season',source:'Verified feed',xG:8,xGPerGame:0,highDangerChancesPerGame:2};
 const query={id:1,sport:'nhl',season:'20262027'};
 assert.equal(selectSeasonXg([row],query).xGPerGame,0);
 assert.equal(selectSeasonXg([{...row,xGPerGame:null}],query).xGPerGame,null);
 assert.equal(selectSeasonXg([row],{...query,id:2}),null);
 assert.equal(selectSeasonXg([row],{...query,season:'20252026'}),null);
});
test('NHL endpoint keeps ten-game form and rejects a stale club assignment',async()=>{
 const {default:handler}=await import('../api/nhl.js');const oldFetch=globalThis.fetch;let body,code;
 const res={setHeader(){},status(c){code=c;return this},json(d){body=d}};
 globalThis.fetch=async input=>{const path=new URL(input).pathname;let data={};
 if(path.startsWith('/v1/score/'))data={games:[{id:9099901,startTimeUTC:'2027-02-17T18:00:00Z',gameState:'FUT',homeTeam:{abbrev:'AAA'},awayTeam:{abbrev:'BBB'}}]};
 if(path.includes('/club-stats/AAA/'))data={skaters:[{playerId:909991,firstName:{default:'Current'},lastName:{default:'Wing'},positionCode:'L',gamesPlayed:20,goals:10,shots:60},{playerId:909992,firstName:{default:'Stale'},lastName:{default:'Wing'},positionCode:'R',gamesPlayed:20,goals:12,shots:60}]};
 if(path.includes('/game-log/'))data={gameLog:Array.from({length:10},(_,i)=>({gameId:9099800+i,gameDate:'2027-02-'+String(i+1).padStart(2,'0'),shots:3,goals:1,toi:'18:00'}))};
 if(path.endsWith('/landing'))data={currentTeamAbbrev:path.includes('909992')?'CCC':'AAA',seasonTotals:[{season:20252026,gameTypeId:2,leagueAbbrev:'NHL',goals:20,shots:200}]};
 return {ok:true,status:200,json:async()=>data};
 };
 try{await handler({query:{date:'2027-02-17',count:'6'}},res);assert.equal(code,200);assert.deepEqual(body.players.map(p=>p.id),[909991]);assert.equal(body.players[0].last10Shots,30);assert.equal(body.players[0].last5Goals,5);assert.equal(body.players[0].xGPerGame,null);assert.equal(body.allPlayers.find(p=>p.id===909992).rosterMismatch,true);}finally{globalThis.fetch=oldFetch;}
});
