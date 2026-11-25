import {activeCombatEffects} from './combat-mechanics.js';
import {ABILITY_TRIGGERS} from './complex-schema.js';
import {composedSelection,customResourceValue} from './card-abilities.js';
import {planAbilityPayment} from './card-runtime.js';
import {SIZE,LANDMARKS,terrain,BY_ID} from './data.js';
import {definition} from './roster.js';
import {activeUnit,battleUnits,reachable,chargeCells,availableMana,manaCost,dist} from './engine.js';
import {withdrawalCost,altitude} from './tactics.js';
import {attackSelection,attackCenter,attackInRange,sight} from './targeting.js';

const uiEscape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const uiKey=p=>`${p.x},${p.y}`;
const uiOwner=u=>u.owner||u.id;
const uiModels=new WeakMap();
const uiMoveModes=new Set(['move','backstep','charge']);
const uiGrid=Array.from({length:SIZE*SIZE},(_,i)=>({x:i%SIZE,y:Math.floor(i/SIZE)}));
const uiLandmarks=new Map(LANDMARKS.map(l=>[uiKey(l),l]));

// Type/shape/effect metadata determines interaction, never a card's display name.
// Existing configurable library and Master abilities keep their own forms.
export function skillPlan(k){
 if(k.type==='composed')return k.compose.target==='self'||k.shape==='selfArea'?'immediate':'aim';
 if(k.type==='attack'&&(k.np||k.chant))return 'channel';
 if(k.type==='master'||k.libraryKey)return 'existing';
 if(['buff','summon','adapted'].includes(k.type))return 'immediate';
 if(k.shape==='selfArea')return 'immediate';
 return 'aim';
}
export function createBoardModel(g,u,mode=null,control={}){
 const cacheKey=JSON.stringify([u.id,mode,control.target,control.command]);
 let cache=uiModels.get(g);if(!cache){cache=new Map();uiModels.set(g,cache);}if(cache.has(cacheKey))return cache.get(cacheKey);
 const fighters=battleUnits(g).filter(v=>v.alive),positions=new Map(fighters.map(v=>[uiKey(v),v])),card=definition(g,u),turn=activeUnit(g)?.id===u.id;
 const participating=fighters.some(v=>v.id===u.id),freeRelease=mode==='releaseNP'&&u.channel?.ready&&u.channel.instant;
 const canAct=g.phase==='battle'&&u.alive&&participating&&!g.pendingAttack&&(turn||freeRelease);
 const effectiveMode=mode||(canAct&&!u.channel?'move':null),moving=uiMoveModes.has(effectiveMode),controlling=mode==='sacrifice'&&!!control.command;
 const controlled=controlling&&control.target?fighters.find(v=>v.id===control.target):null;
 const ability=mode==='releaseNP'?card.skills.find(k=>k.id===u.channel?.skillId):['attack','preciseAttack','sweep'].includes(mode)?{range:card.range,name:mode==='sweep'?'横扫':'通常攻击'}:card.skills.find(k=>k.id===mode);
 let ap=moving?(effectiveMode==='move'&&u.freeMove?0:effectiveMode==='backstep'?withdrawalCost(g,u):1):mode==='releaseNP'?0:mode==='preciseAttack'?2:mode==='sweep'?1:ability?.battleAP??1;
 const cost=ability?.id?manaCost(g,ability,u):0;
 let paymentReason='';if(ability?.compose&&canAct){try{planAbilityPayment(g,u,ability);}catch(e){paymentReason=e.message;}}
 const reason=paymentReason||(!canAct?(g.pendingAttack?'请先完成当前攻击的应对。':!participating?'该单位未在本场战斗中。':'请等待该角色的战斗回合。'):u.channel&&mode!=='releaseNP'?'引导中，请继续引导或选择宝具落点。':u.battleAP<ap?'战斗行动点不足。':availableMana(u)<cost?'魔力不足。':ability?.id&&u.cd?.[ability.id]>0?'技能仍在冷却。':'');
 const movementBlocked=!!u.channel||g.grail?.holderId===u.id;
 let moves=[];if(canAct&&moving&&!reason&&!movementBlocked)moves=effectiveMode==='charge'?chargeCells(g,u):reachable(g,u,effectiveMode==='backstep');
 const moveKeys=new Set(moves.map(uiKey)),rangeKeys=new Set(),validKeys=new Set(),selections=new Map();
 let controlledMoves=null;if(controlled&&['move','charge'].includes(control.command)&&!controlled.channel&&g.grail?.holderId!==controlled.id)controlledMoves=new Set((control.command==='move'?reachable(g,controlled):chargeCells(g,controlled)).map(uiKey));
 function selectionAt(point){
  const key=uiKey(point);if(selections.has(key))return selections.get(key);
  let result={valid:false,inRange:false,targets:[],cells:[],reason:reason||'请选择可用动作。'};
  if(moving){const valid=moveKeys.has(key);result={...result,valid,inRange:valid,cells:valid?[point]:[],reason:reason||(movementBlocked?'当前不能移动。':valid?'':'无法移动至该位置。')};}
  else if(controlling){
   const target=positions.get(key);
   if(!controlled){const valid=canAct&&!reason&&target&&target.id!==u.id&&sight(u,target);result={...result,valid:!!valid,inRange:!!valid,targets:valid?[target]:[],cells:valid?[point]:[],reason:valid?'':'第一步：选择视线内的受控单位；属性条件由技能系统判定。'};}
   else{const valid=canAct&&!reason&&(controlledMoves?controlledMoves.has(key):target&&target.id!==controlled.id&&dist(controlled,target)<=definition(g,controlled).range&&sight(controlled,target));result={...result,valid:!!valid,inRange:!!valid,targets:valid&&target?[target]:[],cells:valid?[point]:[],reason:valid?'':'第二步：请选择受控单位可执行动作的目标。'};}
  }else if(ability&&mode){
   const options={release:mode==='releaseNP',sweep:mode==='sweep'},selected=ability.compose?composedSelection(g,u,ability,point):attackSelection(g,u,ability,point,options);
   const valid=canAct&&!reason&&selected.valid;result={...selected,valid,reason:reason||selected.reason,cells:selected.inRange?uiGrid.filter(p=>selected.contains(positions.get(uiKey(p))||p)):[]};
  }
  selections.set(key,result);return result;
 }
 for(const point of uiGrid){
  const key=uiKey(point);
  if(moving){if(moveKeys.has(key)){rangeKeys.add(key);validKeys.add(key);}continue;}
  if(controlling){const sel=selectionAt(point);if(sel.valid){rangeKeys.add(key);validKeys.add(key);}continue;}
  if(ability?.compose&&mode&&canAct&&!reason){const selection=composedSelection(g,u,ability,point);if(selection.inRange)rangeKeys.add(key);if(selection.valid)validKeys.add(key);continue;}
  if(ability&&mode&&canAct&&!reason){const options={release:mode==='releaseNP',sweep:mode==='sweep'},center=attackCenter(g,u,ability,point,options);if(attackInRange(g,u,ability,center,options)){rangeKeys.add(key);if(attackSelection(g,u,ability,point,options).valid)validKeys.add(key);}}
 }
 const name=ability?.name||({move:'移动',backstep:'后撤',charge:'冲锋',preciseAttack:'精准射击'}[effectiveMode]||'选择动作');
 const hint=reason|| (controlling?(controlled?'步骤 2/2 · 为受控单位选择动作目标':'步骤 1/2 · 选择受控单位'):moving?'蓝色格可移动 · 点击执行，点击我方棋子切换角色':mode?`${name} · 点击带实线标记的合法目标，ESC 或右键取消`:'选择技能，或点击我方棋子查看');
 const model={positions,canAct,effectiveMode,moving,ability,rangeKeys,validKeys,selectionAt,hint,name};cache.set(cacheKey,model);return model;
}

