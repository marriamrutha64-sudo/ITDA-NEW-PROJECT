"""Integration tests for authenticated, idempotent offline patient sync."""
import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
import uuid
from pathlib import Path

import app


class OfflinePatientSyncTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.original_paths = (app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH)
        cls.temp_dir = tempfile.TemporaryDirectory(prefix="aarogya-offline-sync-test-")
        app.DATA_DIR = Path(cls.temp_dir.name)
        app.UPLOAD_DIR = app.DATA_DIR / "uploads"
        app.DB_PATH = app.DATA_DIR / "test.sqlite3"
        cls.original_secret = os.environ.get("AAROGYA_SESSION_SECRET")
        os.environ["AAROGYA_SESSION_SECRET"] = "offline-sync-test-secret-value-123456789012345678"
        app.create_user("offline-worker", "synthetic-worker-password", "health_worker", "Offline Worker")
        app.create_user("offline-admin", "synthetic-admin-password", "admin", "Offline Admin")
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
        cls.temp_dir.cleanup()

    def client(self):
        jar = http.cookiejar.CookieJar()
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))

    def setUp(self):
        with app.connect() as db:
            db.execute("DELETE FROM offline_sync_receipts")
            db.execute("DELETE FROM audit_log")
            db.execute("DELETE FROM patients")

    def request_json(self, client, path, payload=None, method=None, headers=None):
        data = None if payload is None else json.dumps(payload).encode()
        request_headers = dict(headers or {})
        if data is not None:
            request_headers["Content-Type"] = "application/json"
        request = urllib.request.Request(self.base_url + path, data=data, method=method, headers=request_headers)
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
        status, result = self.request_json(
            client, "/api/login", {"username": username, "password": password}, "POST"
        )
        self.assertEqual(status, 200)
        return client, result

    def patient(self, name="Synthetic Offline Patient"):
        return {
            "name": name,
            "age": 34,
            "gender": "Prefer not to say",
            "phone": "+91 90000 00001",
            "village": "Offline Test Village",
            "district": "Example District",
            "history": "",
            "symptoms": "",
            "consent": True,
        }

    def sync_headers(self, operation_id):
        return {"Origin": self.base_url, "Idempotency-Key": operation_id}

    def test_retry_replays_minimal_ack_without_duplicate_patient_or_audit(self):
        client, _ = self.login("offline-worker", "synthetic-worker-password")
        operation_id = uuid.uuid4().hex
        patient = self.patient()
        first_status, first = self.request_json(
            client, "/api/offline/patients", patient, "POST", self.sync_headers(operation_id)
        )
        retry_status, retry = self.request_json(
            client, "/api/offline/patients", patient, "POST", self.sync_headers(operation_id)
        )

        self.assertEqual(first_status, 201)
        self.assertEqual(retry_status, 200)
        self.assertEqual(retry, first)
        self.assertEqual(first["operation_id"], operation_id)
        self.assertTrue(first["patient"]["id"])
        self.assertNotIn("name", first["patient"])
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM patients").fetchone()[0], 1)
            self.assertEqual(
                db.execute("SELECT COUNT(*) FROM audit_log WHERE entity_type='patient' AND action='created'").fetchone()[0],
                1,
            )
            self.assertEqual(db.execute("SELECT COUNT(*) FROM offline_sync_receipts").fetchone()[0], 1)

    def test_idempotency_key_cannot_be_reused_for_another_payload(self):
        client, _ = self.login("offline-worker", "synthetic-worker-password")
        operation_id = uuid.uuid4().hex
        status, _ = self.request_json(
            client, "/api/offline/patients", self.patient(), "POST", self.sync_headers(operation_id)
        )
        self.assertEqual(status, 201)
        changed = self.patient("Different Synthetic Patient")
        status, result = self.request_json(
            client, "/api/offline/patients", changed, "POST", self.sync_headers(operation_id)
        )
        self.assertEqual(status, 409)
        self.assertIn("different patient payload", result["error"])
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM patients").fetchone()[0], 1)

    def test_existing_duplicate_identity_remains_a_conflict(self):
        client, _ = self.login("offline-worker", "synthetic-worker-password")
        original = self.patient()
        status, _ = self.request_json(client, "/api/patients", original, "POST")
        self.assertEqual(status, 201)
        status, result = self.request_json(
            client,
            "/api/offline/patients",
            original,
            "POST",
            self.sync_headers(uuid.uuid4().hex),
        )
        self.assertEqual(status, 409)
        self.assertIn("already exists", result["error"])
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM patients").fetchone()[0], 1)

    def test_sync_requires_authenticated_health_worker_and_same_origin(self):
        operation_id = uuid.uuid4().hex
        empty_client = self.client()
        status, _ = self.request_json(
            empty_client,
            "/api/offline/patients",
            self.patient(),
            "POST",
            self.sync_headers(operation_id),
        )
        self.assertEqual(status, 401)

        admin, _ = self.login("offline-admin", "synthetic-admin-password")
        status, _ = self.request_json(
            admin,
            "/api/offline/patients",
            self.patient(),
            "POST",
            self.sync_headers(operation_id),
        )
        self.assertEqual(status, 403)

        worker, _ = self.login("offline-worker", "synthetic-worker-password")
        status, _ = self.request_json(worker, "/api/offline/patients", self.patient(), "POST")
        self.assertEqual(status, 403)

        status, result = self.request_json(
            worker,
            "/api/offline/patients",
            self.patient(),
            "POST",
            {"Origin": "https://attacker.example", "Idempotency-Key": operation_id},
        )
        self.assertEqual(status, 403)
        self.assertIn("origin", result["error"].lower())


if __name__ == "__main__":
    unittest.main()
