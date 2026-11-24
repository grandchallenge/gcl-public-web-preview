"""Build an isolated, source-authorized publication snapshot.

Only the explicitly reviewed public validation source may produce records.
No private console, private repository, credential, or journal is an input.
Unknown outputs cause a build failure, not best-effort publication.
"""
from __future__ import annotations
import argparse, datetime, hashlib, json, os, pathlib, re, subprocess, sys, tempfile

ROOT = pathlib.Path(__file__).resolve().parents[1]
INPUT = b'import runpy\nrunpy.run_path("validate.py", run_name="__main__")\n'
SOURCE = "validate.py"
SCHEMA = "GCL_PUBLIC_CONSOLE_FEED/1"
PUBLIC_REPOS = {"grandchallenge/gcl-public-web-preview", "grandchallenge/grandchallenge.github.io"}
PASS = re.compile(rb"PASS: [0-9]{1,5} IDs, [0-9]{1,5} illustrations, [0-9]{1,5} links; existing Maths site untouched\n")
HEX = re.compile(r"[0-9a-f]{40}")
def sha(data): return hashlib.sha256(data).hexdigest()
def timestamp(): return datetime.datetime.now(datetime.timezone.utc).isoformat()
def check_output(stdout, stderr, code):
    if code != 0 or stderr or not PASS.fullmatch(stdout):
        raise ValueError("OUTPUT_NOT_DISCLOSURE_AUTHORIZED")
def git_head(root):
    return subprocess.check_output(["git", "-C", str(root), "rev-parse", "HEAD"], text=True).strip()
def safe_file(root, name):
    path = root / name
    if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root.resolve()):
        raise ValueError("PUBLIC_INPUT_UNSAFE")
    return path
def committed_file(root, head, name):
    data = safe_file(root, name).read_bytes()
    if subprocess.check_output(["git", "-C", str(root), "show", head + ":" + name]) != data:
        raise ValueError("PUBLIC_INPUT_DIFFERS_FROM_HEAD")
    return data

def build(root, dest, *, expected_head=None):
    head = git_head(root)
    if not HEX.fullmatch(head) or (expected_head is not None and head != expected_head):
        raise ValueError("SOURCE_REVISION_MISMATCH")
    committed_file(root, head, "scripts/public_console.py")
    policy = json.loads(committed_file(root, head, "scripts/public_console_policy.json"))
    if set(policy) != {"schema", "repository", "source_sha256", "stdin_sha256"} or policy["schema"] != "GCL_PUBLIC_CONSOLE_POLICY/1":
        raise ValueError("POLICY_SCHEMA_INVALID")
    repo = policy["repository"]
    if repo not in PUBLIC_REPOS or policy["stdin_sha256"] != sha(INPUT):
        raise ValueError("SOURCE_NOT_DISCLOSURE_AUTHORIZED")
    remote = subprocess.check_output(["git", "-C", str(root), "remote", "get-url", "origin"], text=True).strip()
    if remote.rstrip("/").removesuffix(".git") not in {"https://github.com/" + repo, "git@github.com:" + repo}:
        raise ValueError("SOURCE_REPOSITORY_MISMATCH")
    if os.environ.get("GITHUB_REPOSITORY", repo) != repo:
        raise ValueError("BUILD_REPOSITORY_MISMATCH")
    # The source that ran must be the exact reviewed repository version.
    source = committed_file(root, head, SOURCE)
    if sha(source) != policy["source_sha256"]:
        raise ValueError("SOURCE_DIGEST_NOT_AUTHORIZED")
    # Only public site input files necessary for this producer; no .git or credentials.
    with tempfile.TemporaryDirectory(prefix="public-console-") as tmp:
        work = pathlib.Path(tmp)
        (work / "index.html").write_bytes(committed_file(root, head, "index.html"))
        (work / "validate.py").write_bytes(source)
        # Image paths are fixed public assets, not arbitrary HTML-controlled filesystem reads.
        for name in policy_assets(repo):
            target = work / name
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(committed_file(root, head, name))
        started = timestamp()
        p = subprocess.run([sys.executable, "-I", "-S", "-"], input=INPUT,
                           capture_output=True, cwd=work, timeout=20,
                           env={"PATH": os.defpath, "LANG": "C.UTF-8", "PYTHONUTF8": "1", "HOME": str(work)})
        finished = timestamp()
    check_output(p.stdout, p.stderr, p.returncode)
    run_id = sha((repo + head + started).encode())[:16]
    def event(utc, stream, data):
        return {"utc": utc, "event": stream, "run_id": run_id,
                "message": data.decode("utf-8"), "sha256": sha(data)}
    events = [event(started, "stdin", INPUT), event(finished, "stdout", p.stdout)]
    # Empty stderr is reported as a byte count, not an invented stderr event.
    feed = {"schema": SCHEMA, "source_repository": repo, "source_revision": head,
            "producer": SOURCE, "source_sha256": sha(source),
            "published_at": finished, "coverage": "explicit_public_producer_only",
            "exit_code": p.returncode, "stream_bytes": {"stdin":len(INPUT), "stdout":len(p.stdout), "stderr":len(p.stderr)},
            "events": events}
    dest.mkdir(parents=True, exist_ok=True)
    target = dest / "feed.json"
    if target.exists() or target.is_symlink():
        raise ValueError("REFUSE_STALE_FEED_REUSE")
    with tempfile.NamedTemporaryFile(mode="w", encoding="utf-8", dir=dest, prefix=".feed-", delete=False) as f:
        temp = pathlib.Path(f.name)
        f.write(json.dumps(feed, ensure_ascii=False, indent=2) + "\n")
    try: temp.replace(target)
    finally: temp.unlink(missing_ok=True)
    print("PASS: source-authorized console snapshot, 2 real stream records, exact source", head)
    return feed
def policy_assets(repo):
    common = ("assets/hero-polished-no-wiring.webp",)
    return common + (("assets/" + PREVIEW_SECOND_IMAGE,) if repo.endswith("gcl-public-web-preview") else ())
# Filled from the reviewed public preview page at implementation time.
PREVIEW_SECOND_IMAGE = "library.webp"
if __name__ == "__main__":
    parser = argparse.ArgumentParser()
    parser.add_argument("--destination", type=pathlib.Path, required=True)
    parser.add_argument("--expected-head")
    args = parser.parse_args()
    try: build(ROOT, args.destination, expected_head=args.expected_head)
    except (ValueError, OSError, subprocess.SubprocessError) as e:
        # Never print arbitrary captured output or exception arguments to the public feed.
        print("Publication withheld: producer authorization or execution check failed", file=sys.stderr)
        raise SystemExit(1) from None
