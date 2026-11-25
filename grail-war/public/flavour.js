// Fixed tabletop conversions retain the source effect direction; never accept effect code from clients.
export function enrichAbility(k,source,card){if(k.libraryKey)return k;const text=source.sourceEffects.join('；'),rank=({E:1,D:2,C:3,B:4,A:5,EX:6}[String(source.rank).replace(/[+＋\-－]/g,'')]||3),tags=[];
 if(/己方全体|己方单体|我方全体|我方单体/.test(text)&&k.type==='adapted')tags.push('team');
 if(/NP减少|NP下降|充能减少/.test(text))tags.push('drain');
 if(/毒/.test(text))tags.push('poison');if(/灼伤/.test(text))tags.push('burn');if(/诅咒/.test(text))tags.push('curse');
 if(/目标集中/.test(text))tags.push('taunt');if(/HP减少|HP下降|生命值减少/.test(text)&&/自身/.test(text))tags.push('selfCost');
 if(/无敌贯通|无视防御|防御力无视/.test(text))tags.push('pierce');
 if(/特攻/.test(text))tags.push('hunter');if(/NP获得量|NP增加|NP充能/.test(text)&&k.np)tags.push('refund');
 if(/无敌|对肃正防御/.test(text)&&k.type==='adapted')tags.push('ward');
 k.tags=tags;k.potency=rank;k.fx=/火|炎|灼/.test(text)?'fire':/雷|电/.test(text)?'lightning':/冰|水|海/.test(text)?'ice':/毒|诅咒|即死/.test(text)?'shadow':card.classId==='archer'?'arrows':card.classId==='lancer'?'lance':card.classId==='caster'?'arcane':'blade';
 if(k.np&&k.type==='attack'){
 const name=source.name;
 if(/流星一条/.test(name)){k.sacrificeSelf=true;k.dice+=6;k.shape='area';k.radius=3;k.fx='arrows';}
 if(/誓约胜利之剑/.test(name)){k.shape='line';k.range=9;k.fx='beam';}
 if(/天地乖离/.test(name)){k.shape='area';k.radius=3;k.range=6;k.dispel=true;k.fx='vortex';}
 if(/刺穿死棘|穿刺死棘|死翔/.test(name)){k.curse=true;k.fx='lance';k.bonus+=8;}
 if(/无限剑制/.test(name)){k.shape='area';k.radius=3;k.fx='blades';k.field='forge';}
 if(/王之军势/.test(name)){k.field='army';k.fx='army';}
 if(/破戒应尽/.test(name)){k.dispel=true;k.range=1;k.bonus+=8;k.fx='shadow';}
 if(/妄想心音/.test(name)){k.curse=true;k.fx='shadow';}
 if(/射杀百头/.test(name)){k.bonus+=8;k.fx='blades';}
 if(/开演之刻|王之故事|归还之时|空之境界/.test(name))k.fx='arcane';
 if(k.shape==='line')k.desc=`直线宝具，射程${k.range}，沿线命中敌人；${k.dice}d4+${k.bonus}。`+(k.sacrificeSelf?'释放后自身退场。':'');
 else k.desc+=k.field==='forge'?' 释放后展开剑之领域，3轮内己方通常伤害+5。':k.field==='army'?' 释放后军势支援，3轮内己方移动+1、通常伤害+3。':'';
 }
 const notes=tags.map(t=>({team:'增益施加同战场存活主从',drain:'下一次有效命中削减目标魔力',poison:'命中后持续中毒2轮',burn:'命中后持续灼烧2轮',curse:'命中后持续诅咒2轮',taunt:'本轮嘲讽可攻击到自己的敌人',selfCost:'额外消耗自身生命（最低保留1）',pierce:'忽略技能与防御减伤，仍进行属性应对',hunter:'对已有负面状态目标追加伤害',refund:'有效命中后返还部分魔力',ward:'获得一次减伤护幕'}[t])).filter(Boolean);
 if(notes.length)k.desc+=' '+notes.join('；')+'。';return k;
}
