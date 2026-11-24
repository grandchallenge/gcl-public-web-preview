"""Hostile release-boundary cases; uses public fixtures only."""
import base64, hashlib, json, os, pathlib, shutil, subprocess, tempfile, unittest
import public_console as pc

class ReleaseTests(unittest.TestCase):
    def test_output_grammar(self):
        pc.check_output(b"PASS: 15 IDs, 2 illustrations, 27 links; existing Maths site untouched\n", b"", 0)
        for out,err,rc in [
            (b"opaque secret",b"",0),
            (b"PASS: 15 IDs, 2 illustrations, 27 links; existing Maths site untouched\nsecret",b"",0),
            (b"",b"password=opaque",0),
            (base64.b64encode(b"opaque"),b"",0),
            (b"Private house at 123 Example Lane",b"",0),
            (b"PASS: 15 IDs, 2 illustrations, 27 links; existing Maths site untouched\n",b"",1),
        ]:
            with self.subTest(out=out,rc=rc), self.assertRaisesRegex(ValueError,"NOT_DISCLOSURE_AUTHORIZED"):
                pc.check_output(out,err,rc)
    def test_actual_committed_source_and_isolation(self):
        with tempfile.TemporaryDirectory() as t:
            dest=pathlib.Path(t)/"public"
            feed=pc.build(pc.ROOT,dest,expected_head=pc.git_head(pc.ROOT))
            self.assertEqual(set(x.name for x in dest.iterdir()),{"feed.json"})
            self.assertEqual(feed["coverage"],"explicit_public_producer_only")
            self.assertEqual(feed["stream_bytes"]["stderr"],0)
            self.assertEqual([e["event"] for e in feed["events"]],["stdin","stdout"])
            for e in feed["events"]:
                self.assertEqual(e["sha256"],pc.sha(e["message"].encode()))
            self.assertEqual(feed["events"][0]["message"].encode(),pc.INPUT)
            with self.assertRaisesRegex(ValueError,"STALE_FEED"):
                pc.build(pc.ROOT,dest)
            with self.assertRaisesRegex(ValueError,"REVISION_MISMATCH"):
                pc.build(pc.ROOT,pathlib.Path(t)/"wrong",expected_head="0"*40)
            self.assertFalse((pathlib.Path(t)/"wrong").exists())
    def test_changed_input_and_policy_rejected(self):
        with tempfile.TemporaryDirectory() as t:
            root=pathlib.Path(t)/"checkout"
            subprocess.run(["git","clone","-q","--local",str(pc.ROOT),str(root)],check=True)
            remote=subprocess.check_output(["git","-C",str(pc.ROOT),"remote","get-url","origin"],text=True).strip()
            subprocess.run(["git","-C",str(root),"remote","set-url","origin",remote],check=True)
            for name in ("validate.py","index.html","scripts/public_console_policy.json","scripts/public_console.py"):
                f=root/name; old=f.read_bytes()
                f.write_bytes(old+b"\n")
                dest=pathlib.Path(t)/"never"
                with self.subTest(name=name), self.assertRaisesRegex(ValueError,"DIFFERS_FROM_HEAD"):
                    pc.build(root,dest)
                self.assertFalse(dest.exists())
                f.write_bytes(old)
            subprocess.run(["git","-C",str(root),"remote","set-url","origin","https://github.com/example/private"],check=True)
            with self.assertRaisesRegex(ValueError,"REPOSITORY_MISMATCH"):
                pc.build(root,pathlib.Path(t)/"never")
if __name__ == "__main__": unittest.main()
