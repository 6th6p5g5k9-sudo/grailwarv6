"""Read the fetched Mooncell pages, retaining attributed factual fields for original tabletop cards."""
from pathlib import Path
import re,json,collections,hashlib
ROOT=Path(__file__).resolve().parent.parent

def split_top(s):
 out=[];buf=[];a=b=0;i=0
 while i<len(s):
  pair=s[i:i+2]
  if pair=='{{':a+=1;buf.append(pair);i+=2;continue
  if pair=='}}':a-=1;buf.append(pair);i+=2;continue
  if pair=='[[':b+=1;buf.append(pair);i+=2;continue
  if pair==']]':b-=1;buf.append(pair);i+=2;continue
  if s[i]=='|' and a==0 and b==0:out.append(''.join(buf).strip());buf=[]
  else:buf.append(s[i])
  i+=1
 out.append(''.join(buf).strip());return out

def templates(text,name):
 out=[];pattern=re.compile(r'\{\{\s*'+re.escape(name)+r'\s*[|\n]')
 for m in pattern.finditer(text):
  depth=1;i=m.start()+2
  while i<len(text)-1:
   if text[i:i+2]=='{{':depth+=1;i+=2
   elif text[i:i+2]=='}}':
    depth-=1
    if depth==0:out.append(text[m.start()+2:i]);break
    i+=2
   else:i+=1
 return out

def clean(s):
 s=re.sub(r'<!--[\s\S]*?-->','',s);s=re.sub(r'<ref\b[^>]*>[\s\S]*?</ref>','',s);s=re.sub(r'<[^>]+>','',s);s=re.sub(r'\[\[(?:[^\]|]*\|)?([^\]]+)\]\]',r'\1',s)
 s=re.sub(r'\{\{[^{}]*\|([^{}|]*)\}\}',r'\1',s);s=s.replace("'''",'').replace("''",'');return re.sub(r'\s+',' ',s).strip()

def fields(body):
 vals=split_top(body);return {v.split('=',1)[0].strip():v.split('=',1)[1].strip() for v in vals[1:] if '=' in v}

def skill(body):
 vals=split_top(body);d=fields(body)
 name=d.get('中文名') or d.get('名称') or (vals[2] if len(vals)>2 else '')
 if not name:return None
 name=clean(name);m=re.search(r'\s+((?:EX|[A-E])[+＋\-－]*)$',name);grade=m[1].replace('＋','+') if m else '?';name=name[:m.start()] if m else name
 # Only effect descriptions are retained, never prose biographies or game dialogue.
 effects=[]
 for v in vals[5:]:
  t=clean(v)
  if t and re.search('[\u4e00-\u9fff]',t) and not t.startswith(('开放','通关','初始','技能')):effects.append(t[:180])
 if not effects:effects=[clean(v)[:180] for k,v in d.items() if k.startswith('效果')]
 return {'name':name,'rank':grade,'sourceEffects':effects[:10]}

