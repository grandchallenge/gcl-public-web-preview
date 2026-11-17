#!/usr/bin/env python3
"""Staging-only Chromium search-trigger accessibility smoke test."""
from __future__ import annotations
from pathlib import Path
import contextlib
import http.server
from functools import partial
from threading import Thread
from playwright.sync_api import sync_playwright

@contextlib.contextmanager
def site_server(site: Path):
    class H(http.server.SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
    server = http.server.ThreadingHTTPServer(('127.0.0.1', 0), partial(H, directory=str(site)))
    worker = Thread(target=server.serve_forever, daemon=True)
    worker.start()
    try:
        yield f'http://127.0.0.1:{server.server_port}/zensical/CMDG_CM4/'
    finally:
        server.shutdown()
        server.server_close()
        worker.join(timeout=3)

def luminance(color):
    components = []
    for part in color:
        value = part / 255
        components.append(value / 12.92 if value <= 0.04045 else ((value + .055) / 1.055) ** 2.4)
    return sum(a*b for a,b in zip(components,(.2126,.7152,.0722)))

def ratio(a,b):
    x,y = sorted((luminance(a),luminance(b)),reverse=True)
    return (x+.05)/(y+.05)

with site_server(Path('.pages-output').resolve()) as url, sync_playwright() as pw:
    browser = pw.chromium.launch(headless=True, args=['--no-sandbox'])
    page = browser.new_page(viewport={'width':1382,'height':450})
    response = page.goto(url,wait_until='domcontentloaded',timeout=20000)
    assert response.status == 200, f'staging route HTTP {response.status}'
    button = page.locator('.md-header .md-search__button')
    assert button.count() == 1, 'missing unique header search trigger'
    assert button.is_visible(), 'search trigger is not visible'
    computed = button.evaluate('''e => {const s=getComputedStyle(e);return {color:s.color,background:s.backgroundColor,outline:s.outlineColor}}''')
    import re
    def rgb(value):
        a=[int(v) for v in re.findall(r'\d+',value)[:3]]
        if len(a)!=3:raise ValueError(f'non-rgb color: {value}')
        return a
    contrast = ratio(rgb(computed['color']),rgb(computed['background']))
    assert contrast >= 4.5, f'header search trigger lacks 4.5:1 contrast: {contrast:.2f}'
    button.focus()
    assert button.evaluate("e => e.matches(':focus-visible')"), 'keyboard focus indicator absent'
    button.press('Enter')
    page.wait_for_timeout(400)
    # Confirm the search overlay still opens; CSS must not disable interaction.
    open_state=page.evaluate('''() => ({dialogs:[...document.querySelectorAll('dialog,[role="dialog"]')].filter(e=>e.getBoundingClientRect().width>0).length, inputs:document.querySelectorAll('input[type="search"]').length})''')
    assert open_state['dialogs'] or open_state['inputs'], 'search overlay does not open'
    print({'browser': browser.version,'page':url,'trigger_style':computed,'contrast_ratio':round(contrast,2),'focus_visible':True,'overlay':open_state})
    browser.close()
