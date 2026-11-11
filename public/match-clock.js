export function nhlClock(g){
 const remaining=typeof g.clock?.timeRemaining==='string'&&/^\d{1,2}:\d{2}$/.test(g.clock.timeRemaining)?g.clock.timeRemaining:null;
 const period=Number(g.periodDescriptor?.number??g.period);
 return {observedAt:Date.now(),remaining,period:Number.isInteger(period)&&period>0?period:null,periodType:g.periodDescriptor?.periodType||null,intermission:g.clock?.inIntermission===true,running:g.clock?.running===true};
}
export function matchClockLabel(g,compact=false){
 const status=g?.fixture?.status||{},s=status.short;
 if(['FT','AET','PEN','FINAL','OFF'].includes(s))return 'Beendet';
 const c=projectClock(status.clock);
 if(g?.sport==='nhl'||g?.league?.id===10000){
  if(['NS','FUT','PRE'].includes(s))return '';
  if(!c?.period)return 'Spielzeit nicht verfügbar';
  const period=c.periodType==='SO'?'Shootout':c.periodType==='OT'?(compact?'OT':'Verlängerung'):c.period+(compact?'. D':'. Drittel');
  if(c.intermission)return period+' · Pause';
  return period+(c.remaining?' · '+c.remaining+(compact?'':' übrig'):'');
 }
 if(s==='HT')return 'Halbzeit';if(s==='BT')return 'Pause';
 if(status.elapsed!=null&&Number.isFinite(Number(status.elapsed))){const extra=Number(status.extra);return status.elapsed+(extra>0?'+'+extra:'')+'′'}
 return 'Spielminute nicht verfügbar';
}

export function projectClock(clock,now=Date.now()){
 if(!clock?.running||clock.intermission||!clock.remaining||!Number.isFinite(clock.observedAt))return clock;
 const delta=Math.max(0,Math.floor((now-clock.observedAt)/1000));
 // Do not extrapolate past the next expected server synchronization indefinitely.
 const elapsed=Math.min(delta,45),parts=clock.remaining.split(':').map(Number),remaining=Math.max(0,parts[0]*60+parts[1]-elapsed);
 return {...clock,remaining:String(Math.floor(remaining/60)).padStart(2,'0')+':'+String(remaining%60).padStart(2,'0')};
}

// NHL live status and period are separate fields in the normalized fixture.
export function isNhlThirdPeriod(status, now=Date.now()) {
 if(!['LIVE','CRIT','IN'].includes(status?.short))return false;
 const clock=projectClock(status.clock,now);
 return clock?.period===3 && (!clock.periodType||clock.periodType==='REG') &&
  !clock.intermission && /^\d{1,2}:\d{2}$/.test(clock.remaining||'') &&
  clock.remaining.split(':').some(part=>Number(part)>0);
}
