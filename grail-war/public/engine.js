import {emitRuleEvent,enqueueRuleEvent,flushRuleEvents,executeRuleClause,ruleModifierTotal,pruneRuleState} from './rule-runtime.js';
import {resolveCombatPacket,consumeRevival,hasComplexProtection,preflightDamageLinks,recordCombatEvent,redactCombatEvents,expireCombatEffects,activeCombatEffects} from './combat-mechanics.js';
import {initializeCardResources} from './card-abilities.js';
import {executeComposedAbility,redactCardResources} from './card-runtime.js';
import {lineCells,sight,attackSelection} from './targeting.js';
export {lineCells,sight};
import {horizontal,altitude,combatDistance,traitCount,bodyRadius,inBody,flightLimit,engagedBy,withdrawalCost} from './tactics.js';
import {ROSTER,CARD_BY_ID,SKILL_BANK,NP_BANK,CLASS_IDS,DEFAULT_MASTER,createMasterCard,createCustomServant,definition,hasLibrary,level,TRAIT_BY_ID} from './roster.js';
import {SERVANTS,BY_ID,SIZE,SPAWNS,terrain,REGIONS,REGION_BY_ID,WORLD_SPAWNS,TIME_SLOTS,adjacentRegions,WORLD_EDGES} from './data.js';
export const dist=combatDistance;
const uid=()=>Array.from(crypto.getRandomValues(new Uint8Array(16)),n=>n.toString(16).padStart(2,'0')).join('');
const rank=level;
const random=n=>{const a=new Uint32Array(1);crypto.getRandomValues(a);return a[0]%n+1;};
const roll=(n,s=4)=>Array.from({length:n},()=>random(s));
const total=a=>a.reduce((x,y)=>x+y,0);
const cap=(n,max)=>Math.max(0,Math.min(n,max));
const log=(g,text,type='info',audience=undefined)=>{if(audience===undefined)audience=g.phase==='battle'?g.battle?.participants:null;g.log.push({audience,day:g.day||1,timeSlot:g.timeSlot||0,stage:g.phase,round:g.phase==='battle'?g.round:0,text,type,id:++g.event});if(g.log.length>240)g.log.shift();};
export const availableMana=u=>u.mp+(u.externalMP||0);
function spendMana(g,u,n){const external=Math.min(u.externalMP||0,n);u.externalMP=(u.externalMP||0)-external;u.mp-=n-external;enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:'mp',amount:n});}
export const manaCost=(g,k,u=null)=>{let value=k.cost;if(k.id==='mind'&&u)value=5*((u.battleUses?.mind||0)+1);return value*(g.day>7?2:1);};
export const battleUnits=g=>g.units?.filter(u=>g.battle?.participants.includes(u.id)&&!g.battle?.escaped.includes(u.id))||[];
export const dailyReady=(g,u)=>g.phase==='daily'&&u?.alive&&u.dailyAP>0&&!g.dailySubmitted?.includes(u.id);
export const activeUnit=g=>g.phase==='daily'&&!g.resolvingDaily?g.units?.find(u=>dailyReady(g,u)):g.units?.find(u=>u.id===(g.phase==='daily'?g.dailyOrder?.[g.dailyTurn]:g.order?.[g.turn]));
const aliveServants=g=>g.units.filter(u=>u.alive&&u.kind!=='master');
const aliveUnits=g=>g.units.filter(u=>u.alive);
const aliveFighters=g=>battleUnits(g).filter(u=>u.alive);
function schedule(g){g.deadline=Date.now()+120000;g.botAt=Date.now()+1100;}
export function createRoom(code,name,token){return {rulesVersion:6,spiritOverrides:Object.fromEntries(SERVANTS.map(s=>[s.id,s.spirit])),code,phase:'lobby',revision:0,players:[{id:uid(),name:name.slice(0,20)||'御主',token,servant:null,cardId:null,customCard:null,masterDraft:structuredClone(DEFAULT_MASTER),spirit:null,ready:false,bot:false}],host:null,round:0,event:0,log:[],created:Date.now(),updated:Date.now()};}
export function addPlayer(g,name,token){if(g.phase!=='lobby')throw Error('战争已经开始，无法加入。');if(g.players.length>=7)throw Error('房间已满，最多七人。');const p={id:uid(),name:(name||'御主').slice(0,20),token,servant:null,cardId:null,customCard:null,masterDraft:structuredClone(DEFAULT_MASTER),spirit:null,ready:false,bot:false};g.players.push(p);return p;}
export function startGame(g,fill=false){
 if(g.phase!=='lobby')throw Error('战争已经开始。');
 if(!fill&&(g.players.length!==7||g.players.some(p=>!p.ready)))throw Error('需要七位御主全部准备。');
 if(g.players.some(p=>!p.servant||(!p.cardId&&!p.customCard)))throw Error('每位真人先抢占职阶，再选择或创建一张从者卡。');
 if(fill&&g.players.some(p=>!p.ready))throw Error('请先让所有真人玩家准备。');
 for(const s of SERVANTS)if(!g.players.some(p=>p.servant===s.id))g.players.push({id:uid(),name:`AI · ${s.title}`,servant:s.id,cardId:'zero-'+s.id,masterDraft:structuredClone(DEFAULT_MASTER),spirit:g.spiritOverrides?.[s.id]||s.spirit,bot:true,ready:true});
 g.rulesVersion=6;g.day=1;g.timeSlot=0;g.round=0;g.battle=null;g.battleSerial=0;g.leyOwners={};g.awareness={};g.pendingAttack=null;
 g.units=g.players.map(p=>{const approved=p.customCard?createCustomServant(p.customCard,p.servant):CARD_BY_ID[p.cardId];if(!approved||approved.classId!==p.servant)throw Error('从者卡与占用职阶不符。');const s=structuredClone(approved),dragon=s.skills.find(k=>k.libraryKey==='dragon'),eternal=s.skills.find(k=>k.libraryKey==='eternal');return {id:p.id,owner:p.id,kind:'servant',card:s,servant:p.servant,name:p.name,spirit:p.spirit||s.spirit,masterMP:80,masterMaxMP:80,masterHP:80,masterAlive:true,masterManaRank:'A',masterDailyAdjustment:dragon?(level(dragon.rank)>=5?10:level(dragon.rank)>=4?5:0):0,eternalRemaining:eternal?level(eternal.rank)+1:0,gold:0,dayUses:{},slotUses:{},workshop:null,region:WORLD_SPAWNS[SERVANTS.findIndex(v=>v.id===p.servant)],x:null,y:null,hp:s.hp,maxHp:s.hp,mp:s.mp,morale:dragon&&level(dragon.rank)>=3?3:2,seals:3,dailyAP:3,battleAP:0,shield:0,cd:{},buff:{},alive:true,autoMorale:false,hits:[],initiative:0};});
 g.units.push(...g.players.map(p=>{const s=createMasterCard(p.masterDraft||DEFAULT_MASTER),partner=g.units.find(u=>u.id===p.id);return {id:p.id+':master',owner:p.id,kind:'master',card:s,servant:p.servant,name:s.name,spirit:'E',region:partner.region,x:null,y:null,hp:s.hp,maxHp:s.hp,mp:s.mp,morale:s.skills.some(k=>k.id==='masterGirl')?1:2,seals:0,dailyAP:3,battleAP:0,shield:0,cd:{},buff:{},effects:[],dayUses:{},slotUses:{},battleUses:{},alive:true,autoMorale:false,hits:[],initiative:0};}));
 for(const u of g.units)initializeCardResources(u);g.fx=[];g.grail={spawned:false,region:null,holderId:null,ritual:null};g.timeIndex=0;
 g.dailyOrder=g.units.map(u=>u.id);g.dailyTurn=0;g.dailyDone=[];g.dailyStep=0;g.dailySubmitted=[];g.dailyPlans={};g.dailyConfirmed=[];g.order=[];g.turn=0;g.phase='daily';
 log(g,'七骑降临，进入大地图。每天 4 个时间回合，每人每个时间回合 3 点日常行动。','system');refreshDetection(g);beginDailyTurn(g);
}
function finishWar(g,force=false){maybeSpawnGrail(g);const alive=aliveServants(g);if(alive.length===0||force){g.phase='finished';g.pendingAttack=null;g.winner=null;log(g,force?'战争期限结束，仪式未完成，本局平局。':'从者全部退场，圣杯战争结束。','system',null);return true;}return false;}
function remove(g,u){if(u.hp<=0&&u.alive){if(u.guts>0){u.hp=Math.min(u.maxHp,u.guts);u.guts=0;if(g.lethalContexts)delete g.lethalContexts[u.id];log(g,`${definition(g,u).name} 触发一次续战。`,'skill');return;}if(consumeRevival(g,u)){log(g,`${definition(g,u).name} 触发死亡复活，恢复${u.hp}HP。`,'skill');if(g.lethalContexts)delete g.lethalContexts[u.id];return;}if(u.kind==='master')lastWill(g,u);recordCombatEvent(g,{type:'unit_died',unitId:u.id,sourceUnitId:g.lethalContexts?.[u.id]?.sourceUnitId??null});if(g.lethalContexts)delete g.lethalContexts[u.id];u.hp=0;u.alive=false;for(const [region,id] of Object.entries(g.leyOwners||{}))if(id===u.id)delete g.leyOwners[region];if(g.grail?.holderId===u.id){g.grail.holderId=null;g.grail.ritual=null;g.grail.region=u.region;grailBroadcast(g,'圣杯持有者退场，圣杯落于'+REGION_BY_ID[u.region].name+'。');}if(u.kind==='master'){const servant=ownedServant(g,u.owner);if(servant){servant.masterAlive=false;servant.orphanedAt=g.timeIndex;}}log(g,`${definition(g,u).name} ${u.kind==='master'?'死亡':'灵基消散'}。`,'death',null);maybeSpawnGrail(g);}}
function direct(g,u,n,label){if(!u.alive)return;const result=resolveCombatPacket(g,u,{kind:'damage',amount:n,reduction:0,successes:2,sourceUnitId:null,ownerPlayerId:null,tags:[]},{reductionFor:v=>combatReduction(g,v,{})});finishPacketVictims(g,result);flushRuleEvents(g);log(g,`${label}：${definition(g,u).name} 损失 ${result.damage} HP。`,'damage');}
function beginDailyTurn(g){schedule(g);log(g,`日常同步行动 ${g.dailyStep+1}/3：御主与从者各提交一次，各自确认结算，收齐后统一执行。`,'turn',null);}
function prepareDailyStep(g){
 g.dailySubmitted=[];g.dailyPlans={};g.dailyConfirmed=[];
 for(const u of aliveUnits(g)){
  if(u.dailyBusy>0){u.dailyBusy--;g.dailySubmitted.push(u.id);continue;}
  if(u.dailyDebt>0&&u.dailyAP>0){u.dailyDebt--;u.dailyAP--;g.dailySubmitted.push(u.id);log(g,`${definition(g,u).name} 因参战扣除本次日常行动点并跳过行动。`,'info',[u.owner||u.id]);}
 }
 beginDailyTurn(g);
}
export function dailyCanResolve(g,owner){const own=(g.units||[]).filter(u=>u.alive&&(u.owner||u.id)===owner);return g.phase==='daily'&&!g.dailyConfirmed?.includes(owner)&&own.length>0&&own.every(u=>u.dailyAP<=0||g.dailySubmitted?.includes(u.id))&&own.some(u=>g.dailyPlans?.[u.id]);}
function dailyComplete(g){return aliveUnits(g).every(u=>u.dailyAP<=0||g.dailySubmitted.includes(u.id))&&g.players.every(p=>p.bot||!aliveUnits(g).some(u=>(u.owner||u.id)===p.id&&g.dailyPlans?.[u.id])||g.dailyConfirmed?.includes(p.id));}
function confirmDaily(g,id){const u=g.units.find(u=>u.id===id),owner=u?.owner||u?.id;if(!dailyCanResolve(g,owner))throw Error('请先为存活的御主和从者各选择一次本次行动，再点击结算。');g.dailyConfirmed??=[];g.dailyConfirmed.push(owner);if(dailyComplete(g))resolveDailyPlans(g);}

// Plans are private until the shared barrier is reached. Validate on a copy so
// rejected submissions cannot spend resources or reveal an opponent's plan.
function submitDaily(g,id,a){
 const u=g.units.find(u=>u.id===id);if(!dailyReady(g,u))throw Error('本轮已提交或没有可用的日常行动点。');
 const probe=structuredClone(g);probe.resolvingDaily=true;probe.dailyTurn=probe.dailyOrder.indexOf(id);probe.validatingDaily=true;
 executeAction(probe,id,a);if(u.dailyAP-probe.units.find(v=>v.id===id).dailyAP>3-g.dailyStep)throw Error('本时间回合剩余同步行动次数不足以完成此动作。');
 g.dailyPlans[id]=structuredClone(a);g.dailySubmitted.push(id);
 if(dailyComplete(g))resolveDailyPlans(g);
}
function resolveDailyPlans(g){
 if(!g.dailyResolution){
  // All movement resolves before encounters, regardless of submission order.
  const priority=a=>a.type==='dailyMove'?0:['engage','dailyAmbush'].includes(a.type)?2:1;
  g.dailyResolution=Object.entries(g.dailyPlans).sort((a,b)=>priority(a[1])-priority(b[1])||g.dailyOrder.indexOf(a[0])-g.dailyOrder.indexOf(b[0]));g.dailyPlans={};g.dailyFought=[];
 }
 while(g.phase==='daily'&&g.dailyResolution.length){
  const [id,a]=g.dailyResolution.shift(),u=g.units.find(u=>u.id===id);if(!u?.alive)continue;
  if(['engage','dailyAmbush'].includes(a.type)&&g.dailyFought.includes(id))continue;
  g.dailyTurn=g.dailyOrder.indexOf(id);g.resolvingDaily=true;const before=u.dailyAP;
  try{executeAction(g,id,a);if(!['engage','dailyAmbush'].includes(a.type)){const spent=before-u.dailyAP;if(spent===0)u.dailyAP=Math.max(0,u.dailyAP-1);u.dailyBusy=Math.max(0,spent-1);}}
  catch(e){u.dailyAP=Math.max(0,u.dailyAP-1);log(g,`${definition(g,u).name} 的行动因局势变化未能执行：${e.message}`,'info',[u.owner||u.id]);}
  finally{delete g.resolvingDaily;}
 }
 if(g.phase!=='daily')return;
 delete g.dailyResolution;delete g.dailyFought;
 if(finishWar(g))return;
 g.dailyStep++;
 if(g.dailyStep>=3){advanceTime(g);return;}
 prepareDailyStep(g);if(dailyComplete(g))resolveDailyPlans(g);
}
function oweBattleAction(g,fighters){for(const u of fighters){u.dailyDebt=(u.dailyDebt||0)+1;if(g.dailyFought&&!g.dailyFought.includes(u.id))g.dailyFought.push(u.id);}}

function settleBattleDebt(g){
 for(const u of aliveUnits(g)){
  if(!(u.dailyDebt>0)||u.dailyAP<=0||u.dailyBusy>0)continue;
  if(g.dailySubmitted.includes(u.id)&&!g.dailyPlans[u.id])continue;
  u.dailyDebt--;u.dailyAP--;delete g.dailyPlans[u.id];
  if(!g.dailySubmitted.includes(u.id))g.dailySubmitted.push(u.id);
  log(g,`${definition(g,u).name} 的下一次日常行动因参战扣除 1 点并跳过。`,'info',[u.owner||u.id]);
 }
}

