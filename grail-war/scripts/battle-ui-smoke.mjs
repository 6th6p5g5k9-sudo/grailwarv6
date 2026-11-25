import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdtemp,writeFile,mkdir,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRoom,startGame,startBattle,publicState} from '../public/engine.js';
import {createBoardModel} from '../public/battle-ui.js';
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const root=fileURLToPath(new URL('..',import.meta.url)),data=await mkdtemp(path.join(tmpdir(),'grail-ui-')),port=13000+process.pid%10000,origin=`http://127.0.0.1:${port}`;
const child=spawn(process.execPath,['server.mjs'],{cwd:root,env:{...process.env,PORT:String(port),DATA_DIR:data},stdio:['ignore','pipe','pipe']});
child.stderr.pipe(process.stderr);
await new Promise((resolve,reject)=>{child.stdout.once('data',resolve);child.once('error',reject);child.once('exit',code=>reject(Error('Server exited '+code)));});
const browser=await chromium.launch({headless:true,executablePath:process.env.CHROMIUM_PATH||'/usr/bin/chromium',args:['--no-sandbox','--disable-dev-shm-usage']});
const errors=[],artifacts=path.join(root,'artifacts/battle-ui');await mkdir(artifacts,{recursive:true});
const context=await browser.newContext({viewport:{width:1440,height:1000}}),page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
let requestCount=0;page.on('request',req=>{if(req.url().endsWith('/action'))requestCount++;});
async function fixture(kind='move'){
 const code=crypto.randomUUID().slice(0,6).toUpperCase(),g=createRoom(code,'UI玩家','ui-token');Object.assign(g.players[0],{servant:'saber',cardId:'zero-saber',ready:true});startGame(g,true);
 for(const p of g.players){p.bot=false;p.token||='ui-'+p.id;}
 const [a,b,c]=g.units,m=g.units[7];b.region=m.region=a.region;g.awareness[a.id]={[b.id]:true};startBattle(g,a.id,{target:b.id});g.turn=g.order.indexOf(a.id);a.battleAP=2;
 Object.assign(a,{x:4,y:4,mp:150,hp:a.maxHp-20});a.card.mp=200;Object.assign(b,{x:kind==='move'?14:5,y:kind==='move'?14:4});Object.assign(m,{x:3,y:4});
 if(kind!=='move'){g.battle.participants.push(c.id);g.order.push(c.id);Object.assign(c,{x:6,y:5});}
 if(kind==='area')a.card.skills=[{id:'ui-area',name:'自定义·星光回响',phase:'battle',type:'attack',shape:'area',radius:2,range:8,dice:2,cost:7,battleAP:1,cd:3}];
 if(kind==='line')a.card.skills=[{id:'ui-line',name:'自定义·方向技能',phase:'battle',type:'attack',shape:'line',range:8,dice:2,cost:4,battleAP:1,cd:2}];
 if(kind==='support')a.card.skills=[{id:'ui-support',name:'自定义·团队恢复',phase:'battle',type:'adapted',tags:['team'],effects:[{kind:'heal',value:9},{kind:'defense',value:3}],cost:5,battleAP:1,cd:2}];
 if(kind==='self')a.card.skills=[{id:'ui-self',name:'自定义·自身范围',phase:'battle',type:'attack',shape:'selfArea',radius:2,range:0,dice:1,cost:0,battleAP:1,cd:1}];
 if(kind==='np'){a.card.skills=[{id:'ui-np',name:'自定义·后置落点',phase:'battle',type:'attack',np:true,shape:'area',range:8,radius:2,dice:2,chant:2,cost:9,battleAP:2,cd:3}];}
 if(kind==='control'){a.card.skills=[{id:'sacrifice',libraryKey:'pollution',name:'精神污染',rank:'EX',phase:'battle',type:'buff',cost:0,battleAP:1,cd:0}];b.card.ranks[3]='E';}
 a.effects=[{kind:'allReduction',value:15,until:g.round+2}];b.dots=[{kind:'poison',damage:2,until:g.round+1,owner:a.id}];
 g.deadline=Date.now()+3600000;await writeFile(path.join(data,code+'.json'),JSON.stringify(g));return {g,a,b,c,m,code};
}
async function open(f){await page.goto(origin);await page.evaluate(c=>localStorage.setItem('grail-session',JSON.stringify(c)),{code:f.code,token:'ui-token'});await page.goto(origin+'/?room='+f.code);await page.locator('.tactical-screen .cell').first().waitFor();}
async function get(f){const res=await fetch(origin+'/api/rooms/'+f.code,{headers:{authorization:'Bearer ui-token'}});assert.equal(res.status,200);return res.json();}
async function cell(p){return page.locator(`.cell[data-x="${p.x}"][data-y="${p.y}"]`);}
async function waitRevision(f,revision){await page.waitForFunction(({revision})=>document.querySelector('.map-cells')&&document.querySelector('.resource-row'),{revision});for(let n=0;n<20;n++){const next=await get(f);if(next.revision>revision)return next;await page.waitForTimeout(50);}throw Error('No committed action');}
try{
 let f=await fixture();await open(f);assert.equal(await page.locator('.cell').count(),400);assert.equal(await page.locator('.party-card').count(),2);
 const snapshot=publicState(f.g,'ui-token'),model=createBoardModel(snapshot,snapshot.units.find(u=>u.id===f.a.id));
 const displayed=await page.locator('.cell.reachable').evaluateAll(cells=>cells.map(el=>`${el.dataset.x},${el.dataset.y}`).sort());assert.deepEqual(displayed,[...model.validKeys].sort());
 const dest=[...model.validKeys][0].split(',').map(Number),point={x:dest[0],y:dest[1]};await page.evaluate(()=>window.originalGrid=document.querySelector('.map-cells'));await(await cell(point)).hover();await page.waitForTimeout(80);assert.ok(await page.evaluate(()=>window.originalGrid===document.querySelector('.map-cells')));assert.equal(await page.locator('.move-destination').count(),1);
 await(await cell(point)).click();let next=await waitRevision(f,0);const moved=next.units.find(u=>u.id===f.a.id);assert.equal(moved.x,point.x);assert.equal(moved.y,point.y);assert.equal(moved.battleAP,1);
 await page.locator(`.party-card[data-id="${f.m.id}"]`).click();assert.equal(await page.locator('.party-card.chosen').getAttribute('data-id'),f.m.id);assert.ok(await(await cell(f.m)).evaluate(el=>el.classList.contains('selected-piece')));
 await(await cell(moved)).click();assert.equal(await page.locator('.party-card.chosen').getAttribute('data-id'),f.a.id);
 await page.locator('.sheet-toolbar [data-id=attack]').click();const before=requestCount;await(await cell({x:19,y:19})).hover();await page.waitForTimeout(60);assert.equal(await page.locator('.hover-invalid').count(),1);await(await cell({x:19,y:19})).click();assert.equal(requestCount,before);assert.ok((await page.locator('#toast').textContent()).length>0);await page.keyboard.press('Escape');assert.equal(await page.locator('.cell.targetable').count(),0);
 console.log('PASS selection, movement, path preview, invalid targets, no hover rerender, ESC');
 f=await fixture('area');await open(f);await page.locator('[data-do=ability][data-id=ui-area]').click();assert.equal(await page.locator('dialog[open]').count(),0);await(await cell(f.b)).hover();await page.waitForTimeout(80);assert.ok(await page.locator('.cell.skill-preview').count()>1);assert.equal(await page.locator('.preview-target').count(),2);
 await page.locator('.sheet-toolbar [data-id=attack]').click();assert.equal(await page.locator('.skill-preview').count(),0);await page.locator('[data-do=ability][data-id=ui-area]').click();await(await cell(f.b)).click({button:'right'});assert.equal(await page.locator('.ability.chosen').count(),0);assert.equal(await page.locator('.skill-preview').count(),0);
 await page.locator('[data-do=ability][data-id=ui-area]').click();await(await cell(f.b)).hover();await page.waitForTimeout(60);for(const [width,height] of [[1280,720],[1440,900],[1920,1080],[768,1024],[390,844]]){await page.setViewportSize({width,height});await page.waitForTimeout(40);const metrics=await page.evaluate(()=>{const cell=document.querySelector('.cell').getBoundingClientRect();return {page:document.documentElement.scrollWidth,viewport:innerWidth,cellWidth:cell.width,cellHeight:cell.height};});assert.ok(metrics.page<=metrics.viewport,JSON.stringify(metrics));assert.ok(Math.abs(metrics.cellWidth-metrics.cellHeight)<1,JSON.stringify(metrics));if(width===1440)await page.screenshot({path:path.join(artifacts,'desktop-aim.png'),fullPage:true});}
 await page.setViewportSize({width:1440,height:1000});await(await cell(f.b)).click();next=await waitRevision(f,0);assert.ok(next.pendingAttack);assert.equal(next.units.find(u=>u.id===f.a.id).battleAP,1);assert.equal(next.units.find(u=>u.id===f.a.id).mp,150-Math.max(0,7-(f.a.externalMP||0)));assert.equal(next.units.find(u=>u.id===f.a.id).cd['ui-area'],3);assert.equal(await page.locator('.ability.chosen').count(),0);
 console.log('PASS custom area targeting, right-click, skill switch, AP/MP/cooldown refresh, five viewport sizes');
 f=await fixture('line');await open(f);await page.locator('[data-do=ability][data-id=ui-line]').click();await(await cell(f.b)).hover();await page.waitForTimeout(60);assert.equal(await page.locator('.preview-target').count(),1);await(await cell(f.b)).click();next=await waitRevision(f,0);assert.equal(next.pendingAttack.targets.length,1);
 f=await fixture('support');await open(f);const hp=f.a.hp;await page.locator('[data-do=ability][data-id=ui-support]').click();next=await waitRevision(f,0);assert.equal(next.units.find(u=>u.id===f.a.id).hp,hp+9);assert.equal(next.units.find(u=>u.id===f.a.id).cd['ui-support'],2);assert.ok((await page.locator('.battle-status-list').textContent()).includes('全类型减伤'));
 await(await cell(f.b)).click();assert.ok((await page.locator('.action-panel').textContent()).includes('我方施加'));assert.ok((await page.locator('.action-panel').textContent()).includes('生命 HP：隐藏'));assert.equal(next.units.find(u=>u.id===f.b.id).hp,null);
 f=await fixture('self');await open(f);await page.locator('[data-do=ability][data-id=ui-self]').click();next=await waitRevision(f,0);assert.ok(next.pendingAttack);assert.equal(await page.locator('dialog[open]').count(),0);
 console.log('PASS line, automatic team support, immediate self area, visible status source, hidden enemy resources');
 f=await fixture('np');await open(f);await page.locator('[data-do=ability][data-id=ui-np]').click();next=await waitRevision(f,0);assert.ok(next.units.find(u=>u.id===f.a.id).channel.ready);await page.locator('[data-do=aimNP]').click();await(await cell(f.b)).hover();await page.waitForTimeout(60);assert.equal(await page.locator('.preview-target').count(),2);await(await cell(f.b)).click();next=await waitRevision(f,1);assert.ok(next.pendingAttack);assert.equal(next.units.find(u=>u.id===f.a.id).battleAP,0);
 f=await fixture('control');await open(f);await page.locator('[data-do=ability][data-id=sacrifice]').click();await page.locator('[data-do=controlCommand][data-id=attack]').click();assert.ok((await page.locator('[data-aim-hint]').textContent()).includes('1/2'));await(await cell(f.b)).click();assert.ok((await page.locator('[data-aim-hint]').textContent()).includes('2/2'));await page.keyboard.press('Escape');assert.equal(await page.locator('.ability.chosen').count(),0);
 console.log('PASS NP prepare-then-aim, zero-AP release, multistage control hints and cancellation');
 const html=await readFile(path.join(root,'dist/冬木圣杯战争-离线试玩.html'),'utf8');const offlinePage=await context.newPage();await offlinePage.addInitScript(()=>localStorage.removeItem('grail-session'));offlinePage.on('pageerror',e=>errors.push('offline: '+e.message));await offlinePage.route(origin+'/offline-preview',route=>route.fulfill({status:200,contentType:'text/html; charset=utf-8',body:html}));await offlinePage.goto(origin+'/offline-preview');await offlinePage.locator('[data-do=demo]').click();assert.equal(await offlinePage.locator('.class-seat').count(),7);await offlinePage.close();
 assert.deepEqual(errors,[]);await page.screenshot({path:path.join(artifacts,'desktop-control.png'),fullPage:true});console.log('PASS standalone boot and zero browser JavaScript errors');
}finally{await browser.close();child.kill();await rm(data,{recursive:true,force:true});}
