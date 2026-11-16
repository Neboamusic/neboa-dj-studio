"""DJ Studio real-FFmpeg normalizer smoke and no-overwrite tests.

All audio is synthesized by FFmpeg in a temporary folder. The tests never
inspect Rekordbox, the user's USB or original DJ collection.
"""
import hashlib
import http.client
import json
import os
from pathlib import Path
import shutil
import socket
import subprocess
import tempfile
import threading
import unittest
import sys

BASE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BASE))
import normalizer as N


class NormalizerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        if not (shutil.which("ffmpeg") and shutil.which("ffprobe")):
            raise unittest.SkipTest("FFmpeg/FFprobe not installed")
        cls.tmp = tempfile.TemporaryDirectory(prefix=".qa-normalizer-", dir=BASE)
        cls.path = Path(cls.tmp.name)
        cls.source = cls.path / "synthetic_original.flac"
        ffmpeg = shutil.which("ffmpeg")
        subprocess.run(
            [ffmpeg, "-nostdin", "-hide_banner", "-loglevel", "error",
             "-f", "lavfi", "-i", "sine=frequency=333:duration=4:sample_rate=44100",
             "-ac", "2", "-af", "volume=8dB", "-c:a", "flac",
             "-y", str(cls.source)], check=True, capture_output=True
        )
        cls.source_hash = hashlib.sha256(cls.source.read_bytes()).hexdigest()

    @classmethod
    def tearDownClass(cls):
        cls.tmp.cleanup()

    def test_01_loudnorm_real_lufs_and_true_peak(self):
        actual = N.measure(self.source)
        self.assertGreater(actual["duration_seconds"], 3.5)
        self.assertGreater(actual["integrated_lufs"], -30)
        self.assertLess(actual["integrated_lufs"], -5)
        self.assertTrue(isinstance(actual["true_peak_dbtp"], float))
        self.assertEqual(actual["sample_rate"], 44100)
        self.assertEqual(actual["channels"], 2)

    def test_02_safe_gain_only_never_destroys_dynamics(self):
        measured = {"integrated_lufs": -18.0, "true_peak_dbtp": -2.0}
        plan = N.make_plan(measured, -11.0, -1.5, "flac")
        self.assertLessEqual(plan["applied_gain_db"], 0.05)
        self.assertFalse(plan["exact_target_possible"])
        self.assertEqual(plan["method"], "GAIN_ONLY_NO_COMPRESSOR_NO_LIMITER")
        self.assertLessEqual(plan["predicted_true_peak_dbtp"], -1.5)

    def test_03_loud_input_is_reduced(self):
        plan = N.make_plan({"integrated_lufs": -7.0, "true_peak_dbtp": -0.1}, -11.0)
        self.assertAlmostEqual(plan["applied_gain_db"], -4.0)
        self.assertAlmostEqual(plan["predicted_lufs"], -11.0)

    def test_04_quiet_input_gain_is_bounded(self):
        plan = N.make_plan({"integrated_lufs": -39.0, "true_peak_dbtp": -41.0}, -11.0)
        self.assertEqual(plan["applied_gain_db"], 6.0)
        self.assertFalse(plan["exact_target_possible"])

    def test_05_reject_outside_target_or_malformed_metrics(self):
        with self.assertRaises(N.NormalizationError):
            N.make_plan({"integrated_lufs": -11.0, "true_peak_dbtp": -1.0}, -3.0)
        with self.assertRaises(N.NormalizationError):
            N.parse_loudnorm("no valid json")
        with self.assertRaises(N.NormalizationError):
            N.parse_loudnorm('{"input_i":"-inf","input_tp":"-1","input_lra":"0","input_thresh":"-30"}')

    def test_06_flac_copy_verified_and_original_hash_unchanged(self):
        src_metrics = N.measure(self.source)
        src_metrics["filename"] = self.source.name
        result = N.normalized_copy(self.source, self.path / "flac_out", src_metrics, -12.0, "flac")
        self.assertEqual(result["status"], "VERIFIED_NEW_COPY")
        self.assertEqual(result["format"], "flac")
        self.assertTrue(result["original_unchanged"])
        self.assertTrue(Path(result["output_path"]).is_file())
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.source_hash)
        self.assertLessEqual(result["after"]["true_peak_dbtp"], -1.5 + 0.12)
        self.assertAlmostEqual(result["before"]["duration_seconds"], result["after"]["duration_seconds"],delta=0.35)
        self.assertGreater(result["after"]["integrated_lufs"], result["before"]["integrated_lufs"]-12)

    def test_07_never_overwrite_a_previous_copy(self):
        src = N.measure(self.source)
        with self.assertRaisesRegex(N.NormalizationError,"ya existe"):
            N.normalized_copy(self.source,self.path/"flac_out",src,-12.0,"flac")
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(), self.source_hash)

    def test_08_mp3_output_remeasured(self):
        src = N.measure(self.source)
        src["filename"] = self.source.name
        result = N.normalized_copy(self.source,self.path/"mp3_out",src,-14.0,"mp3")
        self.assertTrue(Path(result["output_path"]).is_file())
        self.assertEqual(result["after"]["codec"],"mp3")
        self.assertLessEqual(result["after"]["true_peak_dbtp"],-1.5+0.12)

    def test_09_wav_output_preserves_content_and_duration(self):
        src=N.measure(self.source)
        src["filename"]=self.source.name
        result=N.normalized_copy(self.source,self.path/"wav_out",src,-11.0,"wav")
        self.assertTrue(Path(result["output_path"]).is_file())
        self.assertEqual(result["after"]["codec"],"pcm_s24le")
        self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.source_hash)

    def test_10_disallow_output_outside_home_and_symlinks(self):
        with self.assertRaises(N.NormalizationError):
            N._output_dir(Path("/Volumes/fake/OtherDJ"))
        link=self.path/"linked.flac"
        link.symlink_to(self.source)
        with self.assertRaises(N.NormalizationError):
            N.inspect_audio(link)

    def test_11_no_loudness_from_silent_audio(self):
        with self.assertRaises(N.NormalizationError):
            N.parse_loudnorm('{"input_i":"-inf","input_tp":"-inf","input_lra":"0","input_thresh":"-70"}')

    def test_12_source_metadata_ignored_when_encoding(self):
        ffmpeg = shutil.which("ffmpeg")
        tagged=self.path/"tagged.mp3"
        subprocess.run([ffmpeg,"-nostdin","-hide_banner","-loglevel","error","-i",str(self.source),
            "-metadata","title=Quality Track","-metadata","album=Untrusted Artwork Album",
            "-c:a","libmp3lame","-b:a","192k","-y",str(tagged)],check=True,capture_output=True)
        src=N.measure(tagged)
        src["filename"]=tagged.name
        result=N.normalized_copy(tagged,self.path/"untagged",src,-12.0,"flac")
        probe=subprocess.run([shutil.which("ffprobe"),"-v","error","-show_entries",
            "format_tags","-of","json",result["output_path"]],
            capture_output=True,text=True,check=True)
        tags=json.loads(probe.stdout).get("format",{}).get("tags",{})
        self.assertNotIn("album",{key.lower():val for key,val in tags.items()})

    def test_13_loopback_http_session_token_guard_and_user_authorized_render(self):
        with socket.socket() as sock:
            sock.bind(("127.0.0.1",0))
            port=sock.getsockname()[1]
        out=self.path/"http_out"
        server,state=N.create_server(out,port)
        worker=threading.Thread(target=server.serve_forever,daemon=True)
        worker.start()
        def req(method,path,body=None,headers=None):
            conn=http.client.HTTPConnection("127.0.0.1",port,timeout=60)
            h={"Host":f"127.0.0.1:{port}",**(headers or {})}
            conn.request(method,path,body=body,headers=h)
            response=conn.getresponse()
            raw=response.read().decode("utf8")
            data=json.loads(raw) if raw else {}
            status=response.status
            conn.close()
            return status,data
        try:
            status,session=req("GET","/api/session")
            self.assertEqual(status,200)
            self.assertTrue(session["active"])
            token=session["token"]
            self.assertGreater(len(token),30)
            status,_=req("POST","/api/render",b"{}",{"Content-Type":"application/json"})
            self.assertEqual(status,403)
            status,_=req("GET","/api/session",headers={"Origin":"https://evil.example"})
            self.assertEqual(status,403)
            status,_=req("OPTIONS","/api/render",headers={"Origin":"https://evil.example"})
            self.assertEqual(status,405)
            source_bytes=self.source.read_bytes()
            headers={"X-DJ-Token":token,"Content-Type":"application/octet-stream",
                     "X-File-Name":"DJ-test.flac"}
            status,analysis=req("POST","/api/analyze",source_bytes,headers)
            self.assertEqual(status,200,analysis)
            self.assertTrue(analysis["staging_id"])
            self.assertIsInstance(analysis["measurements"]["integrated_lufs"],float)
            self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.source_hash)
            proposal=json.dumps({"target":-12,"format":"flac","staging_id":analysis["staging_id"]}).encode("utf-8")
            status,plan=req("POST","/api/plan",proposal,
                {"X-DJ-Token":token,"Content-Type":"application/json"})
            self.assertEqual(status,200,plan)
            self.assertIn("applied_gain_db",plan["plan"])
            wrong=json.dumps({"target":-12,"format":"flac","staging_id":"wrong-other-tab"}).encode("utf-8")
            status,denied=req("POST","/api/render",wrong,
                {"X-DJ-Token":token,"Content-Type":"application/json"})
            self.assertEqual(status,422,denied)
            self.assertFalse(list(out.glob("*.flac")))
            status,result=req("POST","/api/render",proposal,
                {"X-DJ-Token":token,"Content-Type":"application/json"})
            self.assertEqual(status,200,result)
            self.assertEqual(result["status"],"VERIFIED_NEW_COPY")
            self.assertTrue(Path(result["output_path"]).is_file())
            self.assertFalse(state["file"])
            status,err=req("POST","/api/render",proposal,
                {"X-DJ-Token":token,"Content-Type":"application/json"})
            self.assertEqual(status,422,err)
            self.assertEqual(hashlib.sha256(self.source.read_bytes()).hexdigest(),self.source_hash)
        finally:
            server.shutdown()
            server.server_close()
            worker.join(timeout=3)
            shutil.rmtree(state["stage_dir"],ignore_errors=True)


if __name__=="__main__":
    unittest.main()
