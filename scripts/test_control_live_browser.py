"""Real browser with an explicitly synthetic hostile fixture. Never publishes it."""
import functools,http.server,json,pathlib,threading
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[1]
URL="https://raw.githubusercontent.com/grandchallenge/grandchallenge.github.io/control-public-feed/feed.json"
OP="governed_repository_head";REPO="grandchallenge/MATH-PROGRAMME";T="2026-11-24T20:00:00+00:00";U="2026-11-24T20:00:01+00:00"
row={"id":"a"*20,"accepted_at":T,"finished_at":U,"request":{"operation":OP,"arguments":{"repo":REPO}},"outcome":{"operation":OP,"outcome":"completed","result":{"repository":REPO,"branch":"main","head_sha":"b"*40,"mutation":False}}}
feed={"schema":"GCL_CONTROL_DISCLOSURE_FEED/1","policy":"GCL_CONTROL_PUBLIC_HEAD/1","coverage":"authorized_control_head_projections_only","activated_at":T,"published_at":U,"records":[row],"withheld_candidates":0,"retention_limit":48}
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
httpd=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=httpd.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        b=p.chromium.launch()
        for width,height in ((1440,900),(390,844),(320,640)):
            page=b.new_page(viewport={"width":width,"height":height})
            errors=[];page.on("pageerror",lambda e:errors.append(str(e)))
            payload=[feed]; calls=[]
            page.add_init_script("Date.now=()=>1700000000000")
            def serve(route):
                calls.append(route.request.url)
                route.fulfill(json=payload[0],headers={"Access-Control-Allow-Origin":"*"})
            page.route(URL+"?window=*",serve)
            page.goto(f"http://127.0.0.1:{httpd.server_port}/assets/operations/live.html")
            expect(page.locator("#state")).to_have_text("Feed reachable")
            expect(page.locator(".event")).to_have_count(2)
            expect(page.locator("#count-request")).to_have_text("1")
            expect(page.locator("#count-result")).to_have_text("1")
            expect(page.locator("#count-failure")).to_have_text("0")
            page.locator("[data-filter=request]").click()
            page.locator(".event summary").click()
            expect(page.locator(".detail")).to_contain_text(REPO)
            assert page.evaluate("document.documentElement.scrollWidth<=innerWidth")
            page.locator("[data-filter=all]").click()
            assert len(calls)==1 and calls[0].endswith("window=170000000")
            page.evaluate("tick()")
            assert len(calls)==1, "same-window fetch"
            payload[0]={**feed,"published_at":"2026-11-24T20:00:02+00:00","records":[row,{**row,"id":"c"*20}]}
            page.evaluate("Date.now=()=>1700000010000")
            page.evaluate("tick()")
            expect(page.locator(".event")).to_have_count(4)
            assert len(calls)==2 and calls[-1].endswith("window=170000001")
            page.locator("#pause").click()
            page.evaluate("Date.now=()=>1700000020000")
            page.evaluate("tick()")
            assert len(calls)==2, "paused fetch"
            page.locator("#pause").click()
            expect(page.locator("#state")).to_have_text("Feed reachable")
            payload[0]={**feed,"records":[{**row,"request":{"operation":OP,"arguments":{"repo":"PRIVATE_CANARY"}}}]}
            page.evaluate("Date.now=()=>1700000030000")
            page.evaluate("tick(true)")
            expect(page.locator("#state")).to_contain_text("unavailable")
            expect(page.locator(".event")).to_have_count(4)
            assert "PRIVATE_CANARY" not in page.locator("body").inner_text()
            assert not errors,errors
            print("PASS: live view",width,"window deduplication, fresh update, pause and hostile replacement")
            page.close()
        b.close()
finally:
    httpd.shutdown();httpd.server_close()
