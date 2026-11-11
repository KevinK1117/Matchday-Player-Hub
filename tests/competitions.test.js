import test from 'node:test';import assert from 'node:assert/strict';import {isScorerCompetition,isDrawCompetition,isDrawFixture} from '../public/competitions.js';
test('scorers retain the approved lower leagues and senior cups',()=>{
 for(const [country,name,type] of [['Germany','Bundesliga','League'],['Germany','2. Bundesliga','League'],['Germany','DFB Pokal','Cup'],['World','UEFA Champions League','Cup'],['World','UEFA Europa League','Cup'],['Japan','J2 League','League'],['USA','Major League Soccer','League']])assert.equal(isScorerCompetition({country,name,type}),true,country+': '+name);
});
test('similar names never admit unlisted countries, competitions, youth or women leagues',()=>{
 for(const [country,name] of [['Brazil','Serie A'],['England','Championship'],['France','Ligue 2'],['Germany','Frauen Bundesliga'],['England','Premier League 2'],['Croatia','First NL'],['Unknown','Premier League']])assert.equal(isScorerCompetition({country,name}),false,country+': '+name);
 assert.equal(isScorerCompetition({country:'Germany',name:'Bundesliga',type:'Cup'}),false);
});

test('draws admit senior first divisions and exclude youth teams even in matching leagues',()=>{
 const league={country:'England',name:'Premier League',type:'League'};
 assert.equal(isDrawCompetition(league),true);
 for(const name of ['2. Bundesliga','3. Liga'])assert.equal(isDrawCompetition({country:'Germany',name,type:'League'}),true);
 for(const l of [{...league,name:'Premier League 2'},{...league,type:'Cup'}, {country:'Germany',name:'Regionalliga',type:'League'}, {country:'Japan',name:'J2 League',type:'League'}])assert.equal(isDrawCompetition(l),false);
 for(const name of ['Sunderland U21','India U17','Team Under-19','Club Academy'])assert.equal(isDrawFixture({league,teams:{home:{name},away:{name:'Senior Club'}}}),false);
 assert.equal(isDrawFixture({league,teams:{home:{name:'Sunderland'},away:{name:'Arsenal'}}}),true);
});
