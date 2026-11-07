import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {threeFactorScorer} from '../public/scorer-model.js';
import {rankScorers} from '../public/combo.js';
const base={id:1,name:'Wing',sport:'nhl',GP:20,goals:8,shotsPerGame:3,last10Games:10,last10Shots:30,lineupSource:'last',lineupPosition:'L',fixtureId:1};
test('three factors produce one consistent Poisson chance and blend shot rates rather than adding them',()=>{
 const m=threeFactorScorer(base);
 assert.ok(Math.abs(m.effectiveShotsPerGame-3)<1e-12);
 assert.ok(Math.abs(m.expectedGoals-3*18/160)<1e-12);
 assert.equal(m.probability,100*(1-Math.exp(-m.expectedGoals)));
 assert.equal(m.calibrated,false);
 assert.ok(threeFactorScorer({...base,last10Shots:40}).probability>m.probability);
 assert.ok(threeFactorScorer({...base,goals:6}).probability<m.probability);
});
test('missing, partial and inconsistent evidence never yields a fake zero or a scored candidate',()=>{
 for(const patch of [{GP:null},{goals:null},{shotsPerGame:null},{last10Shots:null},{last10Games:9},{last10Shots:100},{last10Shots:-1},{GP:9},{goals:70}])assert.equal(threeFactorScorer({...base,...patch}),null);
 assert.ok(threeFactorScorer({...base,last10Shots:0}));
});
test('combination orders by its displayed chance and ignores old scores, goal streaks and unavailable xG',()=>{
 const now=Date.now(),games=[{fixture:{id:1,status:{short:'NS'},date:new Date(now+3600000).toISOString()}}];
 const weaker={...base,id:1,goals:4,score:2,last5Goals:20,xGPerGame:3};
 const stronger={...base,id:2,goals:10,last10Shots:40,score:.01};
 const missing={...base,id:3,last10Shots:null,score:3};
 const players=[weaker,stronger,missing];
 const r=rankScorers(games,players,6,now,false,{model:'three-factor'});
 assert.deepEqual(r.picks.map(p=>p.player.id),[2,1]);
 assert.equal(r.complete,false);
 for(const pick of r.picks)assert.equal(pick.score,pick.player.comboAnalysis.expectedGoals);
 assert.ok(r.picks[0].player.comboAnalysis.probability>r.picks[1].player.comboAnalysis.probability);
 assert.equal(stronger.comboAnalysis,undefined);
 // Home keeps its existing score and ranking unless the combo model is explicitly requested.
 assert.equal(rankScorers(games,players,6,now).picks[0].player.id,3);
 assert.equal(stronger.score,.01);
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf('function scorerChance'),end=html.indexOf('function homePlayerCard',start);
 const c=vm.createContext({});vm.runInContext(html.slice(start,end),c);
 assert.equal(c.scorerChance(r.picks[0].player,true),r.picks[0].player.comboAnalysis.probability);
 assert.equal(c.scorerChance(stronger,true),100*(1-Math.exp(-.01)));
});
