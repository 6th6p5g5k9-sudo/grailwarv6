import {privateRuleProjection,enqueueRuleEvent} from './rule-runtime.js';
import {grantCombatEffect} from './combat-mechanics.js';
import {customResourceValue,composedSelection,ABILITY_MODIFIERS} from './card-abilities.js';

// Plan the complete payment before mutating any balance. No effect or counter
// is advanced when one of several required resources is insufficient.
export function cardResourceAmount(g,u,id){const r=u.card.resources?.find(r=>r.id===id);if(r)return customResourceValue(u,r);if(id==='ap')return g.phase==='daily'?u.dailyAP:u.battleAP;if(id==='mp')return u.mp+(u.externalMP||0);if(id==='seals')return g.units.find(v=>v.kind==='servant'&&(v.owner||v.id)===(u.owner||u.id))?.seals||0;return u[id]??0;}
export function checkAbilityConditions(g,u,k){for(const c of k.compose.conditions||[]){const value=cardResourceAmount(g,u,c.resource);if(c.operator==='gte'?value<c.value:value>c.value)throw Error('技能发动条件未满足。');}}
export function planAbilityPayment(g,u,k){
 checkAbilityConditions(g,u,k);
 const owner=u.owner||u.id,servant=g.units.find(v=>v.kind==='servant'&&(v.owner||v.id)===owner),master=g.units.find(v=>v.kind==='master'&&(v.owner||v.id)===owner),changes=[];
 for(const c of k.compose.costs){
  if(!c.amount)continue;const amount=c.amount*(c.resource==='mp'&&g.day>7?2:1);
  const r=u.card.resources?.find(r=>r.id===c.resource);let value;
  if(r)value=customResourceValue(u,r);
  else if(c.resource==='mp')value=u.mp+(u.externalMP||0);
  else if(c.resource==='hp')value=u.hp-1;
  else if(c.resource==='ap')value=g.phase==='daily'?u.dailyAP:u.battleAP;
  else if(c.resource==='seals'){if(!servant?.alive||!master?.alive)throw Error('支付令咒需要存活的契约主从。');value=servant.seals;}
  else value=u[c.resource];
  if(!Number.isFinite(value)||value<amount)throw Error(`技能代价不足：${r?.name||c.resource}，需要${amount}。`);
  changes.push(()=>{
   if(r){u.customResources??={};u.customResources[r.id]=value-amount;}
   else if(c.resource==='mp'){const external=Math.min(u.externalMP||0,amount);u.externalMP=(u.externalMP||0)-external;u.mp-=amount-external;}
   else if(c.resource==='ap')u[g.phase==='daily'?'dailyAP':'battleAP']-=amount;
   else if(c.resource==='seals')servant.seals-=amount;
   else u[c.resource]-=amount;
   enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:c.resource,amount,resource_amount:amount});
  });
 }
 return ()=>{for(const apply of changes)apply();};
}
export function executeComposedAbility(g,u,k,point,hooks){
 const selection=g.phase==='daily'?{valid:true,targets:[u]}:composedSelection(g,u,k,point);
 if(!selection.valid)throw Error(selection.reason);
 const offensive=k.compose.effects.find(e=>['damage','lose_hp'].includes(e.op));if(offensive&&selection.targets.length*(offensive.segments||1)>64)throw Error('chain_budget_exceeded：一次攻击的目标×段数不能超过64。');hooks.preflight?.(selection.targets,k);
 const before=Object.fromEntries([...new Set(k.compose.effects.flatMap(e=>[e.scaling?.resource,...(e.conditionalTags||[]).map(c=>c.resource)]).filter(Boolean))].map(id=>[id,cardResourceAmount(g,u,id)]));
 const pay=planAbilityPayment(g,u,k);
 // All implemented effects are validated when a template is saved, and the
 // target set is fixed before costs are paid. No user-supplied code is run.
 pay();
 for(const e of k.compose.effects){
  if(['damage','lose_hp'].includes(e.op)){const tags=[...(e.tags||[])],read=(id,stage)=>stage==='before_cost'?before[id]:cardResourceAmount(g,u,id);for(const c of e.conditionalTags||[])if(read(c.resource,c.stage)>=c.atLeast&&!tags.includes(c.tag))tags.push(c.tag);const extra=e.scaling?read(e.scaling.resource,e.scaling.stage)*e.scaling.perStack:0;hooks.attack({...k,type:'attack',dice:e.dice||0,bonus:(e.bonus||0)+extra,mechanics:{kind:e.op==='lose_hp'?'hp_loss':'damage',hpLossAmount:e.op==='lose_hp'?e.amount:0,hpLoss:e.hpLoss||0,damageType:e.damageType||'normal',segments:e.segments||1,tags}},selection.targets);continue;}
  for(const target of selection.targets){
   if(['invincibility','special_shield','hp_floor','revival','damage_link','untargetable'].includes(e.op))grantCombatEffect(g,u,target,k,e);
   if(e.op==='heal')target.hp=Math.min(target.maxHp,target.hp+e.amount);
   if(e.op==='gain_resource'){
    const r=target.card.resources?.find(r=>r.id===e.resource);
    if(r){target.customResources??={};target.customResources[r.id]=Math.min(r.max,customResourceValue(target,r)+e.amount);}
    else{const max=e.resource==='hp'?target.maxHp:e.resource==='mp'?target.card.mp:3;target[e.resource]=Math.min(max,target[e.resource]+e.amount);}
   }
   if(e.op==='shield')target.shield=Math.min(30,(target.shield||0)+e.amount);
   if(e.op==='status'){target.effects??=[];target.effects.push({kind:e.kind,value:e.amount,until:g.round+e.duration-1,name:k.name+' · '+ABILITY_MODIFIERS.find(m=>m.id===e.kind).name,owner:u.id,sourcePlayerId:u.owner||u.id});}
   if(e.op==='cleanse'){delete target.buff.root;delete target.buff.weaken;}
  }
 }
 if(g.phase==='battle')u.cd[k.id]=k.cd;
 u.battleUses??={};u.battleUses[k.id]=(u.battleUses[k.id]||0)+1;
 hooks.log(selection.targets);hooks.schedule();return selection.targets;
}
export function redactCardResources(out,owner){
 for(const unit of out.units||[]){if((unit.owner||unit.id)===owner)continue;
  const publicIds=new Set((unit.card?.resources||[]).filter(r=>r.visibility==='public').map(r=>r.id));
  unit.customResources=Object.fromEntries(Object.entries(unit.customResources||{}).filter(([id])=>publicIds.has(id)));
  if(unit.card){unit.card.resources=(unit.card.resources||[]).filter(r=>r.visibility==='public');unit.card.skills=(unit.card.skills||[]).map(k=>{if(!k.compose)return k;return {id:k.id,name:k.name,rank:k.rank,type:k.type,phase:k.phase,np:k.np,hiddenConfiguration:true,battleAP:0,cost:0,cd:0,desc:'自建技能细节仅所属玩家可见。'};});}
 }
 // Lobby drafts are also templates: do not leak another player's private
 // resource definitions through the player record or last submitted card.
 if(out.pendingAttack?.skill?.compose&&(out.units.find(u=>u.id===out.pendingAttack.attacker)?.owner||out.pendingAttack.attacker)!==owner){delete out.pendingAttack.skill.compose;}
 out.players=(out.players||[]).map(p=>{if(p.id===owner)return p;const clean={...p};if(clean.customCard)clean.cardName=clean.customCard.name;delete clean.customCard;delete clean.masterDraft;return clean;});
 return privateRuleProjection(out,owner);
}

export function canPayAbility(g,u,k){try{planAbilityPayment(g,u,k);return true;}catch{return false;}}
