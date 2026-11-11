"""Real HTTP background-job orchestration with explicitly synthetic model stubs."""
from contextlib import ExitStack
import http.cookiejar
import json
import os
from pathlib import Path
import tempfile
import threading
import time
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid

import ai_jobs
import app


class AiJobTests(unittest.TestCase):
    def test_health_assistant_requires_authentication_and_transfer_consent(self):
        code,_,_=self.request_json(self.client(),"/api/ai/assistant",{"mode":"question","question":"Synthetic"})
        self.assertEqual(code,401)
        code,data,_=self.request_json(self.worker,"/api/ai/assistant",{"mode":"question","question":"Synthetic"})
        self.assertEqual(code,400)
        self.assertIn("Google",data["error"])

    def test_health_assistant_worker_can_request_education_without_record_write(self):
        import health_assistant
        with patch.dict(os.environ,{"AAROGYA_AI_PROVIDER":"gemini"}),patch.object(health_assistant.gemini_runtime,"generate",return_value={"text":"Synthetic educational answer","model":"gemini-test","execution":{"provider":"gemini"},"validated":False}):
            code,data,_=self.request_json(self.worker,"/api/ai/assistant",{"mode":"question","question":"What is blood pressure?","acknowledge_google_transfer":True})
        self.assertEqual(code,200)
        self.assertFalse(data["saved_to_patient_record"])
        self.assertEqual(data["result"]["text"],"Synthetic educational answer")
    def test_gemini_transfer_requires_separate_acknowledgement(self):
        client = self.client()
        self.request_json(client, "/api/login", {"username": "jobs-doctor", "password": self.password})
        with patch.dict(os.environ, {"AAROGYA_AI_PROVIDER": "gemini"}), patch.object(app.medgemma_runtime, "analyze") as analyze:
            code, data, _ = self.request_json(client, "/api/ai/jobs", {"screening_id": "synthetic", "acknowledge_experimental": True})
            self.assertEqual(code, 400)
            self.assertIn("Google Gemini", data["error"])
            analyze.assert_not_called()

    @classmethod
    def setUpClass(cls):
        stack = ExitStack()
        cls.addClassCleanup(stack.close)
        directory = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="aarogya-ai-jobs-test-")))
        stack.enter_context(patch.multiple(app, DATA_DIR=directory, UPLOAD_DIR=directory / "uploads", DB_PATH=directory / "test.sqlite3"))
        stack.enter_context(patch.dict(os.environ, {"AAROGYA_SESSION_SECRET": "synthetic-ai-job-secret-12345678901234567890", "AAROGYA_PUBLIC_DEMO": "0"}))
        cls.password = "synthetic-ai-jobs-password-123"
        for username, role in (("jobs-doctor", "medical_officer"), ("jobs-worker", "health_worker"), ("jobs-specialist", "specialist"), ("jobs-admin", "admin")):
            app.create_user(username, cls.password, role, "Synthetic " + role)
        with app.connect() as db:
            ai_jobs.init_schema(db)
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}"
        stack.callback(cls.stop_server)

    @classmethod
    def stop_server(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    @staticmethod
    def client():
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request_json(self, client, path, payload=None):
        data, headers = None, {}
        if payload is not None:
            data = json.dumps(payload).encode()
            headers = {"Content-Type": "application/json", "Origin": self.base_url}
        try:
            response = client.open(urllib.request.Request(self.base_url + path, data=data, headers=headers), timeout=3)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read()), response.headers

    def login(self, username):
        client = self.client()
        status, result, _ = self.request_json(client, "/api/login", {"username": username, "password": self.password})
        self.assertEqual(status, 200)
        return client, result["user"]

    def setUp(self):
        self.doctor, self.user = self.login("jobs-doctor")
        self.worker, _ = self.login("jobs-worker")
        status, result, _ = self.request_json(self.worker, "/api/patients", {"name": "Synthetic AI job " + uuid.uuid4().hex[:8], "age": 37, "village": "Synthetic Village", "consent": True})
        self.assertEqual(status, 201)
        self.patient_id = result["patient"]["id"]
        self.screening_id = str(uuid.uuid4())
        self.image_name = self.screening_id + ".jpg"
        (app.UPLOAD_DIR / self.image_name).write_bytes(b"synthetic image fixture; model stubbed")
        with app.connect() as db:
            db.execute("INSERT INTO screenings(id,patient_id,worker,image_name,image_type,image_bytes,image_width,image_height,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)", (self.screening_id, self.patient_id, "Synthetic Worker", self.image_name, "image/jpeg", 1, 1, 1, self.user["id"], app.now_iso()))
        self.payload = {"screening_id": self.screening_id, "acknowledge_experimental": True}
        self.generated = {"text": "Synthetic job output fixture; not a real model run.", "model": "synthetic-test-model", "notice": "Unvalidated synthetic fixture", "validated": False}

    def tearDown(self):
        deadline = time.monotonic() + 6
        while ai_jobs.is_busy() and time.monotonic() < deadline:
            time.sleep(0.01)
        self.assertFalse(ai_jobs.is_busy(), "Synthetic worker must finish before restoring test database paths.")

    def wait_job(self, job_id):
        deadline = time.monotonic() + 5
        while time.monotonic() < deadline:
            status, result, _ = self.request_json(self.doctor, f"/api/ai/jobs/{job_id}")
            self.assertEqual(status, 200)
            if result["job"]["status"] in {"succeeded", "failed", "interrupted"} and not ai_jobs.is_busy():
                return result["job"]
            time.sleep(0.01)
        self.fail("Synthetic job did not finish in five seconds.")

    def test_http_returns_while_model_is_blocked_and_bounds_access_and_concurrency(self):
        entered, release = threading.Event(), threading.Event()

        def synthetic_model(_path):
            entered.set()
            if not release.wait(5):
                raise RuntimeError("Synthetic test release timeout")
            return self.generated

        with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", side_effect=synthetic_model) as analyze:
            try:
                status, created, _ = self.request_json(self.doctor, "/api/ai/jobs", self.payload)
                self.assertEqual(status, 202)
                self.assertFalse(release.is_set())
                self.assertTrue(entered.wait(1))
                job_id = created["job"]["id"]
                path = f"/api/ai/jobs/{job_id}"
                self.assertEqual(self.request_json(self.doctor, path)[1]["job"]["status"], "running")
                status, _, headers = self.request_json(self.doctor, "/api/ai/jobs", self.payload)
                self.assertEqual(status, 429)
                self.assertEqual(headers["Retry-After"], "5")
                self.assertEqual(self.request_json(self.worker, path)[0], 403)
                self.assertEqual(self.request_json(self.client(), path)[0], 401)
                specialist, _ = self.login("jobs-specialist")
                self.assertEqual(self.request_json(specialist, path)[0], 404)
                admin, _ = self.login("jobs-admin")
                self.assertEqual(self.request_json(admin, path)[0], 200)
            finally:
                release.set()
            job = self.wait_job(job_id)
        self.assertEqual(job["status"], "succeeded")
        self.assertEqual(job["result"]["text"], self.generated["text"])
        self.assertIs(job["result"]["validated"], False)
        self.assertIsNone(job["error"])
        self.assertEqual(analyze.call_count, 1)
        status, history, _ = self.request_json(self.doctor, f"/api/ai/results/{self.screening_id}")
        self.assertEqual(status, 200)
        self.assertEqual(history["inferences"][0]["id"], job["result"]["inference_id"])
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log WHERE entity_id=? AND action='generated_experimental_observations'", (self.screening_id,)).fetchone()[0], 1)

    def test_failed_model_has_no_generation_evidence_and_slot_can_be_reused(self):
        with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", side_effect=app.medgemma_runtime.InferenceUnavailable("Synthetic model unavailable")):
            status, created, _ = self.request_json(self.doctor, "/api/ai/jobs", self.payload)
            self.assertEqual(status, 202)
            job = self.wait_job(created["job"]["id"])
        self.assertEqual(job["status"], "failed")
        self.assertEqual(job["error"], "Synthetic model unavailable")
        self.assertIsNone(job["result"])
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_inferences WHERE screening_id=?", (self.screening_id,)).fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log WHERE entity_id=? AND action='generated_experimental_observations'", (self.screening_id,)).fetchone()[0], 0)
        with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", return_value=self.generated):
            status, created, _ = self.request_json(self.doctor, "/api/ai/jobs", self.payload)
            self.assertEqual(status, 202)
            self.assertEqual(self.wait_job(created["job"]["id"])["status"], "succeeded")

    def test_rejected_requests_create_no_job_and_paths_stay_inside_upload_directory(self):
        self.assertEqual(self.request_json(self.worker, "/api/ai/jobs", self.payload)[0], 403)
        self.assertEqual(self.request_json(self.client(), "/api/ai/jobs", self.payload)[0], 401)
        self.assertEqual(self.request_json(self.doctor, "/api/ai/jobs", {"screening_id": self.screening_id})[0], 400)
        self.assertEqual(self.request_json(self.doctor, "/api/ai/jobs", {**self.payload, "screening_id": "missing"})[0], 404)
        with patch("app.medgemma_runtime.status", return_value={"available": False}):
            self.assertEqual(self.request_json(self.doctor, "/api/ai/jobs", self.payload)[0], 503)
        outside = app.DATA_DIR / "outside.jpg"
        outside.write_bytes(b"synthetic outside upload directory")
        with app.connect() as db:
            db.execute("UPDATE screenings SET image_name='../outside.jpg' WHERE id=?", (self.screening_id,))
        self.assertEqual(self.request_json(self.doctor, "/api/ai/jobs", self.payload)[0], 404)
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_jobs WHERE screening_id=?", (self.screening_id,)).fetchone()[0], 0)

    def test_latest_job_lookup_resumes_only_the_signed_in_clinicians_job(self):
        status, empty, _ = self.request_json(self.doctor, f"/api/ai/jobs?screening_id={self.screening_id}")
        self.assertEqual(status, 200)
        self.assertIsNone(empty["job"])
        job_id = str(uuid.uuid4())
        with app.connect() as db:
            db.execute("INSERT INTO ai_jobs(id,screening_id,created_by,status,created_at) VALUES(?,?,?,'running',?)",
                       (job_id, self.screening_id, self.user["id"], app.now_iso()))
        status, own, _ = self.request_json(self.doctor, f"/api/ai/jobs?screening_id={self.screening_id}")
        self.assertEqual(status, 200)
        self.assertEqual((own["job"]["id"], own["job"]["status"]), (job_id, "running"))
        specialist, _ = self.login("jobs-specialist")
        self.assertIsNone(self.request_json(specialist, f"/api/ai/jobs?screening_id={self.screening_id}")[1]["job"])
        self.assertEqual(self.request_json(self.worker, f"/api/ai/jobs?screening_id={self.screening_id}")[0], 403)
        self.assertEqual(self.request_json(self.client(), f"/api/ai/jobs?screening_id={self.screening_id}")[0], 401)
        self.assertEqual(self.request_json(self.doctor, "/api/ai/jobs?screening_id=")[0], 400)

    def test_startup_marks_stale_jobs_interrupted_without_changing_finished_jobs(self):
        ids = {}
        with app.connect() as db:
            for status in ("queued", "running", "failed"):
                job_id = ids[status] = str(uuid.uuid4())
                db.execute("INSERT INTO ai_jobs(id,screening_id,created_by,status,created_at) VALUES(?,?,?,?,?)", (job_id, self.screening_id, self.user["id"], status, app.now_iso()))
            ai_jobs.init_schema(db)
        for old_status, job_id in ids.items():
            status, result, _ = self.request_json(self.doctor, f"/api/ai/jobs/{job_id}")
            self.assertEqual(status, 200)
            self.assertEqual(result["job"]["status"], "failed" if old_status == "failed" else "interrupted")
            self.assertIsNone(result["job"]["result"])

    def test_result_persistence_failure_rolls_back_output_and_generation_audit(self):
        with app.connect() as db:
            db.execute("CREATE TRIGGER reject_job_inference BEFORE INSERT ON ai_inferences BEGIN SELECT RAISE(ABORT,'synthetic persistence failure'); END")
        try:
            with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", return_value=self.generated):
                status, created, _ = self.request_json(self.doctor, "/api/ai/jobs", self.payload)
                self.assertEqual(status, 202)
                job = self.wait_job(created["job"]["id"])
            self.assertEqual(job["status"], "failed")
            self.assertIsNone(job["result"])
            with app.connect() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_inferences WHERE screening_id=?", (self.screening_id,)).fetchone()[0], 0)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log WHERE entity_id=? AND action='generated_experimental_observations'", (self.screening_id,)).fetchone()[0], 0)
        finally:
            with app.connect() as db:
                db.execute("DROP TRIGGER reject_job_inference")

    def test_legacy_contradiction_is_flagged_on_job_and_history_reads_without_rewriting_source(self):
        source = ("Visible observations: There is a visible ulcerated lesion on the tongue.\n"
                  "Unrelated: The image is unrelated.")
        generated = {**self.generated, "text": source}
        with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", return_value=generated):
            status, created, _ = self.request_json(self.doctor, "/api/ai/jobs", self.payload)
            self.assertEqual(status, 202)
            job = self.wait_job(created["job"]["id"])
        self.assertEqual(job["status"], "succeeded")
        self.assertEqual(job["result"]["text"], source)
        self.assertTrue(job["result"]["inconsistent"])
        self.assertTrue(job["result"]["output_warning"])
        status, history, _ = self.request_json(self.doctor, f"/api/ai/results/{self.screening_id}")
        self.assertEqual(status, 200)
        self.assertEqual(history["inferences"][0]["text"], source)
        self.assertTrue(history["inferences"][0]["inconsistent"])
        self.assertTrue(history["inferences"][0]["output_warning"])
        with app.connect() as db:
            stored = db.execute("SELECT text FROM ai_inferences WHERE screening_id=?", (self.screening_id,)).fetchone()[0]
        self.assertEqual(stored, source)


if __name__ == "__main__":
    unittest.main()
