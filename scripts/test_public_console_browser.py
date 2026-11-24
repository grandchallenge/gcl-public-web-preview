from __future__ import annotations
import functools, http.server, json, pathlib, shutil, tempfile, threading
from playwright.sync_api import sync_playwright, expect
import public_console as pc

with tempfile.TemporaryDirectory() as tmp:
    root = pathlib.Path(tmp)
    target = root / "assets" / "operations"
    shutil.copytree(pc.ROOT / "assets" / "operations", target)
    feed = pc.build(pc.ROOT, target, expected_head=pc.git_head(pc.ROOT))
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(root))
    class Quiet(handler.func):
        def log_message(self, *args): pass
    httpd = http.server.ThreadingHTTPServer(("127.0.0.1", 0), functools.partial(Quiet, directory=str(root)))
    thread = threading.Thread(target=httpd.serve_forever, daemon=True)
    thread.start()
    origin = "http://127.0.0.1:" + str(httpd.server_port)
    try:
        with sync_playwright() as pw:
            browser = pw.chromium.launch(headless=True)
            for width, height in ((1440,900),(390,844),(320,640)):
                page=browser.new_page(viewport={"width":width,"height":height})
                errors=[]; requests=[]
                page.on("pageerror",lambda e: errors.append(str(e)))
                page.on("request",lambda r:requests.append(r.url))
                page.goto(origin+"/assets/operations/index.html")
                expect(page.locator("#state")).to_have_text("Published")
                expect(page.locator(".event")).to_have_count(2)
                expect(page.locator("#count-stdin")).to_have_text("1")
                expect(page.locator("#count-stdout")).to_have_text("1")
                expect(page.locator("#count-stderr")).to_have_text("0")
                expect(page.locator("#source")).to_contain_text("stderr 0 bytes")
                assert page.locator("#source a").get_attribute("href") == "https://github.com/"+feed["source_repository"]+"/commit/"+feed["source_revision"]
                page.locator("[data-filter=stdin]").click()
                expect(page.locator(".event")).to_have_count(1)
                page.locator(".event summary").click()
                expect(page.locator(".event .detail pre")).to_have_text(feed["events"][0]["message"].strip())
                page.locator("[data-filter=stdout]").click()
                page.locator(".event summary").click()
                expect(page.locator(".event .detail pre")).to_contain_text("existing Maths site untouched")
                assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
                page.locator("#search").fill("not-a-record-815bd0")
                expect(page.locator(".empty")).to_be_visible()
                assert not errors, errors
                assert all(x.startswith(origin+"/assets/operations/") for x in requests), requests
                assert not any("/api/" in x for x in requests), requests
                print("PASS: browser viewport",width,"real publication records, source link, search, no private requests")
                page.close()
            browser.close()
    finally:
        httpd.shutdown()
        httpd.server_close()
