export function fairProbabilities(prices){
 if(!Array.isArray(prices)||prices.length<2||prices.some(x=>x==null||!Number.isFinite(Number(x))||Number(x)<=1))return null;
 const implied=prices.map(x=>1/Number(x)),sum=implied.reduce((a,b)=>a+b,0);
 if(sum<.98||sum>1.4)return null;
 return implied.map(x=>x/sum);
}
export function freshTimestamp(value,now=Date.now(),maxAge=900000){const t=Date.parse(value);return Number.isFinite(t)&&t<=now+5000&&now-t<=maxAge;}
export function matchConsensus(rows,fixtureId,now=Date.now()){
 const books=new Map();
 for(const row of rows||[]){if(Number(row.fixture?.id)!==Number(fixtureId)||!freshTimestamp(row.update,now))continue;
 for(const book of row.bookmakers||[]){if(!book.id)continue;const bet=book.bets?.find(b=>Number(b.id)===1&&b.name==='Match Winner');if(!bet)continue;
 const prices=['Home','Draw','Away'].map(name=>bet.values?.find(v=>v.value===name)?.odd),p=fairProbabilities(prices);if(!p)continue;books.set(book.id,{id:book.id,name:book.name,prices:prices.map(Number),p,updatedAt:row.update});}}
 if(books.size<3)return {available:false,bookmakers:books.size,reason:'Mindestens drei aktuelle vollständige 1X2-Märkte erforderlich'};
 const values=[...books.values()],means=[0,1,2].map(i=>values.reduce((n,b)=>n+b.p[i],0)/values.length);
 return {available:true,bookmakers:values.length,probabilities:{home:means[0],draw:means[1],away:means[2]},bestOdds:{home:Math.max(...values.map(b=>b.prices[0])),draw:Math.max(...values.map(b=>b.prices[1])),away:Math.max(...values.map(b=>b.prices[2]))},sources:values.map(b=>({id:b.id,name:b.name,updatedAt:b.updatedAt})),method:'Gleichgewichteter Mittelwert nach proportionaler Margenbereinigung',updatedAt:new Date(now).toISOString()};
}
export function validLiveOffer(x,now=Date.now()){
 return x?.analysis?.quality>=2&&x.analysis.pressure===true&&x.oddsAvailable===true&&freshTimestamp(x.oddsUpdatedAt,now,30000)&&freshTimestamp(x.fixtureFetchedAt,now,30000)&&Number.isFinite(Number(x.g?.fixture?.status?.elapsed))&&Number(x.g.fixture.status.elapsed)>0&&x.g?.goals?.home!=null&&x.g?.goals?.away!=null&&x.liveOdd?.probability>0&&x.liveOdd.probability<1;
}
