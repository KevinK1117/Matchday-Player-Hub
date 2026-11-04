import football from '../api/matchcenter.js';
import nhl from '../api/nhlcenter.js';

// Reuse the server handlers directly instead of an HTTP request through the
// CDN's stale-while-revalidate layer. Provider cache and validation still apply.
export async function pushFixtures(sport,date,handlers={football,nhl}){
 let status=200,data;
 const res={setHeader(){},status(code){status=code;return this},json(value){data=value;return this},end(){return this}};
 await handlers[sport]({query:{action:'fixtures',date}},res);
 if(status!==200||!Array.isArray(data?.data))throw Error('Spielplan derzeit nicht verfügbar');
 return data.data;
}
