const clean=v=>String(v||'').slice(0,100);
const norm=v=>clean(v).normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]/g,'');
export function preferences(input={}){
 const games=(Array.isArray(input.games)?input.games:[]).filter(g=>['football','nhl','del'].includes(g.sport)&&/^\d{1,12}$/.test(String(g.id))).slice(0,150).map(g=>({sport:g.sport,id:String(g.id)}));
 const players=(Array.isArray(input.players)?input.players:[]).filter(p=>['football','nhl','del'].includes(p.sport)&&/^\d{1,12}$/.test(String(p.id))).slice(0,100).map(p=>({sport:p.sport,id:String(p.id),teamId:/^\d{1,12}$/.test(String(p.teamId||''))?String(p.teamId):null,team:clean(p.team)}));
 return {games,players,favoriteEvents:input.favoriteEvents!==false,liveTips:input.liveTips!==false};
}
export function watches(p,sport,g){if(!p?.favoriteEvents)return false;if(p.games?.some(x=>x.sport===sport&&String(x.id)===String(g.fixture.id)))return true;return p.players?.some(x=>x.sport===sport&&[g.teams.home,g.teams.away].some(t=>(x.teamId&&String(t.id)===String(x.teamId))||(norm(x.team)&&[t.name,t.abbrev].some(n=>norm(n)===norm(x.team)))))}
export function footballEvents(g,rows){return rows.filter(e=>e.type==='Goal'&&!/missed|cancelled|disallowed/i.test(e.detail||'')).map((e,i)=>({id:['goal',e.time?.elapsed,e.time?.extra||0,e.team?.id,e.player?.id||e.player?.name].join(':'),type:'goal',label:'Tor'+(e.player?.name?' · '+e.player.name:'')+' · '+(e.time?.elapsed??'?')+"′",playerId:e.player?.id}));}
export function nhlEvents(g,pbp){
 const names=new Map((pbp.rosterSpots||[]).map(p=>[String(p.playerId),[p.firstName?.default,p.lastName?.default].filter(Boolean).join(' ')]));const out=[];let pp=null;
 for(const e of pbp.plays||[]){const id=String(e.eventId),type=e.typeDescKey,period=e.periodDescriptor?.number||'?';
 if(type==='goal'){const scorer=e.details?.scoringPlayerId;out.push({id:'goal:'+id,type:'goal',label:'Tor'+(names.get(String(scorer))?' · '+names.get(String(scorer)):scorer?' · Spieler '+scorer:'')+' · '+period+'. Drittel · '+(e.timeInPeriod||''),playerId:scorer})}
 if(type==='period-start')out.push({id:'period-start:'+period,type:'period',label:period+'. Drittel beginnt'});
 if(type==='period-end')out.push({id:'period-end:'+period,type:'period',label:period+'. Drittel beendet'});
 if(type==='game-end')out.push({id:'finished',type:'finished',label:'Abpfiff · Spiel beendet'});
 // Only unequal skater counts with both goalies present imply a powerplay.
 const c=String(e.situationCode||'');if(/^[01][3-6][3-6][01]$/.test(c)&&c[0]==='1'&&c[3]==='1'){
 const next=c[1]===c[2]?'even':Number(c[1])>Number(c[2])?'away':'home';
 if(next!==pp){if(next!=='even')out.push({id:'powerplay:'+id,type:'powerplay',label:'Powerplay · '+(next==='home'?g.teams.home.name:g.teams.away.name)});else if(pp&&pp!=='even')out.push({id:'powerplay-end:'+id,type:'powerplay',label:'Powerplay beendet'});pp=next;}
 }
 }
 return out;
}
export function snapshot(g,sport,events=[]){return {status:String(g.fixture.status.short||''),score:g.goals,events:events.map(e=>e.id),at:Date.now(),sport};}
export function transitions(previous,g,sport,events=[]){
 if(!previous)return [];const out=events.filter(e=>!previous.events.includes(e.id)),status=String(g.fixture.status.short||''),old=previous.status;
 if(sport==='football'){
 if(['NS','TBD'].includes(old)&&['1H','2H','HT','LIVE'].includes(status))out.push({id:'kickoff',type:'kickoff',label:'Anpfiff'});
 if(status==='HT'&&old!=='HT')out.push({id:'halftime',type:'halftime',label:'Halbzeit'});
 // Catch a halftime crossed between polls without inventing a halftime score.
 if(old==='1H'&&status==='2H')out.push({id:'halftime',type:'halftime',label:'Halbzeit beendet · 2. Halbzeit läuft'});
 if(['FT','AET','PEN'].includes(status)&&!['FT','AET','PEN'].includes(old))out.push({id:'finished',type:'finished',label:'Abpfiff · Spiel beendet'});
 }else if(['NS','FUT','PRE'].includes(old)&&['LIVE','1','2','3'].includes(status))out.push({id:'kickoff',type:'kickoff',label:'Spielbeginn'});
 if(sport!=='football'&&status==='FT'&&old!=='FT'&&!out.some(e=>e.id==='finished'))out.push({id:'finished',type:'finished',label:'Abpfiff · Spiel beendet'});
 const before=previous.score,now=g.goals;if(!out.some(e=>e.type==='goal')&&before?.home!=null&&before?.away!=null&&now?.home!=null&&now?.away!=null&&(now.home>before.home||now.away>before.away))out.push({id:'score:'+now.home+':'+now.away,type:'goal',label:'Tor · '+now.home+':'+now.away+' · Torschütze noch nicht gemeldet'});
 return [...new Map(out.map(e=>[e.id,e])).values()];
}
