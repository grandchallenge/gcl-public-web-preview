from html.parser import HTMLParser
from pathlib import Path
class Parser(HTMLParser):
 def __init__(self):super().__init__();self.ids=set();self.images=[];self.links=[]
 def handle_starttag(self,tag,attrs):
  a=dict(attrs)
  if 'id' in a: self.ids.add(a['id'])
  if tag=='a':self.links.append(a.get('href',''))
  if tag=='img':self.images.append(a)
p=Parser();p.feed(Path('index.html').read_text(encoding='utf-8'))
assert len(p.ids)>=11,(len(p.ids),p.ids)
assert all(l[1:] in p.ids for l in p.links if l.startswith('#'))
assert all('alt' in x for x in p.images)
assert all(Path(x['src']).is_file() for x in p.images)
assert all(Path(path).is_file() for path in ['styles.css','site.js','assets/mark.svg'])
assert not Path('CNAME').exists()
print('PASS',len(p.ids),'anchors',len(p.images),'images',len(p.links),'links')