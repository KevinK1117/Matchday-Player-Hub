import {installationIdentity,verifySubscription} from '../lib/native-subscription.js';
export default async function handler(req,res){
 res.setHeader('Cache-Control','no-store');
 if(req.method!=='POST')return res.status(405).end();
 try{const appUserId=installationIdentity(req.headers['x-matchday-install']);const status=await verifySubscription(appUserId);return res.status(200).json(status)}
 catch(e){return res.status(e.statusCode||503).json({error:e.message})}
}
