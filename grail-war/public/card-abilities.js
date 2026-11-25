import {validateRuleAbility,compileRuleAbility} from './rule-model.js';
import {COMPLEX_EFFECTS,ABILITY_TRIGGERS,validateComplexEffect,complexEffectText} from './complex-schema.js';
import {activeCombatEffects,preflightDamageLinks} from './combat-mechanics.js';
import {SIZE} from './data.js';
import {combatDistance} from './tactics.js';
import {targetingFighters,lineCells,sight} from './targeting.js';

// This registry lists executable operations only, not the candidate v6 list.
export const ABILITY_EFFECTS=[
 {id:'heal',name:'恢复生命',implemented:true},
 {id:'gain_resource',name:'获得资源',implemented:true},
 {id:'shield',name:'获得护盾（上限30）',implemented:true},
 {id:'status',name:'临时增益',implemented:true},
 {id:'cleanse',name:'解除定身与弱化',implemented:true},
 {id:'damage',name:'伤害攻击（普通／真伤／多段）',implemented:true},...COMPLEX_EFFECTS
];
export const ABILITY_MODIFIERS=[{id:'allDamage',name:'全部攻击伤害'},{id:'normalDamage',name:'通常攻击伤害'},{id:'allReduction',name:'全部伤害减免'},{id:'normalReduction',name:'通常伤害减免'},{id:'contest',name:'属性对抗'},{id:'movement',name:'移动距离'}];
export const ABILITY_RESOURCES=[{id:'ap',name:'行动点'},{id:'mp',name:'魔力'},{id:'hp',name:'生命（支付后至少保留1）'},{id:'morale',name:'士气'},{id:'seals',name:'契约令咒'}];
const caBuiltin=new Set(ABILITY_RESOURCES.map(r=>r.id));
function caObject(v,keys,label){if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!keys.includes(k)))throw Error(label+'包含不支持的字段。');}
function caInt(v,min,max,label){if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(`${label}须为${min}至${max}的整数。`);return v;}
function caId(v,label){if(typeof v!=='string'||!/^[a-z][a-z0-9_.-]{2,63}$/.test(v)||['__proto__','prototype','constructor'].includes(v)||caBuiltin.has(v))throw Error(label+'须为3至64位小写字母、数字或 ._-，且不能与内置资源重复。');return v;}
function caName(v,label,max=60){if(typeof v!=='string'||!v.trim()||v.length>max)throw Error(label+'不能为空或超过'+max+'字。');return v.trim();}
export function validateResources(input=[]){
 if(!Array.isArray(input)||input.length>8)throw Error('每张卡最多8种自定义资源。');const seen=new Set();
 return input.map(r=>{caObject(r,['id','name','initial','max','scope','visibility'],'资源');const id=caId(r.id,'资源ID');if(seen.has(id))throw Error('资源ID重复。');seen.add(id);const max=caInt(r.max,1,9999,'资源上限'),initial=caInt(r.initial,0,max,'初始资源');if(!['battle','campaign'].includes(r.scope)||!['owner_only','public'].includes(r.visibility))throw Error('资源生命周期或可见性无效。');return {id,name:caName(r.name,'资源名称',30),initial,max,scope:r.scope,visibility:r.visibility};});
}
export function validateAbilities(input=[],resources=[],role='servant'){
 if(!Array.isArray(input)||input.length>12)throw Error('最多12项自建能力。');const seen=new Set(),defs=new Map(resources.map(r=>[r.id,r]));
 return input.map(raw=>{
  if(raw?.clauses){const normalized=validateRuleAbility(raw,resources,role);if(seen.has(normalized.id))throw Error('能力ID重复。');seen.add(normalized.id);return normalized;}
  caObject(raw,['id','name','category','phase','target','shape','range','radius','cooldown','costs','effects','trigger','conditions'],'能力');const id=caId(raw.id,'能力ID');if(seen.has(id))throw Error('能力ID重复。');seen.add(id);
  const trigger=raw.trigger??'active';if(!ABILITY_TRIGGERS.some(t=>t.id===trigger))throw Error('requires_handler：不支持的触发时机。');if(trigger!=='active'&&(raw.phase!=='battle'||raw.target!=='self'))throw Error('触发技能和防御反应当前仅支持战斗中的自身目标。');const name=caName(raw.name,'技能名称');if(!(role==='master'?['master_skill']:['skill','noble_phantasm']).includes(raw.category))throw Error('能力分类不属于此角色。');
  if(!['battle','daily','both'].includes(raw.phase)||!['self','ally','allies','enemy','enemies'].includes(raw.target)||!['single','area','line','selfArea'].includes(raw.shape))throw Error('技能阶段、目标或范围类型无效。');
  const range=caInt(raw.range,0,20,'射程'),radius=caInt(raw.radius,0,8,'半径'),cooldown=caInt(raw.cooldown,0,20,'冷却');
  if(raw.phase!=='battle'&&(raw.target!=='self'||cooldown!==0))throw Error('日常/通用技能当前仅支持自身目标且不使用战斗冷却。');
  if(raw.target==='self'&&raw.shape!=='single'||raw.target!=='self'&&raw.shape==='selfArea'&&!['allies','enemies'].includes(raw.target)||['self','ally','enemy'].includes(raw.target)&&raw.shape!=='single')throw Error('目标与范围不匹配；单体目标使用单体范围。');
  if(raw.target!=='self'&&range===0&&raw.shape!=='selfArea')throw Error('非自身技能须设置有效射程。');
  const checkResource=(resource,operation)=>{if(typeof resource!=='string'||!caBuiltin.has(resource)&&!defs.has(resource))throw Error('引用了未定义的资源。');if(defs.get(resource)?.scope==='battle'&&raw.phase!=='battle')throw Error('战斗资源只能用于战斗技能。');if(operation==='gain'&&!['hp','mp','morale'].includes(resource)&&!defs.has(resource))throw Error('当前只支持获得生命、魔力、士气和自定义资源。');};
  if(!Array.isArray(raw.costs)||raw.costs.length>10)throw Error('技能代价格式无效。');const costIds=new Set();const costs=raw.costs.map(c=>{caObject(c,['resource','amount'],'代价');checkResource(c.resource,'spend');if(costIds.has(c.resource))throw Error('同一资源的代价请合并为一项。');costIds.add(c.resource);return {resource:c.resource,amount:caInt(c.amount,0,c.resource==='ap'?3:9999,'代价')};});
  const ap=costs.find(c=>c.resource==='ap')?.amount||0;if(raw.phase!=='daily'&&ap>2)throw Error('战斗技能可用0至2行动点；纯日常技能可用0至3点。');
  if(!Array.isArray(raw.effects)||!raw.effects.length||raw.effects.length>6)throw Error('请选择1至6项技能效果。');
  const conditions=raw.conditions??[];if(!Array.isArray(conditions)||conditions.length>4)throw Error('最多4项发动条件。');const normalizedConditions=conditions.map(c=>{caObject(c,['resource','operator','value'],'发动条件');checkResource(c.resource,'spend');if(!['gte','lte'].includes(c.operator))throw Error('条件比较符无效。');return {resource:c.resource,operator:c.operator,value:caInt(c.value,0,9999,'条件值')};});
  const effects=raw.effects.map(e=>{
   if(!e||!ABILITY_EFFECTS.some(v=>v.id===e.op))throw Error('requires_handler：该效果尚未实现。');
   if(e.op==='damage'||COMPLEX_EFFECTS.some(v=>v.id===e.op)){if(raw.phase!=='battle')throw Error('复杂战斗机制只能用于战斗技能。');return validateComplexEffect(e,checkResource);}
   const fields={heal:['op','amount'],gain_resource:['op','resource','amount'],shield:['op','amount'],status:['op','kind','amount','duration'],cleanse:['op'],damage:['op','dice','bonus']}[e.op];caObject(e,fields,'效果');
   if(e.op==='cleanse')return {op:e.op};if(e.op==='damage')return {op:e.op,dice:caInt(e.dice,0,40,'伤害骰数'),bonus:caInt(e.bonus,0,300,'固定伤害')};
   const amount=caInt(e.amount,1,e.op==='shield'?30:999,'效果数值');
   if(e.op==='gain_resource'){checkResource(e.resource,'gain');if(defs.has(e.resource)&&raw.target!=='self')throw Error('自定义资源只能授予技能使用者。');return {op:e.op,resource:e.resource,amount};}
   if(e.op==='status'){if(!ABILITY_MODIFIERS.some(v=>v.id===e.kind))throw Error('requires_handler：不支持的状态修正。');if(raw.phase!=='battle')throw Error('持续增益当前以战斗轮计，只能用于战斗技能。');return {op:e.op,kind:e.kind,amount:caInt(amount,1,50,'增益数值'),duration:caInt(e.duration,1,10,'持续战斗轮数')};}
   if(e.op==='shield'&&raw.phase!=='battle')throw Error('护盾只能在战斗阶段使用。');return {op:e.op,amount};
  });
  if(['enemy','enemies'].includes(raw.target)){if(effects.length!==1||!['damage','lose_hp'].includes(effects[0].op)||raw.phase!=='battle'||effects[0].op==='damage'&&effects[0].dice+effects[0].bonus===0)throw Error('敌方目标须使用一项伤害或生命流失效果；附带生命流失可在伤害效果内设置。');}
  else if(effects.some(e=>['damage','lose_hp'].includes(e.op)))throw Error('伤害效果需选择敌方目标。');
  if(effects.some(e=>e.op==='damage_link')&&!['ally','allies'].includes(raw.target))throw Error('伤害链接须施加给友方，再由施法者接收转移伤害。');
  return {id,name,trigger,conditions:normalizedConditions,category:raw.category,phase:raw.phase,target:raw.target,shape:raw.shape,range,radius,cooldown,costs,effects};
 });
}
export const customResourceValue=(u,r)=>u.customResources?.[r.id]??r.initial;
export function initializeCardResources(u,resetBattle=false){u.customResources??={};for(const r of u.card.resources||[])if(u.customResources[r.id]===undefined||resetBattle&&r.scope==='battle')u.customResources[r.id]=r.initial;}
export function abilityCostText(k,resources=[],mpMultiplier=1){if(!k.compose)return '';const names=Object.fromEntries([...ABILITY_RESOURCES,...resources].map(r=>[r.id,r.name]));return k.compose.costs.filter(c=>c.amount).map(c=>`${c.amount*(c.resource==='mp'?mpMultiplier:1)} ${names[c.resource]||c.resource}`).join(' · ')||'无资源消耗';}
export function compileAbility(a,resources=[]){
 if(a.clauses)return compileRuleAbility(a);
 const trigger=a.trigger||'active';const costs=Object.fromEntries(a.costs.map(c=>[c.resource,c.amount])),labels=Object.fromEntries([...ABILITY_RESOURCES,...resources].map(r=>[r.id,r.name]));
 const descriptions=a.effects.map(e=>complexEffectText(e)||(e.op==='damage'?`${e.dice}d4＋${e.bonus}伤害（正常属性应对）`:e.op==='status'?`${ABILITY_MODIFIERS.find(m=>m.id===e.kind).name}＋${e.amount}，持续${e.duration}战斗轮`:e.op==='gain_resource'?`获得${e.amount}${labels[e.resource]}`:e.op==='heal'?`恢复${e.amount}生命`:e.op==='shield'?`获得${e.amount}护盾（总量上限30）`:'解除定身与弱化'));
 return {id:'custom:'+a.id,name:a.name,rank:'自建',type:'composed',phase:a.phase,np:a.category==='noble_phantasm',cost:costs.mp||0,battleAP:costs.ap||0,dailyAP:costs.ap||0,passive:trigger!=='active',cd:a.cooldown,shape:a.shape,range:a.range,radius:a.radius,compose:{schemaVersion:'0.2',trigger,conditions:[],...structuredClone(a)},desc:(trigger!=='active'?'【'+ABILITY_TRIGGERS.find(t=>t.id===trigger).name+'】':'')+descriptions.join('；')+'。',source:'通用建卡引擎 · 已接入效果'};
}
export function composedSelection(g,u,k,point={}){
 const a=k.compose,fighters=targetingFighters(g),own=v=>(v.owner||v.id)===(u.owner||u.id);
 if(a.target==='self')return {valid:true,inRange:true,targets:[u],center:u,contains:p=>p.x===u.x&&p.y===u.y,reason:''};
 const center=a.shape==='selfArea'?u:(fighters.find(v=>v.x===point.x&&v.y===point.y)||point),positionValid=Number.isInteger(center.x)&&Number.isInteger(center.y)&&center.x>=0&&center.y>=0&&center.x<SIZE&&center.y<SIZE;
 const inRange=positionValid&&(a.shape==='selfArea'||combatDistance(u,center)<=a.range&&sight(u,center));
 const line=a.shape==='line'?new Set(lineCells(u,center).map(p=>`${p.x},${p.y}`)):null;
 const contains=p=>a.shape==='area'||a.shape==='selfArea'?combatDistance(p,center)<=a.radius&&sight(center,p):line?line.has(`${p.x},${p.y}`)&&sight(u,p):p.x===center.x&&p.y===center.y;
 const ally=['ally','allies'].includes(a.target),targets=inRange?fighters.filter(v=>(ally?own(v):!own(v))&&(ally||!activeCombatEffects(g,v,'guards').some(e=>e.kind==='untargetable'))&&contains(v)):[];
 let blocked='';const offensive=a.effects.find(e=>['damage','lose_hp'].includes(e.op));if(offensive&&targets.length){if(targets.length*(offensive.segments||1)>64)blocked='chain_budget_exceeded：目标与段数乘积超过64。';else try{preflightDamageLinks(g,targets);}catch(e){blocked=e.message;}}
 return {valid:inRange&&targets.length>0&&!blocked,inRange,targets,contains,center,reason:blocked||(!inRange?'目标超出射程或视线。':!targets.length?`范围内没有可选${ally?'友方':'敌方'}单位。`:'')};
}
