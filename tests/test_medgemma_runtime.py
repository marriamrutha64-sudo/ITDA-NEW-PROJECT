import json
import os
from pathlib import Path
import subprocess
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

import medgemma_runtime as runtime


class MedGemmaTests(unittest.TestCase):
    def test_missing_weights_fail_without_starting_worker(self):
        with patch.dict(os.environ, {}, clear=True), patch.object(subprocess, "run") as run:
            with self.assertRaises(runtime.InferenceUnavailable):
                runtime.analyze("synthetic.png")
            run.assert_not_called()

    def test_success_is_labelled_unvalidated_and_worker_is_offline(self):
        with tempfile.TemporaryDirectory() as directory:
            model = Path(directory)
            (model / "config.json").write_text("{}")
            (model / "tokenizer.json").write_text("{}")
            (model / "weights.safetensors").write_bytes(b"test-fixture")
            (model / "installation.json").write_text(json.dumps({"model": runtime.MODEL_ID, "revision": runtime.MODEL_REVISION, "files": {"config.json": 2, "tokenizer.json": 2, "weights.safetensors": 12}}))
            interpreter = model / "python.exe"
            interpreter.touch()
            environment = {"AAROGYA_MEDGEMMA_MODEL_DIR": directory, "AAROGYA_MEDGEMMA_PYTHON": str(interpreter)}
            with patch.dict(os.environ, environment), patch.object(subprocess, "run", return_value=SimpleNamespace(returncode=0, stdout=json.dumps({"text": "Synthetic observations"}))) as run:
                result = runtime.analyze("synthetic.png")
                self.assertFalse(result["validated"])
                self.assertIn("NOT FOR CLINICAL USE", result["notice"])
                self.assertEqual(run.call_args.kwargs["env"]["HF_HUB_OFFLINE"], "1")
                self.assertEqual(run.call_args.kwargs["timeout"], 300)

    def test_partial_download_is_not_advertised_as_available(self):
        with tempfile.TemporaryDirectory() as directory, patch.dict(os.environ, {"AAROGYA_MEDGEMMA_MODEL_DIR": directory}):
            (Path(directory) / "config.json").write_text("{}")
            self.assertFalse(runtime.status()["available"])

    def test_timeout_releases_concurrency_slot(self):
        with patch.object(runtime, "status", return_value={"available": True}), patch.dict(os.environ, {"AAROGYA_MEDGEMMA_PYTHON": "python", "AAROGYA_MEDGEMMA_MODEL_DIR": "model"}), patch.object(subprocess, "run", side_effect=subprocess.TimeoutExpired("python", 300)):
            for _ in range(2):
                with self.assertRaisesRegex(runtime.InferenceUnavailable, "five minutes"):
                    runtime.analyze("synthetic.png")


if __name__ == "__main__":
    unittest.main()
