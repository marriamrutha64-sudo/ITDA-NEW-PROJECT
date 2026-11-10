import importlib.util
from pathlib import Path
import tempfile
import json
import unittest
from unittest.mock import patch

HAS_DEPENDENCIES = bool(importlib.util.find_spec("huggingface_hub"))
if HAS_DEPENDENCIES:
    import model_transfer


@unittest.skipUnless(HAS_DEPENDENCIES, "Run transfer tests in the MedGemma environment")
class ModelTransferTests(unittest.TestCase):
    def response(self, content_range="bytes 0-2/3"):
        class Response:
            status_code = 206
            headers = {"Content-Range": content_range}
            def __enter__(self): return self
            def __exit__(self, *args): pass
            def raise_for_status(self): pass
            def iter_content(self, *args): yield b"abc"
        return Response()

    def test_completed_transfer_is_atomic_and_reused(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(model_transfer, "get_token", return_value="test-only"), patch.object(model_transfer.requests, "get", return_value=self.response()) as request:
            target = Path(directory) / "weights.safetensors"
            model_transfer.download_shard("https://huggingface.co/test", target, 3)
            self.assertEqual(target.read_bytes(), b"abc")
            model_transfer.download_shard("https://huggingface.co/test", target, 3)
            self.assertEqual(request.call_count, 1)

    def test_wrong_range_never_publishes_final_file(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(model_transfer, "get_token", return_value="test-only"), patch.object(model_transfer.time, "sleep"), patch.object(model_transfer.requests, "get", return_value=self.response("bytes 1-3/4")):
            target = Path(directory) / "weights.safetensors"
            with self.assertRaises(RuntimeError):
                model_transfer.download_shard("https://huggingface.co/test", target, 3)
            self.assertFalse(target.exists())

    def test_truncated_partial_does_not_reuse_completed_chunks(self):
        with tempfile.TemporaryDirectory() as directory, patch.object(model_transfer, "get_token", return_value="test-only"), patch.object(model_transfer.requests, "get", return_value=self.response()) as request:
            target = Path(directory) / "weights.safetensors"
            partial = target.with_suffix(".safetensors.partial")
            partial.write_bytes(b"a")
            partial.with_suffix(".partial.json").write_text(json.dumps({"url": "https://huggingface.co/test", "size": 3, "chunk_size": 8 * 1024 * 1024, "completed": [0]}))
            model_transfer.download_shard("https://huggingface.co/test", target, 3)
            self.assertEqual(target.read_bytes(), b"abc")
            request.assert_called_once()
