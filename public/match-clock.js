export function nhlClock(g){
 const remaining=typeof g.clock?.timeRemaining==='string'&&/^\d{1,2}:\d{2}$/.test(g.clock.timeRemaining)?g.clock.timeRemaining:null;
 const period=Number(g.periodDescriptor?.number??g.period);
 return {remaining,period:Number.isInteger(period)&&period>0?period:null,periodType:g.periodDescriptor?.periodType||null,intermission:g.clock?.inIntermission===true,running:g.clock?.running===true};
}
export function matchClockLabel(g,compact=false){
 const status=g?.fixture?.status||{},s=status.short;
 if(['FT','AET','PEN','FINAL','OFF'].includes(s))return 'Beendet';
 const c=status.clock;
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
