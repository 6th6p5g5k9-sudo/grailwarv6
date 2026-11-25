import {activeCombatEffects} from './combat-mechanics.js';
import {SIZE,terrain} from './data.js';
import {combatDistance,inBody} from './tactics.js';

// Shared by execution and the board preview. Preserve the distinct targeting
// rules for prepared Noble Phantasms and ordinary attacks.
export function lineCells(a,b){const dx=b.x-a.x,dy=b.y-a.y,n=Math.max(Math.abs(dx),Math.abs(dy)),out=[];for(let i=1;i<=n;i++)out.push({x:Math.round(a.x+dx*i/n),y:Math.round(a.y+dy*i/n)});return out;}
export const sight=(a,b)=>!lineCells(a,b).slice(0,-1).some(p=>terrain(p.x,p.y)==='building');
export const targetingFighters=g=>g.units.filter(v=>v.alive&&g.battle?.participants.includes(v.id)&&!g.battle.escaped.includes(v.id));
export function attackCenter(g,u,k,point={},options={}){
 if(options.sweep||k.shape==='selfArea')return u;
 return targetingFighters(g).find(v=>v.x===point.x&&v.y===point.y)||point;
}
export function attackInRange(g,u,k,center,options={}){
 if(!Number.isInteger(center.x)||!Number.isInteger(center.y)||center.x<0||center.y<0||center.x>=SIZE||center.y>=SIZE)return false;
 if(options.opening)return true;
 if(options.release&&k.shape==='selfArea')return true;
 return !(combatDistance(u,center)>k.range)&&((k.shape==='selfArea'&&!options.release)||sight(u,center));
}
export function attackFootprint(g,u,k,center,options={}){
 if(options.sweep)return p=>inBody(g,u,p);
 if(['area','selfArea'].includes(k.shape))return p=>combatDistance(p,center)<=(options.release?(k.radius||1):k.radius)&&(options.release||sight(center,p));
 if(k.shape==='line'){const cells=new Set(lineCells(u,center).map(p=>`${p.x},${p.y}`));return p=>cells.has(`${p.x},${p.y}`)&&sight(u,p);}
 return p=>p.x===center.x&&p.y===center.y;
}
export function attackSelection(g,u,k,point={},options={}){
 const center=attackCenter(g,u,k,point,options),inRange=attackInRange(g,u,k,center,options),contains=attackFootprint(g,u,k,center,options);
 const targets=targetingFighters(g).filter(v=>(options.release?v.owner!==u.owner:v.id!==u.id&&(v.owner||v.id)!==(u.owner||u.id))&&!activeCombatEffects(g,v,'guards').some(e=>e.kind==='untargetable')&&contains(v));
 return {center,inRange,contains,targets,valid:inRange&&targets.length>0,reason:!inRange?'目标超出射程或被建筑遮挡。':!targets.length?'范围内没有参战敌人。':''};
}
