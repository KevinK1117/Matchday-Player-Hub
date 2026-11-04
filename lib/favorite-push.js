import {confirmedLineupTeams,lineupSignals} from './lineup-notifications.js';
import {eventMessage} from './push-message.js';
import {watches,footballEvents,nhlEvents,snapshot,transitions} from './push-events.js';
async function json(url,headers={}){const r=await fetch(url,{headers,signal:AbortSignal.timeout(8000)});if(!r.ok)throw Error('Ereignisquelle HTTP '+r.status);const d=await r.json();if(d.errors&&Object.keys(d.errors).length)throw Error('Ereignisquelle meldet Fehler');return d}
export async function favoriteSignals({sport,games,subscribers,redis,budgetUntil}){
 const signals=[],errors=[];let next=0;
 const selected=games.filter(g=>subscribers.some(s=>watches(s.preferences,sport,g))&&!['CANC','PST','ABD','AWD','WO'].includes(g.fixture?.status?.short));
 await Promise.all(Array.from({length:Math.min(2,selected.length)},async()=>{while(next<selected.length&&Date.now()<budgetUntil){let g={...selected[next++]};const id=g.fixture.id,key='matchday:event-state:'+sport+':'+id;try{
 const raw=await redis('GET',key),prev=raw?JSON.parse(raw):null;
 // Once a match is finished and its last snapshot is finished, no further provider calls.
 if(prev?.status==='FT'&&g.fixture.status.short==='FT')continue;
 let events=[];const status=g.fixture.status.short;
 if(!['NS','TBD','FUT','PRE'].includes(status)){
 if(sport==='football'){const data=await json('https://v3.football.api-sports.io/fixtures/events?fixture='+encodeURIComponent(id),{'x-apisports-key':process.env.API_SPORTS_KEY});events=footballEvents(g,data.response||[])}
 if(sport==='nhl'){const payload=await json('https://api-web.nhle.com/v1/gamecenter/'+encodeURIComponent(id)+'/play-by-play');events=nhlEvents(g,payload);if(Number.isInteger(payload.homeTeam?.score)&&Number.isInteger(payload.awayTeam?.score))g.goals={home:payload.homeTeam.score,away:payload.awayTeam.score};}
 }
 let lineupTeams=[],lineupEvents=[];
 const nearKickoff=Date.parse(g.fixture.date)-Date.now()<=120*60000;
 const lineupsKnown=[g.teams.home,g.teams.away].every(t=>(prev?.lineups||[]).includes(String(t.id)));
 if(nearKickoff&&!lineupsKnown&&!['FT','AET','PEN'].includes(status))try{
 const payload=sport==='football'?await json('https://v3.football.api-sports.io/fixtures/lineups?fixture='+encodeURIComponent(id),{'x-apisports-key':process.env.API_SPORTS_KEY}):await json('https://api-web.nhle.com/v1/gamecenter/'+encodeURIComponent(id)+'/boxscore');
 lineupTeams=confirmedLineupTeams(g,sport,payload);lineupEvents=lineupSignals(lineupTeams,prev?.lineups||[],sport);
 }catch{errors.push(sport+':'+id+': Aufstellung vorübergehend nicht verfügbar')}
 const audience=subscribers.filter(s=>watches(s.preferences,sport,g)).map(s=>s.key);
 for(const event of [...transitions(prev,g,sport,events),...lineupEvents]){const signal={id:sport+':'+id+':'+event.id,audience,watch:{sport,game:{fixture:{id},teams:g.teams}},...eventMessage(g,sport,event),url:'https://matchday-player-hub.vercel.app/?sport='+sport+'&match='+id+'&date='+new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Berlin'}).format(new Date(g.fixture.date))};await redis('SET','matchday:push:event:'+signal.id,JSON.stringify({...signal,createdAt:Date.now()}),'EX',3600);await redis('SADD','matchday:push:outbox',signal.id);signals.push(signal);}
 await redis('SET',key,JSON.stringify({...snapshot(g,sport,events),lineups:[...new Set([...(prev?.lineups||[]),...lineupTeams.map(t=>t.id)])]}),'EX',259200);
 }catch{errors.push(sport+':'+id+': Ereignisse vorübergehend nicht verfügbar')}}}));return {signals,errors};
}
