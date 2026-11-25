import {validateResources,validateAbilities,compileAbility} from './card-abilities.js';
import {enrichAbility} from './flavour.js';
import {MASTER_SOURCES} from './library.js';
import {SERVANTS,BY_ID,LIBRARY_RULES} from './data.js';
import {MOONCELL_DATA,CATALOGUE_MANIFEST} from './catalogue-data.js';
export {CATALOGUE_MANIFEST};
export const CLASS_IDS=['saber','archer','lancer','rider','caster','assassin','berserker'];
export const level=r=>({E:1,D:2,C:3,B:4,A:5,EX:6}[String(r||'C').toUpperCase().replace(/[+＋\-－]/g,'')]||3);
const grade=r=>['E','D','C','B','A','EX'][level(r)-1];
const clone=x=>structuredClone(x);
const aliases={'直觉':'直感','心眼（真）':'心眼-真','心眼(真)':'心眼-真','气息遮断':'气息遮蔽','阵地作成':'阵地制造','无穷的武练':'无穷武炼','无穷的武炼':'无穷武炼','无穷武练':'无穷武炼'};
const dbBase=new Map();for(const s of SERVANTS)for(const k of s.skills)if(k.libraryKey&&!dbBase.has(k.name))dbBase.set(k.name,k);
for(const [name,key] of [['单独行动','solo'],['气息遮蔽','conceal'],['狂化','madness']])dbBase.set(name,{id:key,name,rank:'B',libraryKey:key,phase:'passive',cost:0,battleAP:0,cd:0,type:'library',desc:LIBRARY_RULES[key].text,source:LIBRARY_RULES[key].source});
function databaseSkill(name,rank){name=aliases[name]||name;const b=dbBase.get(name);if(!b)return null;const k={...clone(b),rank:grade(rank),sourceRank:rank};if(k.libraryKey==='instinct')k.cost=[10,12,14,16,18,20][level(rank)-1];if(k.libraryKey==='burst')k.cost=(level(rank)+2)*5;if(k.libraryKey==='pollution')k.cost=level(rank)*2;k.desc=LIBRARY_RULES[k.libraryKey]?.text||k.desc;return k;}
export const SKILL_BANK=[],NP_BANK=[];
const addBank=(array,k,id,source,role='servant')=>{const item={...clone(k),bankId:id,role,sourceLink:source};array.push(item);return item;};
for(const s of SERVANTS)for(const k of s.skills)addBank(k.np?NP_BANK:SKILL_BANK,k,`zero:${s.id}:${k.id}`,null);
function convertedEffects(text,lvl,np=false){const out=[];const put=(kind,value)=>{if(!out.some(e=>e.kind===kind))out.push({kind,value});};
 if(/(?:HP|生命值|生命|体力).{0,10}(?:回复|恢复)|(?:回复|恢复).{0,14}(?:HP|生命|体力)/i.test(text))put('heal',np?25:8+lvl*2);
 if(/NP.{0,12}(?:增加|充能)|(?:NP增加|NP获得量|NP再充能)/i.test(text))put('mana',np?15:8+lvl*2);
 if(/(?:攻击力|攻击威力|攻击性能|指令卡性能|暴击威力).{0,8}(?:提升|增加)|伤害提升/.test(text))put('damage',4+lvl);
 if(/(?:防御力|防御性能).{0,8}(?:提升|增加)|伤害减免|伤害减免状态/.test(text))put('defense',3+lvl);
 if(/回避|无敌|对肃正防御/.test(text))put('evade',3+lvl);
 if(/毅力/.test(text))put('guts',10+lvl*3);
 if(/弱化状态解除|解除.{0,8}弱化/.test(text))put('cleanse',1);
 if(/强化状态解除|解除.{0,8}强化/.test(text))put('dispel',1);
 if(/眩晕|魅惑|束缚|麻痹|行动不能/.test(text))put('root',1);
 if(/攻击力下降|防御力下降|诅咒|毒|灼伤|恐惧/.test(text))put('weaken',1);
 if(/宝具威力提升|宝具伤害提升/.test(text))put('special',6+lvl*2);
 if(/暴击星|星星|弱化耐性|强化成功率|必中|无敌贯通|暴击发生率/.test(text))put('accuracy',2+Math.ceil(lvl/2));
 if(!out.length)put('accuracy',2+Math.ceil(lvl/2));return out.slice(0,5);
}
function adaptedSkill(src,card,i){const lib=databaseSkill(src.name,src.rank);const id=`mc-s-${card.number}-${i}`;if(lib)return {...lib,conversion:'supplied-database'};
 const effects=convertedEffects(src.sourceEffects.join('；'),level(src.rank));return {id,name:src.name,rank:src.rank==='?'?'B':src.rank,cost:10+Math.min(10,effects.length*3),battleAP:1,cd:3,type:'adapted',phase:'battle',effects,desc:effectText(effects)+'。持续增益一般维持3战斗轮次；数值为本版战棋换算。',source:'Mooncell事实 → 本版战棋改编',conversion:'original-tabletop',sourceEffects:src.sourceEffects};}
