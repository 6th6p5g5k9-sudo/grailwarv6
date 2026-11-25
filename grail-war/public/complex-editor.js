import {COMPLEX_ATTACK_TAGS} from './combat-mechanics.js';
import {ABILITY_TRIGGERS} from './complex-schema.js';
export {ABILITY_TRIGGERS};
const ceBool=[{id:'false',name:'否'},{id:'true',name:'是'}];
export function attackConditionMarkup(c,resources,ui){return `<div class="attack-condition composer-grid">${ui.select('resource','资源',resources,c.resource||resources[0]?.id||'mp')}${ui.number('atLeast','至少数量',c.atLeast??3,0,9999)}${ui.select('tag','追加标签',COMPLEX_ATTACK_TAGS.filter(t=>t.id!=='sourceless'),c.tag||'pierce_invincibility')}${ui.select('stage','读取数量',ui.enums([['before_cost','支付前'],['after_cost','支付后']]),c.stage||'after_cost')}<button type="button" class="text-button" data-compose="remove">移除此条件标签</button></div>`;}
export function complexEffectFields(e,resources,ui){
 const num=ui.number,select=ui.select,enums=ui.enums,turns=()=>num('duration','持续战斗轮（含本轮）',e.duration??3,1,10),tags=()=>`<fieldset class="complex-tags"><legend>本次攻击标签</legend>${COMPLEX_ATTACK_TAGS.map(t=>`<label><input type="checkbox" data-attack-tag="${t.id}" ${(e.tags||[]).includes(t.id)?'checked':''}>${t.name}</label>`).join('')}</fieldset>`;
 if(['damage','lose_hp'].includes(e.op)){
  const fields=e.op==='damage'?`${num('dice','每段d4骰数',e.dice??2,0,40)}${num('bonus','每段固定伤害',e.bonus??0,0,300)}${select('damageType','伤害类型',enums([['normal','普通伤害'],['true','真实伤害（仍受无敌保护）']]),e.damageType||'normal')}${num('hpLoss','命中附带生命流失（每段）',e.hpLoss??0,0,300)}`:num('amount','每次生命流失',e.amount??10,1,999);
  return `${fields}${num('segments',e.op==='damage'?'攻击段数':'生命流失次数',e.segments??1,1,8)}${tags()}${e.op==='damage'?`${select('scalingResource','按资源量增加伤害', [{id:'',name:'不使用资源公式'},...resources],e.scaling?.resource||'')}${num('perStack','每单位资源增加伤害',e.scaling?.perStack??2,1,50)}${select('scalingStage','伤害公式读取数量',enums([['before_cost','支付前'],['after_cost','支付后']]),e.scaling?.stage||'after_cost')}<div class="complex-subsection"><h4>条件攻击标签</h4><div class="attack-conditions">${(e.conditionalTags||[]).map(c=>attackConditionMarkup(c,resources,ui)).join('')}</div><button type="button" class="text-button" data-compose="addAttackTag">＋ 添加资源条件标签</button></div>`:''}`;
 }
 if(e.op==='invincibility')return `${select('mode','无敌类型',enums([['charges','次数型（每段消耗一次）'],['duration','持续型']]),e.mode||'charges')}${num('charges','次数型无敌次数',e.charges||1,1,20)}${turns()}${select('immuneToPierce','明确不可被贯通',ceBool,String(e.immuneToPierce??false))}`;
 if(e.op==='special_shield')return `${num('amount','特殊护盾容量',e.amount??20,1,999)}${turns()}${select('blocksTrue','可抵挡真实伤害',ceBool,String(e.blocksTrue??true))}${select('immuneToPierce','明确不可被贯通',ceBool,String(e.immuneToPierce??false))}`;
 if(e.op==='hp_floor')return `${num('amount','锁血下限（不会抬高当前HP）',e.amount??1,1,999)}${turns()}`;
 if(e.op==='revival')return `${num('amount','复活后的HP',e.amount??30,1,999)}${num('charges','复活次数',e.charges??1,1,3)}${turns()}`;
 if(e.op==='damage_link')return `${num('percent','转给施法者的伤害百分比',e.percent??50,1,100)}${turns()}${select('captureStage','捕获阶段',enums([['before_defense','原目标防御前的原始伤害'],['after_defense','原目标防御后的剩余伤害']]),e.captureStage||'before_defense')}${select('defenseOwner','接收伤害的防御规则',enums([['recipient','接收者计算防御'],['original','沿用原目标防御（仅防御后捕获）']]),e.defenseOwner||'recipient')}<label>规则优先级键<input data-field="priority" value="${ui.escape(e.priority||'link.default')}" maxlength="64"></label><p class="tiny muted">多个链接同时生效时，需要房主在规则手册中配置不同的优先级；没有配置时停止争议结算。伤害接收者始终检查自己的锁血。</p>`;
 if(e.op==='untargetable')return turns();return null;
}
export function readComplexEffect(params,op){
 const get=key=>params.querySelector(`[data-field="${key}"]`)?.value,num=key=>{const v=get(key);return v===undefined||v===''?NaN:Number(v);},bool=key=>get(key)==='true';
 const tags=()=>[...params.querySelectorAll('[data-attack-tag]:checked')].map(el=>el.dataset.attackTag);
 if(op==='damage')return {op,dice:num('dice'),bonus:num('bonus'),damageType:get('damageType'),segments:num('segments'),hpLoss:num('hpLoss'),tags:tags(),...(get('scalingResource')?{scaling:{resource:get('scalingResource'),perStack:num('perStack'),stage:get('scalingStage')}}:{}),conditionalTags:[...params.querySelectorAll('.attack-condition')].map(row=>({resource:row.querySelector('[data-field=resource]').value,atLeast:Number(row.querySelector('[data-field=atLeast]').value),tag:row.querySelector('[data-field=tag]').value,stage:row.querySelector('[data-field=stage]').value}))};
 if(op==='lose_hp')return {op,amount:num('amount'),segments:num('segments'),tags:tags()};
 if(op==='invincibility')return {op,mode:get('mode'),charges:num('charges'),duration:num('duration'),immuneToPierce:bool('immuneToPierce')};
 if(op==='special_shield')return {op,amount:num('amount'),duration:num('duration'),blocksTrue:bool('blocksTrue'),immuneToPierce:bool('immuneToPierce')};
 if(op==='hp_floor')return {op,amount:num('amount'),duration:num('duration')};
 if(op==='revival')return {op,amount:num('amount'),charges:num('charges'),duration:num('duration')};
 if(op==='damage_link')return {op,percent:num('percent'),duration:num('duration'),captureStage:get('captureStage'),defenseOwner:get('defenseOwner'),priority:get('priority')};
 if(op==='untargetable')return {op,duration:num('duration')};return null;
}
