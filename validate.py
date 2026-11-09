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
assert 'class="programme-grid"' in html, "missing programme catalogue"
assert html.count('class="programme"')==5, "expected five programme links"
assert 'class="programme-graphic"' not in html, "decorative programme graphics must remain removed"
for programme in ("Mathematics", "AETHER", "MODULUS", "SPINDLE", "Adaptive"):
    assert programme in html, f"missing programme: {programme}"
assert html.count("assets/hero-polished-no-wiring.webp")==3, "all hero references must use the approved image"
assert html.count('class="hero-art"')==1, "expected one full-width hero image"
assert 'src="assets/hero-polished-no-wiring.webp" width="1983" height="793"' in html, "expected high resolution source and intrinsic dimensions"
assert '.hero-art{display:block;position:static;inset:auto;width:100%;max-width:100%;height:auto;' in html, "hero must preserve aspect ratio without clipping"
assert 'object-fit:contain' in html, "full image must remain visible"
assert 'class="hero-copy"' not in html and 'class="hero-visual"' not in html, "no title/illustration overlay allowed"
assert 'class="hero-links"' in html, "accessible links must remain independent of artwork"
assert 'class="hero-introduction"' in html, "introductory text must be outside hero image"
assert 'class="hero-hotspot"' not in html, "stale art-overlay hotspot must not be retained"
assert Path("assets/hero-polished-no-wiring.webp").stat().st_size > 400000, "unexpectedly low resolution hero asset"
assert "https://grandchallenge.github.io/MATH-PROGRAMME/" in html, "missing documentary continuity"
assert "showModal()" in html and "menu-toggle" in html, "missing interactive navigation"
assert not Path("CNAME").exists(), "preview must not install a custom domain"
print(f"PASS: {len(p.ids)} IDs, {len(p.images)} illustrations, {len(p.links)} links; existing Maths site untouched")
