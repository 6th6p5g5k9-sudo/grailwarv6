import {COMPLEX_ATTACK_TAGS} from './combat-mechanics.js';
export const COMPLEX_EFFECTS=[{id:'lose_hp',name:'直接生命流失（不是伤害）',implemented:true},{id:'invincibility',name:'无敌（次数／持续）',implemented:true},{id:'special_shield',name:'特殊护盾',implemented:true},{id:'hp_floor',name:'锁血',implemented:true},{id:'revival',name:'死亡复活',implemented:true},{id:'damage_link',name:'伤害转移／共享给施法者',implemented:true},{id:'untargetable',name:'不可选中',implemented:true}];
export const ABILITY_TRIGGERS=[{id:'active',name:'主动使用'},{id:'reaction',name:'受攻击时的独立防御反应'},{id:'after_move',name:'自己完成移动后'},{id:'battle_round_start',name:'战斗轮开始时'},{id:'battle_round_end',name:'战斗轮结束时'}];
const cmInt=(v,min,max,name)=>{if(!Number.isSafeInteger(v)||v<min||v>max)throw Error(`${name}须为${min}至${max}的整数。`);return v;};
const cmObj=(v,fields)=>{if(!v||typeof v!=='object'||Array.isArray(v)||Object.keys(v).some(k=>!fields.includes(k)))throw Error('复杂效果包含不支持的字段。');};
const cmBool=(v,name)=>{if(v!==true&&v!==false)throw Error(name+'须明确选择是或否。');return v;};
export function validateComplexEffect(e,checkResource){
 const duration=()=>cmInt(e.duration,1,10,'持续战斗轮数');
 if(e.op==='damage'||e.op==='lose_hp'){
  cmObj(e,e.op==='damage'?['op','dice','bonus','damageType','segments','tags','hpLoss','scaling','conditionalTags']:['op','amount','segments','tags']);
  const segments=cmInt(e.segments??1,1,8,'攻击段数'),tags=e.tags??[];
  if(!Array.isArray(tags)||tags.length>4||new Set(tags).size!==tags.length||tags.some(t=>!COMPLEX_ATTACK_TAGS.some(k=>k.id===t)))throw Error('攻击标签无效。');
  if(tags.includes('sourceless')&&!tags.includes('unrespondable')&&e.op!=='lose_hp')throw Error('needs_ruling：无来源攻击须同时明确不可应对，避免凭空使用施加者属性。');
  if(e.op==='lose_hp')return {op:e.op,amount:cmInt(e.amount,1,999,'生命流失'),segments,tags};
  const damageType=e.damageType??'normal';if(!['normal','true'].includes(damageType))throw Error('伤害类型无效。');
  let scaling=null;if(e.scaling){cmObj(e.scaling,['resource','perStack','stage']);checkResource(e.scaling.resource,'spend');if(!['before_cost','after_cost'].includes(e.scaling.stage))throw Error('资源加成须明确取支付前或支付后的数量。');scaling={resource:e.scaling.resource,perStack:cmInt(e.scaling.perStack,1,50,'每单位资源伤害加成'),stage:e.scaling.stage};}
  const conditions=e.conditionalTags??[];if(!Array.isArray(conditions)||conditions.length>4)throw Error('最多4项条件标签。');
  const conditionalTags=conditions.map(c=>{cmObj(c,['resource','atLeast','tag','stage']);checkResource(c.resource,'spend');if(!['pierce_invincibility','unrespondable','cannot_counter'].includes(c.tag)||!['before_cost','after_cost'].includes(c.stage))throw Error('条件标签或捕获阶段无效。');return {resource:c.resource,atLeast:cmInt(c.atLeast,0,9999,'条件阈值'),tag:c.tag,stage:c.stage};});
  if(tags.includes('sourceless')&&(scaling||conditionalTags.length))throw Error('无来源攻击不能依赖施加者的资源加成或资源条件。');
  return {op:e.op,dice:cmInt(e.dice,0,40,'伤害骰数'),bonus:cmInt(e.bonus,0,300,'固定伤害'),damageType,segments,tags,hpLoss:cmInt(e.hpLoss??0,0,300,'命中时附带生命流失'),...(scaling?{scaling}:{}),...(conditionalTags.length?{conditionalTags}:{})};
 }
 const fields={invincibility:['op','duration','mode','charges','immuneToPierce'],special_shield:['op','duration','amount','blocksTrue','immuneToPierce'],hp_floor:['op','duration','amount'],revival:['op','duration','amount','charges'],damage_link:['op','duration','percent','captureStage','defenseOwner','priority'],untargetable:['op','duration']}[e.op];
 if(!fields)throw Error('requires_handler：复杂效果尚未实现。');cmObj(e,fields);const base={op:e.op,duration:duration()};
 if(e.op==='invincibility'){if(!['charges','duration'].includes(e.mode))throw Error('无敌须明确次数型或持续型。');return {...base,mode:e.mode,charges:e.mode==='charges'?cmInt(e.charges,1,20,'无敌次数'):0,immuneToPierce:cmBool(e.immuneToPierce,'不可贯通')};}
 if(e.op==='special_shield')return {...base,amount:cmInt(e.amount,1,999,'护盾容量'),blocksTrue:cmBool(e.blocksTrue,'抵挡真伤'),immuneToPierce:cmBool(e.immuneToPierce,'不可贯通')};
 if(e.op==='hp_floor')return {...base,amount:cmInt(e.amount,1,999,'锁血下限')};
 if(e.op==='revival')return {...base,amount:cmInt(e.amount,1,999,'复活生命'),charges:cmInt(e.charges,1,3,'复活次数')};
 if(e.op==='damage_link'){
  if(!['before_defense','after_defense'].includes(e.captureStage)||!['recipient','original'].includes(e.defenseOwner)||e.captureStage==='before_defense'&&e.defenseOwner!=='recipient')throw Error('needs_ruling：防御前转移须由接收者计算防御；防御后转移须明确防御归属。');
  if(typeof e.priority!=='string'||!/^[a-z][a-z0-9_.-]{2,63}$/.test(e.priority))throw Error('伤害链接须设置有效的规则优先级键。');
  return {...base,percent:cmInt(e.percent,1,100,'转移百分比'),captureStage:e.captureStage,defenseOwner:e.defenseOwner,priority:e.priority};
 }
 return base;
}
export function complexEffectText(e){
 const tags=(e.tags||[]).map(t=>COMPLEX_ATTACK_TAGS.find(v=>v.id===t)?.name).filter(Boolean).join('、');
 if(e.op==='damage')return `${e.segments||1}段，每段${e.dice}d4＋${e.bonus}${e.damageType==='true'?'真实':'普通'}伤害${e.hpLoss?'，命中附带'+e.hpLoss+'生命流失':''}${tags?'；'+tags:''}${e.scaling?'；按'+(e.scaling.stage==='before_cost'?'支付前':'支付后')+'资源量每单位加'+e.scaling.perStack+'伤害':''}${e.conditionalTags?.length?'；含资源条件攻击标签':''}`;
 if(e.op==='lose_hp')return `${e.segments}次直接生命流失，每次${e.amount}（不触发受伤／反伤）${tags?'；'+tags:''}`;
 if(e.op==='invincibility')return `${e.mode==='charges'?e.charges+'次':'持续'}无敌，${e.duration}战斗轮${e.immuneToPierce?'，不可被贯通':''}`;
 if(e.op==='special_shield')return `特殊护盾${e.amount}，${e.duration}战斗轮${e.blocksTrue?'，可挡真伤':''}${e.immuneToPierce?'，不可被贯通':''}`;
 if(e.op==='hp_floor')return `锁血下限${e.amount}，${e.duration}战斗轮；溢出取消`;
 if(e.op==='revival')return `${e.duration}战斗轮内可复活${e.charges}次，每次${e.amount}HP`;
 if(e.op==='damage_link')return `${e.duration}战斗轮内，${e.captureStage==='before_defense'?'防御前':'防御后'}将${e.percent}%伤害转给施法者（${e.defenseOwner==='original'?'沿用原目标防御':'按接收者防御'}，优先级键${e.priority}）`;
 if(e.op==='untargetable')return `不可被攻击选中，${e.duration}战斗轮`;
 return '';
}
