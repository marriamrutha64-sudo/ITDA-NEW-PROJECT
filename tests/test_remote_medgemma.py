import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch, MagicMock
from urllib.error import HTTPError

import remote_medgemma as remote
import medgemma_runtime as runtime


class RemoteTests(unittest.TestCase):
    def setUp(self):
        self.env = patch.dict(os.environ, {
            "AAROGYA_AI_PROVIDER": "remote",
            "AAROGYA_REMOTE_AI_URL": "https://gpu.example/v1/chat/completions",
            "AAROGYA_REMOTE_AI_TOKEN": "test-only-token",
            "AAROGYA_REMOTE_AI_MODEL": "google/medgemma-27b-it",
            "AAROGYA_REMOTE_AI_APPROVED": "1",
        })
        self.env.start()
        self.addCleanup(self.env.stop)
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.image = Path(self.tmp.name) / "synthetic.jpg"
        self.image.write_bytes(b"\xff\xd8\xff" + b"synthetic-test-fixture")

    def response(self, model="google/medgemma-27b-it", finish="stop"):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps({"model": model, "choices": [{
            "message": {"content": "Synthetic test observation"}, "finish_reason": finish}]}).encode()
        return response

    def test_requires_explicit_operator_transfer_approval(self):
        with patch.dict(os.environ, {"AAROGYA_REMOTE_AI_APPROVED": "0"}), patch.object(remote.request, "build_opener") as network:
            self.assertFalse(runtime.status()["available"])
            with self.assertRaises(runtime.InferenceUnavailable):
                runtime.analyze(self.image)
            network.assert_not_called()

    def test_disallows_insecure_or_credential_bearing_urls(self):
        for url in ["http://gpu.example/v1/chat/completions", "https://user:secret@gpu.example/v1/chat/completions", "https://gpu.example/v1/chat/completions?key=secret", "https://gpu.example/wrong"]:
            with self.subTest(url=url), patch.dict(os.environ, {"AAROGYA_REMOTE_AI_URL": url}):
                self.assertFalse(remote.status()["available"])

    def test_sends_only_image_and_prompt_and_preserves_real_source(self):
        with patch.object(remote.request, "build_opener") as network:
            network.return_value.open.return_value = self.response(finish="length")
            result = runtime.analyze(self.image)
            req = network.return_value.open.call_args.args[0]
            payload = json.loads(req.data)
            self.assertEqual(payload["model"], "google/medgemma-27b-it")
            self.assertNotIn(str(self.image), req.data.decode())
            self.assertNotIn("test-only-token", req.data.decode())
            self.assertEqual(result["execution"]["provider"], "remote")
            self.assertFalse(result["validated"])
            self.assertTrue(result["truncated"])
            self.assertFalse(runtime.status()["busy"])

    def test_wrong_model_rejected_without_fallback(self):
        with patch.object(remote.request, "build_opener") as network:
            network.return_value.open.return_value = self.response(model="other-model")
            with self.assertRaisesRegex(runtime.InferenceUnavailable, "did not confirm"):
                runtime.analyze(self.image)

    def test_redirect_does_not_forward_request(self):
        self.assertIsNone(remote.NoRedirect().redirect_request(None, None, 302, "", {}, "https://other.example"))
        with patch.object(remote.request, "build_opener") as network:
            network.return_value.open.side_effect = HTTPError("https://gpu.example", 302, "secret response", {}, None)
            with self.assertRaisesRegex(runtime.InferenceUnavailable, "HTTP 302") as caught:
                runtime.analyze(self.image)
            self.assertNotIn("secret response", str(caught.exception))


if __name__ == "__main__":
    unittest.main()