function advanceTime(g){
 for(const unit of aliveUnits(g))emitRuleEvent(g,{type:'time_turn_end',unitId:unit.id});if(g.timeSlot===3)for(const unit of aliveUnits(g))emitRuleEvent(g,{type:'day_end',unitId:unit.id});
 for(const [region,id] of Object.entries(g.leyOwners)){const u=g.units.find(u=>u.id===id);if(!u?.alive||u.region!==region){delete g.leyOwners[region];continue;}u.hp=cap(u.hp+30,u.maxHp);u.mp=cap(u.mp+30,definition(g,u).mp);log(g,`${definition(g,u).name} 维持 ${REGION_BY_ID[region].name} 灵脉，时间回合结束恢复 30 HP / 30 MP。`,'info',[u.id]);}
 if(g.timeSlot===3){settleMasterUpkeep(g);if(finishWar(g))return;}
 g.timeIndex=(g.timeIndex||0)+1;resolveTimeEffects(g);if(g.phase==='finished')return;
 g.timeSlot++;if(g.timeSlot>=4){g.timeSlot=0;g.day++;for(const unit of aliveUnits(g))emitRuleEvent(g,{type:'day_start',unitId:unit.id});}for(const unit of aliveUnits(g))emitRuleEvent(g,{type:'time_turn_start',unitId:unit.id});
 if(g.day>10){g.day=10;g.timeSlot=3;finishWar(g,true);return;}
 g.dailyDone=[];g.dailyTurn=0;g.dailyStep=0;for(const u of aliveUnits(g)){u.dailyAP=3;u.dailyBusy=0;u.slotUses={};}refreshDetection(g);
 log(g,`进入第 ${g.day} 天 · ${TIME_SLOTS[g.timeSlot]}。所有存活单位的日常行动点恢复为 3。`,'system');
 prepareDailyStep(g);if(dailyComplete(g))resolveDailyPlans(g);
}
export function endDailyTurn(g){if(g.phase!=='daily')throw Error('当前不是日常阶段。');if(finishWar(g))return;const u=activeUnit(g);if(u)submitDaily(g,u.id,{type:'dailyEnd'});else if(dailyComplete(g))resolveDailyPlans(g);}
function disconnectLey(g,u){if(u.workshop===u.region)u.masterDailyAdjustment=hasLibrary(g,u,'dragon')?(level(hasLibrary(g,u,'dragon').rank)>=5?10:5):0;if(g.leyOwners[u.region]===u.id){delete g.leyOwners[u.region];log(g,`${definition(g,u).name} 离开区域，灵脉连接断开。`);}}
function clearCombat(u){u.height=0;u.bodyBonus=0;u.dots=[];u.nextTags=[];u.ward=0;u.tauntUntil=0;u.battleAP=0;u.buff={};u.cd={};u.mediumRound=0;u.shield=0;u.horror=0;u.territory=null;u.hits=[];u.freeMove=false;u.effects=[];u.battleUses={};u.combatState={guards:[],floors:[],revivals:[],links:[]};u.triggerMarks={};u.mindReady=false;u.forceAttributes=false;u.mountedUntil=0;u.weaponReady=false;u.externalMP=0;u.guts=0;u.snipeReady=false;delete u.channel;}
export function startBattle(g,initiatorId,options={}){
 if(g.phase!=='daily')throw Error('只能在日常阶段发起遭遇战。');const initiator=g.units.find(u=>u.id===initiatorId);
 if(!initiator?.alive||(!g.resolvingDaily&&!dailyReady(g,initiator)))throw Error('请在可提交日常行动时发起交战。');
 const target=g.units.find(u=>u.id===(options.target||knownEnemies(g,initiatorId)[0]?.id));if(!target||!target.alive||(target.owner||target.id)===(initiator.owner||initiator.id)||target.region!==initiator.region||!detects(g,initiatorId,target.id))throw Error('需要先发现同一区域的目标才能交战。');if(options.ambush&&!canAmbush(g,initiatorId,target.id))throw Error('只有单方面发现目标时才能偷袭。');if(g.validatingDaily)return;const fighters=[initiator,target];for(const v of [...fighters]){const partner=v.kind==='master'?ownedServant(g,v.owner):ownedMaster(g,v.owner);if(partner?.alive&&partner.region===initiator.region&&!fighters.includes(partner))fighters.push(partner);}interruptRitual(g,fighters.map(u=>u.id),'进入战斗');if(fighters.every(u=>g.players.find(p=>p.id===(u.owner||u.id))?.bot))return quickAIClash(g,initiator,target,fighters);
 const battle={id:++g.battleSerial,region:initiator.region,participants:fighters.map(u=>u.id),escaped:[],resumeId:initiatorId,entryCosts:{},sneakUsers:[],opening:!!options.ambush};
 for(const [i,u] of fighters.entries()){battle.entryCosts[u.id]=0;clearCombat(u);initializeCardResources(u,true);const pos=SPAWNS[Math.floor(i*SPAWNS.length/fighters.length)];[u.x,u.y]=pos;u.initiative=random(10)+rank(definition(g,u).ranks[2]);if(u.workshop===u.region)u.territory={x:u.x,y:u.y};if(hasLibrary(g,u,'conceal'))u.firstRoundBonus=random(20)-rank(u.spirit)+level(hasLibrary(g,u,'conceal').rank)>=10?1:0;}
 oweBattleAction(g,fighters);g.battle=battle;g.phase='battle';g.round=1;g.turn=0;g.order=[...fighters].sort((a,b)=>b.initiative-a.initiative).map(u=>u.id);revealPair(g,initiator.id,target.id);if(options.ambush){g.battle.normalOrder=[...g.order];g.order=[initiator.id,target.id];g.battle.sneakUsers.push(initiator.id);}
 log(g,`${REGION_BY_ID[battle.region].name} 遭遇战 #${battle.id}：${fighters.map(u=>definition(g,u).name).join('、')} 进入独立战斗地图。发起不扣日常点；每位参战单位的下一次日常行动扣 1 点并跳过，本场只记录一次。`,'system');beginTurn(g);for(const unit of fighters)emitRuleEvent(g,{type:'battle_round_start',unitId:unit.id});for(const actor of fighters)fireCardTriggers(g,actor,'battle_round_start');if(options.ambush){initiator.battleAP=1;action(g,initiator.id,{type:'ambushAttack',x:target.x,y:target.y,openingTarget:target.id});}
}
function finishBattle(g,reason='战斗结束'){
 if(finishWar(g))return true;
 if(new Set(aliveFighters(g).map(u=>u.owner||u.id)).size>1)return false;
 const b=g.battle;g.pendingAttack=null;g.lastBattle={...b,rounds:g.round,reason};for(const id of b.participants)clearCombat(g.units.find(u=>u.id===id));
 g.battle=null;g.phase='daily';for(const unit of aliveUnits(g)){emitRuleEvent(g,{type:'battle_end',unitId:unit.id});pruneRuleState(g,unit);}g.round=0;g.order=[];g.dailyTurn=g.dailyOrder.indexOf(b.resumeId);
 log(g,`${REGION_BY_ID[b.region].name} 遭遇战结束，返回大地图，继续第 ${g.day} 天 · ${TIME_SLOTS[g.timeSlot]} 的剩余日常行动。`,'system',b.participants);
 if(!g.resolvingDaily){settleBattleDebt(g);if(g.dailyResolution||dailyComplete(g))resolveDailyPlans(g);else schedule(g);}return true;
}
export function dailyAction(g,id,a){
 if(g.phase!=='daily')throw Error('日常动作只能在大地图支付日常行动点。');const u=g.units.find(u=>u.id===id);
 if(!u?.alive||(!['engage','dailyAmbush'].includes(a.type)&&activeUnit(g)?.id!==id))throw Error('请等待自己的日常行动。');
 if(a.type==='grailPickup'||a.type==='grailRitual'){return grailAction(g,u,a);}
 if(a.type==='dailyEnd'||a.type==='end'){u.dailyAP=Math.max(0,u.dailyAP-1);return;}
 if(a.type==='engage'||a.type==='dailyAmbush'){startBattle(g,id,{target:a.target,ambush:a.type==='dailyAmbush'});return;}
 const cost=a.type==='dailySleep'?3:1;if(u.dailyAP<cost)throw Error(`日常行动点不足，需要 ${cost} 点。`);
 if(a.type==='dailyMove'){assertCanMove(g,u);
  if(!adjacentRegions(u.region).some(r=>r.id===a.region))throw Error('只能移动到相邻的大地图区域。');const beforeRegion=u.region;disconnectLey(g,u);u.region=a.region;if(u.workshop===u.region)u.masterDailyAdjustment-=10;refreshDetection(g,[beforeRegion,u.region]);log(g,`${definition(g,u).name} 日常移动至 ${REGION_BY_ID[u.region].name}，消耗 1 日常行动点。`,'info',[u.id]);
 }else if(a.type==='dailyEat'||a.type==='dailySleep'){
  if(!['hp','mp'].includes(a.resource))throw Error('请选择恢复生命或魔力。');const dice=roll(cost===3?4:1,10),amount=total(dice);u[a.resource]=cap(u[a.resource]+amount,a.resource==='hp'?u.maxHp:definition(g,u).mp);log(g,`${definition(g,u).name} ${cost===3?'休眠':'进食'}：${dice.length}d10 [${dice.join('+')}]，恢复 ${amount} ${a.resource.toUpperCase()}，消耗 ${cost} 日常行动点。`,'info',[u.id]);
 }else if(a.type==='dailyLey'){
  if(!REGION_BY_ID[u.region].ley)throw Error('当前区域没有可连接的主灵脉。');if(g.leyOwners[u.region])throw Error('此灵脉已被连接。');g.leyOwners[u.region]=u.id;log(g,`${definition(g,u).name} 连接 ${REGION_BY_ID[u.region].name} 主灵脉，消耗 1 日常行动点。`,'info',[u.id]);
 }else throw Error('这不是日常动作；移动、攻击、技能须在战斗地图支付战斗行动点。');
 u.dailyAP-=cost;schedule(g);
}
export function blocked(g,x,y,ignore){return ['void','water','building'].includes(terrain(x,y))||battleUnits(g).some(u=>u.alive&&u.id!==ignore&&u.x===x&&u.y===y);}
export function reachable(g,u,backstep=false){return reachablePaths(g,u,backstep).map(({x,y})=>({x,y}));}
export function reachablePaths(g,u,backstep=false){
 if(g.phase!=='battle'||!battleUnits(g).includes(u)||u.buff.root||g.grail?.holderId===u.id)return [];
 const s=definition(g,u),engaged=engagedBy(g,u).length>0,mounted=u.mountedUntil>=g.round;
 if(backstep&&!engaged||!backstep&&engaged&&!mounted)return [];
 const max=backstep?1:s.move+(mounted?level(s.skills.find(k=>k.id==='riding')?.rank||'E')+2:0)+(u.moveBonus||0)+effects(u,'movement',g)+ruleModifierTotal(g,u,'movement'),visited=new Map([[`${u.x},${u.y}`,0]]),q=[{x:u.x,y:u.y,d:0}],flying=altitude(u)>0;
 const occupied=(x,y)=>battleUnits(g).some(v=>v.alive&&v.id!==u.id&&v.x===x&&v.y===y);
 const wall=(x,y)=>x<0||y<0||x>=SIZE||y>=SIZE||(!flying&&['building','water','void'].includes(terrain(x,y)))||occupied(x,y);
 for(let i=0;i<q.length;i++){const a=q[i];if(a.d>=max||!backstep&&!flying&&!mounted&&a.d>0&&engagedBy(g,{...u,x:a.x,y:a.y}).length)continue;
 for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const x=a.x+dx,y=a.y+dy,key=`${x},${y}`;if(visited.has(key)||wall(x,y)||dx&&dy&&(wall(a.x+dx,a.y)||wall(a.x,a.y+dy)))continue;visited.set(key,a.d+1);q.push({x,y,d:a.d+1});}}
 return [...visited.keys()].slice(1).map(k=>{const [x,y]=k.split(',').map(Number);return {x,y,distance:visited.get(k)};});
}
function beginTurn(g){
 const u=activeUnit(g);if(!u?.alive)return;if(altitude(u)>flightLimit(g,u))u.height=flightLimit(g,u);const s=definition(g,u);u.battleAP=2+(g.round===1?(u.firstRoundBonus||0):0);u.firstHit=false;u.sealUsed=false;u.freeMove=false;delete u.buff.defense;delete u.buff.evade;
 for(const k of Object.keys(u.cd))u.cd[k]=Math.max(0,u.cd[k]-1);
 if(u.territory&&u.x===u.territory.x&&u.y===u.territory.y){u.hp=cap(u.hp+8,u.maxHp);u.mp=cap(u.mp+6,s.mp);}
 const medium=ownedMaster(g,u.owner||u.id);if(medium?.alive&&medium.mediumRound!==g.round&&battleUnits(g).includes(medium)){grantMediumMana(g,medium);medium.mediumRound=g.round;}if(u.kind!=='master'&&u.reservedAttack){addEffect(u,'allDamage',u.reservedAttack);u.reservedAttack=0;}if(u.kind!=='master'&&u.reservedDefense){addEffect(u,'allReduction',u.reservedDefense);u.reservedDefense=0;}
 if(u.horror>0){u.horror--;const targets=aliveFighters(g).filter(v=>v.id!==u.id&&(v.owner||v.id)!==(u.owner||u.id)&&dist(u,v)<=3);if(targets.length)queueAttack(g,u,{name:'巨型海魔',dice:0,bonus:10,np:true,periodic:true},targets);}
 schedule(g);log(g,`${s.class} · ${s.name} 的战斗回合：2 战斗行动点，日常剩余 ${u.dailyAP}。`,'turn');
}
export function endTurn(g){
 if(g.phase!=='battle')throw Error('当前不是战斗回合。');if(g.pendingAttack)throw Error('当前攻击还未完成属性对抗。');const u=activeUnit(g);if(u)delete u.buff.root;if(finishBattle(g))return;
 for(let i=0;i<g.order.length;i++){g.turn++;if(g.turn>=g.order.length){g.turn=0;endBattleRound(g);g.round++;for(const unit of aliveFighters(g))emitRuleEvent(g,{type:'battle_round_start',unitId:unit.id});for(const actor of aliveFighters(g))fireCardTriggers(g,actor,'battle_round_start');}if(aliveFighters(g).some(v=>v.id===g.order[g.turn]))break;}
 beginTurn(g);
}
function spendBuffs(u){u.firstHit=true;for(const k of ['damage','accuracy'])if(u.buff[k]?.n>0&&--u.buff[k].n<=0)delete u.buff[k];delete u.buff.weaken;}
function buff(g,u,key){const set=(value,n)=>u.buff.damage={value,n};switch(key){




case 'charm':for(const v of aliveFighters(g))if(v.id!==u.id&&(v.owner||v.id)!==(u.owner||u.id)&&dist(u,v)<=2)v.buff.weaken=true;set(6,2);break;

case 'conquer':u.hp=cap(u.hp+18,u.maxHp);u.buff.defense=8;break;
case 'territory':u.shield=cap(u.shield+10,30);u.territory={x:u.x,y:u.y};break;
case 'horror':u.horror=3;u.shield=cap(u.shield+15,30);break;
case 'presence':u.buff.evade=7;set(10,2);break;
case 'knowledge':u.hp=cap(u.hp+8,u.maxHp);u.mp=cap(u.mp+15,definition(g,u).mp);delete u.buff.root;delete u.buff.weaken;break;
case 'hundred':u.shield=cap(u.shield+22,30);u.buff.accuracy={value:4,n:3};set(8,3);break;

case 'glory':delete u.buff.weaken;delete u.buff.root;u.shield=cap(u.shield+10,30);u.buff.evade=3;break;
}}
const immediateDaily=new Set(['seal','supply','autoMorale','grailDrop','allocateEarned','engage','dailyAmbush']);
export function action(g,id,a){
 if(a.type==='dailyResolve')return confirmDaily(g,id);
 const unit=g.units?.find(u=>u.id===id),freeDaily=g.phase==='daily'&&a.type==='skill'&&unit&&definition(g,unit).skills?.some(k=>k.id===a.skill&&k.compose&&(k.dailyAP||0)===0);
 if(g.phase==='daily'&&!g.resolvingDaily&&!immediateDaily.has(a.type)&&!freeDaily)return submitDaily(g,id,a);
 const result=executeAction(g,id,a);if(['skill','masterSkill','ruleClause'].includes(a.type))enqueueRuleEvent(g,{type:'skill_used',unitId:id,skillId:a.skill});flushRuleEvents(g);return result;
}
function executeAction(g,id,a){
 const u=g.units?.find(u=>u.id===id);if(!u?.alive)throw Error('你的从者已经退场。');
 if(a.type==='ruleClause'){const k=definition(g,u).skills.find(k=>k.id===a.skill&&k.rule);if(!k)throw Error('unknown_rule_ability');return executeRuleClause(g,u,k,a.clause,a);}
 if(a.type==='releaseNP')return releaseChannel(g,u,a);if(a.type==='counter')return counterAttack(g,u,a);if(a.type==='flight')return changeFlight(g,u,a);if(a.type==='morale')return moraleResponse(g,u,a);if(a.type==='aid'){return timelyAid(g,u);}if(a.type==='grailDrop'){return grailAction(g,u,a);}
 if(a.type==='useDefense')return useDefenseAbility(g,u,a);
 if(a.type==='seal'){return commandSeal(g,u,a);}
 if(a.type==='allocateEarned')return allocateEarned(g,u,a);if(a.type==='masterSkill'||a.type==='masterTrait')return masterAbility(g,u,a);
 if(a.type==='channel'){if(g.phase!=='battle'||g.pendingAttack||!battleUnits(g).includes(u))throw Error('当前不能继续引导。');continueChannel(g,u);return;}if(a.type==='cancelChannel'){delete u.channel;return;}
 if(a.type==='skill'&&definition(g,u).skills.find(k=>k.id===a.skill)&&((definition(g,u).skills.find(k=>k.id===a.skill).chant||0)>0||definition(g,u).skills.find(k=>k.id===a.skill).np&&definition(g,u).skills.find(k=>k.id===a.skill).type==='attack')){if(g.phase!=='battle'||activeUnit(g)?.id!==u.id||g.pendingAttack)throw Error('请在自己的战斗回合引导。');return beginChannel(g,u,definition(g,u).skills.find(k=>k.id===a.skill),a);}
 if(a.type==='skill'&&definition(g,u).skills.find(k=>k.id===a.skill)?.type==='composed')return useComposedAbility(g,u,a);
 if(a.type==='skill'&&definition(g,u).skills.find(k=>k.id===a.skill)?.type==='adapted')return adaptedAbility(g,u,a);
 if(a.type==='supply'){if(u.kind==='master')throw Error('请切换到需要魔力的从者。');const account=ownedMaster(g,u.owner||u.id);if(account){if(!account.alive||!Number.isInteger(a.amount)||a.amount<1||a.amount>account.mp||u.mp+a.amount>definition(g,u).mp)throw Error('御主供魔数量无效。');account.mp-=a.amount;u.mp+=a.amount;syncMasterAccount(g,u.owner);return;}if(!['daily','battle'].includes(g.phase)||!u.masterAlive||(g.pendingAttack?decisionUnit(g)?.id:activeUnit(g)?.id)!==id)throw Error('只能在自己行动或应对时取得御主同意后供魔。');const n=a.amount;if(!Number.isInteger(n)||n<1||n>u.masterMP||u.mp+n>definition(g,u).mp)throw Error('供魔数量超出御主库存或从者上限。');u.masterMP-=n;u.mp+=n;log(g,`${definition(g,u).name} 获得御主同意，按1:1转入${n} MP。`,'info',[id]);return;}
 if(a.type==='autoMorale'&&['daily','battle'].includes(g.phase)){u.autoMorale=!!a.enabled;return;}
 if(u.channel&&!['seal','channel','cancelChannel','autoMorale','end'].includes(a.type))throw Error('引导期间不能执行其他动作。');
 if(a.type==='skill'&&a.skill==='resist')return useLibrary(g,u,a);if(g.pendingAttack){if(a.type!=='respond')throw Error('请先完成当前攻击的属性选择。');return respondAttack(g,id,a);}if(a.type==='skill'&&definition(g,u).skills.find(k=>k.id===a.skill)?.libraryKey)return useLibrary(g,u,a);if(g.phase==='daily')return dailyAction(g,id,a);
 if(g.phase!=='battle')throw Error('当前不在战斗中。');
 if(!battleUnits(g).includes(u))throw Error('你的从者未参加本场战斗，只能观战。');
 if(activeUnit(g)?.id!==id)throw Error('请等待自己的战斗回合。');
 let movementEvent=null;const s=definition(g,u);if(a.type==='end'){endTurn(g);return;}
 const free=a.type==='move'&&u.freeMove,sk=a.type==='skill'?s.skills.find(k=>k.id===a.skill):null;
 if(a.type==='skill'&&!sk)throw Error('未知技能。');const ap=free?0:a.type==='backstep'?withdrawalCost(g,u):a.type==='preciseAttack'?2:(sk?.battleAP??1);
 if(u.battleAP<ap)throw Error('战斗行动点不足。');if(sk&&(availableMana(u)<manaCost(g,sk,u)||u.cd[sk.id]>0))throw Error('魔力不足，或技能仍在冷却。');
 if(a.type==='retreat'){assertCanMove(g,u);
  if(u.x!==0&&u.y!==0&&u.x!==SIZE-1&&u.y!==SIZE-1)throw Error('需要先移动到战斗地图最外围才能撤退。');
  if(!adjacentRegions(g.battle.region).some(r=>r.id===a.region))throw Error('请选择相邻的大地图区域作为撤退方向。');
  disconnectLey(g,u);const oldRegion=u.region;u.region=a.region;if(u.workshop===u.region)u.masterDailyAdjustment=-10;refreshDetection(g,[oldRegion,u.region]);loseMorale(g,u,g.battle.sneakUsers.includes(u.id)?2:1);u.battleAP-=ap;enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:'ap',amount:ap});g.battle.escaped.push(u.id);
  log(g,`${s.name} 消耗 1 战斗行动点撤退至 ${REGION_BY_ID[u.region].name}，失去 1 士气，不追加日常费用。`);
  if(!finishBattle(g))endTurn(g);return;
 }
 if(a.type==='move'||a.type==='backstep'||a.type==='charge'){assertCanMove(g,u);
  if(!Number.isInteger(a.x)||!Number.isInteger(a.y)||!(a.type==='charge'?chargeCells(g,u):reachable(g,u,a.type==='backstep')).some(p=>p.x===a.x&&p.y===a.y))throw Error('无法移动至该位置。');
  movementEvent={type:'after_move',unitId:u.id,cells:a.type==='charge'?horizontal(u,a):(reachablePaths(g,u,a.type==='backstep').find(p=>p.x===a.x&&p.y===a.y)?.distance||0)};u.x=a.x;u.y=a.y;u.freeMove=false;log(g,`${s.name} 战斗移动至 ${String.fromCharCode(65+u.x)}${u.y+1}，消耗 ${ap} 战斗行动点。`);
 }else if(a.type==='attack'||a.type==='preciseAttack'||a.type==='sweep'||a.type==='ambushAttack'||sk){
  if(a.type==='preciseAttack'&&(!hasMasterSkill(u,'masterGun')||u.cd.precise>0))throw Error('精准射击需要枪械精通且冷却已结束。');const attack=sk||{range:s.range,dice:s.dice,name:a.type==='preciseAttack'?'精准射击':'通常攻击',bonus:a.type==='preciseAttack'?4:0};
  if(attack.type==='buff'||attack.type==='summon'){buff(g,u,attack.effect);log(g,`${s.name} 发动 ${attack.name}，消耗 ${ap} 战斗行动点 / ${manaCost(g,attack)} MP。`,'skill');}
  else{
   if(a.type==='sweep'&&!(u.kind!=='master'&&u.servant==='lancer'||traitCount(u,'sweep')))throw Error('该角色没有横扫。');const opening=a.type==='ambushAttack'&&g.battle.opening;const openingTarget=g.units.find(v=>v.id===a.openingTarget);const selected=attackSelection(g,u,attack,opening?openingTarget:{x:a.x,y:a.y},{opening,sweep:a.type==='sweep'});
   if(!selected.valid)throw Error(selected.reason);queueAttack(g,u,{...attack,sneak:opening},selected.targets);
  }
  if(a.type==='preciseAttack')u.cd.precise=3;if(sk){spendMana(g,u,manaCost(g,sk,u));u.cd[sk.id]=sk.cd;}
 }else throw Error('这不是战斗动作；日常移动、进食、休眠只能在大地图执行。');
 u.battleAP-=ap;enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:'ap',amount:ap});if(movementEvent){flushRuleEvents(g);emitRuleEvent(g,movementEvent);fireCardTriggers(g,u,'after_move');}if(g.pendingAttack?.failed){completeAttack(g);return;}if(finishBattle(g))return;g.botAt=Date.now()+1100;
}
function worldDistance(from,to){const q=[[from,0]],seen=new Set([from]);while(q.length){const [v,d]=q.shift();if(v===to)return d;for(const n of adjacentRegions(v))if(!seen.has(n.id)){seen.add(n.id);q.push([n.id,d+1]);}}return Infinity;}
export function botAction(g,actorId=null){
 if(g.pendingAttack?.stage==='moraleChoice'){respondAttack(g,decisionUnit(g).id,{useMorale:true});return;}if(g.pendingAttack){const u=decisionUnit(g);respondAttack(g,u.id,{useMorale:false,attribute:bestAttribute(g,u,g.units.find(v=>v.id===(g.pendingAttack.attacker===u.id?g.pendingAttack.target:g.pendingAttack.attacker))),useEternal:false,instinct:false});return;}const u=actorId?g.units.find(u=>u.id===actorId):activeUnit(g);if(!u?.alive)return;const s=definition(g,u);
 if(g.phase==='daily'){
  if(g.grail?.spawned){if(g.grail.holderId===u.id){if(!g.grail.ritual)action(g,u.id,{type:'grailRitual'});else action(g,u.id,{type:'dailyEnd'});return;}if(!g.grail.holderId&&g.grail.region===u.region){action(g,u.id,{type:'grailPickup'});return;}}
  if(u.dailyAP<=0){endDailyTurn(g);return;}
  if(u.hp<u.maxHp*.35){action(g,u.id,{type:u.dailyAP===3?'dailySleep':'dailyEat',resource:'hp'});return;}
  if(availableMana(u)<s.mp*.25){action(g,u.id,{type:u.dailyAP===3?'dailySleep':'dailyEat',resource:'mp'});return;}
  const known=knownEnemies(g,u.id);if(known.length){action(g,u.id,{type:canAmbush(g,u.id,known[0].id)?'dailyAmbush':'engage',target:known[0].id});return;}
  const roads=adjacentRegions(u.region);if(g.grail?.spawned&&g.grail.region!==u.region&&u.dailyAP>0){const dest=[...roads].sort((a,b)=>worldDistance(a.id,g.grail.region)-worldDistance(b.id,g.grail.region))[0];action(g,u.id,{type:'dailyMove',region:dest.id});return;}const options=roads.filter(v=>v.id!==u.previousRegion);const next=(options.length?options:roads)[random((options.length?options:roads).length)-1];u.previousRegion=u.region;
  action(g,u.id,{type:'dailyMove',region:next.id});return;
 }
 if(g.phase!=='battle')return;if(g.grail?.holderId===u.id){grailAction(g,u,{type:'grailDrop'});return;}if(u.channel){if(u.channel.ready){const k=definition(g,u).skills.find(k=>k.id===u.channel.skillId),t=aliveFighters(g).find(v=>v.owner!==u.owner&&dist(u,v)<=k.range&&sight(u,v));if(t)releaseChannel(g,u,{x:t.x,y:t.y});else{delete u.channel;endTurn(g);}}else if(u.battleAP>0)continueChannel(g,u);else endTurn(g);return;}const target=aliveFighters(g).filter(v=>v.id!==u.id&&(v.owner||v.id)!==(u.owner||u.id)).sort((a,b)=>dist(u,a)-dist(u,b)||a.hp-b.hp)[0];if(!target)return;
 if(u.battleAP<=0){endTurn(g);return;}if(g.round>=30&&botWithdraw(g,u))return;
 if(u.hp<u.maxHp*.35&&u.seals>0&&ownedMaster(g,u.owner||u.id)?.alive){action(g,u.id,{type:'seal',choice:'heal'});return;}
 const usable=s.skills.filter(k=>k.type==='attack'&&u.battleAP>=k.battleAP&&availableMana(u)>=manaCost(g,k)&&!u.cd[k.id]&&dist(u,target)<=k.range&&sight(u,target));
 if(usable.length){const k=usable.sort((a,b)=>(b.dice*2.5+b.bonus)/b.battleAP-(a.dice*2.5+a.bonus)/a.battleAP)[0];action(g,u.id,{type:'skill',skill:k.id,x:target.x,y:target.y});return;}
 if(dist(u,target)<=s.range&&sight(u,target)){action(g,u.id,{type:'attack',x:target.x,y:target.y});return;}
 const path=pathToEnemy(g,u,target),distance=p=>path.get(`${p.x},${p.y}`)??Infinity;const positions=reachable(g,u,engagedBy(g,u).length>0).sort((a,b)=>distance(a)-distance(b)||dist(a,target)-dist(b,target));
 if(positions.length&&distance(positions[0])<distance(u)&&u.battleAP>=(engagedBy(g,u).length?withdrawalCost(g,u):1)){action(g,u.id,{type:engagedBy(g,u).length?'backstep':'move',...positions[0]});return;}endTurn(g);
}
export function tick(g,now=Date.now()){
 if(!['daily','battle'].includes(g.phase))return false;
 if(now>=g.deadline&&g.pendingAttack){const u=decisionUnit(g);respondAttack(g,u.id,{useMorale:false,attribute:bestAttribute(g,u,g.units.find(v=>v.id===g.pendingAttack.attacker)),instinct:false,useEternal:false});return true;}if(now>=g.deadline){log(g,`${g.phase==='daily'?'日常行动':'战斗回合'}超时，自动结束。`);if(g.phase==='daily'){for(const u of g.units.filter(u=>dailyReady(g,u))){g.dailyPlans[u.id]={type:'dailyEnd'};g.dailySubmitted.push(u.id);}resolveDailyPlans(g);}else endTurn(g);return true;}
 const u=g.phase==='daily'?g.units.find(u=>dailyReady(g,u)&&g.players.find(p=>p.id===(u.owner||u.id))?.bot):decisionUnit(g),p=g.players.find(p=>p.id===(u?.owner||u?.id));if(p?.bot&&now>=g.botAt){botAction(g,u?.id);g.botAt=now+1100;return true;}return false;
}

