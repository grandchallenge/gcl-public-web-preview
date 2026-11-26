"""Actual Chromium verification; synthetic feed fixtures are never published."""
import functools,http.server,pathlib,threading,json
from datetime import datetime,timezone
from playwright.sync_api import sync_playwright,expect
ROOT=pathlib.Path(__file__).resolve().parents[1]
URL="https://raw.githubusercontent.com/grandchallenge/grandchallenge.github.io/control-public-feed/activity.json"
REF="https://api.github.com/repos/grandchallenge/grandchallenge.github.io/git/ref/heads/control-public-feed"
IMM="https://raw.githubusercontent.com/grandchallenge/grandchallenge.github.io/"+"a"*40+"/activity.json"
NOW=1800000000000
def stamp(ms):return datetime.fromtimestamp(ms/1000,timezone.utc).isoformat()
T=stamp(NOW-5000);U=stamp(NOW-2000)
def row(id,op,target,outcome="completed",code=0):
    return {"id":id*20,"operation":op,"target":target,"accepted_at":T,"finished_at":None if outcome=="accepted" else U,"outcome":outcome,"exit_code":code}
rows=[row("a","run_bash","CHAD Bash"),row("b","governed_repository_head","grandchallenge/MATHSOLVE"),row("c","run_bash","CHAD Bash","failed",127),row("d","project_queue_audit","GCL Worker Queue #2","accepted",None)]
feed={"schema":"GCL_CONTROL_ACTIVITY_FEED/2","policy":"GCL_CONTROL_PUBLIC_LIFECYCLE/2","coverage":"authorized_control_lifecycle_only","epoch":1,"epoch_started_at":stamp(NOW-10000),"epoch_reason":"activation","published_at":stamp(NOW),"records":rows,"withheld_candidates":0,"retention_limit":48}
class Quiet(http.server.SimpleHTTPRequestHandler):
    def log_message(self,*args):pass
