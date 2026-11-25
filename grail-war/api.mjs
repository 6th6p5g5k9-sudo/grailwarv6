import {normalizePriorityTable} from './public/combat-mechanics.js';
import {createRoom,addPlayer,startGame,action,tick,publicState,decisionUnit} from './public/engine.js';
import {CLASS_IDS,CARD_BY_ID,createCustomServant,createMasterCard} from './public/roster.js';
const json=(body,status=200)=>new Response(JSON.stringify(body),{status,headers:{'content-type':'application/json;charset=utf-8','cache-control':'no-store'}});
export async function api(request,repo){const url=new URL(request.url);try{
 if(request.method==='GET'&&url.pathname==='/api/health')return json({ok:true,version:'0.6.1'});
 const body=request.method==='POST'?await request.json():{},token=request.headers.get('authorization')?.replace(/^Bearer /,'');
 if(url.pathname==='/api/rooms'&&request.method==='POST'){let code;for(let i=0;i<10;i++){code=crypto.randomUUID().slice(0,6).toUpperCase();if(!await repo.get(code))break;}const secret=crypto.randomUUID()+crypto.randomUUID(),g=createRoom(code,body.name||'御主',secret);g.host=g.players[0].id;if(!await repo.save(g,null))return json({error:'房间创建冲突，请重试。'},409);return json({token:secret,state:publicState(g,secret)});}
 const m=url.pathname.match(/^\/api\/rooms\/([A-Z0-9]{6})(?:\/(join|action|lobby))?$/);if(!m)return json({error:'接口不存在。'},404);const code=m[1],op=m[2];let g=await repo.get(code);if(!g)return json({error:'没有找到房间。'},404);if(g.rulesVersion!==6&&g.phase!=='lobby')return json({error:'该房间属于旧规则，请为 v0.6.1 新建房间。'},409);let rev=g.revision;
 if(op==='join'&&request.method==='POST'){const secret=crypto.randomUUID()+crypto.randomUUID();addPlayer(g,body.name,secret);g.revision++;g.updated=Date.now();if(!await repo.save(g,rev))return json({error:'有人同时加入，请重试。'},409);return json({token:secret,state:publicState(g,secret)});}
 const me=g.players.find(p=>p.token===token);if(!me)return json({error:'房间身份失效。'},401);
 if(request.method==='GET'&&!op){if(tick(g)){g.revision++;g.updated=Date.now();if(!await repo.save(g,rev))g=await repo.get(code);}return json(publicState(g,token));}
 if(request.method!=='POST')return json({error:'不支持的请求。'},405);if(body.revision!==rev)return json({error:'战局已更新，请按最新状态操作。'},409);
 if(tick(g)){g.revision++;g.updated=Date.now();await repo.save(g,rev);return json({error:'回合已推进，请按最新状态操作。'},409);}
 if(op==='lobby'&&body.type==='priorityConfig'){if(me.id!==g.host)throw Error('只有房主可以配置规则优先级。');g.priorityTable=normalizePriorityTable(body.priorityTable);}
 else if(op==='lobby'){
  if(g.phase!=='lobby')throw Error('战争已开始，不能修改角色卡。');
  if(body.type==='claim'||body.type==='select'){
   if(!CLASS_IDS.includes(body.servant))throw Error('仅支持七个经典职阶。');if(g.players.some(p=>p.id!==me.id&&p.servant===body.servant))throw Error('该职阶已被先到的玩家占用。');me.servant=body.servant;me.cardId=null;me.customCard=null;me.ready=false;
  }else if(body.type==='releaseClass'){me.servant=null;me.cardId=null;me.customCard=null;me.ready=false;
  }else if(body.type==='card'){
   const c=CARD_BY_ID[body.cardId];if(!me.servant||!c||c.classId!==me.servant)throw Error('先占用职阶，再选择该职阶的从者。');me.cardId=c.id;me.customCard=null;me.spirit=g.spiritConfigured?.[me.servant]?g.spiritOverrides[me.servant]:c.spirit;me.ready=false;
  }else if(body.type==='customCard'){
   if(!me.servant)throw Error('请先占用职阶。');const approved=createCustomServant(body.draft,me.servant);me.customCard=structuredClone(body.draft);me.cardId=null;me.spirit=g.spiritConfigured?.[me.servant]?g.spiritOverrides[me.servant]:approved.spirit;me.ready=false;
  }else if(body.type==='masterCard'){
   createMasterCard(body.draft);me.masterDraft=structuredClone(body.draft);me.ready=false;
  }else if(body.type==='spirit'){
   if(me.id!==g.host)throw Error('仅房主可审定灵格。');if(!['E','D','C','B','A','EX'].includes(body.spirit)||!CLASS_IDS.includes(body.servant))throw Error('灵格或职阶无效。');g.spiritOverrides??={};g.spiritConfigured??={};g.spiritOverrides[body.servant]=body.spirit;g.spiritConfigured[body.servant]=true;const p=g.players.find(p=>p.servant===body.servant);if(p){p.spirit=body.spirit;p.ready=false;}
  }else if(body.type==='ready'){
   if(body.ready){if(!me.servant||(!me.cardId&&!me.customCard))throw Error('先占职阶并选择或创建从者。');if(me.customCard)createCustomServant(me.customCard,me.servant);createMasterCard(me.masterDraft);}me.ready=!!body.ready;
  }else if(body.type==='start'){
   if(me.id!==g.host)throw Error('只有房主可开始战争。');startGame(g,!!body.fill);
  }else throw Error('未知大厅操作。');
 }else if(op==='action'){
  const chooser=decisionUnit(g);const id=body.actorId||(body.type==='respond'&&chooser?.owner===me.id?chooser.id:me.id);const actor=g.units?.find(u=>u.id===id&&(u.owner||u.id)===me.id);if(!actor)throw Error('只能操作自己的御主或从者。');action(g,actor.id,body);
 }else return json({error:'接口不存在。'},404);
 g.revision++;g.updated=Date.now();if(!await repo.save(g,rev))return json({error:'另一个操作已先完成，请重试。'},409);return json(publicState(g,token));
 }catch(e){return json({error:e instanceof SyntaxError?'请求格式错误。':e.message||'请求失败。'},400);}}