export const detects=(g,observer,target)=>{const a=g.units.find(u=>u.id===observer),b=g.units.find(u=>u.id===target);if(!a||!b)return false;if((a.owner||a.id)===(b.owner||b.id))return true;if(a.region!==b.region)return false;if(g.grail?.holderId===target)return true;if(g.awareness?.[observer]?.[target])return true;const m=ownedMaster(g,a.owner||a.id),partner=a.kind==='master'?ownedServant(g,a.owner):m;return !!(partner?.alive&&partner.region===b.region&&(definition(g,m||a).traits?.sight||m?.shareSightUntil>=g.timeIndex||hasMasterSkill(m||a,'masterSync')&&definition(g,m).alignment===definition(g,ownedServant(g,m.owner)).alignment)&&g.awareness?.[partner.id]?.[target]);};
export const knownEnemies=(g,id)=>aliveUnits(g).filter(u=>u.id!==id&&(u.owner||u.id)!==(g.units.find(v=>v.id===id)?.owner||id)&&detects(g,id,u.id));
export const canAmbush=(g,a,b)=>detects(g,a,b)&&!detects(g,b,a);
function revealPair(g,a,b){g.awareness[a]??={};g.awareness[b]??={};g.awareness[a][b]=true;g.awareness[b][a]=true;}
export function refreshDetection(g,regions=null){
 g.awareness??={};for(const a of aliveUnits(g)){g.awareness[a.id]??={};for(const b of aliveUnits(g)){if(a.id===b.id)continue;if(a.region!==b.region){delete g.awareness[a.id][b.id];continue;}if(g.awareness[a.id][b.id]===true||regions&&g.awareness[a.id][b.id]!==undefined)continue;
 const conceal=hasLibrary(g,b,'conceal')?level(hasLibrary(g,b,'conceal').rank):0,die=random(20),value=die-(b.kind==='master'?0:rank(b.spirit))+conceal,found=hasMasterSkill(a,'masterMedium')&&b.kind!=='master'&&!hasLibrary(g,b,'conceal')||value<10;g.awareness[a.id][b.id]=found;
 log(g,found?`魔力波动：1d20(${die})−目标灵格${rank(b.spirit)}＋气息遮蔽${conceal}=${value}<10；发现 ${definition(g,b).name}。`:'魔力波动判定完成，未获得新的目标定位。','detection',[a.id]);
 }}
}
function effects(u,kind,g){return (u.effects||[]).filter(e=>e.kind===kind&&(e.until===undefined||e.until>=g.round)).reduce((n,e)=>n+e.value,0);}
export function attributeBonus(g,u,index){let n=ruleModifierTotal(g,u,'contest')+definition(g,u).luck+(u.buff.accuracy?.n>0?u.buff.accuracy.value:0)+(u.buff.evade||0)+effects(u,'contest',g);
 if(hasLibrary(g,u,'madness'))n+=Math.min(5,level(hasLibrary(g,u,'madness').rank));if(index===3&&definition(g,u).skills.some(k=>['charisma','pollution'].includes(k.libraryKey)))n+=3;
 const dragon=hasLibrary(g,u,'dragon');if(dragon&&((index===0&&level(dragon.rank)>=4)||(index===1&&level(dragon.rank)>=5)||(index===3&&level(dragon.rank)>=6)))n+=5;return n;
}
export function attributeContest(g,a,b,index,flags={}){
 let cancelA=flags.cancelA||false,cancelB=flags.cancelB||false;
 if(flags.eternal){cancelA=cancelB=true;}
 let ar,br,av,bv,rerolls=0;do{ar=roll(rank(definition(g,a).ranks[index]),6);br=roll(rank(definition(g,b).ranks[index]),6);av=total(ar)+(cancelA?0:attributeBonus(g,a,index)+(flags.attackBonus||0));bv=total(br)+(cancelB?0:attributeBonus(g,b,index)+(flags.defendBonus||0));rerolls++;}while(av===bv&&rerolls<100);
 recordContest(g,a,b,index,ar,br,av,bv);
 // A tie after the bounded retry window has no success; never hangs with a broken RNG.
 return {index,attackerDice:ar,defenderDice:br,attackerTotal:av,defenderTotal:bv,attackerSuccess:av>bv,rerolls:rerolls-1,text:`${['筋力','耐久','敏捷','魔力','幸运'][index]}：攻击方 [${ar.join('+')}]${cancelA?'+0':'＋加值'}=${av}，防守方 [${br.join('+')}]${cancelB?'+0':'＋加值'}=${bv}${rerolls>1?'（同值重掷 '+(rerolls-1)+' 次）':''}`};
}
export const finalDamage=(raw,reduction,successes,shield=0)=>{const base=Math.max(0,raw-reduction),scaled=Math.floor(base*successes/2),absorbed=Math.min(shield,scaled);return {base,scaled,absorbed,hp:scaled-absorbed,factor:successes*50};};
export function decisionUnit(g){const p=g.pendingAttack;if(!p)return activeUnit(g);if(p.stage==='sneakModifier')return g.units.find(u=>u.id===p.modifierOwner);const id=['defender','part','defendModifier','instinctChoice','defenderReaction','moraleChoice','unrespondableReaction','hpLossReaction'].includes(p.stage)?p.target:p.controller||p.attacker;return g.units.find(u=>u.id===id);}
export function bestAttribute(g,u,enemy){return definition(g,u).ranks.map((r,i)=>rank(r)*3.5+attributeBonus(g,u,i)-(enemy?rank(definition(g,enemy).ranks[i])*3.5+attributeBonus(g,enemy,i):0)).reduce((best,v,i,arr)=>v>arr[best]?i:best,0);}
function queueAttack(g,a,skill,targets,controller=null){
 preflightDamageLinks(g,targets);
 emitRuleEvent(g,{type:'attack_declared',unitId:a.id,attackId:'declared-'+g.event,target_count:targets.length,segments:skill.mechanics?.segments||1});
 const taunters=aliveFighters(g).filter(v=>v.owner!==a.owner&&v.tauntUntil>=g.round&&dist(a,v)<=skill.range&&sight(a,v));if(!skill.shape&&taunters.length&&!targets.some(v=>taunters.includes(v)))throw Error('受嘲讽影响，单体攻击须优先指定可攻击到的嘲讽者。');
 emitFX(g,a,skill,targets);

 for(const target of targets)if(target.channel){delete target.channel;log(g,`${definition(g,target).name} 遭到攻击威胁，宝具引导中断。`,'skill');}
 const p={id:uid(),attacker:a.id,controller,skill:{...skill},targets:targets.map(v=>v.id),position:0,target:targets[0].id,stage:'defender',checks:[],reaction:{},raw:null};g.pendingAttack=p;p.chainId=p.id;p.segment=1;p.segments=skill.mechanics?.segments||1;p.terminatedTargets=[];setAttackWindow(g,p);if(a.forceAttributes&&!p.skipContest&&!skill.sneak&&rank(targets[0].spirit)>rank(a.spirit)){p.overrideDef=true;p.stage='defenderReaction';a.forceAttributes=false;}
 if(skill.sneak&&!p.skipContest){const holder=[a,targets[0]].find(u=>hasLibrary(g,u,'eternal')&&u.eternalRemaining>0);if(holder){p.stage='sneakModifier';p.modifierOwner=holder.id;}else runSneakContest(g,p,false);}
 schedule(g);
}
function useEternal(g,u,enabled){if(!enabled)return false;if(!hasLibrary(g,u,'eternal')||u.eternalRemaining<=0)throw Error('没有可用的无穷武炼次数。');u.eternalRemaining--;log(g,`${definition(g,u).name} 启用无穷武炼，本次双方取消包括幸运在内的全部加值。`,'skill');return true;}
function useInstinct(g,u,p,a){if(!a.instinct||p.reaction.instinctDone)return false;const tier=a.instinctTier??5;if(!hasLibrary(g,u,'instinct')||!Number.isInteger(tier)||tier<1||tier>level(hasLibrary(g,u,'instinct').rank))throw Error('无效的直感等级。');const cost=[0,10,12,14,16,18,20][tier]*(g.day>7?2:1);if(availableMana(u)<cost)throw Error('直感所需魔力不足。');spendMana(g,u,cost);p.reaction.instinctDone=true;const die=random(6),reduction=2+tier*2,bonus=tier*2;p.reaction.instinctDie=die;
 log(g,`直感：消耗 ${cost} MP，1d6=${die}。`,'skill');if(die===3||die===4)p.reaction.reduction=reduction;if(die===5)p.reaction.bonus=bonus;if(die===6){if(!p.skill.np)p.reaction.immune=true;else{p.stage='instinctChoice';p.reaction.instinctReduction=reduction;p.reaction.instinctBonus=bonus;return true;}}return false;
}
function resolveCheck(g,p,index,eternal=false,part=false){
 const a=g.units.find(u=>u.id===p.attacker),b=g.units.find(u=>u.id===p.target);let cancelA=false;if(b.mindReady&&!part){cancelA=true;b.mindReady=false;}
 const debuff=a.snipeReady&&dist(a,b)>=3?-7:0;const shroud=hasMasterSkill(a,'masterShroud')&&definition(g,b).alignment?.includes('恶')?-4:0;const result=attributeContest(g,a,b,index,{eternal,cancelA,defendBonus:(p.reaction.bonus||0)+debuff+shroud});
 log(g,`${part?'偷袭部位前置':'属性对抗 '+(p.checks.length+1)}：${result.text}；攻击方${result.attackerSuccess?'成功':'失败'}。`,'damage');
 if(part){if(!result.attackerSuccess){log(g,'部位攻击前置对抗失败，本次伤害 0%。','damage');nextAttackTarget(g);return;}p.checks=[{attackerSuccess:true,skipped:true}];p.stage='attacker';}
 else{p.checks.push(result);if(p.checks.length===1)p.stage='attacker';else settleAttack(g);}
 schedule(g);
}
export function respondAttack(g,id,a){
 const p=g.pendingAttack;if(!p||decisionUnit(g)?.id!==id)throw Error('现在应由对应的玩家选择属性或反应。');const u=g.units.find(u=>u.id===id),index=a.attribute;
 for(const [key,group] of [['protectionId','guards'],['revivalId','revivals']])if(a[key]!==undefined){if(id!==p.target||a[key]!==''&&!activeCombatEffects(g,u,group).some(e=>e.id===a[key]))throw Error('无效的防护选择。');p.reaction[key]=a[key];}
 if(['unrespondableReaction','hpLossReaction'].includes(p.stage)){if(a.instinct&&p.stage==='hpLossReaction')throw Error('直接生命流失不是伤害，不能触发直感伤害反应。');if(p.stage==='unrespondableReaction'&&useInstinct(g,u,p,a)){schedule(g);return;}p.moraleDone=true;return settleAttack(g);}
 if(p.stage==='sneakModifier'){const forced=useEternal(g,u,a.useEternal);runSneakContest(g,p,forced);if(p.failed)completeAttack(g);else schedule(g);return;}
 if(p.fixedContest){const forced=useEternal(g,u,a.useEternal),attacker=g.units.find(v=>v.id===p.attacker),target=g.units.find(v=>v.id===p.target),result=attributeContest(g,attacker,target,3,{eternal:forced});g.pendingAttack=null;log(g,`精神污染魔力对抗：${result.text}；${result.attackerSuccess?'成功':'失败'}。`,'skill');if(result.attackerSuccess)applyControl(g,attacker,target,p.control);schedule(g);return;}
 if(p.stage==='moraleChoice'){if(a.useMorale){if(!p.checks.some(c=>c.attackerSuccess))throw Error('没有失败应对可更改。');useMorale(g,u);const i=p.checks.findIndex(c=>c.attackerSuccess);p.checks[i].attackerSuccess=false;p.checks[i].morale=true;}p.moraleDone=true;return settleAttack(g);}
 if(p.stage==='instinctChoice'){a.instinctChoice??='reduction';if(!['reduction','contest'].includes(a.instinctChoice))throw Error('请选择直感的宝具应对效果。');if(a.instinctChoice==='reduction')p.reaction.reduction=p.reaction.instinctReduction;else p.reaction.bonus=p.reaction.instinctBonus;p.stage=p.skipContest?(p.skill.mechanics?.kind==='hp_loss'?'hpLossReaction':'unrespondableReaction'):p.overrideDef?'defenderReaction':'defender';schedule(g);return;}
 if(['attackModifier','defendModifier'].includes(p.stage)){const forced=useEternal(g,u,a.useEternal);const stage=p.afterModifier,index=p.chosenAttribute;delete p.afterModifier;delete p.chosenAttribute;resolveCheck(g,p,index,forced,stage==='part');return;}
 if(p.stage==='defenderReaction'){if(useInstinct(g,u,p,a)){schedule(g);return;}p.stage='overrideDefender';schedule(g);return;}
 if(!Number.isInteger(index)||index<0||index>4)throw Error('请选择筋力、耐久、敏捷、魔力或幸运。');
 if(p.stage==='defender'&&useInstinct(g,u,p,a)){p.deferredAttribute=index;schedule(g);return;}
 const isDefense=['defender','part'].includes(p.stage),other=g.units.find(v=>v.id===(isDefense?p.attacker:p.target));
 const forced=useEternal(g,u,a.useEternal);
 if(!forced&&hasLibrary(g,other,'eternal')&&other.eternalRemaining>0){p.afterModifier=p.stage;p.chosenAttribute=index;p.stage=isDefense?'attackModifier':'defendModifier';schedule(g);return;}
 resolveCheck(g,p,index,forced,p.stage==='part');
}
function attackRaw(g,a,sk){const s=definition(g,a),dice=roll(sk.dice??s.dice,!sk.id&&hasMasterSkill(a,'masterGun')&&a.weaponReady?6:4);let bonus=ruleModifierTotal(g,a,'damage')+(sk.bonus||0)+(a.gold||0)+effects(a,'allDamage',g)+(!sk.id?(definition(g,a).traits?.strike||0)*2:0);if(!sk.id&&hasMasterSkill(a,'masterArt'))bonus+=6;if(a.weaponReady)bonus+=6;if(!sk.id&&hasMasterSkill(a,'masterGun'))bonus+=Math.max(0,Math.min(10,(s.traits?.strike||0)+1)-(s.traits?.strike||0))*2;
 if(hasLibrary(g,a,'solo')&&a.soloRound!==g.round&&!aliveUnits(g).some(v=>v.id!==a.id&&(v.owner||v.id)===(a.owner||a.id)&&v.region===a.region))bonus+=5;
 if(a.buff.damage?.n>0)bonus+=a.buff.damage.value;if(a.buff.weaken)bonus-=6;const master=ownedMaster(g,a.owner||a.id);if(!sk.id&&master?.alive&&hasMasterSkill(master,'masterSync')&&definition(g,master).alignment===definition(g,a).alignment)bonus+=6;if(!sk.id&&a.kind==='master'&&hasMasterSkill(a,'masterSync')&&ownedServant(g,a.owner)?.card?.alignment===definition(g,a).alignment)bonus+=6;
 if(!sk.id&&a.frequencyUntil>=g.timeIndex)bonus+=a.frequencyBonus||4;bonus+=effects(a,sk.id?'specialDamage':'normalDamage',g);if(sk.id)bonus+=effects(a,'specialNext',g);
 return {dice,sides:!sk.id&&hasMasterSkill(a,'masterGun')&&a.weaponReady?6:4,bonus,raw:Math.max(0,total(dice)+bonus)};
}
function settleAttack(g){
 const p=g.pendingAttack;p.chainId??=p.id;p.segment??=1;p.segments??=1;p.terminatedTargets??=[];p.segmentId??=p.id+':0:1';const a=g.units.find(u=>u.id===p.attacker),b=g.units.find(u=>u.id===p.target),sk=p.skill;
 let wins=p.skipContest?2:p.checks.filter(v=>v.attackerSuccess).length;if(!p.skipContest&&!p.moraleDone&&wins>0&&!p.reaction.immune&&!(g.sealEffects?.[a.id]?.unavoidable?.time===g.timeIndex&&g.sealEffects[a.id].unavoidable.round===g.round)){if(b.autoMorale&&b.morale>0){useMorale(g,b);p.checks.find(c=>c.attackerSuccess).attackerSuccess=false;p.moraleDone=true;wins--;}else if(b.morale>0&&!g.players.find(v=>v.id===(b.owner||b.id))?.bot){p.stage='moraleChoice';schedule(g);return;}}const af=g.sealEffects?.[a.id]?.unavoidable,bf=g.sealEffects?.[b.id]?.defend,forcedA=af?.time===g.timeIndex&&af.round===g.round,forcedB=!p.skipContest&&bf?.time===g.timeIndex&&bf.round===g.round;if(forcedA&&!forcedB)wins=2;if(forcedB&&!forcedA)wins=0;
 if((sk.dispel||a.buff.next_dispel)&&wins>0&&!p.reaction.immune){b.buff={root:b.buff.root};b.effects=[];b.shield=0;}
 const sourceExists=!sk.mechanics?.tags?.includes('sourceless'),pureLoss=sk.mechanics?.kind==='hp_loss',rolled=pureLoss?{raw:sk.mechanics.hpLossAmount,dice:[],sides:4,bonus:sk.mechanics.hpLossAmount}:sourceExists?attackRaw(g,a,sk):{dice:roll(sk.dice||0,4),sides:4,bonus:sk.bonus||0};if(rolled.raw===undefined)rolled.raw=total(rolled.dice)+rolled.bonus;if(sk.tags?.includes('hunter')&&(b.dot||b.buff.root||b.buff.weaken))rolled.raw+=8;if(sk.dragon&&b.servant==='saber')rolled.raw+=8;if(sk.clones)rolled.raw+=Math.min(8,aliveFighters(g).filter(v=>v.id!==a.id&&dist(a,v)<=2).length*2);
 const reduction=combatReduction(g,b,sk)+(p.reaction.reduction||0),packet={kind:pureLoss?'hp_loss':'damage',amount:rolled.raw,hpLoss:wins>0?(sk.mechanics?.hpLoss||0):0,damageType:sk.mechanics?.damageType||'normal',tags:sk.mechanics?.tags||[],reduction,successes:wins,immune:!!p.reaction.immune,sourceUnitId:sourceExists?a.id:null,ownerPlayerId:a.owner||a.id,attackId:p.chainId,segmentId:p.segmentId,protectionId:p.reaction.protectionId,revivalId:p.reaction.revivalId};
 const resolved=resolveCombatPacket(g,b,packet,{reductionFor:v=>combatReduction(g,v,sk)}),result={base:resolved.base,scaled:resolved.scaled,absorbed:resolved.absorbed,factor:(p.reaction.immune&&!packet.tags.includes('pierce_invincibility')?0:wins)*50},damage=resolved.damage;b.ward=0;
 if(resolved.killed)p.terminatedTargets.push(b.id);markPacketTermination(p,resolved);
 if(pureLoss)log(g,`${definition(g,b).name} 直接生命流失${resolved.hpLoss}（不是伤害）。`,'hp_loss');else if(resolved.hpLoss)log(g,`${definition(g,b).name} 命中附带生命流失${resolved.hpLoss}（不产生受伤事件）。`,'hp_loss');
 for(const transfer of resolved.transfers)finishPacketVictims(g,transfer);
 if(!pureLoss)log(g,`${definition(g,a).name} → ${definition(g,b).name}｜${sk.name||'通常攻击'}：${rolled.dice.length}d${rolled.sides} [${rolled.dice.join('+')}]＋${rolled.bonus}；减伤后 ${result.base}；攻击方成功 ${p.reaction.immune?0:wins}/2 → ${result.factor}% 最终伤害=${result.scaled}；护盾吸收 ${result.absorbed}，损失 ${damage} HP。`,'damage');
 if(!pureLoss&&wins>0&&(!p.reaction.immune||packet.tags.includes('pierce_invincibility'))){if(sk.dispel){b.buff={root:b.buff.root};b.effects=[];b.shield=0;}if(sk.root||a.buff.next_root)b.buff.root=true;if(sk.weaken||a.buff.next_weaken)b.buff.weaken=true;if(sk.curse&&damage>0){b.maxHp=Math.max(15,b.maxHp-damage);b.hp=Math.min(b.hp,b.maxHp);}if(sk.push&&b.hp>0&&g.grail?.holderId!==b.id){const x=b.x+Math.sign(b.x-a.x),y=b.y+Math.sign(b.y-a.y);if(!blocked(g,x,y,b.id)){b.x=x;b.y=y;}}}
 if(!pureLoss&&sourceExists&&damage>0){for(const tag of [...(sk.tags||[]),...(a.nextTags||[])]){if(['poison','burn','curse'].includes(tag)){b.dots??=[];if(!b.dots.some(d=>d.kind===tag&&d.owner===a.id))b.dots.push({kind:tag,damage:2+(sk.potency||2),until:g.round+1,owner:a.id});}if(tag==='drain')b.mp=Math.max(0,b.mp-(sk.potency||3)*3);if(tag==='refund')a.mp=cap(a.mp+10,definition(g,a).mp);}}const wasAlive=b.alive;remove(g,b);if(sourceExists&&wasAlive&&!b.alive){const artist=ownedMaster(g,a.owner||a.id);if(artist?.alive&&hasMasterSkill(artist,'masterArt')){artist.earnedTraits=(artist.earnedTraits||0)+2;log(g,'死之艺术：永久获得2点可分配通用特性。','skill',[artist.owner]);}}if(sourceExists&&!b.alive){a.morale=cap(a.morale+2,3);enqueueRuleEvent(g,{type:'kill',unitId:a.id,targetId:b.id});}flushRuleEvents(g);nextAttackTarget(g);
}
function setAttackWindow(g,p){
 const tags=p.skill.mechanics?.tags||[];p.skipContest=p.skill.mechanics?.kind==='hp_loss'||tags.includes('unrespondable');p.segmentId=`${p.chainId}:${p.position}:${p.segment}`;p.stage=p.skipContest?(p.skill.mechanics?.kind==='hp_loss'?'hpLossReaction':'unrespondableReaction'):p.overrideDef?'defenderReaction':'defender';
 recordCombatEvent(g,{type:'attack_segment_started',attackId:p.chainId,segmentId:p.segmentId,unitId:p.target,sourceUnitId:tags.includes('sourceless')?null:p.attacker,ownerPlayerId:g.units.find(u=>u.id===p.attacker)?.owner,segment:p.segment});
}
function nextAttackTarget(g){const p=g.pendingAttack;if(!p)return;
 recordCombatEvent(g,{type:'segment_finished',attackId:p.chainId,segmentId:p.segmentId,unitId:p.target,sourceUnitId:p.skill.mechanics?.tags?.includes('sourceless')?null:p.attacker});
 const attacker=g.units.find(u=>u.id===p.attacker),current=g.units.find(u=>u.id===p.target);
 if(p.cancelRemaining||!attacker?.alive){completeAttack(g);return;}
 if(current?.alive&&!p.terminatedTargets?.includes(current.id)&&p.segment<(p.segments||1))p.segment++;
 else{p.position++;p.segment=1;while(p.position<p.targets.length&&!g.units.find(u=>u.id===p.targets[p.position])?.alive)p.position++;}
 if(p.position>=p.targets.length){completeAttack(g);return;}
 p.target=p.targets[p.position];p.checks=[];p.reaction={};p.moraleDone=false;p.counterResolved=false;p.defensesUsed=[];setAttackWindow(g,p);schedule(g);
}
function completeAttack(g){
 const p=g.pendingAttack;if(!p)return;emitRuleEvent(g,{type:'attack_finished',unitId:p.attacker,attackId:p.chainId});const a=g.units.find(u=>u.id===p.attacker);if(!p.skill.periodic&&!p.skill.mechanics?.tags?.includes('sourceless')){spendBuffs(a);a.snipeReady=false;a.nextTags=[];delete a.buff.next_dispel;delete a.buff.next_root;delete a.buff.next_weaken;a.soloRound=g.round;if(p.skill.id)a.effects=(a.effects||[]).filter(e=>e.kind!=='specialNext');}if(p.skill.shield)a.shield=cap(a.shield+p.skill.shield,30);g.pendingAttack=null;if(p.skill.field){for(const ally of aliveFighters(g).filter(v=>v.owner===a.owner)){addEffect(ally,'normalDamage',p.skill.field==='forge'?5:3,g.round+2);if(p.skill.field==='army')addEffect(ally,'movement',1,g.round+2);}log(g,`${p.skill.name} 展开持续3轮的领域。`,'skill');}if(p.skill.sacrificeSelf){a.hp=0;remove(g,a);}
 if(finishBattle(g))return;if(g.battle.opening){g.battle.opening=false;g.order=g.battle.normalOrder;g.turn=0;beginTurn(g);}else schedule(g);if(g.phase==='battle'&&!activeUnit(g)?.alive)endTurn(g);
}
function endBattleRound(g){for(const unit of aliveFighters(g))emitRuleEvent(g,{type:'battle_round_end',unitId:unit.id});for(const actor of aliveFighters(g))fireCardTriggers(g,actor,'battle_round_end');for(const shroud of aliveFighters(g).filter(u=>hasMasterSkill(u,'masterShroud')))for(const target of aliveFighters(g).filter(v=>v.id!==shroud.id&&dist(shroud,v)<=1&&definition(g,v).alignment?.includes('恶')))target.mp=Math.max(0,target.mp-6);for(const u of aliveFighters(g)){for(const dot of u.dots||[])if(dot.until>=g.round)direct(g,u,dot.damage,dot.kind==='burn'?'灼烧':dot.kind==='poison'?'中毒':'诅咒');u.dots=(u.dots||[]).filter(d=>d.until>g.round);if(u.mountedUntil===g.round){u.hp=cap(u.hp+10,u.maxHp);u.mp=cap(u.mp+10,definition(g,u).mp);u.mountedUntil=0;}(u.effects??=[]);u.effects=u.effects.filter(e=>e.until===undefined||e.until>g.round);if(hasLibrary(g,u,'conceal')&&aliveFighters(g).some(v=>v.id!==u.id&&!detects(g,v.id,u.id))){for(const v of aliveFighters(g))if(v.id!==u.id&&random(20)-rank(u.spirit)+level(hasLibrary(g,u,'conceal').rank)<10){g.awareness[v.id]??={};g.awareness[v.id][u.id]=true;}}}}
function addEffect(u,kind,value,until){u.effects??=[];u.effects.push({kind,value,...(until===undefined?{}:{until})});}
function skillAllowed(g,u,k){if(k.onceBattle&&u.battleUses?.[k.id])throw Error('此技能本场已经使用。');if(k.onceDay&&u.dayUses?.[k.id]===g.day)throw Error('此技能今天已经使用。');if(k.onceSlot&&u.slotUses?.[k.id])throw Error('此技能本时间回合已经使用。');}
export function useLibrary(g,u,a){
 const k=definition(g,u).skills.find(v=>v.id===a.skill);if(!k?.libraryKey)throw Error('未知数据库技能。');const daily=g.phase==='daily';if(!['daily','battle'].includes(g.phase)||['response','contest','passive'].includes(k.phase))throw Error('请在技能指定的应对或对抗时机使用。');
 if(daily&&!['daily','both'].includes(k.phase)||!daily&&k.phase==='daily')throw Error('此技能不属于当前阶段。');
 const freeReaction=!daily&&k.id==='resist';if(!freeReaction&&activeUnit(g)?.id!==u.id)throw Error('请等待自己行动。');if(!daily&&!battleUnits(g).includes(u))throw Error('未参加本场战斗。');
 skillAllowed(g,u,k);let ap=daily?(k.dailyAP||1):k.battleAP,cost=manaCost(g,k,u),x=null,tier=null;
 if(k.id==='burst'){const max=level(k.rank)+2;x=a.xValue??max;if(!Number.isInteger(x)||x<1||x>max||!['normal','reduction','special','armor'].includes(a.choice))throw Error('请选择魔力放出的 x（1～7）和一种增益。');cost=x*5*(g.day>7?2:1);}
 if(k.id==='charisma'){tier=a.tier??rank(k.rank);if(!Number.isInteger(tier)||tier<1||tier>rank(k.rank))throw Error('无效的灵活运用等级。');cost=tier*10*(g.day>7?2:1);}
 if(k.id==='mind'&&(u.battleUses?.mind||0)>=level(k.rank))throw Error('心眼-真本场最多启用4次。');
 if(k.id==='dragon'&&daily&&level(k.rank)<2)throw Error('龙之炉心D级起可在日常转化魔力。');if(k.id==='dragon'&&u.morale<1)throw Error('龙之炉心需要消耗1士气。');
 if((daily?u.dailyAP:u.battleAP)<ap||availableMana(u)<cost)throw Error('行动点或魔力不足。');
 if(k.id==='treasury'&&u.gold>=level(k.rank)+6)throw Error('财富标记已到11点上限。');
 if(k.id==='territory'&&u.workshop===u.region)throw Error('本区域已经有自己的阵地。');
 if(k.id==='sacrifice'){const t=g.units.find(v=>v.id===a.target);if(!t?.alive||!battleUnits(g).includes(t)||t.id===u.id||!sight(u,t)||rank(definition(g,t).ranks[3])>rank(k.rank)+(rank(k.rank)>=4?1:0))throw Error('精神污染目标无效。');if(['move','charge'].includes(a.command))assertCanMove(g,t);if(!['move','attack','charge'].includes(a.command))throw Error('请选择强制移动、攻击或冲锋。');if(a.command==='move'&&!reachable(g,t).some(v=>v.x===a.x&&v.y===a.y))throw Error('强制移动位置不合法。');if(a.command==='attack'&&!aliveFighters(g).some(v=>v.id!==t.id&&v.x===a.x&&v.y===a.y&&dist(t,v)<=definition(g,t).range&&sight(t,v)))throw Error('强制攻击位置不合法。');if(a.command==='charge'&&!chargeCells(g,t).some(v=>v.x===a.x&&v.y===a.y))throw Error('冲锋必须沿直线到敌人周身。');}
 if(daily)u.dailyAP-=ap;else u.battleAP-=ap;enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:'ap',amount:ap});spendMana(g,u,cost);u.battleUses??={};u.dayUses??={};u.slotUses??={};u.battleUses[k.id]=(u.battleUses[k.id]||0)+1;if(k.onceDay)u.dayUses[k.id]=g.day;if(k.onceSlot)u.slotUses[k.id]=true;
 if(k.id==='resist')addEffect(u,'allReduction',[0,3,5,10,15,20,25][rank(k.rank)],g.round);
 if(k.id==='riding')u.mountedUntil=g.round;
 if(k.id==='burst'){const effect={normal:['normalDamage',x*2,g.round+2],reduction:['allReduction',x,g.round+2],special:['specialNext',x*4,undefined],armor:['normalReduction',x*4,g.round+1]}[a.choice];addEffect(u,...effect);}
 if(k.id==='charisma'){addEffect(u,'contest',tier);const m=ownedMaster(g,u.owner||u.id);if(m?.alive&&battleUnits(g).includes(m))addEffect(m,'contest',tier);}
 if(k.id==='mind')u.mindReady=true;
 if(k.id==='dragon'){useMorale(g,u);u.mp=cap(u.mp+(daily?25:20),definition(g,u).mp);}
 if(k.id==='treasury')u.gold++;
 if(k.id==='territory'){u.workshop=u.region;u.masterDailyAdjustment=(hasLibrary(g,u,'dragon')?(level(hasLibrary(g,u,'dragon').rank)>=5?10:5):0)-10;}
 if(k.id==='eternalTrain')u.eternalRemaining++;
 if(k.id==='presenceTactic')u.forceAttributes=true;
 log(g,`${definition(g,u).name} 使用技能库「${k.name}」：${ap} ${daily?'日常':'战斗'}行动点 / ${cost} MP。`,'skill',daily?[u.id]:undefined);
 if(k.id==='sacrifice'){const t=g.units.find(v=>v.id===a.target);if(hasLibrary(g,t,'eternal')&&t.eternalRemaining>0)g.pendingAttack={id:uid(),fixedContest:true,attacker:u.id,target:t.id,skill:{name:'精神污染'},stage:'defendModifier',checks:[],reaction:{},control:{command:a.command,x:a.x,y:a.y}};else{const check=attributeContest(g,u,t,3);log(g,`精神污染魔力对抗：${check.text}；${check.attackerSuccess?'成功':'失败'}。`,'skill');if(check.attackerSuccess)applyControl(g,u,t,a);}}
 schedule(g);
}
export function chargeCells(g,u){const out=[];for(const dx of [-1,0,1])for(const dy of [-1,0,1]){if(!dx&&!dy)continue;for(let n=1;n<=definition(g,u).move*2+3*(definition(g,u).traits?.run||0)+(u.mountedUntil>=g.round?rank(definition(g,u).skills.find(k=>k.id==='riding')?.rank||'E')+2:0);n++){const x=u.x+dx*n,y=u.y+dy*n;if(blocked(g,x,y,u.id))break;if(aliveFighters(g).some(v=>v.id!==u.id&&dist({x,y},v)<=1))out.push({x,y});}}return out;}
export function publicState(g,token){
 const me=g.players.find(p=>p.token===token);if(!me)throw Error('无效的房间身份，请重新加入。');const out=structuredClone(g);delete out.dailyResolution;delete out.dailyFought;delete out.resolvingDaily;out.dailyConfirmed=(g.dailyConfirmed||[]).filter(id=>id===me.id);out.dailySubmitted=(g.dailySubmitted||[]).filter(id=>g.units?.some(u=>u.id===id&&(u.owner||u.id)===me.id));out.dailyPlans=Object.fromEntries(Object.entries(g.dailyPlans||{}).filter(([id])=>g.units?.some(u=>u.id===id&&(u.owner||u.id)===me.id)));out.players=g.players.map(({token,...p})=>p);out.me=me.id;if(g.phase==='lobby')return redactCardResources(out,me.id);
 const owned=g.units.filter(u=>(u.owner||u.id)===me.id),inFight=g.battle?.participants.some(id=>owned.some(u=>u.id===id)),known=[...new Set(owned.flatMap(u=>knownEnemies(g,u.id).map(v=>v.id)))],visible=new Set([...owned.map(u=>u.id),...known,...(inFight?g.battle.participants:[])]);
 out.units=g.units.map(u=>visible.has(u.id)?structuredClone(u):{id:u.id,owner:u.owner,kind:u.kind,card:{id:definition(g,u).id,classId:definition(g,u).classId,name:definition(g,u).name,ranks:definition(g,u).ranks,skills:[],traits:{},hp:definition(g,u).hp,mp:definition(g,u).mp,color:definition(g,u).color},servant:u.servant,name:u.name,spirit:u.spirit,alive:u.alive,hidden:true,region:null,x:null,y:null,hp:null,mp:null,maxHp:definition(g,u).hp,dailyAP:null,battleAP:0,morale:0,seals:0,shield:0,buff:{},cd:{},effects:[]});
 // Enemy live and maximum resource values are never sent to the client.
 for(const u of out.units)if((u.owner||u.id)!==me.id){for(const key of ['hp','mp','maxHp','maxMP','maxMp','externalMP','masterHP','masterMP','masterMaxMP'])if(key in u)u[key]=null;u.hiddenVitals=true;if(u.card){u.card.hp=null;u.card.mp=null;u.card.hiddenVitals=true;u.card.ranks=['?','?','?','?','?'];delete u.card.sourceRanks;}}
 out.awareness={[me.id]:Object.fromEntries(known.map(id=>[id,true]))};out.ambushTargets=known.filter(id=>owned.some(u=>canAmbush(g,u.id,id)));out.log=g.log.filter(l=>!l.audience||l.audience.includes(me.id)||owned.some(u=>l.audience.includes(u.id))).map(({audience,...l})=>l);out.leyOwners=Object.fromEntries(Object.entries(g.leyOwners).filter(([,id])=>visible.has(id)));
 if(g.battle&&!inFight){out.battle={id:g.battle.id,spectator:true,region:null,participants:[],escaped:[]};out.order=[];out.pendingAttack=null;out.fx=[];}
 if(out.lastBattle&&!out.lastBattle.participants.some(id=>owned.some(u=>u.id===id)))out.lastBattle=null;
 redactContestState(g,out,me.id);redactCombatEvents(g,out,me.id);return redactCardResources(out,me.id);
}
function legacySettleMasterUpkeep(g){
 for(const u of aliveUnits(g)){const multiplier=g.day>7?2:1,base=rank(u.spirit)*10;
 if(u.masterAlive){const cost=Math.max(0,base+(u.masterDailyAdjustment||0))*multiplier,available=u.masterMP+50;u.masterMP=cap(available-cost,u.masterMaxMP);if(available<cost)u.masterHP=Math.max(0,u.masterHP-2*(cost-available));log(g,`${definition(g,u).name} 御主日结：回魔50，维持费${cost}（含技能调整${u.masterDailyAdjustment||0}），库存${u.masterMP} MP，生命${u.masterHP}。`,'info',[u.id]);if(u.masterHP===0)u.masterAlive=false;}
 if(!u.masterAlive){if(u.servant==='archer'){const cost=(base+10)*multiplier,deficit=Math.max(0,cost-u.mp);u.mp=Math.max(0,u.mp-cost);if(deficit)u.hp=Math.max(0,u.hp-deficit*2);remove(g,u);}else{u.hp=0;remove(g,u);}}
 }
}
function runSneakContest(g,p,forced){const a=g.units.find(u=>u.id===p.attacker),t=g.units.find(u=>u.id===p.target),check=attributeContest(g,a,t,2,{eternal:forced});p.sneakCheck=check;log(g,`偷袭先行敏捷对抗：${check.text}。`,'damage');if(!check.attackerSuccess){log(g,'偷袭敏捷对抗失败，本次偷袭未造成伤害，偷袭者暴露。','damage');p.failed=true;}else p.stage='part';}
function applyControl(g,caster,target,a){if(a.command==='move'||a.command==='charge'){assertCanMove(g,target);target.x=a.x;target.y=a.y;}else{const victim=aliveFighters(g).find(v=>v.x===a.x&&v.y===a.y);if(victim)queueAttack(g,target,{name:'精神污染·强制普攻',range:definition(g,target).range,dice:definition(g,target).dice},[victim],caster.id);}}