export function boardMarkup(g,u,model,icon){
 const current=activeUnit(g),cells=uiGrid.map(point=>{
  const key=uiKey(point),unit=model.positions.get(key),land=uiLandmarks.get(key),type=terrain(point.x,point.y),valid=model.validKeys.has(key),inRange=model.rangeKeys.has(key),own=unit&&uiOwner(unit)===g.me;
  const label=`${String.fromCharCode(65+point.x)}${point.y+1}${unit?' · '+definition(g,unit).name:''}${land?' · '+land.name:''}`;
  const danger=g.inset&&(point.x<g.inset||point.y<g.inset||point.x>=SIZE-g.inset||point.y>=SIZE-g.inset);
  return `<button class="cell ${type} ${valid?model.moving?'reachable':'legal-target':inRange?'range-only':''} ${inRange&&!model.moving?'targetable':''} ${danger?'danger':''} ${unit?.id===current?.id?'active-cell':''} ${unit?.id===u.id?'selected-piece':''}" data-do="cell" data-x="${point.x}" data-y="${point.y}" aria-label="${uiEscape(label)}" title="${uiEscape(label)}" ${unit?.id===u.id?'aria-pressed="true"':''}><span class="cell-surface" aria-hidden="true"></span>${land?`<span class="tile-marker" aria-hidden="true">${land.type==='ley'?'✧':land.type==='church'?'♧':'◇'}</span>`:''}${unit?`<span class="unit ${own?'own':'enemy'}" style="--unit:${uiEscape(definition(g,unit).color)}"><span class="piece-label ${unit.kind==='master'?'piece-master-label':''}">${uiEscape(BY_ID[unit.servant]?.symbol||'从')}${unit.kind==='master'?'<small>御主</small>':''}</span>${own?`<span class="unit-health"><i style="width:${unit.maxHp?Math.max(0,unit.hp/unit.maxHp*100):0}%"></i></span>`:''}${altitude(unit)?`<span class="flight-badge">↑${altitude(unit)}</span>`:''}${unit.shield?'<span class="shield-dot" title="护盾"></span>':''}</span>`:''}</button>`;
 }).join('');
 return `<div class="sheet-scroll"><div class="map-wrap"><div class="map-top-coords">${Array.from({length:SIZE},(_,i)=>`<span>${String.fromCharCode(65+i)}</span>`).join('')}</div><div class="map-side-coords">${Array.from({length:SIZE},(_,i)=>`<span>${i+1}</span>`).join('')}</div><div class="map" style="--grid-size:${SIZE}"><div class="map-cells" role="group" aria-label="战斗棋盘，${SIZE}乘${SIZE}">${cells}</div></div><div class="map-bottom-label"><span>冬木 FUYUKI</span><span>${SIZE} × ${SIZE} · 保持原地图与地形</span></div></div></div>`;
}

