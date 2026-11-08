from html.parser import HTMLParser
from pathlib import Path

class SiteParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.ids=set()
        self.links=[]
        self.images=[]
        self.buttons=[]
    def handle_starttag(self, tag, attrs):
        a=dict(attrs)
        if "id" in a: self.ids.add(a["id"])
        if tag=="a": self.links.append(a.get("href",""))
        if tag=="img": self.images.append(a)
        if tag=="button": self.buttons.append(a)

html=Path("index.html").read_text(encoding="utf-8")
p=SiteParser()
p.feed(html)
assert len(p.ids)>=11, "missing site sections"
assert all(href[1:] in p.ids for href in p.links if href.startswith("#")), "broken internal anchors"
assert all("alt" in img and Path(img["src"]).is_file() for img in p.images), "missing image asset or alt"
assert len(p.images)==2, "expected illustration and library artwork"
assert html.count('class="hero-visual"')==1, "hero artwork must have its own viewport"
assert ".hero-visual{position:absolute;inset:0 0 0 420px;" in html, "desktop hero separation must be preserved"
assert ".hero:after{display:none}" in html, "translucent text overlay reintroduced"
assert "@media(max-width:600px)" in html and ".hero-visual{inset:345px 0 0 0}" in html, "mobile hero separation missing"
assert "https://grandchallenge.github.io/MATH-PROGRAMME/" in html, "missing documentary continuity"
assert "showModal()" in html and "menu-toggle" in html, "missing interactive navigation"
assert not Path("CNAME").exists(), "preview must not install a custom domain"
print(f"PASS: {len(p.ids)} IDs, {len(p.images)} illustrations, {len(p.links)} links; existing Maths site untouched")
