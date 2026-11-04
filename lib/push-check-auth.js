import {timingSafeEqual} from 'node:crypto';
const matches=(header,secret)=>{
 if(typeof header!=='string'||typeof secret!=='string'||!secret)return false;
 const expected=Buffer.from('Bearer '+secret),actual=Buffer.from(header);
 return expected.length===actual.length&&timingSafeEqual(expected,actual);
};
export function pushCheckAccess(req,env=process.env){
 if(matches(req.headers?.authorization,env.CRON_SECRET))return 'admin';
 if(matches(req.headers?.authorization,env.PUSH_SCHEDULER_SECRET))return req.query?.test==='1'?null:'scheduler';
 return null;
}
