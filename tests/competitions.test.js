import test from 'node:test';import assert from 'node:assert/strict';import {isTopFlight} from '../public/competitions.js';
test('top divisions across all world regions are included by country and exact name',()=>{
 for(const [country,name] of [['Germany','Bundesliga'],['England','Premier League'],['Brazil','Serie A'],['Argentina','Liga Profesional Argentina'],['USA','Major League Soccer'],['Japan','J1 League'],['South-Korea','K League 1'],['Saudi-Arabia','Pro League'],['South-Africa','Premier Soccer League'],['Egypt','Premier League'],['Australia','A-League'],['New-Zealand','National League'],['Northern-Ireland','Premiership']])assert.equal(isTopFlight({country,name,type:'League'}),true,country+': '+name);
});
test('lower tiers, cups, international competitions, women/youth and unknown leagues are excluded',()=>{
 for(const [country,name] of [['Germany','2. Bundesliga'],['England','Championship'],['France','Ligue 2'],['Germany','DFB Pokal'],['World','UEFA Champions League'],['World','UEFA Europa League'],['Brazil','Serie B'],['Germany','Frauen Bundesliga'],['England','Premier League 2'],['Japan','J2 League'],['Croatia','First NL'],['Unknown','Premier League']])assert.equal(isTopFlight({country,name}),false,country+': '+name);
 assert.equal(isTopFlight({country:'Germany',name:'Bundesliga',type:'Cup'}),false);
});
