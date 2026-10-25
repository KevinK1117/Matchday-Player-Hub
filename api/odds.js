// Bookmaker odds are deliberately disabled in Matchday Player Hub.
// Keep this endpoint as a non-functional compatibility stub for old clients.
export default function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 return res.status(410).json({error:'Buchmacherquoten wurden dauerhaft aus dieser App entfernt.'});
}