export const ownedServant=(g,owner)=>g.units.find(u=>u.kind!=='master'&&(u.owner||u.id)===owner);
export const ownedMaster=(g,owner)=>g.units.find(u=>u.kind==='master'&&u.owner===owner);
const hasMasterSkill=(u,id)=>u.kind==='master'&&u.card?.skills.some(k=>k.id===id);
function syncMasterAccount(g,owner){const s=ownedServant(g,owner),m=ownedMaster(g,owner);if(s&&m){s.masterMP=m.mp;s.masterMaxMP=definition(g,m).mp;s.masterHP=m.hp;s.masterAlive=m.alive;s.masterManaRank=definition(g,m).ranks[3];}}
function grailBroadcast(g,text){log(g,text,'grail',null);}
function maybeSpawnGrail(g){if(!g.grail||g.grail.spawned||aliveServants(g).length>2)return;g.grail.spawned=true;g.grail.region=REGIONS[random(REGIONS.length)-1].id;grailBroadcast(g,`全图播报：仅剩${aliveServants(g).length}名从者，圣杯在「${REGION_BY_ID[g.grail.region].name}」显现！圣杯位置向全图实时公开。`);}
function assertCanMove(g,u){if(g.grail?.holderId===u.id)throw Error('持有圣杯时不能移动、冲锋、传送或撤退，请先放下圣杯。');if(u.channel)throw Error('引导中不能移动，请先取消或完成引导。');}
function interruptRitual(g,ids,reason){if(g.grail?.ritual&&ids.includes(g.grail.ritual.actorId)){grailBroadcast(g,`圣杯仪式因${reason}中断，进度清零。`);g.grail.ritual=null;}}
function grailAction(g,u,a){const cup=g.grail;if(!cup?.spawned)throw Error('圣杯尚未显现。');if(a.type==='grailDrop'){if(cup.holderId!==u.id)throw Error('你未持有圣杯。');cup.region=u.region;cup.holderId=null;cup.ritual=null;grailBroadcast(g,`${definition(g,u).name} 在「${REGION_BY_ID[u.region].name}」放下圣杯。`);return;}
 if(g.phase!=='daily'||activeUnit(g)?.id!==u.id)throw Error('只能在自己的日常行动中拾取或开始仪式。');if(a.type==='grailPickup'){if(cup.holderId||cup.region!==u.region)throw Error('此处没有可拾取的圣杯。');cup.holderId=u.id;grailBroadcast(g,`${definition(g,u).name} 拾起圣杯，位置「${REGION_BY_ID[u.region].name}」公开。持有者无法移动。`);return;}
 if(cup.holderId!==u.id)throw Error('必须持有圣杯才能举行仪式。');if(cup.ritual)throw Error('仪式已经进行中。');cup.ritual={actorId:u.id,owner:u.owner||u.id,started:g.timeIndex,completeAt:g.timeIndex+2};u.dailyAP=0;grailBroadcast(g,`${definition(g,u).name} 开始圣杯仪式：必须完整度过下一个时间回合，进入战斗将中断。`);
}
function resolveTimeEffects(g){
 for(const u of g.units){if(u.frequencyUntil!==undefined&&u.frequencyUntil<g.timeIndex){delete u.frequencyUntil;delete u.assistReady;}if(u.delayedHeal?.due<=g.timeIndex){const target=g.units.find(v=>v.id===u.delayedHeal.target);if(target?.alive)target.hp=cap(target.hp+30,target.maxHp);delete u.delayedHeal;}if(u.kind==='servant'&&u.orphanedAt!==undefined&&g.timeIndex>u.orphanedAt&&!hasLibrary(g,u,'solo')){u.hp=0;remove(g,u);}}
 const r=g.grail?.ritual;if(r&&g.timeIndex>=r.completeAt){const u=g.units.find(v=>v.id===r.actorId);if(u?.alive&&g.grail.holderId===u.id){g.winner=r.owner;g.phase='finished';g.pendingAttack=null;grailBroadcast(g,`${definition(g,u).name} 完成一个完整时间回合的圣杯仪式，契约方获得胜利！`);}}
}
function grantMediumMana(g,u){if(!hasMasterSkill(u,'masterMedium'))return;const s=ownedServant(g,u.owner);if(u.alive&&s?.alive&&battleUnits(g).includes(s))s.externalMP=(s.externalMP||0)+4;}
function settleMasterUpkeep(g){for(const unit of g.units)if(unit.originalAlignment){unit.card.alignment=unit.originalAlignment;delete unit.originalAlignment;}for(const s of aliveServants(g)){const m=ownedMaster(g,s.owner||s.id);if(!m)continue;const multiplier=g.day>7?2:1;if(m.alive){const income=level(definition(g,m).ranks[3])*10+(definition(g,m).traits?.circuits?20:0);const cost=Math.max(0,level(s.spirit)*10+(s.masterDailyAdjustment||0))*multiplier,available=m.mp+income;m.mp=cap(available-cost,definition(g,m).mp);if(available<cost)m.hp=Math.max(0,m.hp-2*(cost-available));log(g,`${definition(g,m).name} 日结：回魔${income}、从者维持费${cost}，剩余${m.mp} MP。`,'info',[s.owner]);if(m.hp===0)remove(g,m);}else if(hasLibrary(g,s,'solo')){const cost=(level(s.spirit)*10+(6-level(hasLibrary(g,s,'solo').rank))*10)*multiplier,deficit=Math.max(0,cost-s.mp);s.mp=Math.max(0,s.mp-cost);if(deficit)s.hp=Math.max(0,s.hp-deficit*2);remove(g,s);}syncMasterAccount(g,s.owner);}}
export function adaptedAbility(g,u,a){const k=definition(g,u).skills.find(v=>v.id===a.skill);if(g.phase!=='battle'||activeUnit(g)?.id!==u.id||g.pendingAttack||!battleUnits(g).includes(u))throw Error('请在自己的战斗回合使用。');if(u.battleAP<k.battleAP||availableMana(u)<manaCost(g,k,u)||u.cd[k.id]>0)throw Error('行动点、魔力或冷却条件不满足。');u.battleAP-=k.battleAP;enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:'ap',amount:k.battleAP});spendMana(g,u,manaCost(g,k,u));u.cd[k.id]=k.cd;
 const recipients=k.tags?.includes('team')?aliveFighters(g).filter(v=>v.owner===u.owner):[u];for(const target of recipients){applyAdaptedEffects(g,target,k);}if(k.tags?.includes('selfCost'))u.hp=Math.max(1,u.hp-k.potency*2);emitFX(g,u,k,recipients);
 log(g,`${definition(g,u).name} 使用 ${k.name}：${k.desc}`,'skill');schedule(g);
}
function applyAdaptedEffects(g,u,k){for(const e of k.effects){if(e.kind==='heal')u.hp=cap(u.hp+e.value,u.maxHp);if(e.kind==='mana')u.mp=cap(u.mp+e.value,definition(g,u).mp);if(e.kind==='damage')addEffect(u,'normalDamage',e.value,g.round+2);if(e.kind==='defense')addEffect(u,'allReduction',e.value,g.round+2);if(e.kind==='evade')u.buff.evade=(u.buff.evade||0)+e.value;if(e.kind==='accuracy')u.buff.accuracy={value:e.value,n:3};if(e.kind==='special')addEffect(u,'specialNext',e.value);if(e.kind==='guts')u.guts=Math.max(u.guts||0,e.value);if(e.kind==='cleanse'){delete u.buff.root;delete u.buff.weaken;}if(['root','dispel','weaken'].includes(e.kind))u.buff['next_'+e.kind]=true;}
 u.nextTags=[...new Set([...(u.nextTags||[]),...(k.tags||[]).filter(t=>['poison','burn','curse','drain'].includes(t))])];if(k.tags?.includes('taunt'))u.tauntUntil=g.round;if(k.tags?.includes('ward'))u.ward=8+k.potency*2;
}
export function masterAbility(g,u,a){if(u.kind!=='master'||!['daily','battle'].includes(g.phase))throw Error('此操作需要行动阶段的御主单位。');if(activeUnit(g)?.id!==u.id||g.pendingAttack)throw Error('请在自己的行动阶段使用。');const s=ownedServant(g,u.owner);
 if(a.type==='masterTrait'){if(!definition(g,u).traits?.servantHeal||!s?.alive||s.region!==u.region||g.phase==='battle'&&(!battleUnits(g).includes(u)||!battleUnits(g).includes(s)||!inBody(g,u,s)))throw Error('需要治愈从者特性且契约从者在周身。');const key='heal-'+g.timeIndex;if(u.slotUses[key])throw Error('本时间回合已经使用。');if(g.phase==='battle'){if(u.battleAP<1)throw Error('需要1战斗行动点。');u.battleAP--;}u.slotUses[key]=true;u.delayedHeal={target:s.id,due:g.timeIndex+1};log(g,'治愈从者已排定，将在下个时间回合开始恢复30生命。','skill',[u.owner]);return;}
 const k=definition(g,u).skills.find(k=>k.id===a.skill);if(!k||k.type!=='master'||k.phase==='passive')throw Error('御主技能不可用。');if(k.onceDay&&u.dayUses[k.id]===g.day||k.onceBattle&&u.battleUses[k.id]||u.cd[k.id]>0)throw Error('技能次数或冷却未满足。');const daily=g.phase==='daily';if(daily&&!['daily','both'].includes(k.phase))throw Error('此御主技能需要战斗阶段。');if(!daily&&!battleUnits(g).includes(u))throw Error('御主没有参加本场战斗。');const ap=daily?(k.dailyAP||0):k.battleAP;if((daily?u.dailyAP:u.battleAP)<ap||u.mp<k.cost)throw Error('御主行动点或魔力不足。');
 if(k.id==='masterRestart'&&(!a.targetSkill||!u.cd[a.targetSkill]||a.targetSkill===k.id))throw Error('当前没有可缩短的自身冷却。');if(k.id==='masterSnipe'&&(u.battleUses[k.id]||0)>=2)throw Error('本场狙击次数已用尽。');
 if(daily)u.dailyAP-=ap;else u.battleAP-=ap;enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:'ap',amount:ap});spendMana(g,u,k.cost);u.battleUses[k.id]=(u.battleUses[k.id]||0)+1;u.dayUses[k.id]=g.day;if(k.cd)u.cd[k.id]=k.cd;
 if(k.id==='masterWeapon')u.weaponReady=true;if(k.id==='masterRestart')u.cd[a.targetSkill]=Math.max(0,u.cd[a.targetSkill]-4);
 if(k.id==='masterFrequency'&&s?.alive){s.frequencyUntil=g.timeIndex;s.frequencyBonus=s.assistReady||definition(g,s).traits?.aid?6:4;s.assistReady=true;u.shareSightUntil=g.timeIndex;}
 if(k.id==='masterSync'&&s?.alive&&daily){s.originalAlignment??=s.card.alignment;s.card.alignment=definition(g,u).alignment;s.syncDay=g.day;}
 if(k.id==='masterSnipe')u.snipeReady=true;if(k.id==='masterEmergency'){if(a.resource==='mp')u.mp=cap(u.mp+12,definition(g,u).mp);else u.hp=cap(u.hp+12,u.maxHp);u.noFlight=true;}
 log(g,`${definition(g,u).name} 使用御主技能「${k.name}」。`,'skill',daily?[u.owner]:undefined);syncMasterAccount(g,u.owner);
}
function sealPool(g,u){const m=u.kind==='master'?u:ownedMaster(g,u.owner||u.id),s=u.kind==='master'?ownedServant(g,u.owner):u;return {m,s,pool:s};}
function sealFlags(g,s){g.sealEffects??={};return g.sealEffects[s.id]??={};}
function commandSeal(g,u,a){if(!['daily','battle'].includes(g.phase))throw Error('当前无法使用令咒。');const {m,s,pool}=sealPool(g,u);if(!m?.alive||!s?.alive||s.kind==='master')throw Error('需要存活的御主与契约从者，令咒强化只作用于契约从者。');const costs={attack:1,defense:1,heal:1,mana:1,manaMaster:1,defend:1,unavoidable:1,compel:Math.max(1,Math.min(3,a.count||1)),teleport:1,escape:2,release:Math.max(1,Math.min(3,a.count||1))};const cost=costs[a.choice];if(!cost||pool.seals<cost)throw Error('令咒效果或剩余划数无效。');if(['teleport','escape'].includes(a.choice)){if(g.pendingAttack)throw Error('不能用令咒位移规避已经发动的攻击。');assertCanMove(g,s);if(a.choice==='escape')assertCanMove(g,m);}
 if(a.choice==='teleport'){const regions=[m.region,...adjacentRegions(m.region).map(r=>r.id)];if(g.phase==='battle'&&battleUnits(g).includes(m)&&Number.isInteger(a.x)&&Number.isInteger(a.y)){if(blocked(g,a.x,a.y,s.id)||!sight(m,{x:a.x,y:a.y}))throw Error('目标格不在御主视线内。');}else if(!regions.includes(a.region))throw Error('只能传送到御主所在或相邻可见区域。');}
 if(a.choice==='escape'&&(s.region!==m.region||!adjacentRegions(s.region).some(r=>r.id===a.region)))throw Error('主从需在同区，并选相邻区域脱战。');if(a.choice==='release'&&(!s.channel||s.channel.ready))throw Error('从者目前没有正在引导的宝具。');pool.seals-=cost;
 if(a.choice==='attack'){if(g.phase==='battle'&&battleUnits(g).includes(s))addEffect(s,'allDamage',15);else s.reservedAttack=(s.reservedAttack||0)+15;}
 if(a.choice==='defense'){if(g.phase==='battle'&&battleUnits(g).includes(s))addEffect(s,'allReduction',15);else s.reservedDefense=(s.reservedDefense||0)+15;}
 if(a.choice==='heal')s.hp=cap(s.hp+60,s.maxHp);if(a.choice==='mana')s.mp=cap(s.mp+60,definition(g,s).mp);if(a.choice==='manaMaster')m.mp=cap(m.mp+60,definition(g,m).mp);
 if(a.choice==='defend'||a.choice==='unavoidable'){const f=sealFlags(g,s);f[a.choice]={time:g.timeIndex,round:g.phase==='battle'?g.round:1};}
 if(a.choice==='compel')s.compulsion=String(a.command||'遵从御主命令').slice(0,160);
 if(a.choice==='teleport'){if(g.phase==='battle'&&battleUnits(g).includes(m)&&Number.isInteger(a.x)){s.x=a.x;s.y=a.y;}else{s.region=a.region;if(g.phase==='battle'&&!g.battle.escaped.includes(s.id)){g.battle.escaped.push(s.id);finishBattle(g);}}refreshDetection(g,[s.region]);}
 if(a.choice==='escape'){interruptRitual(g,[s.id,m.id],'令咒脱战');s.region=m.region=a.region;if(g.phase==='battle'){for(const v of [s,m])if(!g.battle.escaped.includes(v.id))g.battle.escaped.push(v.id);finishBattle(g);}refreshDetection(g,[a.region]);}
 if(a.choice==='release'){s.channel.remaining=Math.max(0,s.channel.remaining-cost*4);if(!s.channel.remaining)readyChannel(g,s,true);}
 log(g,`${definition(g,m).name} 消耗${cost}划令咒：${{attack:'从者本场攻击+15',defense:'从者本场防御+15',heal:'从者回复60生命',mana:'从者回复60魔力',manaMaster:'御主回复60魔力',defend:'本轮应对必定成功',unavoidable:'本轮攻击无法被应对',compel:'强制服从命令',teleport:'视野传送',escape:'主从强制脱战',release:'缩短宝具引导'}[a.choice]}。`,'seal',[u.owner||u.id]);syncMasterAccount(g,u.owner||u.id);
}
function beginChannel(g,u,k,a){if(u.channel)throw Error('已经在引导宝具。');if(u.battleAP<1||availableMana(u)<manaCost(g,k,u)||u.cd[k.id]>0)throw Error('无法开始宝具引导。');skillAllowed(g,u,k);spendMana(g,u,manaCost(g,k,u));u.channel={skillId:k.id,remaining:k.chant||k.battleAP||1,ready:false};continueChannel(g,u);}
function continueChannel(g,u){if(!u.channel||u.channel.ready||activeUnit(g)?.id!==u.id||u.battleAP<1)throw Error('需要自己的战斗行动点继续引导。');const used=Math.min(u.battleAP,u.channel.remaining);u.channel.remaining-=used;u.battleAP-=used;enqueueRuleEvent(g,{type:'resource_spent',unitId:u.id,resource:'ap',amount:used});log(g,`${definition(g,u).name} 引导宝具，尚需${u.channel.remaining}动作。`,'skill');if(!u.channel.remaining)readyChannel(g,u);}
function readyChannel(g,u,instant=false){u.channel.remaining=0;u.channel.ready=true;u.channel.instant=instant;log(g,`${definition(g,u).name} 引导完成，现在选择目标地点；选点不再消耗AP或MP。`,'skill',[u.owner||u.id]);}
function releaseChannel(g,u,a={}){const data=u.channel;if(g.phase!=='battle'||g.pendingAttack||!data?.ready||!battleUnits(g).includes(u)||activeUnit(g)?.id!==u.id&&!data.instant)throw Error('引导完成后才能在自己的行动中选择地点（令咒即时释放除外）。');const k=definition(g,u).skills.find(k=>k.id===data.skillId);const selected=attackSelection(g,u,k,{x:a.x,y:a.y},{release:true});if(!selected.valid)throw Error(selected.reason);queueAttack(g,u,k,selected.targets);delete u.channel;u.cd[k.id]=k.cd;u.battleUses??={};u.battleUses[k.id]=(u.battleUses[k.id]||0)+1;if(k.onceDay)u.dayUses[k.id]=g.day;}

