import {readFile,writeFile,mkdir,cp} from 'node:fs/promises';
import {SERVANTS,RULES,LIBRARY_RULES,SPIRIT_NOTES} from './public/data.js';
await mkdir('dist',{recursive:true});
const read=f=>readFile(f,'utf8');
const modules=await Promise.all(['library','data','catalogue-data','flavour','tactics','rule-expression','rule-registry','rule-model','rule-runtime','combat-mechanics','targeting','complex-schema','card-abilities','roster','card-runtime','engine','battle-ui','complex-editor','rule-sandbox','rule-form-editor','card-builder','editor-search','app'].map(n=>read('public/'+n+'.js')));
let js=modules.map(s=>s.replace(/^import .*?;\n/gm,'').replace(/^export \{.*?\};?$/gm,'').replace(/^export /gm,'')).join('\n');
js=js.replace("async function api(path,body,auth=true){","async function api(path,body,auth=true){if(location.protocol==='file:')throw Error('离线文件仅支持 AI 演习。联网请按说明运行服务器版本。');");
js=js.replace("<button class=\"primary\" data-do=\"create\">缔结契约 · 创建房间 <span>↗</span></button>","<button class=\"primary\" disabled>联网请运行服务器版本</button>").replace('<button class="secondary" data-do="joinDialog">加入战争</button>','<button class="secondary" disabled>离线试玩版</button>');
const svg=await read('public/crest.svg'),uri='data:image/svg+xml;base64,'+Buffer.from(svg).toString('base64');js=js.replaceAll('/crest.svg',uri);
const mapURI='data:image/webp;base64,'+(await readFile('public/assets/fuyuki-night.webp')).toString('base64');js=js.replaceAll('/assets/fuyuki-night.webp',mapURI);
const css=(await read('public/style.css')).replace(/^@import .*?;\n/,'');
let html=await read('public/index.html');html=html.replace('<link rel="stylesheet" href="/style.css">',`<style>${css}</style>`).replace('/crest.svg',uri).replace('<script type="module" src="/app.js"></script>',`<script type="module">${js.replaceAll('</script','<\\/script')}</script>`);
await writeFile('dist/冬木圣杯战争-离线试玩.html',html);
let cards='# 第四次圣杯战争 · 七骑网页测试卡\n\n依据用户提供的空白卡结构、极简杯数据库和范例创作。同名技能引用用户提供的技能库；宝具公式和未收录技能为本版原创。可逐项对照来源文档。\n\n';
for(const s of SERVANTS){cards+=`## ${s.class} · ${s.name}\n\n${s.title}；${s.gender}；${s.alignment}；${s.origin}。\n\n愿望：${s.wish}。圣遗物：${s.relic}。灵格：${s.spirit}（本版审卡初值，房主可改）。\n\n|筋力|耐久|敏捷|魔力|幸运|\n|---|---|---|---|---|\n|${s.ranks.join('|')}|\n\nHP ${s.hp} / MP ${s.mp} / 士气 ${s.id==='saber'?3:2}/3 / 普攻 ${s.dice}d4 / 移动 ${s.move} / 幸运 +${s.luck}。\n\n职阶技能：${s.passive}\n\n`;
 for(const k of s.skills)cards+=`### ${k.name} ${k.rank}${k.np?'（宝具）':''}\n\n时机：${k.phase||'battle'}。消耗：${k.phase==='daily'?k.dailyAP||1:k.battleAP} ${k.phase==='daily'?'日常':'战斗'}行动点、${k.cost} MP。${k.onceBattle?'每战一次。':k.onceDay?'每日一次。':''}来源：${k.source||'原创'}。\n\n效果：${k.desc}\n\n`;
}
await writeFile('docs/CARDS.md',cards);
await writeFile('docs/SPIRITS.md','# 本版灵格审卡初值\n\n以骑士王A为标准，参考所提供规则书对各灵格档的描述。并非Fate官方属性，房主可开局前修改。\n\n'+SERVANTS.map(s=>'## '+s.class+' · '+s.name+'\n\n'+SPIRIT_NOTES[s.id]+'\n\n').join(''));
let balance='# v0.4 原模板技能收益核对\n\n以相同对抗、减伤与无额外被动为基准；d4 期望为 2.5。表格展示原始期望，实战仍受对抗、范围、护盾和附加效果影响，不能直接当作最终伤害。1 战斗行动点技能对照一次普攻，2 点技能对照两次。\n\n|从者|技能 / 宝具|战斗行动点|MP|普攻基线|技能原始均值|倍率|\n|---|---|---|---|---|---|---|\n';
for(const s of SERVANTS)for(const k of s.skills.filter(k=>k.type==='attack')){const baseline=s.dice*2.5*k.battleAP,expected=k.dice*2.5+(k.bonus||0);balance+=`|${s.name}|${k.name}|${k.battleAP}|${k.cost}|${baseline}|${expected}|${(expected/baseline).toFixed(2)}×|\n`;}
balance+='\n同名数据库技能严格按库中的时机、消耗、次数及数值实现，不再为追求统一伤害倍率而重写其效果。技能库原文见 LIBRARY.md；未收录宝具为原创公式。\n';
await writeFile('docs/BALANCE.md',balance);
await writeFile('docs/LIBRARY.md','# 技能库来源对照\n\n以下原文来自用户提供的《极简杯 数据库 v1.6.8.2》，同名技能使用对应条目；职阶技能已明确选择种类和额外效果。\n\n'+Object.values(LIBRARY_RULES).map(k=>'## '+k.name+'\n\n'+k.source+'\n\n'+k.text+'\n\n').join(''));
await writeFile('docs/RULES.md','# 网页战棋规则与改编说明\n\n'+RULES.map(([h,p])=>'## '+h+'\n\n'+p+'\n\n').join(''));
console.log('Built standalone offline game and generated seven servant cards / rules.');
