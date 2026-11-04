const text=value=>String(value??'').replace(/\s+/g,' ').trim();
const icon=sport=>sport==='football'?'⚽':'🏒';
const match=g=>`${text(g.teams?.home?.name)} – ${text(g.teams?.away?.name)}`;
const validScore=s=>s&&Number.isInteger(s.home)&&s.home>=0&&Number.isInteger(s.away)&&s.away>=0;
const score=(s,side)=>`${side==='home'?'[':''}${s?.home??'–'}${side==='home'?']':''} – ${side==='away'?'[':''}${s?.away??'–'}${side==='away'?']':''}`;
function time(value){return text(value).replace(/^(\d+)\. Drittel · (\d\d:\d\d)$/,'$2 ($1. D.)')}
function shortName(value){const name=text(value),parts=name.split(' ');return parts.length>1?parts[0][0]+'. '+parts.slice(1).join(' '):name}

export function eventMessage(game,sport,event){
 const title=match(game),parts=text(event.label).split(' · '),timing=time(event.time);
 if(event.type==='lineup')return {title,body:`✓ ${sport==='football'?'Startelf bestätigt':'Spielkader bestätigt'} · ${parts.slice(1).join(' · ')}${sport==='nhl'?' · Reihen offen':''}`};
 if(event.type==='goal'){
  const side=['home','away'].find(s=>event.teamId!=null&&String(game.teams?.[s]?.id)===String(event.teamId));
  // Only the event's own score may be presented as the result of this goal.
  const result=validScore(event.score)?score(event.score,side):'Aktuell '+score(game.goals);
  return {title,body:icon(sport)+' '+[timing,'Tor! '+result,event.scorer?shortName(event.scorer):'Torschütze offen'].filter(Boolean).join(' · ')};
 }
 const label=event.type==='finished'?'Endstand '+score(game.goals):text(event.label)||'Spielereignis';
 return {title,body:icon(sport)+' '+[label,event.type==='finished'?'':'Stand '+score(game.goals)].filter(Boolean).join(' · ')};
}

export function liveTipMessage(game,sport,label){
 const parts=text(label).split(' · ');
 return {title:match(game),body:icon(sport)+' '+['Live-Tipp',parts[1],parts.slice(2).join(' · '),'Stand '+score(game.goals)].filter(Boolean).join(' · ')};
}
