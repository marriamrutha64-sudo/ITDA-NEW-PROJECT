"""OS locking tests across independent Python processes; no model is loaded."""
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import time
import unittest
import uuid

import inference_lock


HOLDER = """
import sys
from pathlib import Path
import inference_lock
handle = inference_lock.try_acquire(sys.argv[1])
Path(sys.argv[2]).write_text('acquired' if handle else 'busy', encoding='utf-8')
if handle:
    try:
        sys.stdin.buffer.read(1)
    finally:
        inference_lock.release(handle)
"""

PROBE = """
import sys
import inference_lock
handle = inference_lock.try_acquire(sys.argv[1])
print('busy' if handle is None else 'free')
inference_lock.release(handle)
"""


class InferenceLockTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="aarogya-lock-test-")
        self.addCleanup(temporary.cleanup)
        self.directory = Path(temporary.name)
        self.model = self.directory / "synthetic-model"
        self.model.mkdir()
        self.lock_models = {self.model}
        self.addCleanup(self.cleanup_lock_files)

    def cleanup_lock_files(self):
        # Only unique synthetic-model locks, after all child processes have exited.
        for model in self.lock_models:
            inference_lock._lock_path(model).unlink(missing_ok=True)

    @staticmethod
    def stop_process(process):
        if process.poll() is None:
            process.kill()
        process.wait(timeout=10)
        if process.stdin:
            process.stdin.close()
        if process.stderr:
            process.stderr.close()

    def holder(self, model):
        ready = self.directory / (uuid.uuid4().hex + ".ready")
        process = subprocess.Popen(
            [sys.executable, "-c", HOLDER, str(model), str(ready)],
            cwd=Path(inference_lock.__file__).parent,
            stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.PIPE,
        )
        self.addCleanup(self.stop_process, process)
        deadline = time.monotonic() + 10
        while not ready.exists() and process.poll() is None and time.monotonic() < deadline:
            time.sleep(0.01)
        if not ready.exists():
            self.stop_process(process)
            self.fail("Synthetic lock holder did not initialize.")
        self.assertEqual(ready.read_text(encoding="utf-8"), "acquired")
        return process

    def probe(self, model):
        result = subprocess.run(
            [sys.executable, "-c", PROBE, str(model)],
            cwd=Path(inference_lock.__file__).parent, capture_output=True, text=True,
            timeout=10, check=True,
        )
        return result.stdout.strip()

    def test_context_exception_and_repeated_release_leave_model_available(self):
        handle = inference_lock.try_acquire(self.model)
        self.assertIsNotNone(handle)
        with self.assertRaisesRegex(RuntimeError, "synthetic failure"):
            with handle:
                self.assertTrue(inference_lock.is_busy(self.model))
                raise RuntimeError("synthetic failure")
        inference_lock.release(handle)
        inference_lock.release(None)
        self.assertFalse(inference_lock.is_busy(self.model))
        self.assertFalse(inference_lock.is_busy(self.model))

    def test_two_independent_processes_compete_then_normal_release_frees_lock(self):
        holder = self.holder(self.model)
        self.assertEqual(self.probe(self.model), "busy")
        holder.stdin.write(b"x")
        holder.stdin.flush()
        self.assertEqual(holder.wait(timeout=10), 0)
        self.assertEqual(self.probe(self.model), "free")

    def test_os_releases_lock_when_holder_process_is_killed(self):
        holder = self.holder(self.model)
        self.assertEqual(self.probe(self.model), "busy")
        holder.kill()
        holder.wait(timeout=10)
        self.assertEqual(self.probe(self.model), "free")

    def test_canonical_model_path_shares_lock_but_other_model_is_independent(self):
        alias = self.model / ".." / self.model.name
        second = self.directory / "different-model"
        second.mkdir()
        self.lock_models.add(second)
        first_handle = inference_lock.try_acquire(self.model)
        self.assertIsNotNone(first_handle)
        try:
            self.assertIsNone(inference_lock.try_acquire(alias))
            self.assertTrue(inference_lock.is_busy(alias))
            second_handle = inference_lock.try_acquire(second)
            self.assertIsNotNone(second_handle)
            inference_lock.release(second_handle)
        finally:
            inference_lock.release(first_handle)

    def test_lock_file_contains_no_path_or_patient_data_and_is_not_removed_on_release(self):
        handle = inference_lock.try_acquire(self.model)
        self.assertIsNotNone(handle)
        path = inference_lock._lock_path(self.model)
        try:
            self.assertRegex(path.name, r"^aarogya-model-[0-9a-f]{64}\.lock$")
            self.assertNotIn(self.model.name, path.name)
            if os.name != "nt":
                self.assertEqual(stat.S_IMODE(path.stat().st_mode), 0o600)
        finally:
            inference_lock.release(handle)
        self.assertTrue(path.exists())
        self.assertEqual(path.read_bytes(), b"\0")


if __name__ == "__main__":
    unittest.main()