roster=json.loads((ROOT/'research/mooncell-roster.json').read_text());obtainable={int(r['id']) for r in roster};output=[];excluded=[];issues=[]
for p in sorted((ROOT/'research/pages').glob('*.json')):
 j=json.loads(p.read_text());page=j['page'];rev=page['revisions'][0];text=rev['slots']['main']['content'];base=templates(text,'基础数值')
 if not base:
  if int(j['index']['number']) not in obtainable:excluded.append({'number':j['index']['number'],'reason':'NPC/non-obtainable record without summonable servant base'});continue
  issues.append([j['index']['number'],'missing base']);continue
 b=fields(base[0]);num=int(b.get('序号',j['index']['number']));klass=b.get('职阶',j['index']['class']).replace('Grand ','')
 if num not in obtainable:excluded.append({'number':num,'name':clean(b.get('中文名',page['title'])),'reason':'not obtainable in Mooncell roster'});continue
 if klass not in {'Saber','Archer','Lancer','Rider','Caster','Assassin','Berserker'}:issues.append([num,'class '+klass]);continue
 allskills=[]
 for body in templates(text,'持有技能'):
  k=skill(body)
  if k and not any(v['name']==k['name'] and v['sourceEffects']==k['sourceEffects'] for v in allskills):allskills.append(k)
 # Latest revision of each of the three numbered base skills.
 section=re.search(r'===持有技能===([\s\S]*?)(?:===职阶技能===|===追加技能===|==素材需求==)',text)
 groups=re.split(r"'''技能[123][^\n]*",section[1] if section else '')[1:];selected=[]
 for group in groups[:3]:
  arr=[skill(t) for t in templates(group,'持有技能')];arr=[v for v in arr if v]
  if arr:selected.append(arr[-1])
 if not selected:selected=allskills[-3:]
 nps=[]
 for body in templates(text,'宝具'):
  d=fields(body);name=clean(d.get('中文名',''))
  if not name:continue
  np={'name':name,'rank':clean(d.get('阶级',b.get('宝具','?'))),'kind':clean(d.get('种类','')),'target':clean(d.get('类型','')),'sourceEffects':[clean(v)[:180] for k,v in d.items() if re.match(r'^效果[A-Z0-9]',k)][:12]}
  same=next((i for i,v in enumerate(nps) if v['name']==name),None)
  if same is not None:nps[same]=np
  else:nps.append(np)
 # Rarer pages use a different named NP template; keep failures visible in audit.
 if not nps:issues.append([num,'missing NP'])
 if not selected:issues.append([num,'missing skills'])
 classes=[]
 for body in templates(text,'职阶技能'):
  vals=split_top(body)[1:]
  for i in range(0,len(vals)-3,4):classes.append({'name':clean(vals[i+1]),'rank':clean(vals[i+2])})
 ranks=[clean(b.get(k,j['index'].get('ranks',[])[i] if i<len(j['index'].get('ranks',[])) else '?')) for i,k in enumerate(['筋力','耐久','敏捷','魔力','幸运'])]
 traits=[clean(v) for k,v in b.items() if re.match(r'^特性\d+$',k)]
 output.append({'id':'mc-'+str(num).zfill(3),'number':num,'name':clean(b.get('中文名',page['title'])),'classId':klass.lower(),'rarity':int(b.get('稀有度','3')) if b.get('稀有度','3').isdigit() else 3,'gender':clean(b.get('性别','未知')),'alignment':clean(b.get('属性1',''))+'·'+clean(b.get('属性2','')),'sourceRanks':ranks,'traits':traits,'classSkills':classes,'skills':selected,'allSkills':allskills,'nps':nps,'source':{'url':'https://fgo.wiki/w/'+__import__('urllib.parse',fromlist=['quote']).quote(page['title'].replace(' ','_')),'title':page['title'],'pageId':page.get('pageid'),'revisionId':rev['revid'],'revisionAt':rev.get('timestamp'),'fetchedAt':'2026-11-23'}})
manifest={'source':'https://fgo.wiki/w/英灵图鉴','parameterIndex':'https://fgo.wiki/w/从者参数一览','asOf':'2026-11-23','scope':'all obtainable seven-class roster entries including swimsuits, Alters and separate spirit origins; extra classes excluded','expected':len(obtainable),'read':len(output),'classCounts':dict(collections.Counter(r['classId'] for r in output)),'excluded':excluded,'issues':issues,'conversion':'original deterministic tabletop conversion v0.4; matching supplied database skills reuse that database, unmatched effects are original tabletop adaptations, not FGO numeric copies'}
(ROOT/'public/catalogue-data.js').write_text('export const MOONCELL_DATA='+json.dumps(output,ensure_ascii=False,separators=(',',':'))+';\nexport const CATALOGUE_MANIFEST='+json.dumps(manifest,ensure_ascii=False,indent=2)+';\n')
(ROOT/'research/catalogue-audit.json').write_text(json.dumps(manifest,ensure_ascii=False,indent=2));print(json.dumps(manifest,ensure_ascii=False,indent=2))
