from pathlib import Path
from html.parser import HTMLParser
class Check(HTMLParser):
    def __init__(self):
        super().__init__(); self.ids=set(); self.links=[]; self.images=[]
    def handle_starttag(self, tag, attrs):
        d=dict(attrs)
        if 'id' in d: self.ids.add(d['id'])
        if tag=='a' and d.get('href'): self.links.append(d['href'])
        if tag=='img': self.images.append(d)
h=Path('index.html').read_text()
c=Check();c.feed(h)
assert '<title>Grand Challenge Labs' in h
assert len(c.ids)>=4
assert all(link[1:] in c.ids for link in c.links if link.startswith('#')), 'broken internal anchors'
assert all('alt' in item for item in c.images), 'image missing alt'
assert 'https://grandchallenge.github.io/MATH-PROGRAMME/' in h
assert not Path('CNAME').exists()
print(f'PASS: {len(c.ids)} anchors, {len(c.links)} links, {len(c.images)} images; no CNAME')
