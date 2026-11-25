// Shared geometric rules. Height changes range, not horizontal movement cost.
export const horizontal=(a,b)=>Math.max(Math.abs(a.x-b.x),Math.abs(a.y-b.y));
export const altitude=u=>Math.max(0,u.height||0);
export const combatDistance=(a,b)=>horizontal(a,b)+Math.abs(altitude(a)-altitude(b));
export const traitCount=(u,id)=>(u.card?.traits?.[id]||0)+(u.temporaryTraits?.[id]||0);
export function bodyRadius(g,u){const alone=traitCount(u,'army')&&!g.units.some(v=>v.alive&&v.id!==u.id&&v.owner===u.owner&&g.battle?.participants.includes(v.id)&&!g.battle.escaped.includes(v.id));return 1+(alone?1:0)+(u.bodyBonus||0);}
export const inBody=(g,u,target)=>combatDistance(u,target)<=bodyRadius(g,u);
export function flightLimit(g,u){if(!traitCount(u,'flight')&&!u.flightGift)return 0;const grounded=g.units.some(v=>v.alive&&v.owner!==u.owner&&(traitCount(v,'antiAir')||v.noFlight)&&g.battle?.participants.includes(v.id)&&!g.battle.escaped.includes(v.id));return grounded?0:Math.min(traitCount(u,'antiAir')?3:10,traitCount(u,'flight')+(u.flightGift||0));}
export function engagedBy(g,u){if(altitude(u)>0)return [];return g.units.filter(v=>v.alive&&v.owner!==u.owner&&g.battle?.participants.includes(v.id)&&!g.battle.escaped.includes(v.id)&&inBody(g,v,u));}
export const withdrawalCost=(g,u)=>engagedBy(g,u).some(v=>traitCount(v,'blockade')||traitCount(v,'antiAir')&&!g.units.some(e=>e.alive&&e.owner!==v.owner&&(traitCount(e,'flight')||e.flightGift)&&g.battle?.participants.includes(e.id)))?2:1;