server=http.server.ThreadingHTTPServer(("127.0.0.1",0),functools.partial(Quiet,directory=str(ROOT)))
threading.Thread(target=server.serve_forever,daemon=True).start()
try:
    with sync_playwright() as p:
        b=p.chromium.launch()
        for width,height in [(1440,900),(390,844),(320,640)]:
            q=b.new_page(viewport={"width":width,"height":height});errors=[];calls=[]
            q.on("pageerror",lambda e:errors.append(str(e)))
            q.add_init_script(f"Date.now=()=>{NOW}")
            payload=[feed]
            def serve(route):
                calls.append(route.request.url)
                route.fulfill(json=payload[0],headers={"Access-Control-Allow-Origin":"*"})
            q.route(URL+"?window=*",serve)
            ref_calls=[]; immutable=[None]
            def ref(route):
                ref_calls.append(route.request.url)
                if immutable[0] is None:route.fulfill(status=503,body="unavailable",headers={"Access-Control-Allow-Origin":"*"})
                else:route.fulfill(json={"ref":"refs/heads/control-public-feed","object":{"type":"commit","sha":"a"*40}},headers={"Access-Control-Allow-Origin":"*"})
            q.route(REF+"?window=*",ref)
            q.route(IMM,lambda route:route.fulfill(json=immutable[0],headers={"Access-Control-Allow-Origin":"*"}))
            q.goto(f"http://127.0.0.1:{server.server_port}/assets/operations/live.html")
            expect(q.locator("#state")).to_have_text("Recent publication")
            expect(q.locator(".event")).to_have_count(7)
            for channel,n in [("request",4),("result",2),("failure",1)]:expect(q.locator("#count-"+channel)).to_have_text(str(n))
            expect(q.locator("#source")).to_contain_text("last activity")
            # Late release of an actual-shaped reviewed transcript must update an already-open row.
            q.locator("[data-filter=request]").click()
            item=q.locator(".event").filter(has_text="run_bash").first
            item.locator("summary").click()
            expect(item.locator(".detail")).to_contain_text("not released")
            transcript={"policy":"GCL_REVIEWED_RESEARCH_TRANSCRIPT/1","id":"a"*20,"repository":"grandchallenge/MATH-PROGRAMME","revision":"b"*40,"command":"lake env lean Proof.lean","stdout_stderr":"error: unsolved goals\n<script>literal text</script>\n[REDACTED:assignment]","redactions":{"command":{},"output":{"assignment":1}},"exit_code":0,"source_end":U}
            payload[0]={**feed,"transcripts":[transcript]}
            q.evaluate("tick(true)")
            expect(q.locator(".event[open] .detail")).to_contain_text("lake env lean Proof.lean")
            q.locator("[data-filter=result]").click()
            item=q.locator(".event").filter(has_text="reviewed output")
            item.locator("summary").click()
            expect(item.locator(".detail")).to_contain_text("unsolved goals")
            expect(item.locator(".detail")).to_contain_text("<script>literal text</script>")
            assert item.locator(".detail script").count()==0
            q.evaluate("async () => { while(inFlight) await new Promise(r=>setTimeout(r,20)); }")
            payload[0]={**feed,"transcripts":[{**transcript,"policy":"GCL_AUTOMATIC_PUBLIC_SOURCE_TRANSCRIPT/1"}]}
            q.evaluate("tick(true)")
            expect(q.locator("#source")).to_contain_text("1 automatic")
            expect(q.locator(".event[open] .detail")).to_contain_text("Automatic exact public-source verification")
            q.evaluate("async () => { while(inFlight) await new Promise(r=>setTimeout(r,20)); }")
            payload[0]={**feed,"transcripts":[{**transcript,"policy":"GCL_OPEN_RESEARCH_EXECUTION/1","stdout_stderr":json.dumps({"stdout":"computed 42\n","stderr":"proof diagnostic\n"})}]}
            q.evaluate("tick(true)")
            expect(q.locator(".event[open] .detail")).to_contain_text("Open research execution")
            expect(q.locator(".event[open] .detail")).to_contain_text("computed 42")
            expect(q.locator(".event[open] .detail")).to_contain_text("proof diagnostic")
            q.locator("[data-filter=research]").click()
            expect(q.locator(".event")).to_have_count(2)


            q.locator("[data-filter=all]").click()
            q.evaluate("async () => { while(inFlight) await new Promise(r=>setTimeout(r,20)); }")
            payload[0]=feed
            q.evaluate("tick(true)")
            q.evaluate("async () => { while(inFlight) await new Promise(r=>setTimeout(r,20)); }")
            calls.clear();calls.append(URL)

            assert q.evaluate("document.documentElement.scrollWidth<=innerWidth")
            q.locator("[data-filter=failure]").click()
            q.locator(".event summary").click()
            expect(q.locator(".detail")).to_contain_text("127")
            q.locator("[data-filter=all]").click()
            q.evaluate("tick()");assert len(calls)==1
            q.locator("#pause").click()
            q.evaluate(f"Date.now=()=>{NOW+620000}");q.evaluate("tick()")
            assert len(calls)==1
            q.locator("#pause").click()
            expect(q.locator("#state")).to_contain_text("Stale publication")
            q.evaluate("async () => { while(inFlight) await new Promise(r=>setTimeout(r,20)); }")
            expect(q.locator(".event")).to_have_count(7)
            payload[0]={**feed,"epoch":2,"epoch_reason":"source_gap","epoch_started_at":stamp(NOW+615000),"published_at":stamp(NOW+620000),"records":[]}
            q.evaluate("tick(true)")
            expect(q.locator("#state")).to_have_text("Recent publication")
            expect(q.locator("#source")).to_contain_text("source discontinuity")
            expect(q.locator(".event")).to_have_count(0)
            payload[0]={**payload[0],"published_at":stamp(NOW+620000),"records":[{**rows[0],"target":"PRIVATE_CANARY"}]}
            q.evaluate("tick(true)")
            expect(q.locator("#state")).to_contain_text("unavailable")
            assert "PRIVATE_CANARY" not in q.locator("body").inner_text()
            # Stale raw branch, fresh immutable fallback, and rollback prevention.
            q.evaluate(f"Date.now=()=>{NOW+800000}")
            payload[0]={**feed,"epoch":2,"epoch_reason":"source_gap","epoch_started_at":stamp(NOW+615000),"published_at":stamp(NOW+620000),"records":[]}
            immutable[0]={**payload[0],"published_at":stamp(NOW+800000),"records":[{**rows[0],"accepted_at":stamp(NOW+799000),"finished_at":stamp(NOW+799500)}]}
            q.evaluate("tick(true)")
            expect(q.locator(".event")).to_have_count(2)
            expect(q.locator("#state")).to_have_text("Recent publication")
            before=len(ref_calls)
            q.evaluate("tick(true)")
            expect(q.locator(".event")).to_have_count(2)
            assert len(ref_calls)==before
            assert not errors,errors
            print("PASS",width,"mixed operations, failure, accepted-only, stale heartbeat, gap recovery, hostile schema, pause")
            q.close()
        b.close()
finally:
    server.shutdown();server.server_close()
