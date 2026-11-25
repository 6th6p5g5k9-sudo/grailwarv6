import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {parseRuleExpression,evaluateRuleExpression} from '../public/rule-expression.js';
import {validateRuleAbility,compileRuleAbility} from '../public/rule-model.js';
import {emitRuleEvent,executeRuleClause,ruleModifierTotal,readRuleCounter} from '../public/rule-runtime.js';
import {runRuleSandbox} from '../public/rule-sandbox.js';
import {createRoom,startGame,startBattle,action,respondAttack,reachablePaths,endTurn,publicState} from '../public/engine.js';
import {NP_BANK} from '../public/roster.js';
import {compileAbility,validateAbilities} from '../public/card-abilities.js';
const sample=async name=>JSON.parse(await readFile(new URL('../examples/unified/'+name,import.meta.url),'utf8'));
function stateFor(raw){const skill=compileRuleAbility(validateRuleAbility(raw)),u={id:'unit',owner:'player',alive:true,hp:100,maxHp:100,mp:100,externalMP:0,battleAP:2,morale:3,shield:0,x:0,y:0,card:{hp:100,mp:100,ranks:['C','C','C','C','C'],resources:[],skills:[skill]}},g={phase:'battle',round:1,timeIndex:0,day:1,battle:{id:1,participants:[u.id],escaped:[]},turn:0,order:[u.id],units:[u]};return {g,u,skill};}
function arena(raw){const g=createRoom('RULEUI','甲','token');g.host=g.players[0].id;Object.assign(g.players[0],{servant:'saber',customCard:{name:'通用模型样本',traits:{},skills:[],nps:[{bankId:NP_BANK[0].bankId}],abilities:[raw]},ready:true});startGame(g,true);for(const p of g.players){p.bot=false;p.token||='opponent-'+p.id;}const [a,b]=g.units,m=g.units[7],n=g.units[8];b.region=m.region=n.region=a.region;g.awareness[a.id]={[b.id]:true};startBattle(g,a.id,{target:b.id});g.turn=g.order.indexOf(a.id);Object.assign(a,{x:4,y:4,hp:100,maxHp:100,mp:60,externalMP:0,battleAP:2});Object.assign(b,{x:14,y:14});Object.assign(m,{x:3,y:4});Object.assign(n,{x:15,y:14});return {g,a,b,m,n,k:a.card.skills.find(k=>k.rule)};}
const basic=effects=>({id:'rule.basic',name:'基础词条',category:'skill',clauses:[{id:'clause.active',window:'own_turn',trigger:{event:'manual'},costs:[{resource:'mp',amount:5}],effects}]});
test('safe expressions support the requested arithmetic, comparisons, percentages, variables and rounding',()=>{
 const refs={total_hp_lost:37,max_hp:100,moved_cells_this_round:24,X:3,'target.max_hp':100,'target.hp':42};const evaluate=x=>evaluateRuleExpression(x,key=>refs[key]);assert.equal(evaluate('floor(total_hp_lost / (max_hp * 0.1))'),3);assert.equal(evaluate('min(moved_cells_this_round, 18)'),18);assert.equal(evaluate('X * 400'),1200);assert.equal(evaluate('target.max_hp - target.hp'),58);assert.equal(evaluate('ceil(percent(75, 10))'),8);assert.equal(evaluate('abs(-5) + max(2, 9)'),14);assert.equal(evaluate('X >= 3 && X < 5'),true);
});
test('formulas reject executable code, prototype access, missing references, division by zero and excessive nesting',()=>{
 for(const expr of ['globalThis.process','self.constructor','eval(1)','self.hp = 3','[1,2]','Math.random()','1 / 0'])assert.throws(()=>evaluateRuleExpression(expr,()=>undefined));assert.throws(()=>parseRuleExpression('('.repeat(40)+'1'+')'.repeat(40)));assert.throws(()=>evaluateRuleExpression('target.secret',()=>undefined),/unknown_reference/);
});
test('the three original evidence-based models preserve missing rulings and unimplemented interactions',async()=>{
 for(const filename of ['case-a-hp.json','case-b-guess.json','case-c-movement.json']){const raw=await sample(filename),model=validateRuleAbility(raw);assert.ok(model.clauses.length);const f=stateFor(raw),before=f.u.mp;assert.throws(()=>executeRuleClause(f.g,f.u,f.skill,model.clauses[0].id),/needs_ruling|requires_handler/);assert.equal(f.u.mp,before);}
});
test('case A runs through actual combat once its demo accumulation and durations are explicitly resolved',async()=>{
 const raw=await sample('case-a-hp.json');for(const c of raw.clauses){c.status='implemented';c.issues=['仅测试用的显式裁定，不代表原卡'];for(const e of c.effects)if(e.timer)e.timer.duration=3;}raw.clauses[1].trigger.event='battle_round_end';raw.clauses[1].limit={scope:'battle_round',max:1};
 const f=arena(raw);f.b.x=5;f.b.y=4;f.n.x=6;f.n.y=4;const spell={id:'ability.hit',name:'测试伤害',category:'skill',phase:'battle',target:'enemy',shape:'single',range:3,radius:0,cooldown:0,costs:[{resource:'ap',amount:1}],effects:[{op:'damage',dice:0,bonus:55,tags:['unrespondable']}]};f.b.card.skills.push(compileAbility(validateAbilities([spell])[0]));f.g.turn=f.g.order.indexOf(f.b.id);f.b.battleAP=2;
 action(f.g,f.b.id,{type:'skill',skill:'custom:ability.hit',x:f.a.x,y:f.a.y});respondAttack(f.g,f.a.id,{});assert.equal(f.a.hp,45);assert.equal(ruleModifierTotal(f.g,f.a,'reduction'),5);assert.equal(readRuleCounter(f.g,f.a,f.k,'lost_actual').value,5);
 emitRuleEvent(f.g,{type:'battle_round_end',unitId:f.a.id});assert.equal(f.a.hp,47);assert.equal(ruleModifierTotal(f.g,f.a,'contest'),3);assert.equal(ruleModifierTotal(f.g,f.a,'reduction'),5);
});
test('case C uses actual path lengths, pays 20MP once per round and stores counter separately from damage',async()=>{
 const f=arena(await sample('demo-movement.json'));const step1=reachablePaths(f.g,f.a).find(p=>p.distance>=3);assert.ok(step1);action(f.g,f.a.id,{type:'move',x:step1.x,y:step1.y});const step2=reachablePaths(f.g,f.a).find(p=>p.distance>=3);assert.ok(step2);action(f.g,f.a.id,{type:'move',x:step2.x,y:step2.y});const moved=step1.distance+step2.distance;assert.equal(readRuleCounter(f.g,f.a,f.k,'moved_cells_this_round').value,moved);
 action(f.g,f.a.id,{type:'ruleClause',skill:f.k.id,clause:'clause.movement'});assert.equal(f.a.mp,40);assert.equal(ruleModifierTotal(f.g,f.a,'damage'),Math.min(moved,18));assert.throws(()=>action(f.g,f.a.id,{type:'ruleClause',skill:f.k.id,clause:'clause.movement'}),/usage_limit/);assert.equal(f.a.mp,40);
 let guard=0;while(f.g.round===1&&guard++<20)endTurn(f.g);assert.ok(guard<20);assert.equal(readRuleCounter(f.g,f.a,f.k,'moved_cells_this_round').value,0);assert.equal(ruleModifierTotal(f.g,f.a,'damage'),0);
});
test('one skill has independent windows, targets, costs, limits and cooldowns per clause',()=>{
 const raw=basic([{op:'heal',amount:2}]);raw.clauses.push({id:'clause.move',window:'automatic',trigger:{event:'after_move'},condition:{all:[{compare:{left:'event.cells',op:'gte',right:3}},{not:{compare:{left:'self.hp',op:'gt',right:99}}}]},costs:[],effects:[{op:'heal',amount:4}]});const f=stateFor(raw);f.u.hp=80;executeRuleClause(f.g,f.u,f.skill,'clause.active');assert.equal(f.u.mp,95);assert.equal(f.u.hp,82);emitRuleEvent(f.g,{type:'after_move',unitId:f.u.id,cells:3});assert.equal(f.u.hp,86);assert.equal(f.u.mp,95);
});
test('all costs and formulas validate before spending and cyclic variables cannot run',()=>{
 const raw=basic([{op:'heal',amount:'1 / 0'}]),f=stateFor(raw);assert.throws(()=>executeRuleClause(f.g,f.u,f.skill,'clause.active'));assert.equal(f.u.mp,100);raw.clauses[0].effects[0].amount='X';raw.clauses[0].variables={X:'Y',Y:'X'};const circular=stateFor(raw);assert.throws(()=>executeRuleClause(circular.g,circular.u,circular.skill,'clause.active'),/cyclic_variable/);assert.equal(circular.u.mp,100);
});
test('stack cap, independent expiry, next-attack consumption and delayed events execute without per-card code',()=>{
 const raw=basic([{op:'modifier',stat:'damage',value:10,stack:{key:'bonus',mode:'add',cap:18},timer:{scope:'battle_round',duration:3,consumeOn:'attack_declared',uses:1}}]);const f=stateFor(raw);executeRuleClause(f.g,f.u,f.skill,'clause.active');executeRuleClause(f.g,f.u,f.skill,'clause.active');assert.equal(ruleModifierTotal(f.g,f.u,'damage'),18);emitRuleEvent(f.g,{type:'attack_declared',unitId:f.u.id});assert.equal(ruleModifierTotal(f.g,f.u,'damage'),18);emitRuleEvent(f.g,{type:'attack_finished',unitId:f.u.id});assert.equal(ruleModifierTotal(f.g,f.u,'damage'),0);
 const delayed=stateFor(basic([{op:'schedule',after:{scope:'battle_round',duration:2},costs:[{resource:'mp',amount:3}],effects:[{op:'heal',amount:7}]}]));delayed.u.hp=50;executeRuleClause(delayed.g,delayed.u,delayed.skill,'clause.active');assert.equal(delayed.u.mp,95);delayed.g.round=2;emitRuleEvent(delayed.g,{type:'battle_round_start',unitId:delayed.u.id});assert.equal(delayed.u.hp,50);delayed.g.round=3;emitRuleEvent(delayed.g,{type:'battle_round_start',unitId:delayed.u.id});assert.equal(delayed.u.hp,57);assert.equal(delayed.u.mp,92);
});
test('sandbox uses real handlers on isolated state and private rule state is filtered',async()=>{
 const raw=await sample('demo-movement.json'),result=runRuleSandbox(raw);assert.equal(result.mp,80);assert.equal(result.damage,5);const f=arena(raw);action(f.g,f.a.id,{type:'ruleClause',skill:f.k.id,clause:'clause.movement'});const enemy=publicState(f.g,f.g.players[1].token);assert.ok(!enemy.units.find(u=>u.id===f.a.id).ruleState);assert.ok(!enemy.units.find(u=>u.id===f.a.id).card.skills.some(k=>k.rule));
});
test('cooldown, source-death cleanup and battle-round reset are distinct timers',()=>{
 const raw=basic([{op:'modifier',stat:'contest',value:3,stack:{key:'focus',mode:'none'},timer:{scope:'battle_round',duration:5,sourceDeath:'remove'}}]);raw.clauses[0].timer={scope:'battle_round',duration:3};const f=stateFor(raw);executeRuleClause(f.g,f.u,f.skill,'clause.active');f.g.round=2;assert.throws(()=>executeRuleClause(f.g,f.u,f.skill,'clause.active'),/cooldown/);f.g.round=4;executeRuleClause(f.g,f.u,f.skill,'clause.active');assert.equal(ruleModifierTotal(f.g,f.u,'contest'),3);f.u.alive=false;assert.equal(ruleModifierTotal(f.g,f.u,'contest'),0);
});
test('battle timers never leak into a later battle and own-applied modifiers remain visible without enemy counters',()=>{
 const delayed=stateFor(basic([{op:'schedule',after:{scope:'battle_round',duration:2},effects:[{op:'heal',amount:7}]}]));delayed.u.hp=50;executeRuleClause(delayed.g,delayed.u,delayed.skill,'clause.active');delayed.g.battle.id=2;delayed.g.round=3;emitRuleEvent(delayed.g,{type:'battle_round_start',unitId:delayed.u.id});assert.equal(delayed.u.hp,50);
});
test('an author sees its modifiers on another unit, while unrelated players never receive private counters',()=>{
 const raw=basic([{op:'modifier',target:'selected',stat:'contest',value:3,stack:{key:'tagged',mode:'none'},timer:{scope:'battle_round',duration:3}}]);raw.clauses[0].targeting={kind:'enemy',range:3};const f=arena(raw);f.b.x=5;f.b.y=4;action(f.g,f.a.id,{type:'ruleClause',skill:f.k.id,clause:'clause.active',target:f.b.id});const source=publicState(f.g,'token').units.find(u=>u.id===f.b.id);assert.equal(source.visibleRuleModifiers.length,1);assert.equal(source.ruleState,undefined);const outsider=f.g.units[2];f.g.battle.participants.push(outsider.id);const view=publicState(f.g,f.g.players[2].token).units.find(u=>u.id===f.b.id);assert.equal(view.ruleState,undefined);assert.equal(view.visibleRuleModifiers,undefined);
});
test('activation window and trigger stay independent; an own-turn listener cannot fire on the enemy turn',()=>{
 const raw=basic([{op:'heal',amount:5}]);raw.clauses[0].window='own_turn';raw.clauses[0].trigger={event:'hp_changed',subject:'self'};raw.clauses[0].condition={compare:{left:'event.hp_loss',op:'gt',right:0}};raw.clauses[0].costs=[];const f=stateFor(raw);f.u.hp=50;f.g.order=['enemy',f.u.id];f.g.turn=0;emitRuleEvent(f.g,{type:'hp_changed',unitId:f.u.id,amount:-5});assert.equal(f.u.hp,50);f.g.turn=1;emitRuleEvent(f.g,{type:'hp_changed',unitId:f.u.id,amount:-5});assert.equal(f.u.hp,55);
});

test('recursive resource-trigger chains stop at the event budget rather than hanging',()=>{const raw=basic([{op:'gain_resource',resource:'mp',amount:1}]);raw.clauses[0].window='automatic';raw.clauses[0].trigger={event:'resource_spent',subject:'self'};raw.clauses[0].costs=[{resource:'mp',amount:1}];const f=stateFor(raw);emitRuleEvent(f.g,{type:'resource_spent',unitId:f.u.id,resource:'mp',amount:1});assert.ok(f.g.ruleErrors.some(e=>e.code==='rule_budget_exceeded'));assert.equal(f.u.mp,100);});
