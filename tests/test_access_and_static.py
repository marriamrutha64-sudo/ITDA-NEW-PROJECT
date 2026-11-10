"""Public asset delivery and ownership regressions through the real HTTP handler."""
from contextlib import ExitStack
from html.parser import HTMLParser
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
from test_offline_screenings import png


class ScriptSources(HTMLParser):
    def __init__(self):
        super().__init__()
        self.sources = set()

    def handle_starttag(self, tag, attributes):
        if tag == "script":
            source = dict(attributes).get("src", "")
            if source.startswith("/"):
                self.sources.add(source)


class AccessAndStaticTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stack = ExitStack()
        cls.addClassCleanup(stack.close)
        directory = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="aarogya-access-test-")))
        stack.enter_context(patch.multiple(app, DATA_DIR=directory, UPLOAD_DIR=directory / "uploads", DB_PATH=directory / "test.sqlite3"))
        stack.enter_context(patch.dict(os.environ, {"AAROGYA_SESSION_SECRET": "synthetic-access-test-secret-12345678901234567890", "AAROGYA_PUBLIC_DEMO": "0"}))
        cls.password = "synthetic-access-password-123"
        for username, role in (("access-owner", "health_worker"), ("access-other", "health_worker"), ("access-doctor", "medical_officer")):
            app.create_user(username, cls.password, role, "Synthetic " + role)
        (directory / "credentials.json").write_text("SYNTHETIC-PRIVATE-SENTINEL", encoding="utf-8")
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

    def request(self, client, path, data=None, content_type=None):
        headers = {}
        if data is not None:
            headers = {"Content-Type": content_type or "application/json", "Origin": self.base_url}
        try:
            response = client.open(urllib.request.Request(self.base_url + path, data=data, headers=headers), timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, response.headers, response.read()

    def json(self, client, path, payload=None):
        status, _, body = self.request(client, path, None if payload is None else json.dumps(payload).encode())
        return status, json.loads(body)

    def login(self, username):
        client = self.client()
        status, result = self.json(client, "/api/login", {"username": username, "password": self.password})
        self.assertEqual(status, 200)
        return client, result["user"]

    def patient(self, owner):
        status, result = self.json(owner, "/api/patients", {"name": "Synthetic Scope " + uuid.uuid4().hex[:8], "age": 36, "village": "Synthetic Village", "consent": True})
        self.assertEqual(status, 201)
        return result["patient"]

    def screening(self, client, patient_id):
        boundary = "synthetic-access-" + uuid.uuid4().hex
        fields = {"patient_id": patient_id, "worker": "Synthetic Worker", "notes": "Synthetic ownership test"}
        parts = [f'--{boundary}\r\nContent-Disposition: form-data; name="{key}"\r\n\r\n{value}\r\n'.encode() for key, value in fields.items()]
        parts.append(f'--{boundary}\r\nContent-Disposition: form-data; name="image"; filename="synthetic.png"\r\nContent-Type: image/png\r\n\r\n'.encode() + png() + b"\r\n")
        parts.append(f"--{boundary}--\r\n".encode())
        status, _, body = self.request(client, "/api/screenings", b"".join(parts), "multipart/form-data; boundary=" + boundary)
        return status, json.loads(body)

    def test_original_screening_upload_requires_worker_patient_ownership(self):
        owner, owner_user = self.login("access-owner")
        other, _ = self.login("access-other")
        patient = self.patient(owner)
        files_before = set(app.UPLOAD_DIR.iterdir())
        status, rejected = self.screening(other, patient["id"])
        self.assertEqual(status, 404)
        self.assertNotIn("screening", rejected)
        self.assertNotIn(patient["name"], json.dumps(rejected))
        self.assertEqual(set(app.UPLOAD_DIR.iterdir()), files_before)
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM screenings WHERE patient_id=?", (patient["id"],)).fetchone()[0], 0)
        status, created = self.screening(owner, patient["id"])
        self.assertEqual(status, 201)
        self.assertEqual(created["screening"]["created_by"], owner_user["id"])
        image_url = "/api/images/" + created["screening"]["id"]
        self.assertEqual(self.request(other, image_url)[0], 404)
        self.assertEqual(self.request(owner, image_url)[0], 200)
        doctor, _ = self.login("access-doctor")
        self.assertEqual(self.screening(doctor, patient["id"])[0], 201)
        self.assertEqual(self.request(doctor, image_url)[0], 200)

    def test_followup_write_requires_worker_patient_ownership(self):
        owner, _ = self.login("access-owner")
        other, _ = self.login("access-other")
        patient = self.patient(owner)
        payload = {"patient_id": patient["id"], "due_date": "2026-11-15", "notes": "Synthetic follow-up"}
        status, rejected = self.json(other, "/api/followups", payload)
        self.assertEqual(status, 404)
        self.assertNotIn("followup", rejected)
        self.assertNotIn(patient["name"], json.dumps(rejected))
        with app.connect() as db:
            self.assertEqual(db.execute("SELECT COUNT(*) FROM followups WHERE patient_id=?", (patient["id"],)).fetchone()[0], 0)
        self.assertEqual(self.json(owner, "/api/followups", payload)[0], 201)
        doctor, _ = self.login("access-doctor")
        self.assertEqual(self.json(doctor, "/api/followups", payload)[0], 201)
        status, care = self.json(other, "/api/care")
        self.assertEqual(status, 200)
        self.assertFalse(any(item["patient_id"] == patient["id"] for item in care["followups"]))

    def test_seven_reference_images_and_loaded_scripts_have_correct_public_mime_types(self):
        client = self.client()
        names = ("gums-reference.jpg", "ulcer-reference-poster.jpg", "tongue-reference.jpg", "examination-reference.jpg", "clinic-reference.jpg", "outreach-reference.jpg", "palate-reference.jpg")
        for name in names:
            with self.subTest(image=name):
                status, headers, body = self.request(client, "/assets/reference/" + name)
                self.assertEqual(status, 200)
                self.assertEqual(headers.get_content_type(), "image/jpeg")
                self.assertTrue(body.startswith(b"\xff\xd8"))
                self.assertEqual(body, (app.ROOT / "assets" / "reference" / name).read_bytes())
        status, _, index = self.request(client, "/")
        self.assertEqual(status, 200)
        parser = ScriptSources()
        parser.feed(index.decode("utf-8"))
        self.assertIn("/app.js", parser.sources)
        status, headers, patient_call = self.request(client, "/patient-call.html")
        self.assertEqual(status, 200)
        self.assertEqual(headers.get_content_type(), "text/html")
        parser.feed(patient_call.decode("utf-8"))
        self.assertIn("/patient-call.js", parser.sources)
        for path in parser.sources | {"/service-worker.js"}:
            with self.subTest(script=path):
                status, headers, body = self.request(client, path)
                self.assertEqual(status, 200)
                self.assertIn(headers.get_content_type(), {"text/javascript", "application/javascript"})
                self.assertGreater(len(body), 0)

    def test_private_and_traversal_paths_are_not_served(self):
        client = self.client()
        for path in (
            "/app.py", "/.env", "/.git/config", "/.private-data/aarogya.sqlite3", "/credentials.json",
            "/models/medgemma-1.5-4b-it/config.json", "/assets/reference/../../app.py",
            "/assets/reference/%2e%2e/%2e%2e/app.py", "/assets/reference/gums-reference.jpg/../app.py",
        ):
            with self.subTest(path=path):
                status, _, body = self.request(client, path)
                self.assertEqual(status, 404)
                self.assertNotIn(b"SYNTHETIC-PRIVATE-SENTINEL", body)
                self.assertNotIn(b"SQLite format 3", body)


if __name__ == "__main__":
    unittest.main()
