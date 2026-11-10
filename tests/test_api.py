import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
from unittest.mock import patch
from datetime import datetime, timezone
import urllib.error
import urllib.request
from pathlib import Path

import app


class ApiFlowTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_paths = (app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH)
        cls.temp_dir = tempfile.TemporaryDirectory(prefix="aarogya-api-test-")
        app.DATA_DIR = Path(cls.temp_dir.name)
        app.UPLOAD_DIR = app.DATA_DIR / "uploads"
        app.DB_PATH = app.DATA_DIR / "test.sqlite3"
        cls.original_secret = os.environ.get("AAROGYA_SESSION_SECRET")
        os.environ["AAROGYA_SESSION_SECRET"] = "test-only-secret-value-12345678901234567890"
        cls.original_jitsi = {
            key: os.environ.get(key)
            for key in ("AAROGYA_JITSI_DOMAIN", "AAROGYA_JITSI_APP_ID", "AAROGYA_JITSI_APP_SECRET")
        }
        for key in cls.original_jitsi:
            os.environ.pop(key, None)

        app.create_user("fieldworker", "synthetic-password-123", "health_worker", "Test Worker")
        app.create_user("admin", "synthetic-admin-123", "admin", "Test Admin")
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH = cls.original_paths
        if cls.original_secret is None:
            os.environ.pop("AAROGYA_SESSION_SECRET", None)
        else:
            os.environ["AAROGYA_SESSION_SECRET"] = cls.original_secret
        for key, value in cls.original_jitsi.items():
            if value is None:
                os.environ.pop(key, None)
            else:
                os.environ[key] = value
        cls.temp_dir.cleanup()

    def client(self):
        jar = http.cookiejar.CookieJar()
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def request_json(self, client, path, payload=None, method=None):
        data = None if payload is None else json.dumps(payload).encode()
        request = urllib.request.Request(
            self.base_url + path,
            data=data,
            method=method,
            headers={"Content-Type": "application/json"} if data is not None else {},
        )
        try:
            with client.open(request, timeout=5) as response:
                return response.status, json.loads(response.read())
        except urllib.error.HTTPError as error:
            try:
                return error.code, json.loads(error.read())
            finally:
                error.close()

    def login(self, username, password):
        client = self.client()
        status, result = self.request_json(client, "/api/login", {"username": username, "password": password}, "POST")
        self.assertEqual(status, 200)
        return client, result

    def test_authenticated_patient_create_duplicate_and_dashboard(self):
        client, _ = self.login("fieldworker", "synthetic-password-123")
        patient = {
            "name": "Synthetic Example Patient",
            "age": 39,
            "gender": "Prefer not to say",
            "phone": "+1 555 0100",
            "village": "Example Village",
            "district": "Example District",
            "consent": True,
        }
        status, created = self.request_json(client, "/api/patients", patient, "POST")
        self.assertEqual(status, 201)
        self.assertTrue(created["patient"]["id"])
        status, duplicate = self.request_json(client, "/api/patients", patient, "POST")
        self.assertEqual(status, 409)
        self.assertTrue(duplicate["duplicate"].startswith("AD-"))
        status, dashboard = self.request_json(client, "/api/dashboard")
        self.assertEqual(status, 200)
        self.assertEqual(dashboard["patients"], 1)

    def test_session_role_and_video_unconfigured_behavior(self):
        worker, _ = self.login("fieldworker", "synthetic-password-123")
        status, session = self.request_json(worker, "/api/session")
        self.assertEqual(status, 200)
        self.assertEqual(session["user"]["role"], "health_worker")
        status, _ = self.request_json(worker, "/api/consultations")
        self.assertEqual(status, 403)

        admin, _ = self.login("admin", "synthetic-admin-123")
        status, consultations = self.request_json(admin, "/api/consultations")
        self.assertEqual(status, 200)
        self.assertFalse(consultations["configured"])

    def test_ai_endpoint_never_fabricates_an_unavailable_prediction(self):
        client, _ = self.login("fieldworker", "synthetic-password-123")
        with patch.dict(os.environ, {"AAROGYA_MEDGEMMA_MODEL_DIR": str(app.DATA_DIR / "missing-model")}):
            status, result = self.request_json(client, "/api/ai/analyze", {}, "POST")
        self.assertEqual(status, 503)
        self.assertIn("no trained, validated model is installed", result["error"])

    def test_private_api_rejects_missing_session(self):
        status, result = self.request_json(self.client(), "/api/patients")
        self.assertEqual(status, 401)
        self.assertIn("Sign in", result["error"])

    def test_pwa_assets_are_served_from_consistent_paths(self):
        client = self.client()
        for path in ("/styles.css", "/offline-vault.js", "/service-worker.js"):
            with self.subTest(path=path), client.open(self.base_url + path, timeout=5) as response:
                self.assertEqual(response.status, 200)
                self.assertGreater(len(response.read()), 0)

    def test_public_demo_http_flow_acknowledgement_invitation_and_completion(self):
        client, _ = self.login("admin", "synthetic-admin-123")
        with patch.dict(os.environ, {"AAROGYA_VIDEO_PROVIDER": "public_demo"}):
            status, patient = self.request_json(client, "/api/patients", {
                "name": "Synthetic Video Demonstration", "age": 42,
                "village": "Synthetic Video Village", "phone": "+1 555 0199", "consent": True,
            }, "POST")
            self.assertEqual(status, 201)
            status, appointment = self.request_json(client, "/api/consultations", {
                "patient_id": patient["patient"]["id"],
                "scheduled_at": datetime.now(timezone.utc).isoformat(), "duration_minutes": 15,
            }, "POST")
            self.assertEqual(status, 201)
            consultation_id = appointment["consultation"]["id"]
            status, listing = self.request_json(client, "/api/consultations")
            self.assertEqual(status, 200)
            self.assertEqual(listing["provider"], "public_demo")
            status, _ = self.request_json(client, f"/api/consultations/{consultation_id}/join", {}, "POST")
            self.assertEqual(status, 400)
            status, joining = self.request_json(client, f"/api/consultations/{consultation_id}/join", {"acknowledge_demo": True}, "POST")
            self.assertEqual(status, 200)
            self.assertEqual(joining["domain"], "meet.jit.si")
            self.assertNotIn("jwt", joining)
            status, invitation = self.request_json(client, f"/api/consultations/{consultation_id}/invite", {"acknowledge_demo": True}, "POST")
            self.assertEqual(status, 200)
            self.assertEqual(invitation["guest_url"], "https://meet.jit.si/" + joining["room_name"])
            self.assertNotIn(patient["patient"]["id"], invitation["guest_url"])
            status, _ = self.request_json(client, f"/api/consultations/{consultation_id}/complete", {}, "POST")
            self.assertEqual(status, 200)
            status, _ = self.request_json(client, f"/api/consultations/{consultation_id}/join", {"acknowledge_demo": True}, "POST")
            self.assertEqual(status, 409)


if __name__ == "__main__":
    unittest.main()
