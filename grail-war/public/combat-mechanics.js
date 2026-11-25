import {enqueueRuleEvent} from './rule-runtime.js';
// Small, shared rule operations. No card-name branches and no random priority.
export const COMPLEX_ATTACK_TAGS=[{id:'unrespondable',name:'不可应对'},{id:'pierce_invincibility',name:'无敌贯通'},{id:'cannot_counter',name:'禁止反击'},{id:'sourceless',name:'无来源（需同时不可应对）'}];
export const combatState=(u)=>u.combatState??={guards:[],floors:[],revivals:[],links:[]};
export const activeCombatEffects=(g,u,key)=>(u.combatState?.[key]||[]).filter(e=>(e.until===undefined||e.until>=g.round)&&(e.charges===undefined||e.charges>0)&&(e.pool===undefined||e.pool>0));
export function expireCombatEffects(g,u){if(!u.combatState)return;for(const key of ['guards','floors','revivals','links'])u.combatState[key]=activeCombatEffects(g,u,key);}
export function recordCombatEvent(g,event){g.combatEvents??=[];g.combatSerial=(g.combatSerial||0)+1;const row={...event,id:g.combatSerial,battleId:g.battle?.id??null,round:g.round};g.combatEvents.push(row);g.combatEvents=g.combatEvents.slice(-160);enqueueRuleEvent(g,row);return row;}
export function grantCombatEffect(g,caster,target,k,e){
 g.combatSerial=(g.combatSerial||0)+1;const state=combatState(target),base={id:`ce:${g.combatSerial}`,name:k.name,owner:caster.id,ownerPlayerId:caster.owner||caster.id,until:g.round+e.duration-1,visibility:e.visibility||'public'};
 if(e.op==='untargetable')state.guards.push({...base,kind:'untargetable'});
 if(e.op==='invincibility')state.guards.push({...base,kind:'invincibility',charges:e.mode==='charges'?e.charges:undefined,immuneToPierce:e.immuneToPierce});
 if(e.op==='special_shield')state.guards.push({...base,kind:'special_shield',pool:e.amount,blocksTrue:e.blocksTrue,immuneToPierce:e.immuneToPierce});
 if(e.op==='hp_floor')state.floors.push({...base,kind:'hp_floor',floor:e.amount});
 if(e.op==='revival')state.revivals.push({...base,kind:'revival',hp:e.amount,charges:e.charges});
 if(e.op==='damage_link')state.links.push({...base,kind:'damage_link',recipientId:caster.id,percent:e.percent,captureStage:e.captureStage,defenseOwner:e.defenseOwner,priority:e.priority});
 return base;
}
export function hasComplexProtection(g,u){return ['guards','floors','links'].some(key=>activeCombatEffects(g,u,key).length>0);}
export function consumeRevival(g,u){const revivals=activeCombatEffects(g,u,'revivals'),effect=revivals.find(e=>e.id===g.lethalContexts?.[u.id]?.revivalId)||revivals[0];if(!effect)return false;effect.charges--;recordCombatEvent(g,{type:'unit_died',unitId:u.id,sourceUnitId:g.lethalContexts?.[u.id]?.sourceUnitId??null});u.hp=Math.max(1,Math.min(u.maxHp,effect.hp));u.alive=true;recordCombatEvent(g,{type:'unit_revived',unitId:u.id,sourceUnitId:effect.owner,hp:u.hp});return true;}
export function chooseDamageLink(g,u){
 const links=activeCombatEffects(g,u,'links').filter(e=>e.recipientId!==u.id&&g.units.some(v=>v.id===e.recipientId&&v.alive&&g.battle?.participants.includes(v.id)&&!g.battle.escaped.includes(v.id)));
 if(links.length<2)return links[0]||null;
 const priorities=links.map(e=>g.priorityTable?.[e.priority]);
 if(priorities.some(p=>!Number.isFinite(p))||new Set(priorities).size!==priorities.length){const error=Error('needs_priority_config：多个伤害链接同时生效，需要配置不同的规则优先级。');error.code='needs_priority_config';throw error;}
 return links[priorities.indexOf(Math.max(...priorities))];
}
export function preflightDamageLinks(g,targets,path=new Set()){
 for(const u of targets){if(path.has(u.id))throw Error('needs_ruling：伤害链接形成循环，不能自动结算。');const link=chooseDamageLink(g,u);if(link){const next=new Set(path);next.add(u.id);preflightDamageLinks(g,[g.units.find(v=>v.id===link.recipientId)],next);}}
}
function mechanicsGuard(g,u,packet){
 const piercing=packet.tags?.includes('pierce_invincibility'),guards=activeCombatEffects(g,u,'guards').filter(e=>e.kind==='invincibility'&&(!piercing||e.immuneToPierce)),guard=guards.find(e=>e.id===packet.protectionId)||guards[0];
 if(!guard)return null;if(guard.charges!==undefined)guard.charges--;return guard;
}
function mechanicsClampHP(g,u,loss,packet){
 const floors=activeCombatEffects(g,u,'floors'),floor=Math.max(0,...floors.map(e=>e.floor)),amount=Math.min(Math.max(0,u.hp-floor),Math.max(0,Math.floor(loss))),actual=Math.min(u.hp,amount);
 const before=u.hp;u.hp-=actual;
 if(loss>actual&&floor>0)recordCombatEvent(g,{type:'hp_floor_prevented',unitId:u.id,cancelled:loss-actual,sourceUnitId:packet.sourceUnitId,attackId:packet.attackId,segmentId:packet.segmentId});
 if(actual>0)recordCombatEvent(g,{type:'hp_changed',unitId:u.id,amount:-actual,from:before,to:u.hp,changeKind:packet.kind,raw_damage:packet.kind==='hp_loss'?0:packet.amount||0,final_damage:packet.kind==='hp_loss'?0:loss,hp_loss:actual,sourceUnitId:packet.sourceUnitId,ownerPlayerId:packet.ownerPlayerId,attackId:packet.attackId,segmentId:packet.segmentId});
 return actual;
}
// Resolve one segment (damage plus attached HP loss). A single charge of
// invincibility protects the whole segment, and is never consumed when pierced.
export function resolveCombatPacket(g,u,packet,options={}){
 const visited=options.visited||new Set();if(visited.has(u.id)||visited.size>14)throw Error('needs_ruling：伤害转移循环。');const nextVisited=new Set(visited);nextVisited.add(u.id);
 const source=packet.sourceUnitId===null?null:packet.sourceUnitId;
 const context={...packet,sourceUnitId:source};const kind=packet.kind||'damage',piercing=packet.tags?.includes('pierce_invincibility'),isTrue=packet.damageType==='true';
 const result={unitId:u.id,damage:0,hpLoss:0,absorbed:0,prevented:0,base:0,scaled:0,killed:false,transfers:[]};
 const link=options.noLink?null:chooseDamageLink(g,u);let raw=Math.max(0,packet.amount||0),hpLoss=Math.max(0,packet.hpLoss||0),linkAmount=0;
 if(kind==='hp_loss'){hpLoss+=raw;raw=0;}
 if(link&&kind==='damage'&&link.captureStage==='before_defense'){linkAmount=Math.floor(raw*link.percent/100);raw-=linkAmount;}
 const canHit=raw>0&&(packet.successes??2)>0||hpLoss>0,independentImmune=packet.immune&&!piercing;const guard=canHit&&(!independentImmune||hpLoss>0||packet.protectionId)&&!(options.defensesAlreadyApplied&&kind==='damage')?mechanicsGuard(g,u,{...context,amount:raw,hpLoss}):null;
 const hits=(packet.successes??2)/2,immune=packet.immune&&!piercing;
 let damage=0;
 if(guard||immune){result.prevented=raw+(guard?hpLoss:0);raw=0;if(guard)hpLoss=0;recordCombatEvent(g,{type:'hp_protection',unitId:u.id,protectionId:guard?.id,sourceUnitId:source,attackId:packet.attackId,segmentId:packet.segmentId});}
 else{
  const reduction=options.defensesAlreadyApplied||isTrue||piercing?0:Math.max(0,packet.reduction||0);
  result.base=Math.max(0,raw-reduction);damage=Math.floor(result.base*hits);result.scaled=damage;
  if(!options.defensesAlreadyApplied){
   for(const shield of activeCombatEffects(g,u,'guards').filter(e=>e.kind==='special_shield')){
    if(piercing&&!shield.immuneToPierce||isTrue&&!shield.blocksTrue)continue;
    const absorb=Math.min(shield.pool,damage);shield.pool-=absorb;damage-=absorb;result.absorbed+=absorb;
   }
   if(!piercing&&!isTrue){const absorb=Math.min(u.shield||0,damage);u.shield=(u.shield||0)-absorb;damage-=absorb;result.absorbed+=absorb;}
  }
 }
 if(link&&kind==='damage'&&link.captureStage==='after_defense'){linkAmount=Math.floor(damage*link.percent/100);damage-=linkAmount;}
 if(linkAmount>0){
  const recipient=g.units.find(v=>v.id===link.recipientId),after=link.captureStage==='after_defense',transferred=resolveCombatPacket(g,recipient,{...context,amount:linkAmount,hpLoss:0,successes:after?2:packet.successes,reduction:options.reductionFor?.(recipient)||0,immune:false},{...options,visited:nextVisited,defensesAlreadyApplied:after&&link.defenseOwner==='original'});
  result.transfers.push(transferred);recordCombatEvent(g,{type:'damage_transferred',originalTargetId:u.id,actualHpBearerId:recipient.id,amount:linkAmount,captureStage:link.captureStage,defenseOwner:link.defenseOwner,sourceUnitId:source,attackId:packet.attackId,segmentId:packet.segmentId});
 }
 if(damage>0){result.damage=mechanicsClampHP(g,u,damage,{...context,kind:'damage'});if(result.damage>0){recordCombatEvent(g,{type:'damage_taken',unitId:u.id,amount:result.damage,sourceUnitId:source,ownerPlayerId:packet.ownerPlayerId,attackId:packet.attackId,segmentId:packet.segmentId});if(source!==null)recordCombatEvent(g,{type:'damage_dealt',unitId:source,targetId:u.id,amount:result.damage,sourceUnitId:source,attackId:packet.attackId,segmentId:packet.segmentId});}}
 result.killed=u.hp<=0;
 if(hpLoss>0&&u.hp>0){result.hpLoss=mechanicsClampHP(g,u,hpLoss,{...context,kind:'hp_loss'});result.killed||=u.hp<=0;}
 if(result.killed){g.lethalContexts??={};g.lethalContexts[u.id]={sourceUnitId:source,attackId:packet.attackId,segmentId:packet.segmentId,revivalId:packet.revivalId};}
 return result;
}
export function redactCombatEvents(g,out,owner){
 const own=id=>g.units.some(u=>u.id===id&&(u.owner||u.id)===owner);
 out.combatEvents=(g.combatEvents||[]).filter(e=>own(e.unitId)||own(e.targetId)||own(e.originalTargetId)||own(e.actualHpBearerId)).map(e=>{
  const clean={...e};if(!own(e.unitId)){for(const key of ['amount','from','to','hp','cancelled'])delete clean[key];}return clean;
 });
 delete out.lethalContexts;return out;
}

export function normalizePriorityTable(input){
 if(!input||typeof input!=='object'||Array.isArray(input)||Object.keys(input).length>32)throw Error('规则优先级最多32项。');
 const entries=Object.entries(input);for(const [key,value] of entries)if(!/^[a-z][a-z0-9_.-]{2,63}$/.test(key)||['__proto__','constructor','prototype'].includes(key)||!Number.isSafeInteger(value)||value<0||value>10000)throw Error('优先级键须为稳定ID，数值须为0至10000整数。');
 if(new Set(entries.map(([,v])=>v)).size!==entries.length)throw Error('规则优先级数值须互不相同。');return Object.fromEntries(entries);
}