function lastWill(g,m){if(m.lastWillUsed)return;m.lastWillUsed=true;const s=ownedServant(g,m.owner);if(!s?.alive||s.seals<1)return;const check=total(roll(level(definition(g,m).ranks[2]),6))+definition(g,m).luck;if(check<=10){log(g,`${definition(g,m).name} 濒死令咒敏捷判定${check}，未大于10。`,'seal',[m.owner]);return;}const count=s.seals;s.seals=0;const plan=['heal','mana','defense'];for(const effect of plan.slice(0,count)){if(effect==='heal')s.hp=cap(s.hp+60,s.maxHp);if(effect==='mana')s.mp=cap(s.mp+60,definition(g,s).mp);if(effect==='defense')addEffect(s,'allReduction',15);}log(g,`${definition(g,m).name} 濒死判定${check}>10，消耗全部${count}划令咒，按最后指令预案强化从者（治疗、回魔、防御依次）。`,'seal',[m.owner]);}

function allocateEarned(g,u,a){const m=ownedMaster(g,u.owner||u.id),t=g.units.find(v=>v.id===a.target&&(v.owner||v.id)===(u.owner||u.id)),trait=TRAIT_BY_ID[a.trait],count=a.count;if(g.phase!=='daily'||!dailyReady(g,u)||!m?.alive||!t?.alive||!trait||trait.scope!=='general'||!Number.isInteger(count)||count<1||count*trait.cost>(m.earnedTraits||0))throw Error('需要自己的日常行动、可用通用点和有效特性。');t.card.traits??={};if((t.card.traits[trait.id]||0)+count>trait.max)throw Error('特性超过叠加上限。');m.earnedTraits-=count*trait.cost;t.card.traits[trait.id]=(t.card.traits[trait.id]||0)+count;if(trait.id==='hp'){t.card.hp+=10*count;t.maxHp+=10*count;t.hp+=10*count;}if(trait.id==='mp'){t.card.mp+=10*count;t.mp+=10*count;}if(trait.id==='shoot')t.card.range+=(t.kind!=='master'&&['archer','caster','assassin'].includes(t.servant)?2:1)*count;log(g,'已分配获得的通用特性点，初始6/9点预算保持固定。','skill',[m.owner]);}
function timelyAid(g,u){const p=g.pendingAttack,target=p&&g.units.find(v=>v.id===p.target);if(g.phase!=='battle'||!p||!target||p.stage!=='defender'||target.id===u.id||(target.owner||target.id)!==(u.owner||u.id)||!battleUnits(g).includes(u)||!(u.assistReady||definition(g,u).traits?.aid)||dist(u,target)>3||availableMana(u)<10)throw Error('需要及时援护、3格内友方受攻击威胁，以及10魔力。');assertCanMove(g,u);const cells=[];for(let x=target.x-1;x<=target.x+1;x++)for(let y=target.y-1;y<=target.y+1;y++)if(!blocked(g,x,y,u.id))cells.push({x,y});if(!cells.length)throw Error('目标周身没有可援护的格子。');const cell=cells.sort((a,b)=>dist(a,u)-dist(b,u))[0];preflightDamageLinks(g,[u]);spendMana(g,u,10);u.x=cell.x;u.y=cell.y;p.targets[p.position]=u.id;p.target=u.id;p.checks=[];p.reaction={};log(g,definition(g,u).name+' 支付10魔力及时援护，代为承担此次攻击。','skill');schedule(g);}