const uiStatusNames={allDamage:'全类型伤害',normalDamage:'通常伤害',specialNext:'下次特殊攻击',allReduction:'全类型减伤',normalReduction:'通常减伤',contest:'属性对抗',movement:'移动',poison:'中毒',burn:'灼烧',curse:'诅咒',root:'定身',weaken:'弱化',damage:'伤害强化',accuracy:'命中强化',defense:'防御强化',evade:'回避强化',next_root:'下次攻击定身',next_weaken:'下次攻击弱化',next_dispel:'下次攻击驱散'};
export function visibleStatuses(g,u){
 if(!u||u.hidden)return [];
 const statuses=[],add=(name,detail='',source=null)=>statuses.push({name,detail,source});
 for(const m of u.ruleState?.modifiers||u.visibleRuleModifiers||[]){const clock=m.timer.scope==='battle_round'?g.round:m.timer.scope==='time_turn'?g.timeIndex:g.day;if(m.expires!==null&&clock>=m.expires)continue;add(m.name+' · '+({damage:'伤害',reduction:'减伤',contest:'对抗',movement:'移动'}[m.stat]||m.stat),`数值 ${m.value}${m.expires!==null?' · 剩余'+(m.expires-clock)+' '+m.timer.scope:''}${m.remainingUses!==null?' · 剩余'+m.remainingUses+'次':''}`,m.sourceUnitId);}
 for(const group of ['guards','floors','revivals','links'])for(const e of activeCombatEffects(g,u,group)){const label={invincibility:'无敌',special_shield:'特殊护盾',hp_floor:'锁血',revival:'复活',damage_link:'伤害链接',untargetable:'不可选中'}[e.kind]||e.kind;add(label+' · '+e.name,[e.charges!==undefined?'剩余'+e.charges+'次':'',e.pool!==undefined?'容量'+e.pool:'',e.floor!==undefined?'下限'+e.floor:'',e.hp!==undefined?'复活HP'+e.hp:'',e.percent!==undefined?e.percent+'% · '+(e.captureStage==='before_defense'?'防御前':'防御后'):'',e.blocksTrue?'可挡真伤':'',e.immuneToPierce?'不可贯通':'','剩余'+(e.until-g.round+1)+'战斗轮'].filter(Boolean).join(' · '),e.owner);}
 if(uiOwner(u)===g.me)for(const k of u.card?.skills||[])if(k.passive&&k.compose)add(k.name,ABILITY_TRIGGERS.find(t=>t.id===k.compose.trigger)?.name||'触发能力');
 for(const resource of u.card?.resources||[])add(resource.name,`${customResourceValue(u,resource)} / ${resource.max} · ${resource.scope==='battle'?'战斗资源':'整局资源'}`);
 for(const e of [...(u.effects||[]),...(u.dots||[])]){
  if(e.hidden||e.visible===false||e.until!==undefined&&e.until<g.round)continue;
  const time=e.until===undefined?'未记录持续轮数':`剩余 ${e.until-g.round+1} 轮（含本轮）`;
  const value=e.value??e.damage,stacks=e.stacks??e.count;
  add(e.name||uiStatusNames[e.kind]||e.kind,[value!==undefined?`数值 ${value}`:'',time,stacks!==undefined?`${stacks} 层`:''].filter(Boolean).join(' · '),e.owner||e.sourceId||e.source);
 }
 for(const [key,value] of Object.entries(u.buff||{}))if(value){if(value.hidden||value.visible===false)continue;add(uiStatusNames[key]||key,typeof value==='object'?[value.value!==undefined?`数值 ${value.value}`:'',value.n!==undefined?`剩余 ${value.n} 次`:''].filter(Boolean).join(' · '):typeof value==='number'?`数值 ${value}`:'生效中');}
 for(const [key,label] of [['shield','护盾'],['ward','一次性减伤'],['guts','战斗续行'],['gold','财富标记'],['externalMP','外部魔力'],['reservedAttack','下场攻击强化'],['reservedDefense','下场防御强化']])if(u[key])add(label,`数值 ${u[key]}`);
 for(const [key,label] of [['weaponReady','武器强化'],['snipeReady','狙击准备'],['mindReady','心眼准备'],['forceAttributes','属性选择权'],['assistReady','援护准备'],['freeMove','免费移动'],['noFlight','禁空领域']])if(u[key])add(label,'生效中');
 for(const [key,label] of [['mountedUntil','骑乘'],['tauntUntil','嘲讽']])if(u[key]!==undefined&&u[key]>=g.round)add(label,`剩余 ${u[key]-g.round+1} 轮（含本轮）`);
 if(u.channel)add('宝具引导',u.channel.ready?'已完成 · 等待选择地点':`剩余 ${u.channel.remaining} 动作`);
 if(u.delayedHeal)add('延迟治疗',`目标 ${g.units.find(v=>v.id===u.delayedHeal.target)?.card?.name||'契约从者'} · ${Math.max(0,u.delayedHeal.due-g.timeIndex)} 时间回合后`);
 return statuses;
}
export function statusMarkup(g,u){
 const statuses=visibleStatuses(g,u),own=uiOwner(u)===g.me;
 return `<section class="battle-status-list" aria-label="可见状态"><h3>${own?'当前状态':'对方可见状态'}</h3><div>${statuses.length?statuses.map(s=>`<span class="status-chip" tabindex="0" title="${uiEscape(s.name+' · '+s.detail)}">${uiEscape(s.name)}${s.source&&g.units.some(v=>v.id===s.source&&uiOwner(v)===g.me)?'<i>我方施加</i>':''}<small>${uiEscape(s.detail)}</small></span>`).join(''):'<p class="muted tiny">暂无可见状态</p>'}</div></section>`;
}
export function partyMarkup(g,selectedId,icon){
 const mine=g.units.filter(u=>uiOwner(u)===g.me),participants=new Set(g.battle.participants),current=activeUnit(g);
 return `<aside class="party-panel panel"><div class="panel-title"><span>我方契约</span><small>${mine.filter(u=>u.alive).length} 位存活</small></div><div class="party-list">${mine.map(u=>`<button class="party-card ${u.id===selectedId?'chosen':''}" data-do="switchActor" data-id="${u.id}" aria-pressed="${u.id===selectedId}"><span class="party-avatar" style="--unit:${uiEscape(definition(g,u).color)}">${icon(u.kind==='master'?'master':u.servant)}</span><span class="party-info"><b>${uiEscape(definition(g,u).name)}</b><small>${u.kind==='master'?'御主':'从者'} · ${!u.alive?'已退场':!participants.has(u.id)||g.battle.escaped.includes(u.id)?'未在战场':current?.id===u.id?'正在行动':'等待回合'}</small><span class="party-hp">HP ${u.hp} / ${u.maxHp}</span><span class="bar"><i style="width:${u.maxHp?Math.max(0,u.hp/u.maxHp*100):0}%"></i></span><small>MP ${u.mp} · AP ${u.battleAP} · 士气 ${u.morale}</small><span class="party-states">${visibleStatuses(g,u).slice(0,3).map(s=>`<i title="${uiEscape(s.name+' · '+s.detail)}">${uiEscape(s.name)}</i>`).join('')}</span></span></button>`).join('')}</div><p class="party-tip">点击我方棋子或角色卡切换。<br>蓝色为移动，红色为攻击，紫色为技能影响范围。</p></aside>`;
}

