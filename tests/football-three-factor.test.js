import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';import vm from 'node:vm';
import {footballThreeFactorScorer} from '../public/scorer-model.js';
import {rankScorers} from '../public/combo.js';
const base={id:1,name:'Forward',sport:'football',lineupSource:'last',lineupPosition:'F',fixtureId:1,minutes:1200,appearances:15,minutesPerGame:80,goals:8,shotsPerGame:2};
test('football normalizes shots and goals to 90 and scales its rate by expected minutes',()=>{
 const m=footballThreeFactorScorer(base);assert.equal(m.shotsOnTarget90,2.25);assert.equal(m.goals90,.6);assert.equal(m.expectedMinutes,80);assert.equal(m.minutesSource,'Saisonschnitt');
 const short=footballThreeFactorScorer({...base,externalExpectedMinutes:60});assert.equal(short.minutesSource,'Zusatzquelle');assert.ok(Math.abs(short.expectedGoals/m.expectedGoals-.75)<1e-12);
 for(const patch of [{minutes:null},{shotsPerGame:null},{goals:null},{externalExpectedMinutes:-5},{externalExpectedMinutes:120},{goals:40}])assert.equal(footballThreeFactorScorer({...base,...patch}),null);
});
test('football combo ordering and displayed probability agree and Home keeps its original score',()=>{
 const now=Date.now(),games=[{fixture:{id:1,status:{short:'NS'},date:new Date(now+3600000).toISOString()}}];
 const ps=[{...base,id:1,goals:5,score:100},{...base,id:2,goals:12,score:.01},{...base,id:3,externalExpectedMinutes:30,score:200}];
 const r=rankScorers(games,ps,6,now,false,{model:'three-factor'});assert.deepEqual(r.picks.map(p=>p.player.id),[2,1]);assert.equal(r.complete,false);assert.equal(ps[1].comboAnalysis,undefined);
 const html=fs.readFileSync(new URL('../index.html',import.meta.url),'utf8'),a=html.indexOf('function scorerChance'),b=html.indexOf('function homePlayerCard',a),c=vm.createContext({});vm.runInContext(html.slice(a,b),c);
 for(const pick of r.picks){assert.equal(pick.score,pick.player.comboAnalysis.expectedGoals);assert.equal(c.scorerChance(pick.player,false),pick.player.comboAnalysis.probability);}
 assert.equal(rankScorers(games,ps,6,now).picks[0].player.id,1);
 assert.equal(c.scorerChance(ps[1],false),100*(1-Math.exp(-(12/1200)*80)));
});