function pathToEnemy(g,u,target){const q=[{x:target.x,y:target.y}],result=new Map([[`${target.x},${target.y}`,0]]);for(let i=0;i<q.length;i++){const a=q[i],d=result.get(`${a.x},${a.y}`);for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++){if(!dx&&!dy)continue;const x=a.x+dx,y=a.y+dy,key=`${x},${y}`;if(result.has(key)||blocked(g,x,y,u.id))continue;if(dx&&dy&&(blocked(g,a.x+dx,a.y,u.id)||blocked(g,a.x,a.y+dy,u.id)))continue;result.set(key,d+1);q.push({x,y});}}return result;}

function botWithdraw(g,u){const edge=u.x===0||u.y===0||u.x===SIZE-1||u.y===SIZE-1;if(edge){action(g,u.id,{type:'retreat',region:adjacentRegions(u.region)[0].id});return true;}const cells=reachable(g,u,engagedBy(g,u).length>0),distance=p=>Math.min(p.x,p.y,SIZE-1-p.x,SIZE-1-p.y);cells.sort((a,b)=>distance(a)-distance(b));if(cells.length&&distance(cells[0])<distance(u)&&u.battleAP>=(engagedBy(g,u).length?withdrawalCost(g,u):1)){action(g,u.id,{type:engagedBy(g,u).length?'backstep':'move',...cells[0]});return true;}return false;}

