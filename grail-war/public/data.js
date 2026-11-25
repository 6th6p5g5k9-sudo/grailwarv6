import {LIBRARY_RULES} from './library.js';
// Original playable Fate/Zero adaptations; numerical effects are not official cards.
const skill=(id,name,rank,cost,cd,type,desc,extra={})=>({id,name,rank,cost,cd,type,battleAP:1,desc,...extra});
export const SERVANTS=[
{id:'saber',class:'SABER',name:'阿尔托莉雅',title:'骑士王',quote:'以此剑，立下胜利的誓言。',color:'#82b3ce',symbol:'剑',gender:'女',alignment:'秩序·善',origin:'不列颠',wish:'重选不列颠的王',relic:'圣剑之鞘',ranks:['B','A','A','A','D'],hp:90,mp:80,move:5,dice:4,luck:2,range:1,passive:'对魔力 A：受到魔术伤害减少 5。骑乘 B：移动已计入面板。',skills:[
skill('instinct','直感','A',8,3,'buff','本次行动后至下次回合开始，闪避对抗 +4；下次攻击对抗 +3。',{effect:'instinct'}),
skill('burst','魔力放出','A',12,3,'buff','接下来 3 次伤害各 +10。',{effect:'burst'}),
skill('wind','风王结界','C',12,2,'attack','射程 3，对单体造成 4d4+8 伤害，击退 1 格。',{np:true,range:3,dice:4,bonus:8,push:1}),
skill('excalibur','誓约胜利之剑','A++',35,5,'attack','宝具 · 射程 6，朝选定格发射贯通光束，对路径内敌人造成 12d4+18 伤害。',{np:true,battleAP:2,range:6,dice:12,bonus:18,shape:'line'})]},
{id:'archer',class:'ARCHER',name:'吉尔伽美什',title:'英雄王',quote:'仰望吧，这便是王的财宝。',color:'#d8b76b',symbol:'弓',gender:'男',alignment:'混沌·善',origin:'乌鲁克',wish:'以王之眼见证此世',relic:'最初之蛇的化石',ranks:['B','B','B','A','A'],hp:80,mp:80,move:4,dice:4,luck:5,range:4,passive:'单独行动 A：每次自身回合首次造成的伤害 +5。对魔力 C：受到魔术伤害减少 3。',skills:[
skill('treasury','黄金律','A',0,4,'buff','恢复 20 魔力；接下来 2 次伤害 +8。',{effect:'treasury'}),
skill('gate','王之财宝','E～A++',15,2,'attack','宝具 · 射程 5，对目标格及周围 1 格敌人造成 5d4+8 伤害。',{np:true,range:5,dice:5,bonus:8,shape:'area',radius:1}),
skill('enkidu','天之锁','—',18,3,'attack','宝具 · 射程 4，造成 4d4+8 伤害并束缚，目标下个战斗回合不能移动。',{np:true,range:4,dice:4,bonus:8,root:true}),
skill('ea','天地乖离开辟之星','EX',45,6,'attack','宝具 · 射程 5、半径 2，造成 14d4+20 伤害。',{np:true,battleAP:2,range:5,dice:14,bonus:20,shape:'area',radius:2})]},
{id:'lancer',class:'LANCER',name:'迪卢木多',title:'辉貌之骑士',quote:'此枪，只为贯彻骑士之道。',color:'#69b99b',symbol:'枪',gender:'男',alignment:'秩序·中庸',origin:'爱尔兰',wish:'尽忠直至最后一刻',relic:'费奥纳骑士团遗物',ranks:['B','C','A','D','E'],hp:70,mp:50,move:5,dice:4,luck:1,range:2,passive:'对魔力 B：受到魔术伤害减少 4。双枪：普通攻击射程 2。',skills:[
skill('mind','心眼（真）','B',8,3,'buff','至下次自身回合开始，防御 +8、闪避对抗 +4。',{effect:'mind'}),
skill('love','爱之黑痣','C',10,3,'buff','周围 2 格敌人的下次伤害 -6，自身接下来 2 次伤害 +6（所有性别均受影响，为对战改编）。',{effect:'charm'}),
skill('gaeDearg','破魔的红蔷薇','B',16,2,'attack','宝具 · 射程 2，先解除目标防御与强化，再造成 5d4+10 伤害。',{np:true,range:2,dice:5,bonus:10,dispel:true}),
skill('gaeBuidhe','必灭的黄蔷薇','B',20,3,'attack','宝具 · 射程 2，造成 5d4+8 伤害；实际生命损失同时降低生命上限（最低 15）。',{np:true,range:2,dice:5,bonus:8,curse:true})]},
{id:'rider',class:'RIDER',name:'伊斯坎达尔',title:'征服王',quote:'所谓王者，便是比任何人都活得鲜明。',color:'#c8785c',symbol:'骑',gender:'男',alignment:'中立·善',origin:'马其顿',wish:'再次征服世界',relic:'征服王的披风残片',ranks:['B','A','D','C','A+'],hp:80,mp:60,move:6,dice:4,luck:5,range:1,passive:'骑乘 A+：移动距离 6；每次自身回合首次移动不耗行动点（仍不可穿越建筑与敌人）。',skills:[
skill('charisma','王之军势·领袖气质','A',12,4,'buff','接下来 4 次伤害 +8，回复 1 士气。',{effect:'charisma'}),
skill('conquer','征服者的雄略','B',8,3,'buff','恢复 18 生命，至下次自身战斗回合开始防御 +8。',{effect:'conquer'}),
skill('gordius','神威车轮','A+',22,3,'attack','宝具 · 射程 3，对目标及相邻敌人造成 6d4+10 伤害并击退 1 格。',{np:true,range:3,dice:6,bonus:10,shape:'area',radius:1,push:1}),
skill('ionioi','王之军势','EX',38,5,'attack','宝具 · 固有结界，周围 3 格敌人受到 12d4+16 伤害；自身获得 15 护盾。',{np:true,battleAP:2,range:0,dice:12,bonus:16,shape:'selfArea',radius:3,shield:15})]},
{id:'caster',class:'CASTER',name:'吉尔·德·雷',title:'蓝胡子',quote:'来吧，让我们展示真正的奇迹。',color:'#9e8dc6',symbol:'书',gender:'男',alignment:'混沌·恶',origin:'法国',wish:'再次见到贞德',relic:'螺湮城教本',ranks:['D','E','D','C','E'],hp:40,mp:60,move:3,dice:2,luck:1,range:3,passive:'阵地作成 B：在灵脉区域参加战斗时，入场获得 8 护盾。灵脉恢复在日常时间回合结束时结算。',skills:[
skill('territory','渎神的工房','B',12,3,'buff','获得 10 护盾，并在脚下建立阵地；停留其上时，自身回合开始回复 8 生命和 6 魔力。',{effect:'territory'}),
skill('tentacles','螺湮城教本·海魔触手','A+',15,1,'attack','宝具 · 射程 4、半径 1，造成 4d4+8 魔术伤害。',{np:true,range:4,dice:4,bonus:8,shape:'area',radius:1,magic:true}),
skill('sacrifice','精神污染','A',10,3,'attack','射程 4，造成 4d4+8 魔术伤害，目标下次伤害 -6。',{range:4,dice:4,bonus:8,magic:true,weaken:true}),
skill('horror','螺湮城教本·巨型海魔','A+',32,5,'summon','宝具 · 召唤持续 3 个自身回合的海魔。每次自身回合开始，半径 3 格内敌人受到 10 点魔术伤害；获得 15 护盾。',{np:true,battleAP:2,effect:'horror'})]},
{id:'assassin',class:'ASSASSIN',name:'百貌哈桑',title:'山中老人',quote:'无数的面孔，同一个愿望。',color:'#a2aba6',symbol:'影',gender:'多重人格',alignment:'秩序·恶',origin:'中东',wish:'成为完整统一的人格',relic:'阿萨辛教团遗物',ranks:['C','D','A','C','E'],hp:50,mp:60,move:5,dice:3,luck:1,range:1,passive:'气息遮断 A+：每个自身回合首次攻击对抗 +3；攻击尚未命中的敌人时伤害额外 +4。',skills:[
skill('presence','气息遮断','A+',10,3,'buff','至下次自身回合开始，闪避对抗 +7；接下来 2 次伤害 +10（公开棋盘，不隐藏位置）。',{effect:'presence'}),
skill('knowledge','专科百般','A+',8,3,'buff','回复 15 魔力及 8 生命，解除束缚与弱化。',{effect:'knowledge'}),
skill('zabaniya','妄想幻像','B+',22,3,'attack','宝具 · 射程 3，分身围攻造成 7d4+10 伤害；每有一名周围 2 格敌人，伤害额外 +2，上限 +8。',{np:true,range:3,dice:7,bonus:10,clones:true}),
skill('hundred','百貌分身','B+',18,4,'buff','宝具 · 获得 22 护盾，接下来 3 次攻击对抗 +4、伤害 +8。',{np:true,effect:'hundred'})]},
{id:'berserker',class:'BERSERKER',name:'兰斯洛特',title:'湖之骑士',quote:'漆黑的甲胄之下，仍是骑士的执念。',color:'#8694c4',symbol:'狂',gender:'男',alignment:'秩序·狂',origin:'不列颠',wish:'由王亲手裁决',relic:'圆桌骑士的遗物',ranks:['A','A','A+','C','B'],hp:80,mp:60,move:5,dice:5,luck:4,range:1,passive:'狂化 C：伤害 +3；自身回合开始消耗 3 魔力，魔力不足时改为失去 3 生命（不会因此致死）。',skills:[
skill('eternal','无穷的武练','A+',10,3,'buff','接下来 3 次攻击对抗 +5；至下次自身战斗回合开始防御 +6。',{effect:'eternal'}),
skill('glory','不为一己之荣光','B',10,3,'buff','宝具 · 解除弱化与束缚，获得 10 护盾、闪避对抗 +3 至下次自身回合开始。',{np:true,effect:'glory'}),
skill('knight','骑士不徒手而亡','A++',18,2,'attack','宝具 · 射程 4，把周围物品化为武器，造成 7d4+10 伤害。',{np:true,range:4,dice:7,bonus:10}),
skill('arondight','无毁的湖光','A++',30,4,'attack','宝具 · 射程 1，造成 12d4+18 伤害；对拥有龙因子的 Saber 额外 +8。',{np:true,battleAP:2,range:1,dice:12,bonus:18,dragon:true})]}
];
// Matching names use the supplied database; Noble Phantasm formulas remain original card designs.
const db=(id,key,grade,cost,battleAP,phase,desc,extra={})=>({id,name:LIBRARY_RULES[key].name,rank:grade,cost,battleAP,cd:0,type:'library',phase,desc,libraryKey:key,source:LIBRARY_RULES[key].source,...extra});
const replace=(s,id,k)=>{const i=s.skills.findIndex(v=>v.id===id);if(i>=0)s.skills[i]=k;else s.skills.push(k);};
const magicResist=grade=>db('resist','resist',grade,0,0,'battle','种类2：每场战斗一次，不占动作，使本战斗轮次获得对应等级的全类型减伤；Saber/Archer/Lancer 另有生命增益。',{onceBattle:true});
const ride=grade=>db('riding','riding',grade,0,0,'battle','种类2：每场战斗一次，不占动作，本战斗轮次无视周身阻挡，冲锋与移动距离按等级增加；轮次结束回复 10 HP/10 MP。',{onceBattle:true});
const leader=grade=>db('charisma','charisma',grade,0,0,'battle','每天一次，支付所选等级 10/20/30/40/50/60 MP，整场战斗全部对抗 +1/2/3/4/5/6；魔力对抗常驻 +3。灵活运用。',{onceDay:true});
for(const s of SERVANTS){
 s.spirit=({saber:'A',archer:'A',lancer:'B',rider:'A',caster:'C',assassin:'D',berserker:'B'})[s.id];
 s.skills.forEach(k=>{k.phase='battle';k.source='本版原创从者卡';});
 if(['saber','archer','lancer'].includes(s.id))s.skills.push(magicResist(({saber:'A',archer:'C',lancer:'B'})[s.id]));
 if(s.id==='saber'){
  s.skills.push(ride('A'),leader('B'),db('dragon','dragon','A',0,1,'both','E：1 战斗动作、1 士气换 20 MP；D：1 日常操作、1 士气换 25 MP；C：初始士气 +1；B：筋力判定 +5；A：耐久判定 +5、每日耗魔 +10；视为龙种。'));
  replace(s,'instinct',db('instinct','instinct','A',18,0,'response','受击时不占动作，支付 18 MP（可选低等级），掷 d6：1–2 无加成；3–4 减伤12；5 本次对抗+10；6 免疫非宝具攻击，面对宝具在减伤12/对抗+10中选一。'));
  replace(s,'burst',db('burst','burst','A',35,1,'battle','每战一次，选择 x（1～7），支付 5x MP：通常伤害 +2x（3轮）／全减伤 +x（3轮）／下次特殊伤害 +4x／通常减伤 +4x（至下一轮结束）。',{onceBattle:true}));
  s.passive='对魔力 A、骑乘 A（均采用技能库种类2）；直感 A、魔力放出 A、领袖气质 B、龙之炉心 A。';
 }
 if(s.id==='archer'){
  replace(s,'treasury',db('treasury','treasury','A',20,0,'daily','每个时间回合一次，1 日常操作＋20 MP 得到 1 财富标记，上限 11；全类型伤害 +标记数（真实伤害加值减半向下取整）。',{dailyAP:1,onceSlot:true}));
  s.passive='对魔力 C（种类2）；单独行动 A（种类1）：无友军时每战斗轮次首次造伤 +5。';
 }
 if(s.id==='lancer'){replace(s,'mind',db('mind','mind','B',5,1,'battle','本战斗下一次应对属性对抗中，攻击方不能取得包括幸运在内的任何加值。每战最多 4 次，依次消耗 5/10/15/20 MP。'));s.passive='对魔力 B（种类2）；额外生命增益已计入面板；横扫：普通攻击可选择周身内多个目标。';}
 if(s.id==='rider'){replace(s,'charisma',leader('A'));s.skills.push(ride('A+'));s.move=2;s.passive='骑乘 A+（种类2）；领袖气质 A，魔力对抗常驻 +3。';}
 if(s.id==='caster'){
  replace(s,'sacrifice',db('sacrifice','pollution','A',10,1,'battle','每战一次，指定视线内魔力等级至多高于技能 1 级的目标，进行魔力对抗；成功则令其执行由施术者指定的攻击、移动或冲锋。自身魔力判定常驻 +3。',{range:19,onceBattle:true}));
  replace(s,'territory',db('territory','workshop','B',0,0,'daily','2 日常操作，在当前区域建立最多 1 处 B 级阵地，每日耗魔 -10。阵地效果自拟：在该区域战斗时，停留于自身阵地格，每自身回合回复 8 HP/6 MP。',{dailyAP:2,originalEffect:true}));
  s.passive='阵地制造 B（技能库；阵地具体效果为原创）；精神污染 A：魔力对抗常驻 +3。';
 }
 if(s.id==='assassin'){
  s.skills=s.skills.filter(k=>k.id!=='presence');s.skills.push(db('presenceTactic','conceal','A+',0,0,'battle','选择额外效果1、2：首轮入场 1d20−灵格＋技能等级≥10 时额外 1 战斗行动；每战一次，本轮下一次攻击更高灵格目标时，两次应对属性都由自己选择。',{onceBattle:true}));
  s.passive='气息遮蔽 A+：魔力波动暗骰 +5；隐藏参战时每个战斗轮次再判波动，暴露后失去隐藏。附加效果选1、2。';
 }
 if(s.id==='berserker'){
  replace(s,'eternal',db('eternal','eternal','A+',0,0,'contest','整局初始 6 次。任意小节属性对抗前可启用，使该次双方无法获得包括幸运在内的任何加值；每天可花 1 日常操作和 20 MP 增加 1 次。'));
  s.skills.push(db('eternalTrain','eternal','A+',20,0,'daily','每日一次，1 日常操作和20 MP，增加1次无穷武炼使用次数。',{dailyAP:1,onceDay:true}));
  s.passive='狂化 C：全部属性对抗 +3，选择额外效果3，免除士气消耗导致的御主20魔力限制。';
 }
}
export const BY_ID=Object.fromEntries(SERVANTS.map(s=>[s.id,s]));
export const TIME_SLOTS=['白昼Ⅰ','白昼Ⅱ','黑夜Ⅰ','黑夜Ⅱ'];
export const REGIONS=[
{id:'temple',name:'柳洞寺',px:15,py:20,ley:true,desc:'西山古寺与主灵脉。'},
{id:'forest',name:'西山森林',px:8,py:49,desc:'山林与隐蔽小径。'},
{id:'miyama',name:'深山町',px:31,py:29,desc:'旧城住宅与通往大桥的街巷。'},
{id:'tohsaka',name:'远坂邸',px:35,py:52,ley:true,desc:'旧城高处的魔术师洋馆。'},
{id:'school',name:'穗群原学园',px:39,py:68,desc:'夜间寂静的校园。'},
{id:'matou',name:'间桐邸',px:25,py:81,desc:'古老宅邸与隐秘地下室。'},
{id:'castle',name:'爱因兹贝伦城',px:12,py:89,desc:'森林边缘的孤城。'},
{id:'bridge',name:'冬木大桥',px:52,py:34,desc:'横跨未远川的交通枢纽。'},
{id:'shinto',name:'新都',px:74,py:44,desc:'灯火明亮的现代都市。'},
{id:'station',name:'新都车站',px:88,py:34,desc:'连向港口的车站和街道。'},
{id:'docks',name:'港口仓库',px:86,py:15,desc:'码头、仓库与起重机。'},
{id:'church',name:'冬木教会',px:89,py:65,desc:'俯瞰新都的教会。'},
{id:'park',name:'新都公园',px:70,py:82,ley:true,desc:'河畔绿地与主灵脉。'}
];
export const WORLD_SPAWNS=['temple','tohsaka','shinto','park','matou','church','docks'];
export const REGION_BY_ID=Object.fromEntries(REGIONS.map(r=>[r.id,r]));
export const WORLD_EDGES=[['temple','miyama'],['forest','temple'],['miyama','bridge'],['miyama','tohsaka'],['tohsaka','school'],['school','matou'],['matou','castle'],['bridge','shinto'],['shinto','station'],['station','docks'],['shinto','church'],['church','park']];
export const adjacentRegions=id=>REGIONS.filter(r=>WORLD_EDGES.some(([a,b])=>a===id&&b===r.id||b===id&&a===r.id));
export const SIZE=20;
export const SPAWNS=[[5,5],[14,5],[16,10],[14,15],[5,15],[3,10],[10,3]];
export const LANDMARKS=[{x:10,y:10,name:'中央广场',type:'park'},{x:10,y:5,name:'北桥',type:'bridge'},{x:10,y:15,name:'南桥',type:'bridge'}];
export function terrain(x,y){if(x<0||y<0||x>=SIZE||y>=SIZE)return 'void';if(x===10&&![5,10,15].includes(y))return 'water';if([[6,8],[7,8],[12,12],[13,12],[5,12],[14,7],[7,3],[12,17],[3,7],[17,16]].some(p=>p[0]===x&&p[1]===y))return 'building';if(x===10)return 'bridge';return 'ground';}
export const RULES=[
  [
    "开局与角色",
    "七个经典职阶先到先得，占位后从369张Mooncell改编卡与7张原模板中选择，或自建角色。每位玩家控制一名御主与一名从者。新卡为战棋改编，未逐张人工审定。"
  ],
  [
    "日常与地图",
    "一天4个时间回合，每个存活单位各3日常行动点；分3轮同步提交，每轮御主和从者各提交一次，所有存活且可行动单位收齐后统一结算。移动先统一处理，再处理其他行动。同类冲突按固定单位顺序处理，与提交先后无关。待机只消耗本次1点，多点动作占用连续多轮；13个地点通过12条树形道路连接。四时段有不同光照。更换底图只影响本机外观。"
  ],
  [
    "固定特性预算",
    "从者初始6点、御主初始9点。各自专属预算可用于通用特性，战斗中获得的通用点和战斗专家奖励不能反向购买专属特性。所有房间固定预算；职阶优惠由引擎校验。"
  ],
  [
    "独立发现与偷袭",
    "同区每个发现方向独立检定1d20−目标灵格＋气息遮蔽，小于10则发现。单方面发现才可偷袭。刷新不重掷；离区失去定位。主从视野技能可共享发现。"
  ],
  [
    "战斗与入场",
    "战斗为20×20局部图，主从在同区时共同参战，发起战斗不扣日常点，战斗结束后每个实际参战单位的下一次日常行动扣1点并跳过，替代尚未执行的已提交行动；当前无可用行动则顺延至下一时间回合。本场不重复收费。战斗内每单位每回合2AP，日常时间暂停。"
  ],
  [
    "移动、周身与后撤",
    "默认周身为周围一圈。地面角色进入敌方周身后不能普通移动，须用后撤固定移动1格，通常1AP，敌有阻断时2AP。一人成军在无友军参战时扩大周身。到战斗图边缘才可另付1AP脱战。"
  ],
  [
    "飞行",
    "飞行能力每层2通用点，增加1格高度上限。开关或调整高度1AP，忽略周身与地形阻拦，棋子不能重叠。攻击距离为平面格距加高度差；同高飞行不额外加距离。本版禁空领域压制敌方全部飞行。"
  ],
  [
    "双方属性对抗",
    "防守者先选一种属性，双方分别按自己的等级掷XD6＋幸运与技能修正；攻击者再选一种属性作第二次对抗。攻击者成功0/1/2次对应0%/50%/100%伤害，先减伤再乘比例，最后扣护盾。"
  ],
  [
    "士气与反噬",
    "初始2、上限3。两次对抗后，防守者可消耗1士气挽回一次失败，每次威胁最多改一次，也可选自动。普通脱战减1、偷袭者脱战减2。应扣士气时已为0则扣20MP，缺口按两倍HP支付；15MP时即损失10HP。"
  ],
  [
    "技能与宝具",
    "库内效果固定；自建只改名称、渊源和人物资料。已接入的数据库同名技能优先采用原库；其余按原作方向改编。增益、领域、削魔、护幕、嘲讽、持续伤害分别结算。引导期间不能另行动，遇攻击威胁中断。"
  ],
  [
    "令咒",
    "每局3划，不占日常或战斗动作，可在他人回合使用。1划可选契约从者本场攻击+15、防御+15（仅从者生效，御主不获得加成）、从者回复60HP、从者或御主回复60MP、本轮应对必成或攻击无法应对；后两者互相抵消。也可强制服从、视野传送，2划主从脱战，X划缩短4X宝具引导。已经发动的攻击不能靠令咒位移规避。濒死令咒暂按治疗/回魔/防御预案。"
  ],
  [
    "御主与供魔",
    "御主独立行动、生命和魔力，当前接入10项御主技能。本人可同意零动作1:1给从者供魔。日结按御主魔力等级×10回魔，魔术回路另+20，随后支付从者维持费；不足以双倍HP支付。御主死亡后，无单独行动的从者在下一时间回合消散。"
  ],
  [
    "恢复与结束战斗",
    "日常进食1点恢复1d10HP或MP，休眠3点恢复4d10。连接主灵脉且未离开时，时间回合结束恢复30HP/MP。同场只剩一个契约方仍在战场则结束，返回剩余日常行动。"
  ],
  [
    "圣杯终局",
    "剩余两名从者时圣杯随机显现并全图公开。到场可拾起、随时放下。持杯不能移动、后撤、传送、调整飞行或撤退。仪式须完整度过下一个时间回合，参战立即清零。完成者契约方获胜。第8天起技能耗魔翻倍，第10天结束仪式未完成则平局。"
  ],
  [
    "跨WiFi与隐私",
    "所有人打开同一个Render HTTPS部署网址即可联网。仅填写虚构人物资料，不填写现实地址。游戏不读取GPS、不收集现实住址，不分享身份令牌；平台基础设施日志遵循平台隐私政策。免费Render重启可能丢房间，长局请使用可选持久化方案。"
  ]
];