export function effectText(effects){return effects.map(e=>({heal:`恢复${e.value}生命`,mana:`恢复${e.value}魔力`,damage:`通常伤害+${e.value}`,defense:`减伤+${e.value}`,evade:`应对对抗+${e.value}`,guts:`本场一次致死时以${e.value}生命续战`,cleanse:'解除束缚与弱化',dispel:'下次攻击命中时驱散目标强化',root:'下次攻击命中时束缚目标',weaken:'下次攻击命中时使目标弱化',special:`下次特殊攻击+${e.value}`,accuracy:`后续3次攻击对抗+${e.value}`}[e.kind]||'')).join('；');}
function adaptedNP(src,card,i,dice){const l=level(src.rank),text=src.sourceEffects.join('；'),support=src.target==='辅助'||!text.includes('攻击')&&!text.includes('伤害');const id=`mc-np-${card.number}-${i}`;
 const base={id,name:src.name,rank:src.rank,np:true,battleAP:2,cost:25+l*4,cd:5,chant:!support&&l>=5?4:0,phase:'battle',source:'Mooncell宝具事实 → 本版战棋改编',sourceEffects:src.sourceEffects,sourceKind:src.kind,conversion:'original-tabletop'};
 if(support){const effects=convertedEffects(text,l,true);return {...base,type:'adapted',effects,desc:'辅助宝具：'+effectText(effects)+'。本版固定战棋效果。'};}
 const area=src.target==='全体',d=Math.max(8,dice*2+2),bonus=8+l*2;return {...base,type:'attack',range:area?5:3,dice:d,bonus,...(area?{shape:'area',radius:2}:{}),root:/眩晕|魅惑|束缚/.test(text),curse:/HP回复量下降|最大HP下降/.test(text),dispel:/强化状态解除/.test(text),weaken:/攻击力下降|诅咒|灼伤|毒/.test(text),sacrificeSelf:/自身.*即死|自身.*战斗不能/.test(text),desc:`${area?'射程5、半径2':'射程3、单体'}，造成${d}d4+${bonus}伤害${/强化状态解除/.test(text)?'，命中时驱散强化':''}${/眩晕|魅惑|束缚/.test(text)?'并束缚':''}。${/自身.*即死|自身.*战斗不能/.test(text)?'使用后自身退场。':''}依据原作效果方向作固定战棋换算。`};}