export function loseMorale(g,u,count=1){for(let i=0;i<count&&u.alive;i++){if(u.morale>0){u.morale--;continue;}const loss=Math.min(u.mp,20),overflow=20-loss;u.mp-=loss;if(overflow)direct(g,u,overflow*2,'零士气魔力不足反噬');log(g,`${definition(g,u).name} 零士气：扣${loss}MP，溢出${overflow}转为${overflow*2}HP。`,'morale');}}
function useMorale(g,u,reason='改变一次失败应对'){if(u.morale<1)throw Error('士气不足，不能主动强化应对。');if(!(traitCount(u,'intimidate')&&random(4)===4))u.morale--;if(hasLibrary(g,u,'madness')&&!(definition(g,u).originTemplate&&u.servant==='berserker')){const m=ownedMaster(g,u.owner);if(m?.alive){const available=Math.min(m.mp,20);m.mp-=available;if(available<20)direct(g,m,(20-available)*2,'狂化御主魔力不足');}}log(g,`${definition(g,u).name} 使用士气${reason}。`,'morale');}
function moraleResponse(g,u,a){if(g.pendingAttack?.stage!=='moraleChoice')throw Error('尚未进入士气选择。');return respondAttack(g,u.id,{useMorale:a.useMorale!==false});}
function changeFlight(g,u,a){if(g.phase!=='battle'||activeUnit(g)?.id!==u.id||g.pendingAttack||u.battleAP<1||u.channel)throw Error('飞行调整需要自己的1战斗行动点。');assertCanMove(g,u);const h=a.height;if(!Number.isInteger(h)||h<0||h>flightLimit(g,u))throw Error('飞行高度超过特性上限或受到禁空领域限制。');if(h===0&&['water','building'].includes(terrain(u.x,u.y)))throw Error('必须在可站立地面降落。');u.height=h;u.battleAP--;log(g,`${definition(g,u).name} 调整飞行高度至${h}格，消耗1AP。`,'skill');}

function emitFX(g,u,k,targets){g.fx??=[];g.fx.push({id:++g.event,battleId:g.battle?.id,owner:u.owner,actor:u.id,x:u.x,y:u.y,name:k.name||'通常攻击',np:!!k.np,style:k.fx||(k.np?'beam':k.id?'arcane':'blade'),targets:targets.map(t=>({id:t.id,x:t.x,y:t.y})),at:Date.now()});g.fx=g.fx.slice(-12);}