export {LIBRARY_RULES};

export const SPIRIT_NOTES={saber:'A：不列颠传说的核心君王，作为本版基准。',archer:'A：古代史诗的核心英雄、乌鲁克王及神之子；按规则书神之子的A档，未按真正神灵的EX档。',lancer:'B：费奥纳骑士团的大英雄，按传奇英雄档。',rider:'A：以征服者身份成为一个时代的核心君王。',caster:'C：历史人物结合秘典的特殊召唤，影响局限于特定领域。',assassin:'D：秘密教团的传说人物与百貌分散的灵基。',berserker:'B：圆桌传说中的传奇骑士，按大英雄档。'};


RULES.push(['反击（0AP）','在本次攻击的属性应对开始前，可花1士气改为通常攻击、可即时发动的攻击技能或宝具反击，并放弃本次属性应对。技能仍支付MP与次数冷却，反击不扣战斗AP；按本版指定，宝具反击至少消耗1划令咒立即释放，每划消除最多4个引导动作。双方比较攻击伤害（含各自攻击加值），较低方承受差值，已有护盾可吸收；该差值不能再次应对、士气改判或连锁反击。范围攻击逐个目标处理，不额外模拟波及旁人的对波。规则没有独立“防御+减伤”基础动作。']);

RULES.push(['骰子保密','属性对抗动画仅显示自己这一方的骰子数量、点数、修正、合计与成功/失败。对方骰子数量和点数不显示，接口及战报同样隐藏。战斗图保留本次攻击最近两项属性的己方结果。']);
RULES.push(['纯AI快速结算','参战双方与同区共同参战的契约伙伴全为AI时，不进入战斗图。两方各有50%概率获胜，再随机rd75（1至75整数）：胜方扣该百分比当前生命，败方扣双倍百分比当前生命，最低0。发起不扣点，结算后参战单位的下一次日常行动扣1点并跳过，与真人战斗一致。双方参战主从按各自当前HP扣除阵营对应百分比，未参战伙伴不受伤。任何真人参战则照常进行战斗。']);

RULES.push(['宝具后置选点','攻击宝具先付MP、完成引导，再选择目标地点；无单独引导数时按原行动费用完成准备。选点与解放不再额外扣AP/MP；空格或非法选点可重选，尚未选点时受到攻击威胁仍中断。令咒完成引导可立即选点，反击宝具直接针对攻击者结算。']);
