"""Fetch the requested Mooncell seven-class catalogue with cached, attributed snapshots."""
from pathlib import Path
from urllib.parse import quote,unquote,urlencode
from urllib.request import Request,urlopen
from concurrent.futures import ThreadPoolExecutor,as_completed
import json,time
from lxml import html
root=Path(__file__).resolve().parent.parent; research=root/'research'; research.mkdir(exist_ok=True)
classes={'Saber','Archer','Lancer','Rider','Caster','Assassin','Berserker'}
tree=html.parse(str(research/'mooncell-params.html'));records=[]
for tr in tree.xpath('//table//tr')[1:]:
 td=tr.xpath('./td')
 if len(td)<9:continue
 values=[v.text_content().strip() for v in td]
 klass=values[1].replace('Grand ','')
 if klass not in classes:continue
 links=td[2].xpath('.//a/@href')
 if not links:continue
 title=unquote(links[-1].split('/w/')[-1]); records.append({'number':values[0],'class':klass,'name':values[2],'title':title,'ranks':values[3:8],'npRank':values[8],'source':'https://fgo.wiki'+links[-1]})
(research/'mooncell-index.json').write_text(json.dumps(records,ensure_ascii=False,indent=2));print('INDEX',len(records),flush=True)
cache=research/'pages';cache.mkdir(exist_ok=True)
def fetch(batch):
 params={'action':'query','titles':'|'.join(r['title'] for r in batch),'prop':'revisions','rvprop':'ids|timestamp|content','rvslots':'main','redirects':'1','format':'json','formatversion':'2','maxlag':'5'}
 url='https://fgo.wiki/api.php?'+urlencode(params)
 for attempt in range(4):
  try:
   req=Request(url,headers={'User-Agent':'GrailWarResearch/0.4 personal fan-game source audit (two concurrent API requests)'})
   with urlopen(req,timeout=60) as response: data=json.load(response)
   if 'error' in data:raise RuntimeError(data['error'])
   aliases={r['from']:r['to'] for r in data.get('query',{}).get('redirects',[])};pages={p['title']:p for p in data['query']['pages']}
   result=[]
   for rec in batch:
    title=rec['title'].replace('_',' ');seen=set()
    while title in aliases and title not in seen:seen.add(title);title=aliases[title]
    page=pages.get(title)
    if not page or not page.get('revisions'): result.append((rec['number'],False));continue
    (cache/(rec['number']+'.json')).write_text(json.dumps({'index':rec,'page':page},ensure_ascii=False));result.append((rec['number'],True))
   return result
  except Exception as e:
   if attempt==3:return [(r['number'],str(e)) for r in batch]
   time.sleep(1+attempt*2)
complete=research/'mooncell-index-complete.json'
if complete.exists():records=json.loads(complete.read_text())
missing=[r for r in records if not(cache/(r['number']+'.json')).exists()];batches=[missing[i:i+20] for i in range(0,len(missing),20)]
with ThreadPoolExecutor(max_workers=2) as ex:
 for future in as_completed([ex.submit(fetch,b) for b in batches]):
  results=future.result();print('BATCH',len(results),'OK',sum(ok is True for _,ok in results),'ERRORS',[(n,e) for n,e in results if e is not True],flush=True)
print('CACHED',len(list(cache.glob('*.json'))),flush=True)