export function classPackage(classId,classFacts=[],rankOverrides={}){const names={saber:['对魔力','骑乘'],archer:['对魔力','单独行动'],lancer:['对魔力'],rider:['对魔力','骑乘'],caster:['阵地制造'],assassin:['气息遮蔽'],berserker:['狂化']}[classId];return names.map(name=>{const fact=classFacts.find(v=>(aliases[v.name]||v.name)===name);const skill=databaseSkill(name,fact?.rank||'B');return skill&&rankOverrides[skill.libraryKey]?databaseSkill(name,rankOverrides[skill.libraryKey]):skill;}).filter(Boolean);}
export const STOCK_CARDS=SERVANTS.map(s=>({...clone(s),id:'zero-'+s.id,classId:s.id,originTemplate:true,bio:`第四次圣杯战争原始测试模板：${s.title}。`,traitBudget:6,traits:{},sourceInfo:null}));
export const MOONCELL_CARDS=MOONCELL_DATA.map(raw=>{
 const ranks=raw.sourceRanks.map(grade),end=level(ranks[1]),mana=level(ranks[3]),agility=level(ranks[2]),str=level(ranks[0]),dice=str===6?8:str;const skills=[];
 for(const [i,src] of raw.allSkills.entries())addBank(SKILL_BANK,enrichAbility(adaptedSkill(src,raw,i),src,raw),`mooncell:skill:${raw.number}:${i}`,raw.source.url);
 for(const src of raw.skills){const originalIndex=raw.allSkills.findIndex(k=>k.name===src.name&&JSON.stringify(k.sourceEffects)===JSON.stringify(src.sourceEffects));const bank=SKILL_BANK.find(k=>k.bankId===`mooncell:skill:${raw.number}:${Math.max(0,originalIndex)}`);if(bank&&!skills.some(k=>k.id===bank.id))skills.push(clone(bank));}
 const nps=raw.nps.map((np,i)=>addBank(NP_BANK,enrichAbility(adaptedNP(np,raw,i,dice),np,raw),`mooncell:np:${raw.number}:${i}`,raw.source.url));
 const klass=classPackage(raw.classId,raw.classSkills);for(const k of klass)if(!skills.some(v=>v.libraryKey===k.libraryKey))skills.push(k);
 const spirit=raw.rarity>=5?'A':raw.rarity>=3?'B':'C',c=BY_ID[raw.classId];return {id:raw.id,classId:raw.classId,class:raw.classId.toUpperCase(),name:raw.name,title:`No.${String(raw.number).padStart(3,'0')} · ${raw.rarity}★`,quote:'回应召唤，缔结新的契约。',color:c.color,symbol:c.symbol,gender:raw.gender,alignment:raw.alignment,origin:'Mooncell从者档案',wish:'由御主与从者共同书写',relic:'对应灵基的圣遗物',ranks,hp:[0,40,50,60,70,80,110][end]+(['saber','archer','lancer'].includes(raw.classId)?10:0),mp:[0,40,50,60,70,80,110][mana],move:agility===6?8:agility,dice,luck:[0,1,2,3,4,5,7][level(ranks[4])],range:['archer','caster'].includes(raw.classId)?3:1,spirit,passive:klass.map(k=>k.name+' '+k.rank).join('；')+'（所选数据库职阶效果）',skills:[...skills,...nps.slice(0,1)],sourceInfo:raw.source,sourceRanks:raw.sourceRanks,sourceTraits:raw.traits,bio:`${raw.name}，${raw.gender}，属性${raw.alignment}，以${raw.classId}职阶登记。${raw.traits.slice(0,4).join('、')}。卡面基础参数来自Mooncell；技能数值和灵格为本版战棋转换。`,traitBudget:6,traits:{},adaptation:true};
});
export const ROSTER=[...STOCK_CARDS,...MOONCELL_CARDS];
export const CARD_BY_ID=Object.fromEntries(ROSTER.map(c=>[c.id,c]));
export const SKILL_BY_BANK=Object.fromEntries(SKILL_BANK.map(k=>[k.bankId,k]));
export const NP_BY_BANK=Object.fromEntries(NP_BANK.map(k=>[k.bankId,k]));
export const TRAITS=[
{id:'hp',name:'生命增益',cost:1,scope:'general',max:10,desc:'生命上限+10，可叠加10层。'},
{id:'mp',name:'魔力增益',cost:1,scope:'general',max:10,desc:'魔力上限+10，可叠加10层。'},
{id:'strike',name:'猛击',cost:1,scope:'general',max:10,desc:'通常攻击伤害+2，可叠加10层。'},
{id:'shoot',name:'射击',cost:1,scope:'general',max:10,desc:'通常射程+1；Archer/Caster/Assassin为+2。'},
{id:'aid',name:'及时援护',cost:1,scope:'general',max:1,desc:'3格内同伴受单体攻击威胁时，可支付10魔力移动到周身代为应对，不占动作。'},
{id:'flight',name:'飞行能力',cost:2,scope:'general',max:10,desc:'每层飞行高度上限+1；开关或调整高度1战斗AP。飞行忽略周身与地形阻拦；攻击距离计平面距离加高度差。'},
{id:'antiAir',name:'禁空领域',cost:4,scope:'general',max:1,desc:'本版固定选择：压制同战场全部敌方飞行能力；无人可飞时临时获得阻断。'},
{id:'blockade',name:'阻断',cost:3,scope:'general',max:1,desc:'敌方在自身周身内后撤需2AP；Saber/Lancer/Berserker购买只需2点。'},
{id:'sweep',name:'横扫',cost:3,scope:'general',max:1,desc:'通常攻击可对周身敌人逐个结算；Saber/Berserker只需2点。'},
{id:'army',name:'一人成军',cost:3,scope:'general',max:1,desc:'同战场无存活契约友军时，周身半径+1。'},
{id:'intimidate',name:'气势凌人',cost:3,scope:'general',max:1,desc:'使用士气时掷1d4，结果4则免除本次士气消耗。'},
{id:'run',name:'狂奔',cost:1,scope:'general',max:10,desc:'冲锋距离+3。'},
{id:'extraSkill',name:'额外固有栏',cost:2,scope:'servant',max:3,desc:'从者固有技能栏+1。'},
{id:'extraNP',name:'额外宝具栏',cost:3,scope:'servant',max:2,desc:'宝具栏+1。'},
{id:'expert',name:'战斗专家',cost:2,scope:'servant',max:3,desc:'获得3点仅可购买通用特性的点数。'},
{id:'circuits',name:'魔术回路',cost:1,scope:'master',max:1,desc:'每天结束额外恢复20魔力。'},
{id:'servantHeal',name:'治愈从者',cost:1,scope:'master',max:1,desc:'每时间回合一次，日常不占操作/战斗1动作，使周身契约从者在下个时间回合开始恢复30生命。'},
{id:'sight',name:'视野感应',cost:1,scope:'master',max:1,desc:'共享自己从者的视野与无视距离的私密交流。'},
{id:'suggestion',name:'暗示魔术',cost:1,scope:'master',max:1,desc:'魔力上限+10；可对无魔术回路NPC使用暗示（本版没有普通NPC棋子）。'},
{id:'masterSlot',name:'额外技能栏',cost:3,scope:'master',max:3,desc:'御主技能栏+1。'}
];
export const traitPrice=(id,kind='servant',classId='')=>kind==='servant'&&(id==='blockade'&&['saber','lancer','berserker'].includes(classId)||id==='sweep'&&['saber','berserker'].includes(classId))?2:TRAITS.find(t=>t.id===id)?.cost;
export const TRAIT_BY_ID=Object.fromEntries(TRAITS.map(t=>[t.id,t]));
export function traitAudit(traits={},kind='servant',classId=''){const budget=kind==='master'?9:6;let roleSpent=0,generalSpent=0;for(const [id,n]of Object.entries(traits)){const t=TRAIT_BY_ID[id];if(!t||!Number.isInteger(n)||n<0||n>t.max||t.scope!=='general'&&t.scope!==kind)throw Error('特性选择或层数无效。');const cost=traitPrice(t.id,kind,classId);if(t.scope==='general')generalSpent+=cost*n;else roleSpent+=cost*n;}const bonus=kind==='servant'?(traits.expert||0)*3:0;if(roleSpent>budget||generalSpent>budget-roleSpent+bonus)throw Error(`${kind==='master'?'御主9':'从者6'}点特性预算超出，额外通用点不能购买专属特性。`);return {budget,roleBudget:budget,roleSpent,generalSpent,generalBonus:bonus,roleConvertedToGeneral:Math.max(0,generalSpent-bonus),spent:roleSpent+generalSpent,bonus,remaining:budget+bonus-roleSpent-generalSpent};}
const text=(v,n=500)=>String(v||'').trim().slice(0,n);
function selections(input,bank,slots){if(!Array.isArray(input)||input.length>slots)throw Error('技能或宝具栏位不足。');const seen=new Set();return input.map(s=>{if(!s||Object.keys(s).some(k=>!['bankId','name','lore'].includes(k)))throw Error('只能修改技能名称和渊源，不能上传效果或费用。');const item=bank[s.bankId];if(!item)throw Error('库内条目不存在。');if(seen.has(item.id))throw Error('不能重复选用同一效果。');seen.add(item.id);return {...clone(item),name:text(s.name,60)||item.name,lore:text(s.lore),originalName:item.name};});}
export function createCustomServant(draft,classId){if(!CLASS_IDS.includes(classId)||!draft||Object.keys(draft).some(k=>!['name','bio','traits','skills','nps','resources','abilities','ranks','spirit','classSkillRanks'].includes(k)))throw Error('自建卡包含不支持的字段。');const traits={...(draft.traits||{})};traitAudit(traits,'servant',classId);const base=clone(STOCK_CARDS.find(c=>c.classId===classId));const resources=validateResources(draft.resources||[]),abilities=validateAbilities(draft.abilities||[],resources),customSkills=abilities.filter(a=>a.category==='skill').map(a=>compileAbility(a,resources)),customNps=abilities.filter(a=>a.category==='noble_phantasm').map(a=>compileAbility(a,resources));const skills=selections(draft.skills||[],SKILL_BY_BANK,3+(traits.extraSkill||0)-customSkills.length);const nps=selections(draft.nps||[],NP_BY_BANK,1+(traits.extraNP||0)-customNps.length);if(customSkills.length>3+(traits.extraSkill||0)||customNps.length>1+(traits.extraNP||0))throw Error('自建技能或宝具超过可用栏位。');if(nps.length+customNps.length<1)throw Error('至少选择一件宝具。');const grades=['E','D','C','B','A','EX'];if(draft.ranks!==undefined&&(!Array.isArray(draft.ranks)||draft.ranks.length!==5||draft.ranks.some(r=>!grades.includes(r))))throw Error('五项属性须选择E至EX等级。');if(draft.spirit!==undefined&&!grades.includes(draft.spirit))throw Error('灵格须选择E至EX。');const classSkillRanks=draft.classSkillRanks||{},classKeys=classPackage(classId).map(k=>k.libraryKey);if(typeof classSkillRanks!=='object'||Array.isArray(classSkillRanks)||Object.entries(classSkillRanks).some(([key,value])=>!classKeys.includes(key)||!grades.includes(value)))throw Error('职阶技能等级无效。');const klass=classPackage(classId,[],classSkillRanks);const c={...base,id:'custom-'+classId,name:text(draft.name,60)||'无名从者',title:'自创英灵',bio:text(draft.bio,1500),traits,originTemplate:false,custom:true,sourceInfo:null,spirit:draft.spirit||'B',ranks:clone(draft.ranks||BY_ID[classId].ranks),skills:[...klass,...skills.filter(k=>!['resist','riding','solo','conceal','madness'].includes(k.libraryKey)),...customSkills,...nps,...customNps],resources,cardEngineVersion:1};if(draft.ranks){const levels=c.ranks.map(level);c.hp=[0,40,50,60,70,80,110][levels[1]]+(['saber','archer','lancer'].includes(classId)?10:0);c.mp=[0,40,50,60,70,80,110][levels[3]];c.move=levels[2]===6?8:levels[2];c.dice=levels[0]===6?8:levels[0];c.luck=[0,1,2,3,4,5,7][levels[4]];}c.hp+=10*(traits.hp||0);c.mp+=10*(traits.mp||0);c.range+=(['archer','caster','assassin'].includes(classId)?2:1)*(traits.shoot||0);c.passive=klass.map(k=>k.name+' '+k.rank).join('；');return c;}
export const MASTER_SKILLS=[
{id:'masterWeapon',name:'武具',rank:'B',phase:'battle',battleAP:1,cost:0,type:'master',onceBattle:true,desc:'本场以武具造成的伤害+6。',sourceKey:'武具'},
{id:'masterGun',name:'枪械精通',rank:'B',phase:'passive',battleAP:0,cost:0,type:'master',desc:'枪械攻击临时猛击+2；开启武具后枪械通常骰改d6；2动作精准射击+4，冷却3轮。',sourceKey:'枪械精通'},
{id:'masterRestart',name:'再启动',rank:'B',phase:'battle',battleAP:0,cost:0,type:'master',onceBattle:true,desc:'使自己的一个有轮次冷却技能缩短4轮。',sourceKey:'再启动'},
{id:'masterMedium',name:'灵媒体质',rank:'B',phase:'passive',battleAP:0,cost:0,type:'master',desc:'同战场每轮为自己的从者提供4体外魔力；同区没有气息遮蔽的灵异角色必被发现。',sourceKey:'灵媒体质'},
{id:'masterFrequency',name:'频率对接',rank:'B',phase:'both',battleAP:0,cost:10,type:'master',onceDay:true,desc:'本时间回合从者获得及时援护、主从共享视野，通常伤害+4；已有援护时另+2。',sourceKey:'频率对接'},
{id:'masterSync',name:'精神同步',rank:'B',phase:'daily',battleAP:0,cost:0,type:'master',dailyAP:3,desc:'同阵营时主从通常伤害+6并共享视野；日常3操作可令从者当天阵营与御主一致。',sourceKey:'精神同步'},
{id:'masterShroud',name:'圣骸布',rank:'B',phase:'passive',battleAP:0,cost:0,type:'master',desc:'周身恶属性目标每轮末失去6魔力；攻击恶属性目标时其应对对抗-4。',sourceKey:'圣骸布'},
{id:'masterSnipe',name:'狙击',rank:'B',phase:'battle',battleAP:0,cost:0,type:'master',cd:3,desc:'本次距离至少3格的通常攻击令目标应对对抗-7，每战两次、冷却3轮。',sourceKey:'狙击'},
{id:'masterArt',name:'死之艺术',rank:'B',phase:'passive',battleAP:0,cost:0,type:'master',desc:'通常伤害+6；自身或契约从者击杀玩家单位，永久获得2通用特性点，可在日常分配。',sourceKey:'死之艺术'},
{id:'masterEmergency',name:'应急协议',rank:'B',phase:'battle',battleAP:2,cost:0,type:'master',onceDay:true,desc:'引导2动作，获得禁空领域，并立即恢复12生命或魔力。',sourceKey:'应急协议'}
];
for(const k of MASTER_SKILLS)k.sourceText=MASTER_SOURCES[k.sourceKey];
export const MASTER_SKILL_BY_ID=Object.fromEntries(MASTER_SKILLS.map(k=>[k.id,k]));
export const DEFAULT_MASTER={name:'御主',bio:'圣杯战争的契约者。',archetype:'magus',traits:{circuits:1,servantHeal:1,sight:1,hp:2,mp:2,shoot:2},skills:['masterWeapon','masterMedium','masterFrequency']};
export function createMasterCard(draft=DEFAULT_MASTER){if(!draft||Object.keys(draft).some(k=>!['name','bio','archetype','traits','skills','resources','abilities'].includes(k)))throw Error('御主卡包含不可编辑效果字段。');const traits={...(draft.traits||{})};traitAudit(traits,'master');if(!Array.isArray(draft.skills)||draft.skills.length>3+(traits.masterSlot||0)||new Set(draft.skills).size!==draft.skills.length)throw Error('御主技能栏或选择无效。');const resources=validateResources(draft.resources||[]),abilities=validateAbilities(draft.abilities||[],resources,'master');if(draft.skills.length+abilities.length>3+(traits.masterSlot||0))throw Error('御主自建技能与原有技能合计超过栏位。');const skills=draft.skills.map(id=>{if(!MASTER_SKILL_BY_ID[id])throw Error('御主技能不在可用技能库中。');return clone(MASTER_SKILL_BY_ID[id]);});skills.push(...abilities.map(a=>compileAbility(a,resources)));const builds={magus:['E','D','D','C','D'],fighter:['C','C','C','E','D'],sniper:['D','D','C','D','C']};if(!builds[draft.archetype||'magus'])throw Error('请选择规则模板属性组。');const ranks=builds[draft.archetype||'magus'],d=level(ranks[0]);return {id:'master-card',classId:'master',class:'MASTER',name:text(draft.name,60)||'御主',title:'人类魔术师',bio:text(draft.bio,1500),gender:'未指定',alignment:'中立·中庸',traits,ranks,hp:30+level(ranks[1])*10+(traits.hp||0)*10,mp:30+level(ranks[3])*10+(traits.mp||0)*10+(traits.suggestion||0)*10,move:level(ranks[2]),dice:d,luck:level(ranks[4]),range:1+(traits.shoot||0),color:'#c5b888',skills,resources,cardEngineVersion:1,passive:'御主技能与9点特性组合。',master:true};}
export const definition=(g,u)=>u.card||BY_ID[u.servant];
export const hasLibrary=(g,u,key)=>definition(g,u).skills.find(k=>k.libraryKey===key);
