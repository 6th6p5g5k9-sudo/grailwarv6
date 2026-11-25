import test from 'node:test';
import assert from 'node:assert/strict';
import {resolveCombatPacket,grantCombatEffect,normalizePriorityTable,preflightDamageLinks,activeCombatEffects} from '../public/combat-mechanics.js';
import {createRoom,startGame,startBattle,action,respondAttack,decisionUnit,canCounter,publicState,reachable,endTurn} from '../public/engine.js';
import {validateAbilities,compileAbility} from '../public/card-abilities.js';
import {NP_BANK} from '../public/roster.js';
import {api} from '../api.mjs';
const attackEffect=(changes={})=>({op:'damage',dice:0,bonus:10,damageType:'normal',segments:1,tags:['unrespondable'],hpLoss:0,...changes});
const ability=(effect,changes={})=>({id:'ability.complex',name:'复杂机制样本',category:'skill',phase:'battle',trigger:'active',target:'enemy',shape:'single',range:5,radius:1,cooldown:0,costs:[{resource:'ap',amount:1},{resource:'mp',amount:10}],effects:[effect],...changes});
function arena(e=attackEffect(),extra={}){
 const d={name:'攻击者',traits:{},skills:[],nps:[{bankId:NP_BANK[0].bankId}],abilities:[ability(e,extra.ability||{})],resources:extra.resources||[]};const g=createRoom('COMBAT','甲','token-a');g.host=g.players[0].id;Object.assign(g.players[0],{servant:'saber',customCard:d,ready:true});startGame(g,true);for(const p of g.players){p.bot=false;p.token||='token-'+p.id;}
 const [a,b]=g.units,m=g.units[7],n=g.units[8];b.region=m.region=n.region=a.region;g.awareness[a.id]={[b.id]:true};startBattle(g,a.id,{target:b.id});g.turn=g.order.indexOf(a.id);Object.assign(a,{x:4,y:4,hp:100,maxHp:100,battleAP:2,mp:60,externalMP:0,morale:2});Object.assign(b,{x:5,y:4,hp:100,maxHp:100,mp:60,externalMP:0,morale:0});Object.assign(m,{x:3,y:4});Object.assign(n,{x:6,y:4});g.deadline=Date.now()+3600000;return {g,a,b,m,n,k:a.card.skills.find(k=>k.compose)};
}
const protect=(f,target,e)=>grantCombatEffect(f.g,f.a,target,{name:'保护'},e);
const cast=f=>action(f.g,f.a.id,{type:'skill',skill:f.k.id,x:f.b.x,y:f.b.y});
const continueSegment=f=>respondAttack(f.g,decisionUnit(f.g).id,{});
const packet=(changes={})=>({kind:'damage',amount:30,reduction:5,successes:2,sourceUnitId:'caster',ownerPlayerId:'player',tags:[],...changes});
function pure(){const u={id:'target',owner:'target-owner',hp:100,maxHp:100,shield:20,alive:true};return {g:{round:1,units:[u],combatEvents:[],battle:{id:1,participants:[u.id],escaped:[]}},u};}
test('true damage bypasses ordinary shields and reductions, but respects invincibility',()=>{
 let {g,u}=pure();resolveCombatPacket(g,u,packet({damageType:'true'}));assert.equal(u.hp,70);assert.equal(u.shield,20);
 ({g,u}=pure());grantCombatEffect(g,u,u,{name:'无敌'},{op:'invincibility',duration:2,mode:'charges',charges:1,immuneToPierce:false});resolveCombatPacket(g,u,packet({damageType:'true'}));assert.equal(u.hp,100);assert.equal(u.combatState.guards[0].charges,0);
});
test('special shields explicitly block true damage, piercing skips them unless exempt',()=>{
 for(const immuneToPierce of [false,true]){const {g,u}=pure();grantCombatEffect(g,u,u,{name:'特殊盾'},{op:'special_shield',duration:2,amount:10,blocksTrue:true,immuneToPierce});resolveCombatPacket(g,u,packet({damageType:'true',tags:['pierce_invincibility']}));assert.equal(u.hp,immuneToPierce?80:70);assert.equal(u.combatState.guards[0].pool,immuneToPierce?0:10);}
});
test('direct HP loss consumes one invincibility charge, ignores shields and emits no damage events',()=>{
 const {g,u}=pure();grantCombatEffect(g,u,u,{name:'无敌'},{op:'invincibility',duration:3,mode:'charges',charges:1,immuneToPierce:false});let result=resolveCombatPacket(g,u,packet({kind:'hp_loss',amount:8}));assert.equal(result.hpLoss,0);assert.equal(u.combatState.guards[0].charges,0);result=resolveCombatPacket(g,u,packet({kind:'hp_loss',amount:8}));assert.equal(result.hpLoss,8);assert.equal(u.hp,92);assert.equal(u.shield,20);assert.ok(!g.combatEvents.some(e=>e.type==='damage_taken'||e.type==='damage_dealt'));
});
test('same-attack piercing applies to attached HP loss, and one ordinary guard protects the whole segment',()=>{
 for(const piercing of [false,true]){const {g,u}=pure();grantCombatEffect(g,u,u,{name:'无敌'},{op:'invincibility',duration:3,mode:'charges',charges:1,immuneToPierce:false});resolveCombatPacket(g,u,packet({amount:10,hpLoss:8,reduction:0,tags:piercing?['pierce_invincibility']:[]}));assert.equal(u.hp,piercing?82:100);assert.equal(u.combatState.guards[0].charges,piercing?1:0);}
});
test('HP floor cancels excess HP loss and never heals a target below the floor',()=>{
 const {g,u}=pure();u.hp=10;grantCombatEffect(g,u,u,{name:'锁血'},{op:'hp_floor',amount:4,duration:3});resolveCombatPacket(g,u,packet({kind:'hp_loss',amount:50}));assert.equal(u.hp,4);u.hp=2;resolveCombatPacket(g,u,packet({kind:'hp_loss',amount:1}));assert.equal(u.hp,2);assert.ok(g.combatEvents.some(e=>e.type==='hp_floor_prevented'));
});
test('missed ordinary damage does not consume invincibility',()=>{const {g,u}=pure();grantCombatEffect(g,u,u,{name:'无敌'},{op:'invincibility',mode:'charges',charges:1,duration:2,immuneToPierce:false});resolveCombatPacket(g,u,packet({successes:0}));assert.equal(u.combatState.guards[0].charges,1);});
test('multisegment attack pays once and has an independent defense window and guard consumption per segment',()=>{
 const f=arena(attackEffect({segments:3}));protect(f,f.b,{op:'invincibility',mode:'charges',charges:2,duration:3,immuneToPierce:false});cast(f);assert.equal(f.g.pendingAttack.stage,'unrespondableReaction');assert.equal(f.g.pendingAttack.segment,1);assert.equal(f.a.mp,50);assert.equal(f.a.battleAP,1);
 continueSegment(f);assert.equal(f.b.hp,100);assert.equal(f.g.pendingAttack.segment,2);continueSegment(f);assert.equal(f.b.hp,100);assert.equal(f.g.pendingAttack.segment,3);continueSegment(f);assert.equal(f.b.hp,90);assert.equal(f.g.pendingAttack,null);assert.equal(f.a.mp,50);assert.equal(f.g.contestHistory?.length||0,0);assert.equal(f.g.combatEvents.filter(e=>e.type==='attack_segment_started').length,3);
});
test('unrespondable damage permits a separately paid defensive skill without generating fake contest failures',()=>{
 const f=arena(attackEffect({segments:2})),d=ability({op:'invincibility',mode:'charges',charges:1,duration:3,immuneToPierce:false},{id:'ability.guard',trigger:'reaction',target:'self',costs:[{resource:'ap',amount:0},{resource:'mp',amount:3}]});f.b.card.skills.push(compileAbility(validateAbilities([d])[0]));f.b.battleAP=0;cast(f);
 action(f.g,f.b.id,{type:'useDefense',skill:'custom:ability.guard'});assert.equal(f.b.mp,57);assert.throws(()=>action(f.g,f.b.id,{type:'useDefense',skill:'custom:ability.guard'}));continueSegment(f);assert.equal(f.b.hp,100);action(f.g,f.b.id,{type:'useDefense',skill:'custom:ability.guard'});continueSegment(f);assert.equal(f.b.hp,100);assert.equal(f.b.mp,54);assert.ok(!f.g.combatEvents.some(e=>e.type==='contest_failed'));
});
test('killing a target stops its remaining segments even when it immediately revives',()=>{
 const f=arena(attackEffect({segments:3}));f.b.hp=5;protect(f,f.b,{op:'revival',amount:40,charges:1,duration:3});cast(f);continueSegment(f);assert.equal(f.b.alive,true);assert.equal(f.b.hp,40);assert.equal(f.g.pendingAttack,null);assert.equal(f.g.combatEvents.filter(e=>e.type==='attack_segment_started').length,1);assert.ok(f.g.combatEvents.some(e=>e.type==='unit_died'));assert.ok(f.g.combatEvents.some(e=>e.type==='unit_revived'));
});
test('each segment offers counterattack, and a counter killing the attacker immediately stops the chain',()=>{
 const f=arena(attackEffect({segments:3}));f.a.hp=1;f.b.morale=3;f.b.card.dice=40;cast(f);assert.ok(canCounter(f.g,f.b.id));action(f.g,f.b.id,{type:'counter'});assert.equal(f.a.alive,false);assert.equal(f.g.pendingAttack,null);assert.equal(f.g.combatEvents.filter(e=>e.type==='attack_segment_started').length,1);
});
test('a counter-killed attacker still cancels remaining segments if it revives',()=>{
 const f=arena(attackEffect({segments:3}));f.a.hp=1;f.b.morale=3;f.b.card.dice=40;protect(f,f.a,{op:'revival',amount:30,charges:1,duration:3});cast(f);action(f.g,f.b.id,{type:'counter'});assert.equal(f.a.alive,true);assert.equal(f.a.hp,30);assert.equal(f.g.pendingAttack,null);assert.equal(f.g.combatEvents.filter(e=>e.type==='attack_segment_started').length,1);
});
test('cannot-counter flags prohibit counteractions without removing ordinary defense',()=>{const f=arena(attackEffect({tags:['unrespondable','cannot_counter']}));f.b.morale=3;cast(f);assert.equal(canCounter(f.g,f.b.id),false);continueSegment(f);assert.equal(f.b.hp,90);});
test('direct HP-loss chains skip attributes/counters and obey locks without damage events',()=>{
 const f=arena({op:'lose_hp',amount:50,segments:2,tags:[]});f.b.hp=10;protect(f,f.b,{op:'hp_floor',amount:1,duration:3});cast(f);assert.equal(f.g.pendingAttack.stage,'hpLossReaction');assert.equal(canCounter(f.g,f.b.id),false);continueSegment(f);continueSegment(f);assert.equal(f.b.hp,1);assert.ok(!f.g.combatEvents.some(e=>e.type==='damage_taken'&&e.unitId===f.b.id));assert.equal(f.g.contestHistory?.length||0,0);
});
test('sourceless damage keeps owner separate, gets no caster bonuses or damage-dealt triggers',()=>{
 const f=arena(attackEffect({tags:['unrespondable','sourceless']}));f.a.gold=100;f.a.effects.push({kind:'allDamage',value:100});cast(f);continueSegment(f);assert.equal(f.b.hp,90);const event=f.g.combatEvents.find(e=>e.type==='damage_taken');assert.equal(event.sourceUnitId,null);assert.equal(event.ownerPlayerId,f.a.owner);assert.ok(!f.g.combatEvents.some(e=>e.type==='damage_dealt'));
});
test('damage transfers apply lock only to actual HP bearer and preserve the configured capture stage',()=>{
 const f=arena();protect(f,f.b,{op:'hp_floor',amount:100,duration:3});protect(f,f.a,{op:'hp_floor',amount:95,duration:3});protect(f,f.b,{op:'damage_link',percent:100,duration:3,captureStage:'before_defense',defenseOwner:'recipient',priority:'link.one'});cast(f);continueSegment(f);assert.equal(f.b.hp,100);assert.equal(f.a.hp,95);assert.ok(f.g.combatEvents.some(e=>e.type==='damage_transferred'&&e.actualHpBearerId===f.a.id));
});
test('conflicting link priority and cycles fail before any AP/MP cost, and explicit unique table resolves priority',()=>{
 const f=arena();protect(f,f.b,{op:'damage_link',percent:50,duration:3,captureStage:'before_defense',defenseOwner:'recipient',priority:'link.one'});grantCombatEffect(f.g,f.m,f.b,{name:'另一链接'},{op:'damage_link',percent:50,duration:3,captureStage:'before_defense',defenseOwner:'recipient',priority:'link.two'});assert.throws(()=>cast(f),/needs_priority_config/);assert.equal(f.a.mp,60);assert.equal(f.a.battleAP,2);
 f.g.priorityTable=normalizePriorityTable({'link.one':1,'link.two':2});cast(f);continueSegment(f);assert.equal(f.b.hp,95);assert.equal(f.a.hp,100);assert.ok(f.m.hp<f.m.maxHp);
 const loop=arena();protect(loop,loop.b,{op:'damage_link',percent:50,duration:3,captureStage:'before_defense',defenseOwner:'recipient',priority:'link.one'});grantCombatEffect(loop.g,loop.b,loop.a,{name:'环'},{op:'damage_link',percent:50,duration:3,captureStage:'before_defense',defenseOwner:'recipient',priority:'link.one'});assert.throws(()=>cast(loop),/循环/);assert.equal(loop.a.mp,60);
});
test('piercing never bypasses target selection protection',()=>{const f=arena(attackEffect({tags:['unrespondable','pierce_invincibility']}));protect(f,f.b,{op:'untargetable',duration:3});assert.throws(()=>cast(f),/没有可选/);assert.equal(f.a.mp,60);});
test('movement trigger gains resources; resource formula and conditional tags capture the specified cost stage',()=>{
 const resources=[{id:'res.intent',name:'剑意',initial:3,max:10,scope:'battle',visibility:'owner_only'}],effect=attackEffect({scaling:{resource:'res.intent',perStack:3,stage:'after_cost'},conditionalTags:[{resource:'res.intent',atLeast:4,tag:'pierce_invincibility',stage:'before_cost'}]});
 const f=arena(effect,{resources,ability:{costs:[{resource:'ap',amount:1},{resource:'res.intent',amount:2}]}});const passive=ability({op:'gain_resource',resource:'res.intent',amount:1},{id:'ability.gain',trigger:'after_move',target:'self',costs:[]});f.a.card.skills.push(compileAbility(validateAbilities([passive],resources)[0]));f.b.x=f.n.x=15;f.b.y=14;f.n.y=15;const step=reachable(f.g,f.a)[0];action(f.g,f.a.id,{type:'move',...step});assert.equal(f.a.customResources['res.intent'],4);f.b.x=f.a.x+1;f.b.y=f.a.y;protect(f,f.b,{op:'invincibility',mode:'charges',charges:1,duration:3,immuneToPierce:false});cast(f);assert.ok(f.g.pendingAttack.skill.mechanics.tags.includes('pierce_invincibility'));continueSegment(f);assert.equal(f.b.hp,84);assert.equal(f.a.customResources['res.intent'],2);
});
test('host alone may configure non-random rule priority during play and serialization preserves complex states',async()=>{
 const f=arena();protect(f,f.b,{op:'hp_floor',amount:1,duration:3});const map=new Map([[f.g.code,structuredClone(f.g)]]),repo={get:async code=>structuredClone(map.get(code)),save:async(g,rev)=>{if(map.get(g.code)?.revision!==rev)return false;map.set(g.code,structuredClone(g));return true;}};
 const request=token=>new Request('http://test/api/rooms/COMBAT/lobby',{method:'POST',headers:{authorization:'Bearer '+token,'content-type':'application/json'},body:JSON.stringify({revision:f.g.revision,type:'priorityConfig',priorityTable:{'link.one':10,'link.two':20}})});
 assert.equal((await api(request(f.g.players[1].token),repo)).status,400);assert.equal((await api(request('token-a'),repo)).status,200);assert.deepEqual(map.get(f.g.code).priorityTable,{'link.one':10,'link.two':20});const loaded=JSON.parse(JSON.stringify(f.g));assert.equal(activeCombatEffects(loaded,loaded.units.find(u=>u.id===f.b.id),'floors')[0].floor,1);
});
