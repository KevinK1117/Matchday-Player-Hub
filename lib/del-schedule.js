import {createHash} from 'node:crypto';

const base='https://www.penny-del.org';
const months=['januar','februar','maerz','april','mai','juni','juli','august','september','oktober','november','dezember'];
const berlinOffset=new Intl.DateTimeFormat('en',{timeZone:'Europe/Berlin',timeZoneName:'longOffset'});
const cache=new Map(), pending=new Map();
const text=html=>html.replace(/<[^>]*>/g,' ').replace(/&(amp|nbsp|quot|auml|ouml|uuml|Auml|Ouml|Uuml|szlig);|&#(\d+);/g,(_,name,num)=>{
 if(num)return Number(num)<=0x10ffff?String.fromCodePoint(Number(num)):'';
 return {amp:'&',nbsp:' ',quot:'"',auml:'ä',ouml:'ö',uuml:'ü',Auml:'Ä',Ouml:'Ö',Uuml:'Ü',szlig:'ß'}[name];
}).replace(/\s+/g,' ').trim();

export function parseDelSchedule(html,month){
 const table=html.match(/<table\b[^>]*class="[^"]*\bteam-schedule--full\b[^"]*"[^>]*>([\s\S]*?)<\/table>/i)?.[1];
 if(!table||!/<th\b[^>]*>\s*Spieltag\s*<\/th>/i.test(table)&&!table.includes('team-schedule__date'))throw Error('Offizieller DEL-Spielplan nicht lesbar');
 const rows=[];
 for(const item of table.matchAll(/<tr\b[^>]*>([\s\S]*?)<\/tr>/gi)){
  const cells=[...item[1].matchAll(/<td\b[^>]*>([\s\S]*?)<\/td>/gi)].map(m=>m[1]);
  if(cells.length<5)continue;
  const [day,clock,round,home,away]=cells.slice(0,5).map(text);
  const match=day.match(/(\d\d)\.(\d\d)\.(\d{4})$/);
  if(!match||!/^([01]\d|2[0-3]):[0-5]\d$/.test(clock)||!home||!away)continue;
  const date=match[3]+'-'+match[2]+'-'+match[1];
  if(!date.startsWith(month+'-'))continue;
  const local=date+'T'+clock+':00';
  const offset=berlinOffset.formatToParts(new Date(local+'Z')).find(x=>x.type==='timeZoneName')?.value.slice(3);
  if(!offset)continue;
  const result=cells.slice(5).map(text).find(x=>/^\d+\s*:\s*\d+/.test(x))||'';
  const score=result.match(/^(\d+)\s*:\s*(\d+)/);
  const completed=Boolean(score&&item[1].includes('/statistik/spieldetails/'));
  const officialPath=item[1].match(/href="(\/statistik\/spieldetails\/[^"]+)"/i)?.[1];
  const logo=cell=>{
   const src=cell.match(/<img\b[^>]*\bsrc="(\/fileadmin\/[^"]+)"/i)?.[1];
   return src?base+src:null;
  };
  const season=Number(match[3])-(Number(match[2])<7?1:0);
  const hash=createHash('sha256').update([season,round,home,away].join('|')).digest().readUIntBE(0,6);
  rows.push({id:1000000000000+hash,date:local+offset,home,away,homeLogo:logo(cells[3]),awayLogo:logo(cells[4]),
   homeGoals:completed?Number(score[1]):null,awayGoals:completed?Number(score[2]):null,
   status:completed?'FT':Date.parse(local+offset)>Date.now()?'NS':'Status offen',official:true,officialUrl:officialPath?base+officialPath:null});
 }
 if(!rows.length&&!table.includes('Keine Spiele'))throw Error('DEL-Spielplan für diesen Monat nicht verfügbar');
 return [...new Map(rows.map(row=>[row.id,row])).values()].sort((a,b)=>Date.parse(a.date)-Date.parse(b.date));
}

export async function officialDelDay(date){
 const month=date.slice(0,7);
 const cached=cache.get(month);
 let rows=cached?.until>Date.now()?cached.rows:null;
 if(!rows){
  if(!pending.has(month)){
   const work=(async()=>{
    const response=await fetch(base+'/spiele/monat/'+months[Number(month.slice(5))-1],{signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('Offizieller DEL-Spielplan derzeit nicht erreichbar');
    const rows=parseDelSchedule(await response.text(),month);
    cache.set(month,{rows,until:Date.now()+120000});
    if(cache.size>12)cache.delete(cache.keys().next().value);
    return rows;
   })().finally(()=>pending.delete(month));
   pending.set(month,work);
  }
  rows=await pending.get(month);
 }
 return {configured:true,games:rows.filter(row=>row.date.startsWith(date+'T')),
  nextDate:rows.find(row=>row.date.slice(0,10)>date)?.date.slice(0,10)||null,
  source:'PENNY DEL · offizieller Spielplan',updatedAt:new Date().toISOString()};
}
