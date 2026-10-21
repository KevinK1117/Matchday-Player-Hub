// Licensed odds-feed adapter. No bookmaker credentials in the browser.
const allowedSports=new Set(['nhl','football']);
export default async function handler(req,res){
  res.setHeader('Cache-Control','s-maxage=120, stale-while-revalidate=60');
  const date=String(req.query?.date||''),sport=String(req.query?.sport||'');
  if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!allowedSports.has(sport))return res.status(400).json({error:'Ungültiges Datum oder Sport'});
  const endpoint=process.env.ODDS_FEED_URL;
  if(!endpoint)return res.status(200).json({configured:false,source:null,quotes:[],updatedAt:null});
  try{
    const u=new URL(endpoint);
    if(u.protocol!=='https:')throw Error('ODDS_FEED_URL muss HTTPS verwenden');
    u.searchParams.set('date',date);u.searchParams.set('sport',sport);
    const headers={Accept:'application/json'};
    if(process.env.ODDS_FEED_TOKEN)headers.Authorization='Bearer '+process.env.ODDS_FEED_TOKEN;
    const response=await fetch(u,{headers,signal:AbortSignal.timeout(9000)});
    if(!response.ok)throw Error('Quotenanbieter HTTP '+response.status);
    const data=await response.json();
    const quotes=(Array.isArray(data.quotes)?data.quotes:[]).filter(q=>
      q&&String(q.bookmaker).toLowerCase()==='bet365'&&q.market==='anytime_goalscorer'&&
      Number.isInteger(Number(q.fixtureId))&&Number.isInteger(Number(q.playerId))&&
      Number.isFinite(Number(q.decimal))&&Number(q.decimal)>1
    ).map(q=>({fixtureId:Number(q.fixtureId),playerId:Number(q.playerId),bookmaker:'bet365',market:'anytime_goalscorer',decimal:Number(q.decimal)}));
    return res.status(200).json({configured:true,source:data.source||'Lizenzierter Quotenfeed',updatedAt:data.updatedAt||null,quotes});
  }catch(e){return res.status(502).json({error:'Quotenfeed nicht erreichbar oder nicht kompatibel',detail:String(e.message)})}
}