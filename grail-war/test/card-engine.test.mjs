import test from 'node:test';
import assert from 'node:assert/strict';
import {validateResources,validateAbilities,compileAbility,composedSelection} from '../public/card-abilities.js';
import {createCustomServant,createMasterCard,DEFAULT_MASTER,NP_BANK} from '../public/roster.js';
import {createRoom,startGame,startBattle,action,publicState,endDailyTurn,endTurn,activeUnit,decisionUnit} from '../public/engine.js';
import {createBoardModel,skillPlan,visibleStatuses} from '../public/battle-ui.js';
const resource=(scope='battle')=>({id:'res.intent',name:'私密剑意',initial:3,max:10,scope,visibility:'owner_only'});
const ability=(overrides={})=>({id:'ability.focus',name:'自建蓄势',category:'skill',phase:'battle',target:'self',shape:'single',range:3,radius:1,cooldown:1,costs:[{resource:'ap',amount:1},{resource:'mp',amount:8},{resource:'res.intent',amount:2}],effects:[{op:'heal',amount:12},{op:'status',kind:'allReduction',amount:5,duration:2}],...overrides});
const draft=(abilities=[ability()],resources=[resource()])=>({name:'建卡样本',bio:'',traits:{},skills:[],nps:[{bankId:NP_BANK[0].bankId}],resources,abilities});
function room(d=draft()){
 const g=createRoom('CARDUI','甲','owner-token');Object.assign(g.players[0],{servant:'saber',customCard:d,ready:true});startGame(g,true);for(const p of g.players){p.bot=false;p.token||='enemy-'+p.id;}
 return g;
}
function arena(d=draft()){
 const g=room(d),[a,b]=g.units,m=g.units[7];b.region=m.region=a.region;g.awareness[a.id]={[b.id]:true};startBattle(g,a.id,{target:b.id});g.turn=g.order.indexOf(a.id);Object.assign(a,{x:4,y:4,mp:60,externalMP:0,battleAP:2,hp:20});Object.assign(b,{x:5,y:4});Object.assign(m,{x:3,y:4});return {g,a,b,m,k:a.card.skills.find(k=>k.compose)};
}
test('new abilities compile beside bank skills and share the existing slot budgets',()=>{
 const d=draft(),card=createCustomServant(d,'saber'),k=card.skills.find(k=>k.compose);assert.equal(k.type,'composed');assert.equal(k.cost,8);assert.ok(k.desc.includes('减免'));assert.equal(card.resources[0].id,'res.intent');
 assert.throws(()=>createCustomServant(draft(Array.from({length:4},(_,i)=>ability({id:'ability.slot'+i}))),'saber'),/栏位/);
 const master=createMasterCard({...DEFAULT_MASTER,skills:[],resources:[resource()],abilities:[ability({category:'master_skill'})]});assert.equal(master.skills[0].type,'composed');
 assert.throws(()=>createMasterCard({...DEFAULT_MASTER,abilities:[ability({category:'master_skill'})],resources:[resource()]}),/栏位/);
 d.resources[0].max=99;d.abilities[0].effects[0].amount=999;assert.equal(card.resources[0].max,10);assert.equal(k.compose.effects[0].amount,12);
});
test('unknown operations, formulas, NaN, duplicate costs and invalid references fail explicitly',()=>{
 for(const effect of [{op:'true_damage',amount:5},{op:'heal',amount:10,js:'alert(1)'},{op:'heal',amount:NaN},{op:'gain_resource',resource:'unknown',amount:5}])assert.throws(()=>validateAbilities([ability({effects:[effect]})],[resource()]));
 assert.throws(()=>validateResources([{...resource(),id:'constructor'}]));assert.throws(()=>validateResources([resource(),resource()]));
 assert.throws(()=>validateAbilities([ability({costs:[{resource:'ap',amount:1},{resource:'mp',amount:2},{resource:'mp',amount:2}]})],[resource()]),/合并/);
 assert.throws(()=>validateAbilities([ability({phase:'daily',cooldown:0})],[resource()]),/战斗资源/);
});
test('joint payment is atomic, uses typed resources, then applies heal and sourced duration',()=>{
 const {g,a,k}=arena();a.customResources['res.intent']=1;const before=structuredClone(a);assert.throws(()=>action(g,a.id,{type:'skill',skill:k.id}),/代价不足/);assert.deepEqual(a,before);assert.equal(g.pendingAttack,null);
 a.customResources['res.intent']=3;action(g,a.id,{type:'skill',skill:k.id});assert.equal(a.battleAP,1);assert.equal(a.mp,52);assert.equal(a.customResources['res.intent'],1);assert.equal(a.hp,32);assert.equal(a.cd[k.id],1);assert.equal(a.effects.at(-1).until,g.round+1);assert.equal(a.effects.at(-1).owner,a.id);
 assert.throws(()=>action(g,a.id,{type:'skill',skill:k.id}),/冷却/);
});
test('HP and contract seal costs never partially spend and never kill their payer',()=>{
 const costs=[{resource:'ap',amount:1},{resource:'hp',amount:10},{resource:'seals',amount:1}],{g,a,k}=arena(draft([ability({costs})]));a.hp=10;const seals=a.seals;assert.throws(()=>action(g,a.id,{type:'skill',skill:k.id}),/代价不足/);assert.equal(a.battleAP,2);assert.equal(a.seals,seals);
 a.hp=20;action(g,a.id,{type:'skill',skill:k.id});assert.equal(a.hp,22);assert.equal(a.seals,seals-1);
});
test('custom resource gains clamp to max, and day-eight MP surcharge uses the same payment',()=>{
 const {g,a,k}=arena(draft([ability({costs:[{resource:'ap',amount:1},{resource:'mp',amount:4}],effects:[{op:'gain_resource',resource:'res.intent',amount:20}]})]));g.day=8;action(g,a.id,{type:'skill',skill:k.id});assert.equal(a.mp,52);assert.equal(a.customResources['res.intent'],10);
});
test('friendly targeting previews the actual recipient and updates only the selected ally',()=>{
 const {g,a,b,m,k}=arena(draft([ability({target:'ally',effects:[{op:'heal',amount:9}],costs:[{resource:'ap',amount:1}]})]));m.hp=10;const model=createBoardModel(g,a,k.id);assert.ok(model.selectionAt(m).valid);assert.equal(model.selectionAt(b).valid,false);assert.equal(skillPlan(k),'aim');action(g,a.id,{type:'skill',skill:k.id,x:m.x,y:m.y});assert.equal(m.hp,19);assert.equal(a.hp,20);
});
test('custom enemy area attacks use their exact preview target set and original response pipeline',()=>{
 const {g,a,b,k}=arena(draft([ability({category:'noble_phantasm',target:'enemies',shape:'area',effects:[{op:'damage',dice:2,bonus:3}],costs:[{resource:'ap',amount:1}]})].map(a=>({...a,category:'skill'}))));
 const selected=composedSelection(g,a,k,b);assert.ok(selected.valid);action(g,a.id,{type:'skill',skill:k.id,x:b.x,y:b.y});assert.deepEqual(g.pendingAttack.targets,selected.targets.map(u=>u.id));assert.equal(g.pendingAttack.stage,'defender');assert.equal(decisionUnit(g).id,b.id);assert.equal(a.battleAP,1);
});
test('daily composed actions wait for the simultaneous barrier, then pay and apply once',()=>{
 const d=draft([ability({phase:'daily',cooldown:0,costs:[{resource:'ap',amount:1}],effects:[{op:'gain_resource',resource:'res.intent',amount:2}]})],[resource('campaign')]),g=room(d),a=g.units[0],k=a.card.skills.find(k=>k.compose);action(g,a.id,{type:'skill',skill:k.id});assert.equal(a.customResources['res.intent'],3);
 while(g.dailyStep===0)endDailyTurn(g);assert.equal(a.customResources['res.intent'],5);assert.equal(a.dailyAP,2);
});
test('hidden resources and templates never leak in lobby, units, plans or pending attack state',()=>{
 const g=room(),a=g.units[0],enemyToken=g.players[1].token;const other=publicState(g,enemyToken);assert.ok(!JSON.stringify(other).includes('res.intent'));assert.equal(publicState(g,'owner-token').units.find(u=>u.id===a.id).customResources['res.intent'],3);
 const d=draft([ability({target:'enemy',effects:[{op:'damage',dice:2,bonus:0}]})]),f=arena(d);action(f.g,f.a.id,{type:'skill',skill:f.k.id,x:f.b.x,y:f.b.y});const foe=publicState(f.g,f.g.players[1].token);assert.ok(!JSON.stringify(foe).includes('res.intent'));assert.ok(!foe.pendingAttack.skill.compose);
});
test('public resources remain visible only with a visible unit; old cards and serialized rooms still work',()=>{
 const r={...resource(),visibility:'public'},f=arena(draft([ability()],[r]));const token=f.g.players[1].token,view=publicState(f.g,token);assert.equal(view.units.find(u=>u.id===f.a.id).customResources['res.intent'],3);
 const loaded=JSON.parse(JSON.stringify(f.g)),actor=loaded.units.find(u=>u.id===f.a.id);action(loaded,actor.id,{type:'skill',skill:f.k.id});assert.equal(actor.customResources['res.intent'],1);
 const old=createCustomServant({name:'旧卡',traits:{},skills:[],nps:[{bankId:NP_BANK[0].bankId}]},'saber');assert.deepEqual(old.resources,[]);
});
test('battle resources reset on admission while campaign balances survive, and duration expires on its round',()=>{
 const resources=[resource(),{...resource('campaign'),id:'res.saved',name:'持久材料'}],g=room(draft([ability()],resources)),[a,b]=g.units;
 a.customResources['res.intent']=1;a.customResources['res.saved']=7;b.region=a.region;g.awareness[a.id]={[b.id]:true};startBattle(g,a.id,{target:b.id});g.turn=g.order.indexOf(a.id);a.battleAP=2;a.mp=60;a.externalMP=0;
 assert.equal(a.customResources['res.intent'],3);assert.equal(a.customResources['res.saved'],7);const k=a.card.skills.find(k=>k.compose);action(g,a.id,{type:'skill',skill:k.id});
 let guard=0;while(g.round<3&&guard++<20)endTurn(g);assert.ok(guard<20);assert.ok(!a.effects.some(e=>e.owner===a.id));
});