// Pointer previews change only classes on the affected cells. The app's state
// and board nodes stay intact while aiming; no full 400-cell rerender per move.
export function mountBoardPreview(root,model){
 const grid=root.querySelector('.map-cells');if(!grid)return;
 const cells=new Map([...grid.querySelectorAll('.cell')].map(el=>[`${el.dataset.x},${el.dataset.y}`,el])),hint=root.querySelector('[data-aim-hint]');
 let previous=new Set(),hovered=null,frame=null,lastKey=null;
 const clear=()=>{for(const key of previous)cells.get(key)?.classList.remove('skill-preview','preview-target');previous.clear();hovered?.classList.remove('hover-valid','hover-invalid','move-destination');hovered=null;lastKey=null;if(hint)hint.textContent=model.hint;};
 const paint=el=>{const key=`${el.dataset.x},${el.dataset.y}`;if(lastKey===key)return;clear();lastKey=key;hovered=el;const point={x:+el.dataset.x,y:+el.dataset.y},selection=model.selectionAt(point),next=new Set(selection.cells.map(uiKey));
  for(const k of next)cells.get(k)?.classList.add('skill-preview');for(const target of selection.targets)cells.get(uiKey(target))?.classList.add('preview-target');previous=new Set([...next,...selection.targets.map(uiKey)]);
  if(model.effectiveMode){el.classList.add(selection.valid?'hover-valid':'hover-invalid');if(model.moving&&selection.valid)el.classList.add('move-destination');}
  if(hint)hint.textContent=`${String.fromCharCode(65+point.x)}${point.y+1} · ${selection.valid?model.moving?'点击移动':`合法目标 · 影响 ${selection.targets.length} 个单位`:selection.reason||'非法目标'}`;
 };
 grid.addEventListener('pointermove',event=>{const el=event.target.closest('.cell');if(!el)return;cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>paint(el));});
 grid.addEventListener('pointerleave',()=>{cancelAnimationFrame(frame);clear();});
 grid.addEventListener('focusin',event=>{const el=event.target.closest('.cell');if(el)paint(el);});
 grid.addEventListener('focusout',()=>clear());
}
