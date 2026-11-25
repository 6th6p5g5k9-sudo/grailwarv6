import test from 'node:test';
import assert from 'node:assert/strict';
import {createRoom,startGame,startBattle,action,activeUnit,reachable,publicState} from '../public/engine.js';
import {createBoardModel,skillPlan,visibleStatuses} from '../public/battle-ui.js';
import {attackSelection} from '../public/targeting.js';

function uiArena(){
 const g=createRoom('UIRULE','甲','ui-secret');Object.assign(g.players[0],{servant:'saber',cardId:'zero-saber',ready:true});startGame(g,true);
 const [a,b,c]=g.units,m=g.units[7];for(const p of g.players)p.bot=false;b.region=m.region=a.region;g.awareness[a.id]={[b.id]:true};startBattle(g,a.id,{target:b.id});
 g.battle.participants.push(c.id);g.order.push(c.id);g.turn=g.order.indexOf(a.id);g.deadline=Date.now()+3600000;
 Object.assign(a,{x:4,y:4,battleAP:10,mp:200,externalMP:0});Object.assign(b,{x:5,y:4});Object.assign(c,{x:6,y:5});Object.assign(m,{x:3,y:4});
 return {g,a,b,c,m};
}
const uiKeys=points=>points.map(p=>`${p.x},${p.y}`).sort();
test('board movement reuses engine paths, AP and engaged/backstep restrictions',()=>{
 const {g,a,b,c}=uiArena();b.x=15;b.y=15;c.x=16;c.y=15;
 const model=createBoardModel(g,a);assert.deepEqual([...model.validKeys].sort(),uiKeys(reachable(g,a)));
 const point=reachable(g,a)[0],before=a.battleAP;assert.ok(model.selectionAt(point).valid);action(g,a.id,{type:'move',...point});assert.equal(a.x,point.x);assert.equal(a.y,point.y);assert.equal(a.battleAP,before-1);
 const other=uiArena();assert.equal(createBoardModel(other.g,other.a).validKeys.size,0);assert.deepEqual([...createBoardModel(other.g,other.a,'backstep').validKeys].sort(),uiKeys(reachable(other.g,other.a,true)));
 const blocked=uiArena();blocked.a.battleAP=0;assert.equal(createBoardModel(blocked.g,blocked.a,'move').validKeys.size,0);
});
test('single, area, line and self attacks preview exactly the engine-selected targets',()=>{
 for(const shape of [undefined,'area','line','selfArea']){
  const {g,a,b}=uiArena(),k={id:'user-defined-effect',name:'自定义名称不影响目标规则',type:'attack',phase:'battle',battleAP:1,cost:0,cd:2,dice:1,range:shape==='selfArea'?0:8,radius:2,...(shape?{shape}:{})};a.card.skills=[k];
  const point={x:b.x,y:b.y},selection=attackSelection(g,a,k,point),model=createBoardModel(g,a,k.id);assert.ok(selection.valid);assert.ok(model.selectionAt(point).valid);
  const before=a.battleAP;action(g,a.id,{type:'skill',skill:k.id,...point});assert.deepEqual(g.pendingAttack.targets,selection.targets.map(v=>v.id));assert.equal(a.battleAP,before-1);assert.equal(a.cd[k.id],2);
 }
});
test('prepared NP previews preserve their existing radius, height and sight rules',()=>{
 for(const shape of ['area','line','selfArea']){
  const {g,a,b}=uiArena(),k={id:'custom-np',name:'任意宝具名',type:'attack',phase:'battle',np:true,range:shape==='selfArea'?0:8,radius:2,shape,dice:2,cd:3};a.card.skills=[k];a.channel={skillId:k.id,ready:true,remaining:0,instant:true};a.battleAP=0;
  const selection=attackSelection(g,a,k,b,{release:true}),model=createBoardModel(g,a,'releaseNP');assert.ok(selection.valid);assert.ok(model.selectionAt(b).valid);
  action(g,a.id,{type:'releaseNP',x:b.x,y:b.y});assert.deepEqual(g.pendingAttack.targets,selection.targets.map(v=>v.id));assert.equal(a.battleAP,0);assert.equal(a.channel,undefined);assert.equal(a.cd[k.id],3);
 }
});
test('invalid empty and out-of-range cells never appear as legal single targets',()=>{
 const {g,a}=uiArena();const model=createBoardModel(g,a,'attack');assert.equal(model.selectionAt({x:19,y:19}).valid,false);assert.equal(model.selectionAt({x:4,y:3}).valid,false);
});
test('team support and configurable/custom skills retain their existing interaction types',()=>{
 assert.equal(skillPlan({type:'adapted',name:'复杂自建效果',tags:['team'],effects:[{kind:'heal',value:9}]}),'immediate');
 assert.equal(skillPlan({type:'attack',shape:'line',name:'另一个自定义名称'}),'aim');assert.equal(skillPlan({type:'attack',np:true}),'channel');assert.equal(skillPlan({libraryKey:'pollution',type:'buff'}),'existing');
 const {g,a,m}=uiArena(),k={id:'custom-support',name:'自定义团队治疗',type:'adapted',phase:'battle',battleAP:1,cost:5,cd:2,tags:['team'],effects:[{kind:'heal',value:9}]};a.card.skills=[k];a.hp-=12;m.hp-=12;const hp=a.hp,mhp=m.hp,mp=a.mp;action(g,a.id,{type:'skill',skill:k.id});assert.equal(a.hp,hp+9);assert.equal(m.hp,mhp+9);assert.equal(a.mp,mp-5);assert.equal(a.cd[k.id],2);
});
test('public status display uses existing visibility and marks own sourced effects',()=>{
 const {g,a,b}=uiArena();b.dots=[{kind:'poison',damage:4,until:g.round+1,owner:a.id}];a.effects=[{kind:'allReduction',value:15,until:g.round+2},{kind:'expired',value:99,until:g.round-1},{kind:'private',value:8,hidden:true}];
 const state=publicState(g,'ui-secret'),self=state.units.find(u=>u.id===a.id),enemy=state.units.find(u=>u.id===b.id);assert.equal(enemy.hp,null);assert.equal(enemy.card.hp,null);
 assert.ok(visibleStatuses(state,self).some(s=>s.name==='全类型减伤'&&s.detail.includes('3 轮')));assert.ok(!visibleStatuses(state,self).some(s=>['private','expired'].includes(s.name)));assert.equal(visibleStatuses(state,enemy).find(s=>s.name==='中毒').source,a.id);assert.deepEqual(visibleStatuses(state,{hidden:true,effects:[{kind:'secret'}]}),[]);
});