export function canCounter(g,id){const p=g.pendingAttack,u=g.units?.find(v=>v.id===id);return !!(g.phase==='battle'&&u?.alive&&p&&p.target===id&&!p.fixedContest&&!p.skill.mechanics?.tags?.some(t=>['cannot_counter','sourceless'].includes(t))&&p.skill.mechanics?.kind!=='hp_loss'&&!p.counterResolved&&p.checks.length===0&&!p.reaction.instinctDone&&['defender','part','defenderReaction','overrideDefender','unrespondableReaction'].includes(p.stage)&&battleUnits(g).includes(u));}
export function counterOptions(g,id){if(!canCounter(g,id))return [];const u=g.units.find(v=>v.id===id),enemy=g.units.find(v=>v.id===g.pendingAttack.attacker),s=definition(g,u),master=ownedMaster(g,u.owner||u.id),pool=ownedServant(g,u.owner||u.id);const candidates=[{id:'normal',name:'通常攻击',dice:s.dice,range:s.range,cost:0,np:false},...s.skills.filter(k=>k.type==='attack')];return candidates.map(k=>{const seals=k.np?Math.ceil((k.chant||k.battleAP||1)/4):Math.ceil((k.chant||0)/4),cost=k.id==='normal'?0:manaCost(g,k,u);let reason='';if(u.morale<1)reason='需要1士气';else if(!enemy?.alive||dist(u,enemy)>(k.range||1)||!sight(u,enemy))reason='攻击者不在射程或视线内';else if(availableMana(u)<cost)reason='魔力不足';else if(k.id!=='normal'&&(u.cd[k.id]>0||k.onceBattle&&u.battleUses?.[k.id]||k.onceDay&&u.dayUses?.[k.id]===g.day||k.onceSlot&&u.slotUses?.[k.id]))reason='冷却或次数不足';else if(seals&&(!master?.alive||(pool?.seals||0)<seals))reason='立即释放所需令咒不足';return {id:k.id,name:k.name,np:!!k.np,cost,seals,range:k.range||1,enabled:!reason,reason};});}
function counterPower(g,u,k,target){const r=attackRaw(g,u,k);if(k.dragon&&target.servant==='saber')r.raw+=8;if(k.clones)r.raw+=Math.min(8,aliveFighters(g).filter(v=>v.id!==u.id&&dist(u,v)<=2).length*2);if(k.tags?.includes('hunter')&&(target.dots?.length||target.buff.root||target.buff.weaken))r.raw+=8;return r;}
function counterHit(g,winner,loser,k,amount){const resolved=resolveCombatPacket(g,loser,{kind:'damage',amount,reduction:0,successes:2,damageType:k.mechanics?.damageType||'normal',tags:k.mechanics?.tags||[],hpLoss:k.mechanics?.hpLoss||0,sourceUnitId:k.mechanics?.tags?.includes('sourceless')?null:winner.id,ownerPlayerId:winner.owner||winner.id,attackId:g.pendingAttack?.chainId,segmentId:g.pendingAttack?.segmentId},{reductionFor:()=>0}),absorbed=resolved.absorbed,damage=resolved.damage;if(g.pendingAttack)markPacketTermination(g.pendingAttack,resolved);for(const transfer of resolved.transfers)finishPacketVictims(g,transfer);if(damage>0){if(k.dispel||winner.buff.next_dispel){loser.buff={};loser.effects=[];loser.shield=0;}if(k.root||winner.buff.next_root)loser.buff.root=true;if(k.weaken||winner.buff.next_weaken)loser.buff.weaken=true;if(k.curse){loser.maxHp=Math.max(15,loser.maxHp-damage);loser.hp=Math.min(loser.hp,loser.maxHp);}for(const tag of [...(k.tags||[]),...(winner.nextTags||[])]){if(['burn','poison','curse'].includes(tag)){loser.dots??=[];if(!loser.dots.some(d=>d.kind===tag&&d.owner===winner.id))loser.dots.push({kind:tag,damage:2+(k.potency||2),until:g.round+1,owner:winner.id});}if(tag==='drain')loser.mp=Math.max(0,loser.mp-(k.potency||3)*3);if(tag==='refund')winner.mp=cap(winner.mp+10,definition(g,winner).mp);}}
 const alive=loser.alive;remove(g,loser);if(alive&&!loser.alive){winner.morale=cap(winner.morale+2,3);const artist=ownedMaster(g,winner.owner||winner.id);if(artist?.alive&&hasMasterSkill(artist,'masterArt'))artist.earnedTraits=(artist.earnedTraits||0)+2;}log(g,`反击差值${amount}，护盾吸收${absorbed}，${definition(g,loser).name} 损失${damage}HP；不可再应对或反击。`,'damage');}
export function counterAttack(g,u,a){if(!canCounter(g,u.id))throw Error('只能在本次攻击开始应对前宣布反击。');const option=counterOptions(g,u.id).find(k=>k.id===(a.skill||'normal'));if(!option||!option.enabled)throw Error(option?.reason||'反击选项无效。');const p=g.pendingAttack,enemy=g.units.find(v=>v.id===p.attacker),s=definition(g,u),skill=option.id==='normal'?{name:'通常攻击',range:s.range,dice:s.dice}:s.skills.find(k=>k.id===option.id);if(option.seals)ownedServant(g,u.owner||u.id).seals-=option.seals;spendMana(g,u,option.cost);useMorale(g,u,'进行反击，放弃本次属性应对');if(option.id!=='normal'){u.cd[skill.id]=skill.cd||0;u.battleUses??={};u.battleUses[skill.id]=(u.battleUses[skill.id]||0)+1;if(skill.onceDay)u.dayUses[skill.id]=g.day;if(skill.onceSlot)u.slotUses[skill.id]=true;}
 const incoming=counterPower(g,enemy,p.skill,u),answer=counterPower(g,u,skill,enemy);p.counterResolved=true;emitFX(g,u,{...skill,name:'反击 · '+skill.name},[enemy]);log(g,`${definition(g,u).name} 反击（0AP、1士气、${option.cost}MP${option.seals?'、'+option.seals+'划令咒':''}）：${skill.name}伤害${answer.raw} 对 ${p.skill.name||'通常攻击'}伤害${incoming.raw}，差值${Math.abs(incoming.raw-answer.raw)}。`,'counter');
 if(incoming.raw>answer.raw)counterHit(g,enemy,u,p.skill,incoming.raw-answer.raw);else if(answer.raw>incoming.raw)counterHit(g,u,enemy,skill,answer.raw-incoming.raw);else log(g,'反击双方伤害相同，本次交锋互不造成伤害。','counter');
 spendBuffs(u);u.snipeReady=false;u.nextTags=[];delete u.buff.next_dispel;delete u.buff.next_root;delete u.buff.next_weaken;u.soloRound=g.round;if(skill.id)u.effects=(u.effects||[]).filter(e=>e.kind!=='specialNext');if(skill.shield)u.shield=cap(u.shield+skill.shield,30);if(skill.field)for(const ally of aliveFighters(g).filter(v=>v.owner===u.owner)){addEffect(ally,'normalDamage',skill.field==='forge'?5:3,g.round+2);if(skill.field==='army')addEffect(ally,'movement',1,g.round+2);}if(skill.sacrificeSelf){u.hp=0;remove(g,u);}
 flushRuleEvents(g);if(!enemy.alive){p.position=p.targets.length;completeAttack(g);}else nextAttackTarget(g);
}

function recordContest(g,a,b,index,ar,br,av,bv){g.contestHistory??=[];g.event=(g.event||0)+1;g.contestHistory.push({id:g.event,battleId:g.battle?.id,attackId:g.pendingAttack?.id||null,segmentId:g.pendingAttack?.segmentId||null,at:Date.now(),index,attacker:a.id,defender:b.id,attackerDice:ar,defenderDice:br,attackerTotal:av,defenderTotal:bv,attackerSuccess:av>bv});g.contestHistory=g.contestHistory.slice(-32);enqueueRuleEvent(g,{type:'contest_result',unitId:a.id,targetId:b.id,success:av>bv?1:0,failure:av>bv?0:1,dice_total:av,attackId:g.pendingAttack?.id,segmentId:g.pendingAttack?.segmentId});enqueueRuleEvent(g,{type:'contest_result',unitId:b.id,targetId:a.id,success:av>bv?0:1,failure:av>bv?1:0,dice_total:bv,attackId:g.pendingAttack?.id,segmentId:g.pendingAttack?.segmentId});}
function redactContestState(g,out,owner){const own=id=>g.units.find(u=>u.id===id)?.owner===owner;const project=(r,a=r.attacker,b=r.defender)=>{const attack=own(a),defend=own(b);const dice=attack?r.attackerDice:defend?r.defenderDice:undefined,total=attack?r.attackerTotal:defend?r.defenderTotal:undefined;return {id:r.id,battleId:r.battleId,attackId:r.attackId,segmentId:r.segmentId,at:r.at,index:r.index,attacker:a,defender:b,attackerSuccess:r.attackerSuccess,skipped:r.skipped,ownRole:attack?'攻击方':'应对方',ownDice:dice,ownTotal:total,ownBonus:dice?total-dice.reduce((n,v)=>n+v,0):undefined,ownSuccess:attack?r.attackerSuccess:!r.attackerSuccess,text:r.skipped?'此小节按规则跳过':`${['筋力','耐久','敏捷','魔力','幸运'][r.index]}：${dice?'我方 ['+dice.join('+')+']，合计'+total:'骰子保密'}；攻击方${r.attackerSuccess?'成功':'失败'}，敌方骰子保密。`};};out.contestHistory=(g.contestHistory||[]).filter(r=>own(r.attacker)||own(r.defender)).map(r=>project(r));const p=out.pendingAttack;if(p){if(!own(p.attacker)&&p.skill){delete p.skill.dice;}p.checks=p.checks.map(r=>project(r,p.attacker,p.target));if(p.sneakCheck)p.sneakCheck=project(p.sneakCheck,p.attacker,p.target);if(!own(p.target))delete p.reaction.instinctDie;delete p.raw;}out.log=out.log.map(l=>({...l,text:/属性对抗 [12]：|偷袭部位前置：|偷袭先行敏捷对抗：|精神污染魔力对抗：/.test(l.text)?'属性对抗已结算；己方骰子和结果见掷骰记录，敌方骰子保密。':l.text.replace(/：\d+d\d+ \[[^\]]*\]＋[-\d.]+/g,'：伤害骰详情保密')}));}
function quickAIClash(g,a,b,fighters){const winner=random(2)===1?a:b,loser=winner===a?b:a,percent=random(75),serial=++g.battleSerial;oweBattleAction(g,fighters);for(const fighter of fighters)initializeCardResources(fighter,true);const injuries=fighters.map(u=>({u,hp:u.hp,rate:(u.owner||u.id)===(winner.owner||winner.id)?percent:percent*2}));for(const hit of injuries)hit.u.hp=Math.max(0,hit.hp-Math.floor(hit.hp*hit.rate/100));for(const hit of [...injuries].sort((a,b)=>(a.u.kind==='master')-(b.u.kind==='master')))remove(g,hit.u);g.lastBattle={id:serial,region:a.region,participants:fighters.map(u=>u.id),resumeId:a.id,quick:true,rounds:0,winner:winner.id,percent,reason:'纯AI快速结算'};log(g,`AI快速战斗 #${serial}：双方各50%胜率，${definition(g,winner).name}胜。rd75=${percent}，胜方损失${percent}%当前生命，败方损失${percent*2}%当前生命。`,'quickBattle',null);if(finishWar(g))return;if(!g.resolvingDaily){settleBattleDebt(g);if(dailyComplete(g))resolveDailyPlans(g);else schedule(g);}}

function useComposedAbility(g,u,a){
 const k=definition(g,u).skills.find(k=>k.id===a.skill);
 if((k.compose.trigger||'active')!=='active')throw Error('此能力需要其指定的触发时机。');
 if(!['daily','battle'].includes(g.phase)||(g.phase==='daily'?(g.resolvingDaily?activeUnit(g)?.id!==u.id:!dailyReady(g,u)):activeUnit(g)?.id!==u.id)||g.pendingAttack||u.channel)throw Error('请在自己的行动中使用自建技能，不能在应对或引导期间发动。');
 if(g.phase==='daily'&&!['daily','both'].includes(k.phase)||g.phase==='battle'&&!['battle','both'].includes(k.phase))throw Error('此自建技能不属于当前阶段。');
 if(g.phase==='battle'&&(!battleUnits(g).includes(u)||u.cd[k.id]>0))throw Error('未参战或技能仍在冷却。');
 return executeComposedAbility(g,u,k,a,{preflight:(targets,k)=>{if(k.compose.effects.some(e=>['damage','lose_hp'].includes(e.op)))preflightDamageLinks(g,targets);},attack:(skill,targets)=>queueAttack(g,u,skill,targets),log:targets=>{log(g,`${definition(g,u).name} 使用自建技能「${k.name}」。`,'skill',g.phase==='daily'?[u.owner||u.id]:undefined);log(g,k.desc,'skill',[u.owner||u.id]);},schedule:()=>schedule(g)});
}

function combatReduction(g,u,k){return k.tags?.includes('pierce')?0:ruleModifierTotal(g,u,'reduction')+(u.buff.defense||0)+effects(u,'allReduction',g)+(!k.id?effects(u,'normalReduction',g):0)+(u.ward||0);}
function markPacketTermination(p,result){if(result.killed){p.terminatedTargets??=[];if(!p.terminatedTargets.includes(result.unitId))p.terminatedTargets.push(result.unitId);if(result.unitId===p.attacker)p.cancelRemaining=true;}for(const transfer of result.transfers)markPacketTermination(p,transfer);}
function finishPacketVictims(g,result){for(const child of result.transfers)finishPacketVictims(g,child);const unit=g.units.find(u=>u.id===result.unitId);if(unit)remove(g,unit);}
export function canUseDefense(g,u){return !!(g.pendingAttack&&g.pendingAttack.target===u.id&&u.alive&&g.pendingAttack.checks.length===0&&['defender','part','defenderReaction','overrideDefender','unrespondableReaction','hpLossReaction'].includes(g.pendingAttack.stage));}
function useDefenseAbility(g,u,a){const p=g.pendingAttack,k=definition(g,u).skills.find(k=>k.id===a.skill);if(!canUseDefense(g,u)||!k?.compose||k.compose.trigger!=='reaction'||(p.defensesUsed||[]).includes(k.id)||u.cd[k.id]>0)throw Error('当前不能使用此独立防御反应。');executeComposedAbility(g,u,k,{}, {log:()=>log(g,`${definition(g,u).name} 使用独立防御「${k.name}」。`,'skill'),schedule:()=>schedule(g)});p.defensesUsed??=[];p.defensesUsed.push(k.id);}
function fireCardTriggers(g,u,event){
 if(g.phase!=='battle'||!u.alive)return;u.triggerMarks??={};const key=event==='after_move'?`${g.battle.id}:move:${g.event}`:`${g.battle.id}:${g.round}:${event}`;
 for(const k of definition(g,u).skills.filter(k=>k.compose?.trigger===event)){
  if(u.triggerMarks[k.id]===key||u.cd[k.id]>0)continue;
  try{executeComposedAbility(g,u,k,{}, {log:()=>log(g,`${definition(g,u).name} 触发「${k.name}」。`,'skill',[u.owner||u.id]),schedule:()=>{}});u.triggerMarks[k.id]=key;}catch(e){log(g,`「${k.name}」未触发：${e.message}`,'info',[u.owner||u.id]);}
 }
}
