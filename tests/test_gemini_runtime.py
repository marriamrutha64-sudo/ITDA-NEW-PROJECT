import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch
from urllib.error import HTTPError

import gemini_runtime as gemini
import medgemma_runtime as runtime


class GeminiTests(unittest.TestCase):
    def setUp(self):
        env = patch.dict(os.environ, {"AAROGYA_AI_PROVIDER": "gemini", "GEMINI_API_KEY": "synthetic-key", "AAROGYA_GEMINI_MODEL": gemini.DEFAULT_MODEL})
        env.start()
        self.addCleanup(env.stop)
        tmp = tempfile.TemporaryDirectory()
        self.addCleanup(tmp.cleanup)
        self.image = Path(tmp.name) / "synthetic.png"
        self.image.write_bytes(b"\x89PNG\r\n\x1a\nsynthetic")

    def reply(self, finish="STOP", parts=None):
        return {"modelVersion": gemini.DEFAULT_MODEL, "candidates": [{"finishReason": finish,
                "content": {"parts": parts or [{"text": "Synthetic observation"}]}}]}

    def network(self, opener, payload):
        response = MagicMock()
        response.__enter__.return_value = response
        response.read.return_value = json.dumps(payload).encode()
        opener.return_value.open.return_value = response

    def test_missing_key_fails_without_network_or_local_fallback(self):
        with patch.dict(os.environ, {"GEMINI_API_KEY": ""}), patch.object(gemini.request, "build_opener") as opener:
            self.assertFalse(runtime.status()["available"])
            with self.assertRaises(runtime.InferenceUnavailable):
                runtime.analyze(self.image)
            opener.assert_not_called()

    def test_key_only_in_header_and_source_preserved(self):
        with patch.object(gemini.request, "build_opener") as opener:
            self.network(opener, self.reply())
            result = runtime.analyze(self.image)
            req = opener.return_value.open.call_args.args[0]
            self.assertNotIn("synthetic-key", req.full_url)
            self.assertNotIn("synthetic-key", req.data.decode())
            self.assertNotIn(str(self.image), req.data.decode())
            self.assertEqual(req.get_header("X-goog-api-key"), "synthetic-key")
            self.assertEqual(result["execution"]["provider"], "gemini")
            self.assertEqual(result["text"], "Synthetic observation")
            self.assertFalse(result["validated"])

    def test_blocked_or_invalid_output_never_saved(self):
        for payload in [{"promptFeedback": {"blockReason": "SAFETY"}}, self.reply("SAFETY"), {"candidates": []}, self.reply(parts=[{"thought": True, "text": "Hidden thought"}])]:
            with self.subTest(payload=payload), patch.object(gemini.request, "build_opener") as opener:
                self.network(opener, payload)
                with self.assertRaises(runtime.InferenceUnavailable):
                    runtime.analyze(self.image)

    def test_quota_error_does_not_expose_response_or_key(self):
        with patch.object(gemini.request, "build_opener") as opener:
            opener.return_value.open.side_effect = HTTPError("https://example.test", 429, "synthetic-key", {}, None)
            with self.assertRaisesRegex(runtime.InferenceUnavailable, "quota") as caught:
                runtime.analyze(self.image)
            self.assertNotIn("synthetic-key", str(caught.exception))
            self.assertFalse(runtime.status()["busy"])

    def test_truncated_review_is_rejected_instead_of_saved(self):
        with patch.object(gemini.request, "build_opener") as opener:
            self.network(opener, self.reply("MAX_TOKENS"))
            with self.assertRaisesRegex(runtime.InferenceUnavailable, "cut off"):
                runtime.analyze(self.image)

    def test_review_prompt_asks_for_differentials_without_invented_severity(self):
        with patch.object(gemini.request, "build_opener") as opener:
            self.network(opener, self.reply())
            result = runtime.analyze(self.image)
            req = opener.return_value.open.call_args.args[0]
            payload = json.loads(req.data)
            prompt = payload["contents"][0]["parts"][0]["text"]
            for heading in ["Possible conditions:", "Severity:", "Review priority:", "Next step:", "Ask about:", "Urgent warning signs:"]:
                self.assertIn(heading, prompt)
            self.assertIn("Cannot be determined from a photograph alone", prompt)
            self.assertIn("never assign mild/moderate/severe", prompt)
            self.assertGreaterEqual(payload["generationConfig"]["maxOutputTokens"], 4096)
            self.assertEqual(result["execution"]["prompt_version"], "oral-review-support-v1")

    def test_unexpected_model_version_rejected(self):
        with patch.object(gemini.request, "build_opener") as opener:
            payload = self.reply(); payload["modelVersion"] = "other-model"
            self.network(opener, payload)
            with self.assertRaises(runtime.InferenceUnavailable):
                runtime.analyze(self.image)


if __name__ == "__main__":
    unittest.main()
