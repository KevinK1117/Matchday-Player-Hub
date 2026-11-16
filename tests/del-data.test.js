import test from 'node:test';
import assert from 'node:assert/strict';
import {delDetail} from '../lib/del-data.js';
import {rankScorers} from '../public/combo.js';

test('DEL resolves team data and the last lineup without a fixture in the detail provider',async()=>{
 const oldFetch=globalThis.fetch,oldKey=process.env.ICE_HOCKEY_API_KEY;
 process.env.ICE_HOCKEY_API_KEY='test';
 const home={id:'tm_testhome',name:'Krefeld Pinguine'},away={id:'tm_testaway',name:'Straubing Tigers'};
 const last={id:'gm_test',date:'2099-11-11',status:'final',home_team:home,away_team:away};
 const player={id:'pl_test',name:'Testspieler'};
 const paths=[];
 globalThis.fetch=async input=>{
  const path=new URL(input).pathname;
  const params=new URL(input).searchParams;
  paths.push(path);
  let data=[];
  if(path.endsWith('/seasons'))data=[{id:'ss_test',label:'2099-00'}];
  if(path.endsWith('/teams'))data=[home,away];
  if(path.endsWith('/roster')){assert.equal(params.get('season_id'),'ss_test');data=[{player,position:'right_wing',games:10}];}
  if(path.startsWith('/v1/teams/')&&path.endsWith('/games'))data=[last];
  if(path.endsWith('/lineups'))data=[{player,side:'home',position:null}];
  if(path.endsWith('/standings'))data=[{position:1,team:home,points:12}];
  return Response.json({data});
 };
 try{
  const result=await delDetail({date:'2099-11-15',start:'2099-11-15T19:00:00Z',home:home.name,away:away.name});
  assert.equal(result.matched,true);
  assert.equal(result.homeRoster[0].position,'R');
  assert.deepEqual(result.lineups.map(x=>x.source),['last','season']);
  assert.equal(result.lineups[0].rows[0].position,'R');
  assert.equal(result.standings[0].points,12);
  assert(paths.includes('/v1/teams/tm_testhome/head-to-head/tm_testaway'));
 }finally{
  globalThis.fetch=oldFetch;
  if(oldKey===undefined)delete process.env.ICE_HOCKEY_API_KEY;
  else process.env.ICE_HOCKEY_API_KEY=oldKey;
 }
});

test('scorer selection mixes DEL forwards with NHL wings and still excludes NHL centers',()=>{
 const now=Date.parse('2099-11-15T19:00:00Z');
 const games=[1,2].map(id=>({fixture:{id,date:'2099-11-16T19:00:00Z',status:{short:'NS'}}}));
 const last10=Array.from({length:5},(_,i)=>({gameId:i+1,date:'2099-11-0'+(i+1),goals:i%2}));
 const players=[{id:'pl_test',name:'DEL',sport:'del',fixtureId:1,position:'F',last10},
  {id:2,name:'Wing',sport:'nhl',fixtureId:2,position:'R',last10},
  {id:3,name:'Center',sport:'nhl',fixtureId:2,position:'C',last10}];
 assert.deepEqual(rankScorers(games,players,3,now,false,{model:'recent-form'}).picks.map(x=>x.player.name),['DEL','Wing']);
});
