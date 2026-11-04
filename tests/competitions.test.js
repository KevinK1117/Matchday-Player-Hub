import test from 'node:test';import assert from 'node:assert/strict';import {isScorerCompetition,isDrawCompetition} from '../public/competitions.js';
test('explicit approved league and tournament list is shared by scorers and match analysis',()=>{
 for(const [country,name,type] of [['Germany','Bundesliga','League'],['Germany','2. Bundesliga','League'],['Germany','DFB Pokal','Cup'],['World','UEFA Champions League','Cup'],['World','UEFA Europa League','Cup'],['Japan','J2 League','League'],['USA','Major League Soccer','League']])for(const accepts of [isScorerCompetition,isDrawCompetition])assert.equal(accepts({country,name,type}),true,country+': '+name);
});
test('similar names never admit unlisted countries, competitions, youth or women leagues',()=>{
 for(const [country,name] of [['Brazil','Serie A'],['England','Championship'],['France','Ligue 2'],['Germany','Frauen Bundesliga'],['England','Premier League 2'],['Croatia','First NL'],['Unknown','Premier League']])assert.equal(isScorerCompetition({country,name}),false,country+': '+name);
 assert.equal(isScorerCompetition({country:'Germany',name:'Bundesliga',type:'Cup'}),false);
});
