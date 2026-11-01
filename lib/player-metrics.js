const cache=new Map();
export function summarizeLastFive(rows){
 const last=Array.isArray(rows)?rows.slice(0,5):[];
 const known=last.filter(r=>r.available!==false&&Number.isInteger(r.goals)&&r.goals>=0);
 return {goals:last.length===5&&known.length===5?known.reduce((s,r)=>s+r.goals,0):null,knownGoals:known.reduce((s,r)=>s+r.goals,0),available:known.length,total:last.length,complete:last.length===5&&known.length===5};
}
export function selectSeasonXg(rows,{id,sport,season}){
 const matches=(rows||[]).filter(r=>String(r.playerId)===String(id)&&r.sport===sport&&String(r.season)===String(season)&&r.scope==='season');
 if(matches.length!==1)return null;const r=matches[0];
 const number=v=>v!==null&&v!==''&&Number.isFinite(Number(v))&&Number(v)>=0?Number(v):null;
 const xG=number(r.xG);if(xG===null)return null;
 return {xG,xG90:number(r.xG90),season:String(season),scope:'season',source:String(r.source||'Externer xG-Feed').slice(0,100)};
}
export async function getPlayerXg(id,sport,season){
 if(!process.env.XG_FEED_URL)return null;
 const key=[id,sport,season].join(':');if(cache.get(key)?.until>Date.now())return cache.get(key).data;
 try{const u=new URL(process.env.XG_FEED_URL);if(u.protocol!=='https:')return null;u.searchParams.set('playerId',id);u.searchParams.set('sport',sport);u.searchParams.set('season',season);u.searchParams.set('scope','season');
 const r=await fetch(u,{headers:process.env.XG_FEED_TOKEN?{Authorization:'Bearer '+process.env.XG_FEED_TOKEN}:{},signal:AbortSignal.timeout(6000)});if(!r.ok)return null;
 const data=selectSeasonXg((await r.json()).players,{id,sport,season});cache.set(key,{until:Date.now()+300000,data});if(cache.size>200)cache.delete(cache.keys().next().value);return data;
 }catch{return null}
}
