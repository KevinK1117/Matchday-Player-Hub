// Apply at creation AND delivery so older queued lineup/phase/tip messages
// cannot escape the new policy after a deployment.
export function allowedPushEvent(signal){
 if(!signal?.audience||!signal.watch)return false;
 if(signal.eventType!=null)return ['goal','finished'].includes(signal.eventType);
 return /^(football|nhl):\d+:(goal:|score:|finished$)/.test(String(signal.id||''));
}
