"""Read-only security regression tests for the NEBOA 0.4.1 audio engine.

No DJ library, USB, or real audio is read. Synthetic bytes only.
"""
import os
from pathlib import Path
import shutil
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

BASE=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(BASE))
import normalizer as N


class ReadOnlySafetyTests(unittest.TestCase):
    def test_preflight_does_not_create_output_dir(self):
        destination=BASE / ".not-created-qa-041" / "normalized"
        self.assertFalse(destination.exists())
        report=N.preflight_info(destination)
        self.assertEqual(report["version"],"0.4.1")
        self.assertFalse(report["creates_files"])
        self.assertIn("available_bytes",report)
        self.assertEqual(report["reserve_bytes"],N.MIN_FREE_BYTES)
        self.assertFalse(destination.exists())

    def test_preflight_blocks_low_disk(self):
        destination=BASE / ".not-created-qa-041" / "normalized"
        with patch.object(N.shutil,"disk_usage",return_value=SimpleNamespace(free=0)):
            report=N.preflight_info(destination)
        self.assertFalse(report["safe_to_render"])
        self.assertIn("espacio",report["warning"].lower())

    def test_preflight_rejects_outside_home(self):
        with self.assertRaises(N.NormalizationError):
            N.preflight_info(Path("/Volumes/a-nonexistent-usb/exports"))

    def test_sha256_detects_same_size_changes(self):
        with tempfile.TemporaryDirectory(prefix=".qa-sha-",dir=BASE) as folder:
            source=Path(folder)/"synthetic.flac"
            source.write_bytes(b"NON_REAL_AUDIO_01")
            first=N.sha256_file(source)
            source.write_bytes(b"NON_REAL_AUDIO_02")
            second=N.sha256_file(source)
            self.assertNotEqual(first,second)
            self.assertEqual(source.stat().st_size,17)

    def test_stale_hash_rejected_before_audio_render_or_disk_write(self):
        with tempfile.TemporaryDirectory(prefix=".qa-stale-",dir=BASE) as folder:
            source=Path(folder)/"synthetic.flac"
            source.write_bytes(b"NON_REAL_AUDIO_01")
            measured={"bytes":source.stat().st_size,"duration_seconds":10.0,
                "source_sha256":"0"*64}
            simulated={"bytes":source.stat().st_size,"duration_seconds":10.0}
            with patch.object(N,"inspect_audio",return_value=simulated):
                with self.assertRaisesRegex(N.NormalizationError,"SHA-256"):
                    N.normalized_copy(source,Path(folder)/"should-not-exist",measured)
            self.assertFalse((Path(folder)/"should-not-exist").exists())


if __name__=="__main__":
    unittest.main()
