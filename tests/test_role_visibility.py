"""End-to-end role visibility on the isolated preview server."""
import http.cookiejar
import json
import os
import tempfile
import threading
import unittest
import urllib.error
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

import app
from public_demo_setup import _synthetic_png


class QuietHandler(app.Handler):
    def log_message(self, *_args):
        pass


class RoleHierarchyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_paths = app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH
        cls.old_secret = os.environ.get("AAROGYA_SESSION_SECRET")
        cls.temp = tempfile.TemporaryDirectory(prefix="aarogya-role-preview-")
        app.DATA_DIR = Path(cls.temp.name)
        app.UPLOAD_DIR = app.DATA_DIR / "uploads"
        app.DB_PATH = app.DATA_DIR / "test.sqlite3"
        os.environ["AAROGYA_SESSION_SECRET"] = "role-visibility-tests-12345678901234567890"
        for name, role in (("worker-a", "health_worker"), ("worker-b", "health_worker"),
                           ("doctor-a", "medical_officer"), ("specialist-a", "specialist"),
                           ("admin-a", "admin")):
            app.create_user(name, "synthetic-role-password", role, name.title())
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), QuietHandler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.url = f"http://127.0.0.1:{cls.server.server_address[1]}"

    @classmethod
    def tearDownClass(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)
        app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH = cls.old_paths
        if cls.old_secret is None:
            os.environ.pop("AAROGYA_SESSION_SECRET", None)
        else:
            os.environ["AAROGYA_SESSION_SECRET"] = cls.old_secret
        cls.temp.cleanup()

    def call(self, client, path, data=None, content_type="application/json"):
        body = None if data is None else (json.dumps(data).encode() if content_type == "application/json" else data)
        req = urllib.request.Request(self.url + path, data=body,
                                     headers={"Content-Type": content_type} if body is not None else {})
        try:
            with client.open(req, timeout=5) as response:
                return response.status, response.read()
        except urllib.error.HTTPError as error:
            return error.code, error.read()

    def json_call(self, client, path, data=None):
        status, raw = self.call(client, path, data)
        return status, json.loads(raw)

    def sign_in(self, name):
        client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
        status, _ = self.json_call(client, "/api/login", {"username": name, "password": "synthetic-role-password"})
        self.assertEqual(status, 200)
        return client

    def patient(self, client, name):
        status, result = self.json_call(client, "/api/patients", {
            "name": name, "age": 42, "village": "Synthetic Village", "consent": True,
        })
        self.assertEqual(status, 201)
        return result["patient"]["id"]

    def screening(self, client, patient_id):
        boundary = "role-visibility-boundary"
        fields = {"patient_id": patient_id, "worker": "Synthetic Worker", "location": "Tongue"}
        body = b"".join(
            f"--{boundary}\r\nContent-Disposition: form-data; name=\"{key}\"\r\n\r\n{value}\r\n".encode()
            for key, value in fields.items()
        )
        body += (f"--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"demo.png\"\r\n"
                 "Content-Type: image/png\r\n\r\n").encode() + _synthetic_png() + f"\r\n--{boundary}--\r\n".encode()
        status, raw = self.call(client, "/api/screenings", body, f"multipart/form-data; boundary={boundary}")
        self.assertEqual(status, 201, raw[:200])
        return json.loads(raw)["screening"]["id"]

    def test_worker_doctor_admin_hierarchy_and_direct_access(self):
        worker_a, worker_b = self.sign_in("worker-a"), self.sign_in("worker-b")
        doctor, specialist, admin = self.sign_in("doctor-a"), self.sign_in("specialist-a"), self.sign_in("admin-a")
        ids = {"a": self.patient(worker_a, "Synthetic A"),
               "b": self.patient(worker_b, "Synthetic B"),
               "doctor": self.patient(doctor, "Synthetic Doctor"),
               "admin": self.patient(admin, "Synthetic Admin")}
        status, duplicate = self.json_call(worker_b, "/api/patients", {
            "name": "Synthetic A", "age": 42, "village": "Synthetic Village", "consent": True,
        })
        self.assertEqual(status, 409)
        self.assertNotIn("duplicate", duplicate)
        for client, expected in ((worker_a, {ids["a"]}), (worker_b, {ids["b"]}),
                                 (doctor, {ids["a"], ids["b"], ids["doctor"]}),
                                 (specialist, {ids["a"], ids["b"], ids["doctor"]}),
                                 (admin, set(ids.values()))):
            status, listing = self.json_call(client, "/api/patients")
            self.assertEqual(status, 200)
            self.assertEqual({row["id"] for row in listing["patients"]}, expected)
            self.assertTrue(all(row["creator_name"] and row["creator_role"] for row in listing["patients"]))
            status, dashboard = self.json_call(client, "/api/dashboard")
            self.assertEqual(status, 200)
            self.assertEqual(dashboard["patients"], len(expected))
        for path in (f"/api/patients/{ids['b']}", f"/api/patients/{ids['b']}/journey"):
            self.assertEqual(self.json_call(worker_a, path)[0], 404)
        self.assertEqual(self.json_call(doctor, f"/api/patients/{ids['admin']}")[0], 404)
        self.assertEqual(self.json_call(admin, f"/api/patients/{ids['admin']}")[0], 200)
        self.assertEqual(self.json_call(worker_a, "/api/reviews")[0], 403)
        self.assertEqual(self.json_call(worker_a, "/api/audit")[0], 403)
        self.assertEqual(self.json_call(worker_a, "/api/consultations")[0], 403)

        screening_id = self.screening(worker_a, ids["a"])
        admin_screening = self.screening(admin, ids["admin"])
        self.assertEqual(self.call(worker_b, f"/api/images/{screening_id}")[0], 404)
        self.assertEqual(self.call(doctor, f"/api/images/{screening_id}")[0], 200)
        self.assertEqual(self.call(doctor, f"/api/images/{admin_screening}")[0], 404)
        self.assertEqual(self.json_call(doctor, f"/api/ai/results/{admin_screening}")[0], 404)
        self.assertEqual(self.json_call(admin, f"/api/ai/results/{admin_screening}")[0], 200)
        for client, expected_count in ((worker_a, 1), (worker_b, 0), (doctor, 1), (admin, 2)):
            status, screens = self.json_call(client, "/api/screenings")
            self.assertEqual(status, 200)
            self.assertEqual(len(screens["screenings"]), expected_count)
        self.assertEqual(self.json_call(worker_a, "/api/reviews", {
            "patient_id": ids["a"], "reviewer": "Worker", "status": "Reviewed", "observations": "Not allowed"
        })[0], 403)
        self.assertEqual(self.json_call(doctor, "/api/reviews", {
            "patient_id": ids["a"], "reviewer": "Doctor", "status": "Reviewed", "observations": "Synthetic observation"
        })[0], 201)
        self.assertEqual(len(self.json_call(worker_a, f"/api/patients/{ids['a']}")[1]["reviews"]), 1)
        self.assertEqual(self.json_call(doctor, "/api/reviews", {
            "patient_id": ids["admin"], "reviewer": "Doctor", "status": "Reviewed", "observations": "Out of scope"
        })[0], 404)
        self.assertEqual(self.json_call(doctor, "/api/treatments", {
            "patient_id": ids["admin"], "plan": "Synthetic plan", "stage": "assessment", "status": "planned"
        })[0], 404)
        self.assertEqual(self.json_call(worker_a, "/api/followups", {
            "patient_id": ids["b"], "due_date": "2027-01-01", "notes": "Out of scope"
        })[0], 404)
        self.assertEqual(self.json_call(worker_a, "/api/followups", {
            "patient_id": ids["a"], "due_date": "2027-01-01", "notes": "Synthetic followup"
        })[0], 201)
        self.assertEqual(len(self.json_call(doctor, "/api/care")[1]["followups"]), 1)
        self.assertEqual(len(self.json_call(admin, "/api/care")[1]["followups"]), 1)

        appointment = {"patient_id": ids["a"], "scheduled_at": datetime.now(timezone.utc).isoformat(),
                       "duration_minutes": 15}
        status, scheduled = self.json_call(doctor, "/api/consultations", appointment)
        self.assertEqual(status, 201)
        consultation_id = scheduled["consultation"]["id"]
        self.assertEqual(self.json_call(admin, f"/api/consultations/{consultation_id}/join", {})[0], 200)
        self.assertEqual(self.json_call(doctor, "/api/consultations", {
            **appointment, "patient_id": ids["admin"]
        })[0], 404)
        status, admin_appointment = self.json_call(admin, "/api/consultations", {
            **appointment, "patient_id": ids["admin"]
        })
        self.assertEqual(status, 201)
        self.assertEqual(self.json_call(doctor,
            f"/api/consultations/{admin_appointment['consultation']['id']}/join", {})[0], 404)
