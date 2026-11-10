"""Synthetic, real-HTTP tests for clinician-entered longitudinal care records."""
from contextlib import ExitStack
import http.cookiejar
import json
import os
from pathlib import Path
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
import uuid

import app
import clinical_records


class ClinicalRecordsTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stack = ExitStack()
        cls.addClassCleanup(stack.close)
        directory = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="aarogya-clinical-test-")))
        stack.enter_context(patch.multiple(app, DATA_DIR=directory, UPLOAD_DIR=directory / "uploads", DB_PATH=directory / "test.sqlite3"))
        stack.enter_context(patch.dict(os.environ, {
            "AAROGYA_SESSION_SECRET": "synthetic-clinical-records-secret-12345678901234567890",
            "AAROGYA_PUBLIC_DEMO": "0",
        }))
        cls.password = "synthetic-clinical-password-123"
        for username, role in (("records-doctor", "medical_officer"), ("records-worker", "health_worker"), ("records-other", "health_worker"), ("records-specialist", "specialist")):
            app.create_user(username, cls.password, role, "Synthetic " + role)
        with app.connect() as db:
            clinical_records.init_schema(db)
            clinical_records.init_schema(db)
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
        headers = {}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode()
            headers = {"Content-Type": "application/json", "Origin": self.base_url}
        try:
            response = client.open(urllib.request.Request(self.base_url + path, data=data, headers=headers), timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read())

    def login(self, username):
        client = self.client()
        status, result = self.request_json(client, "/api/login", {"username": username, "password": self.password})
        self.assertEqual(status, 200)
        return client, result["user"]

    def setUp(self):
        self.doctor, self.doctor_user = self.login("records-doctor")
        self.worker, _ = self.login("records-worker")
        status, result = self.request_json(self.worker, "/api/patients", {
            "name": "Synthetic Journey " + uuid.uuid4().hex[:8], "age": 43,
            "village": "Synthetic Village", "consent": True,
        })
        self.assertEqual(status, 201)
        self.patient_id = result["patient"]["id"]
        self.journey_path = f"/api/patients/{self.patient_id}/journey"

    def write(self, path, **values):
        return self.request_json(self.doctor, path, {"patient_id": self.patient_id, **values})

    def insert_screening(self, patient_id=None):
        screening_id = str(uuid.uuid4())
        with app.connect() as db:
            db.execute(
                "INSERT INTO screenings(id,patient_id,worker,image_name,image_type,image_bytes,image_width,image_height,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?)",
                (screening_id, patient_id or self.patient_id, "Synthetic Worker", "fixture.jpg", "image/jpeg", 1, 1, 1, self.doctor_user["id"], app.now_iso()),
            )
        return screening_id

    def insert_inference_audit_fixture(self, screening_id):
        # A synthetic DB fixture tests provenance linking; no model inference is claimed.
        with app.connect() as db:
            cursor = db.execute(
                "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                (self.doctor_user["id"], "generated_experimental_observations", "screening", screening_id, app.now_iso()),
            )
            return cursor.lastrowid

    def test_longitudinal_care_preserves_progress_and_audits_every_mutation(self):
        status, diagnostic = self.write("/api/diagnostics", test_type="biopsy", ordered_at="2026-11-10T10:30:00+05:30", status="reported", facility="Synthetic Laboratory", report_note="Synthetic report reviewed by clinician.")
        self.assertEqual(status, 201)
        self.assertEqual(diagnostic["diagnostic"]["ordered_at"], "2026-11-10T05:00:00+00:00")
        identifiers = [("diagnostic", diagnostic["diagnostic"]["id"])]
        previous_treatment = ""
        series_id = None
        for stage, treatment_status in (("treatment", "active"), ("recovery", "completed")):
            status, treatment = self.write("/api/treatments", plan="Synthetic clinician-entered plan", stage=stage, status=treatment_status, next_review_date="2026-12-10", notes="Synthetic progress note", previous_id=previous_treatment)
            self.assertEqual(status, 201)
            self.assertEqual(treatment["treatment"]["previous_id"], previous_treatment or None)
            series_id = series_id or treatment["treatment"]["id"]
            self.assertEqual(treatment["treatment"]["series_id"], series_id)
            previous_treatment = treatment["treatment"]["id"]
            identifiers.append(("treatment", treatment["treatment"]["id"]))
        status, escalation = self.write("/api/escalations", specialty="Oral medicine", reason="Synthetic specialist review requested", priority="urgent", status="requested")
        self.assertEqual(status, 201)
        identifiers.append(("escalation", escalation["escalation"]["id"]))
        status, assessment = self.write("/api/ai-reviews", disposition="independent", reason="Independent clinical assessment", assessment="Synthetic clinician observations; no AI output used.")
        self.assertEqual(status, 201)
        self.assertIsNone(assessment["ai_review"]["inference_audit_id"])
        identifiers.append(("ai_review", assessment["ai_review"]["id"]))

        status, journey = self.request_json(self.worker, self.journey_path)
        self.assertEqual(status, 200)
        self.assertEqual(journey["stages"]["diagnostics"], {"count": 1, "status": "reported"})
        self.assertEqual(journey["stages"]["treatment"], {"count": 2, "status": "completed", "stage": "recovery"})
        self.assertEqual(journey["stages"]["specialist"]["status"], "requested")
        self.assertEqual(journey["stages"]["clinical_review"]["count"], 1)
        self.assertEqual([row["status"] for row in journey["treatments"]], ["completed", "active"])
        with app.connect() as db:
            for kind, record_id in identifiers:
                rows = db.execute("SELECT actor_id,action FROM audit_log WHERE entity_type=? AND entity_id=?", (kind, record_id)).fetchall()
                self.assertEqual([(row["actor_id"], row["action"]) for row in rows], [(self.doctor_user["id"], "created")])

    def test_role_and_patient_scope_are_enforced_by_server(self):
        other, _ = self.login("records-other")
        self.assertEqual(self.request_json(other, self.journey_path)[0], 404)
        self.assertEqual(self.request_json(self.client(), self.journey_path)[0], 401)
        for path in clinical_records.POST_ROUTES:
            with self.subTest(path=path):
                self.assertEqual(self.request_json(self.worker, path, {"patient_id": self.patient_id})[0], 403)
                self.assertEqual(self.request_json(self.client(), path, {"patient_id": self.patient_id})[0], 401)
        specialist, _ = self.login("records-specialist")
        self.assertEqual(self.request_json(specialist, "/api/escalations", {"patient_id": self.patient_id, "specialty": "Oral surgery", "reason": "Synthetic specialist acceptance", "priority": "routine", "status": "accepted"})[0], 201)
        self.assertEqual(self.request_json(self.doctor, "/api/patients/missing/journey")[0], 404)
        self.assertEqual(self.request_json(self.doctor, "/api/treatments", {"patient_id": "missing", "plan": "Synthetic plan", "stage": "assessment", "status": "planned"})[0], 404)

    def test_invalid_dates_types_statuses_and_blank_reports_are_rejected(self):
        cases = [
            ("/api/diagnostics", {"test_type": "biopsy", "ordered_at": "2026-02-30", "status": "ordered"}),
            ("/api/diagnostics", {"test_type": "biopsy", "ordered_at": "2026-11-10T10:30:00", "status": "ordered"}),
            ("/api/diagnostics", {"test_type": "biopsy", "ordered_at": "2026-11-10", "status": "reported"}),
            ("/api/diagnostics", {"test_type": "anything", "ordered_at": "2026-11-10", "status": "ordered"}),
            ("/api/treatments", {"plan": ["not text"], "stage": "treatment", "status": "active"}),
            ("/api/treatments", {"plan": "Synthetic plan", "stage": "treatment", "status": "active", "next_review_date": "2026-02-30"}),
            ("/api/treatments", {"plan": "x" * 4001, "stage": "treatment", "status": "active"}),
            ("/api/treatments", {"plan": "Synthetic plan", "stage": "treatment", "status": "active", "previous_id": "missing"}),
            ("/api/escalations", {"specialty": "Oral medicine", "reason": "Synthetic", "priority": "critical"}),
            ("/api/ai-reviews", {"disposition": "independent", "reason": "", "assessment": "Synthetic"}),
        ]
        for path, data in cases:
            with self.subTest(path=path, fields=list(data)):
                self.assertEqual(self.write(path, **data)[0], 400)
        status, journey = self.request_json(self.doctor, self.journey_path)
        self.assertEqual(status, 200)
        self.assertTrue(all(not journey[table] for table in ("diagnostics", "treatments", "escalations", "ai_reviews")))

    def test_ai_override_requires_and_preserves_actual_screening_provenance(self):
        screening_id = self.insert_screening()
        values = {"screening_id": screening_id, "disposition": "disagreed", "reason": "Synthetic clinician disagrees with generated observations", "assessment": "Synthetic independent assessment recorded"}
        self.assertEqual(self.write("/api/ai-reviews", **values)[0], 400)
        inference_id = self.insert_inference_audit_fixture(screening_id)
        status, result = self.write("/api/ai-reviews", **values)
        self.assertEqual(status, 201)
        self.assertEqual(result["ai_review"]["inference_audit_id"], inference_id)
        self.assertEqual(result["ai_review"]["reason"], values["reason"])
        self.assertEqual(result["ai_review"]["screening_id"], screening_id)
        self.assertEqual(result["ai_review"]["source_status"], "historical_text_unavailable")
        self.assertIsNone(result["ai_review"]["inference"])
        self.assertEqual(self.write("/api/ai-reviews", **{**values, "inference_audit_id": inference_id + 9999})[0], 400)
        self.assertEqual(self.write("/api/ai-reviews", **{**values, "inference_audit_id": True})[0], 400)
        status, result = self.write("/api/ai-reviews", **{**values, "disposition": "accepted", "inference_audit_id": inference_id})
        self.assertEqual(status, 201)
        status, journey = self.request_json(self.doctor, self.journey_path)
        self.assertEqual(status, 200)
        self.assertEqual([row["disposition"] for row in journey["ai_reviews"]], ["accepted", "disagreed"])
        self.assertEqual(journey["stages"]["screening"]["count"], 1)
        self.assertEqual(self.write("/api/ai-reviews", **{**values, "disposition": "independent", "inference_audit_id": inference_id})[0], 400)

    def test_ai_source_cannot_be_borrowed_from_another_patient(self):
        status, other = self.request_json(self.worker, "/api/patients", {"name": "Synthetic Other " + uuid.uuid4().hex[:8], "age": 49, "village": "Synthetic Village", "consent": True})
        self.assertEqual(status, 201)
        other_screening = self.insert_screening(other["patient"]["id"])
        source_id = self.insert_inference_audit_fixture(other_screening)
        self.assertEqual(self.write("/api/ai-reviews", screening_id=other_screening, inference_audit_id=source_id, disposition="disagreed", reason="Synthetic reason", assessment="Synthetic assessment")[0], 400)
        self.assertEqual(self.write("/api/ai-reviews", screening_id=other_screening, disposition="independent", reason="Synthetic reason", assessment="Synthetic assessment")[0], 400)

    def test_record_and_audit_are_saved_atomically(self):
        with app.connect() as db:
            db.execute("CREATE TRIGGER reject_treatment_audit BEFORE INSERT ON audit_log WHEN NEW.entity_type='treatment' BEGIN SELECT RAISE(ABORT,'synthetic audit failure'); END")
        try:
            self.assertEqual(self.write("/api/treatments", plan="Synthetic plan", stage="assessment", status="planned")[0], 409)
            with app.connect() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM treatments WHERE patient_id=?", (self.patient_id,)).fetchone()[0], 0)
        finally:
            with app.connect() as db:
                db.execute("DROP TRIGGER reject_treatment_audit")

    def test_successful_model_output_is_persisted_and_linked_to_override(self):
        screening_id = self.insert_screening()
        (app.UPLOAD_DIR / "fixture.jpg").write_bytes(b"synthetic image fixture; model mocked")
        generated = {
            "text": "Synthetic model-output fixture, not a genuine clinical inference.",
            "model": "synthetic-test-model", "validated": False,
            "notice": "Unvalidated synthetic test output.",
            "model_revision":"synthetic-fixture-revision", "execution":{"mode":"synthetic-runtime"}, "truncated":True,
        }
        with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", return_value=generated):
            status, response = self.request_json(self.doctor, "/api/ai/analyze", {"screening_id": screening_id, "acknowledge_experimental": True})
        self.assertEqual(status, 200)
        self.assertIn("inference_id", response)
        self.assertIsInstance(response["inference_audit_id"], int)
        status, result = self.request_json(self.doctor, f"/api/ai/results/{screening_id}")
        self.assertEqual(status, 200)
        self.assertEqual(len(result["inferences"]), 1)
        inference = result["inferences"][0]
        self.assertEqual(inference["text"], generated["text"])
        self.assertEqual(inference["id"], response["inference_id"])
        self.assertIs(inference["validated"], False)
        self.assertEqual(inference["runtime"],{"model_revision":"synthetic-fixture-revision","execution":{"mode":"synthetic-runtime"},"truncated":True})
        status, result = self.write("/api/ai-reviews", screening_id=screening_id, inference_audit_id=inference["inference_audit_id"], disposition="disagreed", reason="Synthetic disagreement reason", assessment="Synthetic clinician assessment")
        self.assertEqual(status, 201)
        self.assertEqual(result["ai_review"]["source_status"], "saved")
        self.assertEqual(result["ai_review"]["inference"]["text"], generated["text"])
        self.assertEqual(self.request_json(self.worker, f"/api/ai/results/{screening_id}")[0], 403)
        self.assertEqual(self.request_json(self.client(), f"/api/ai/results/{screening_id}")[0], 401)
        self.assertEqual(self.request_json(self.doctor, "/api/ai/results/missing")[0], 404)
        status, journey = self.request_json(self.worker, self.journey_path)
        self.assertEqual(status, 200)
        self.assertIsNone(journey["ai_reviews"][0]["inference"])
        self.assertEqual(journey["ai_reviews"][0]["source_status"], "clinical_access_required")

    def test_failed_inference_never_creates_generation_evidence(self):
        screening_id = self.insert_screening()
        (app.UPLOAD_DIR / "fixture.jpg").write_bytes(b"synthetic image fixture; model mocked")
        with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", side_effect=app.medgemma_runtime.InferenceUnavailable("Synthetic model failure")):
            status, _ = self.request_json(self.doctor, "/api/ai/analyze", {"screening_id": screening_id, "acknowledge_experimental": True})
        self.assertEqual(status, 503)
        self.assertEqual(self.request_json(self.doctor, f"/api/ai/results/{screening_id}"), (200, {"inferences": []}))
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log WHERE entity_id=? AND action='generated_experimental_observations'", (screening_id,)).fetchone()[0], 0)

    def test_persistence_failure_rolls_back_generation_audit(self):
        screening_id = self.insert_screening()
        (app.UPLOAD_DIR / "fixture.jpg").write_bytes(b"synthetic image fixture; model mocked")
        generated = {"text": "Synthetic output", "model": "synthetic-test-model", "notice": "Synthetic unvalidated fixture", "validated": False}
        with app.connect() as db:
            db.execute("CREATE TRIGGER reject_inference BEFORE INSERT ON ai_inferences BEGIN SELECT RAISE(ABORT,'synthetic storage failure'); END")
        try:
            with patch("app.medgemma_runtime.status", return_value={"available": True}), patch("app.medgemma_runtime.analyze", return_value=generated):
                status, _ = self.request_json(self.doctor, "/api/ai/analyze", {"screening_id": screening_id, "acknowledge_experimental": True})
            self.assertEqual(status, 409)
            with app.connect() as db:
                self.assertEqual(db.execute("SELECT COUNT(*) FROM ai_inferences WHERE screening_id=?", (screening_id,)).fetchone()[0], 0)
                self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log WHERE entity_id=? AND action='generated_experimental_observations'", (screening_id,)).fetchone()[0], 0)
        finally:
            with app.connect() as db:
                db.execute("DROP TRIGGER reject_inference")


if __name__ == "__main__":
    unittest.main()
