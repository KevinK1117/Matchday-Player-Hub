import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import vm from 'node:vm';
import {analysisFailure} from '../api/draws.js';
test('provider failures distinguish access restrictions from retryable outages without exposing raw responses',()=>{
 for(const raw of ['API_PAUSED','API-Sports HTTP 429']){const v=analysisFailure(Error(raw));assert.equal(v.status,503);assert.equal(v.retryAfter,90)}
 for(const raw of ['API-Sports HTTP 403','subscription unavailable']){const v=analysisFailure(Error(raw));assert.equal(v.code,'PROVIDER_ACCESS');assert.equal(v.retryAfter,undefined)}
 assert.equal(analysisFailure(Error('fetch failed')).retryAfter,15);
 assert.equal(JSON.stringify(analysisFailure(Error('secret provider response'))).includes('secret'),false);
});
test('initial transient failure retries the same batch and finishes without a false zero-game report',async()=>{
 const html=readFileSync(new URL('../index.html',import.meta.url),'utf8');
 const start=html.indexOf("$('drawGenerate').onclick=async()=>{");
 const code=html.slice(start,html.indexOf('function leagueSeason',start));
 const elements={drawGenerate:{},drawResult:{innerHTML:'',insertAdjacentHTML(_,s){this.innerHTML=s+this.innerHTML}},date:{value:'2099-11-07'},drawCount:{value:'all'}};
 let calls=0;const urls=[];
 const context=vm.createContext({$:id=>elements[id],drawToken:0,demoMode:false,Map,Date,Number,Infinity,URLSearchParams,esc:s=>s,setTimeout:fn=>fn(),drawPickCard:()=>'',fetch:async url=>{urls.push(url);calls++;return calls===1?{ok:false,json:async()=>({error:'Temporary',retryAfter:15})}:{ok:true,json:async()=>({totalFixtures:2,considered:2,scanComplete:true,diagnostics:{},verifiedCandidates:[],provisionalCandidates:[]})}}});
 vm.runInContext(code,context);await elements.drawGenerate.onclick();assert.equal(calls,2);assert.equal(urls[0],urls[1]);assert.match(elements.drawResult.innerHTML,/2 \/ 2 Spiele geprüft/);assert.match(elements.drawResult.innerHTML,/Analyse beendet/);assert.equal(elements.drawGenerate.disabled,false);
});
