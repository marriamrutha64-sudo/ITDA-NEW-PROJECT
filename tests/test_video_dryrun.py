"""Real HTTP control-plane checks; Jitsi transports the actual audio/video."""

from contextlib import ExitStack
from datetime import datetime, timezone
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
from urllib.parse import urlparse

import app


class VideoBackendDryRunTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        stack = ExitStack()
        cls.addClassCleanup(stack.close)
        directory = Path(stack.enter_context(tempfile.TemporaryDirectory(prefix="aarogya-video-dryrun-")))
        stack.enter_context(patch.multiple(
            app, DATA_DIR=directory, UPLOAD_DIR=directory / "uploads", DB_PATH=directory / "test.sqlite3",
        ))
        stack.enter_context(patch.dict(os.environ, {
            "AAROGYA_SESSION_SECRET": "synthetic-video-dryrun-secret-12345678901234567890",
            "AAROGYA_VIDEO_PROVIDER": "public_demo",
            "AAROGYA_PUBLIC_DEMO": "1",
        }))
        cls.password = "synthetic-dryrun-password-123"
        app.create_user("dryrun-doctor", cls.password, "medical_officer", "Synthetic Doctor")
        app.create_user("dryrun-worker", cls.password, "health_worker", "Synthetic Worker")
        cls.server = app.ThreadingHTTPServer(("127.0.0.1", 0), app.Handler)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_address[1]}"
        # Stop requests before the database paths and environment are restored.
        stack.callback(cls.stop_server)

    @classmethod
    def stop_server(cls):
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=3)

    @staticmethod
    def client():
        return urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))

    def request_json(self, client, path, payload=None, origin=True):
        headers = {}
        data = None
        if payload is not None:
            data = json.dumps(payload).encode()
            headers["Content-Type"] = "application/json"
            if origin is not False:
                headers["Origin"] = self.base_url if origin is True else origin
        request = urllib.request.Request(self.base_url + path, data=data, headers=headers)
        try:
            response = client.open(request, timeout=5)
        except urllib.error.HTTPError as error:
            response = error
        with response:
            return response.status, json.loads(response.read()), response.headers

    def login(self, username):
        client = self.client()
        status, result, _ = self.request_json(client, "/api/login", {
            "username": username, "password": self.password,
        })
        self.assertEqual(status, 200)
        return client, result["user"]

    def test_doctor_schedules_and_shares_same_room_with_guest_then_completes(self):
        doctor, user = self.login("dryrun-doctor")
        self.assertEqual(user["role"], "medical_officer")
        worker, _ = self.login("dryrun-worker")
        status, result, _ = self.request_json(worker, "/api/patients", {
            "name": "Synthetic Audio Demonstration", "age": 40,
            "village": "Synthetic Village", "phone": "+1 555 0123", "consent": True,
        })
        self.assertEqual(status, 201)
        patient = result["patient"]
        appointment = {
            "patient_id": patient["id"],
            "scheduled_at": datetime.now(timezone.utc).isoformat(), "duration_minutes": 15,
        }
        for client, expected in ((self.client(), 401), (worker, 403)):
            with self.subTest(expected=expected):
                status, _, _ = self.request_json(client, "/api/consultations", appointment)
                self.assertEqual(status, expected)
        for origin in (False, "https://other-origin.example"):
            with self.subTest(origin=origin):
                status, _, _ = self.request_json(doctor, "/api/consultations", appointment, origin=origin)
                self.assertEqual(status, 403)

        status, result, _ = self.request_json(doctor, "/api/consultations", appointment)
        self.assertEqual(status, 201)
        consultation_id = result["consultation"]["id"]
        self.assertNotIn("room_name", result["consultation"])
        base = f"/api/consultations/{consultation_id}"
        for action in ("join", "invite"):
            with self.subTest(action=action):
                status, _, _ = self.request_json(doctor, f"{base}/{action}", {})
                self.assertEqual(status, 400)
                status, _, _ = self.request_json(worker, f"{base}/{action}", {"acknowledge_demo": True})
                self.assertEqual(status, 403)
                status, _, _ = self.request_json(self.client(), f"{base}/{action}", {"acknowledge_demo": True})
                self.assertEqual(status, 401)

        status, joined, _ = self.request_json(doctor, f"{base}/join", {"acknowledge_demo": True})
        self.assertEqual(status, 200)
        self.assertEqual(joined["provider"], "public_demo")
        self.assertEqual(joined["domain"], "meet.jit.si")
        self.assertNotIn("jwt", joined)
        self.assertRegex(joined["room_name"], r"^[0-9a-f]{48}$")
        status, invited, _ = self.request_json(doctor, f"{base}/invite", {"acknowledge_demo": True})
        self.assertEqual(status, 200)
        guest_url = urlparse(invited["guest_url"])
        self.assertEqual((guest_url.scheme, guest_url.netloc, guest_url.path), (
            "https", joined["domain"], "/" + joined["room_name"],
        ))
        self.assertEqual(invited["join_closes_at"], joined["join_closes_at"])
        self.assertNotIn(patient["id"], invited["guest_url"])
        self.assertNotIn(patient["patient_code"], invited["guest_url"])

        status, finished, _ = self.request_json(doctor, f"{base}/complete", {})
        self.assertEqual(status, 200)
        self.assertEqual(finished["status"], "completed")
        for action in ("join", "invite"):
            status, _, _ = self.request_json(doctor, f"{base}/{action}", {"acknowledge_demo": True})
            self.assertEqual(status, 409)
        status, listing, _ = self.request_json(doctor, "/api/consultations")
        self.assertEqual(status, 200)
        completed = next(item for item in listing["consultations"] if item["id"] == consultation_id)
        self.assertFalse(completed["can_join"])
        self.assertEqual(completed["access_state"], "completed")
        with app.connect() as db:
            audit = db.execute(
                "SELECT actor_id, action FROM audit_log WHERE entity_type='consultation' AND entity_id=? ORDER BY id",
                (consultation_id,),
            ).fetchall()
        self.assertEqual([(row["actor_id"], row["action"]) for row in audit], [
            (user["id"], action) for action in ("created", "joined", "generated_guest_link", "completed")
        ])

    def test_app_headers_allow_selected_jitsi_frame_without_disabling_microphone(self):
        with self.client().open(self.base_url + "/", timeout=5) as response:
            self.assertEqual(response.status, 200)
            csp = response.headers["Content-Security-Policy"]
            self.assertIn("frame-src https://meet.jit.si", csp)
            self.assertIn("script-src 'self' https://meet.jit.si", csp)
            # Frame permission delegation still depends on the browser/Jitsi embed.
            self.assertNotRegex(response.headers.get("Permissions-Policy", ""), r"(?:microphone|camera)=\(\)")


if __name__ == "__main__":
    unittest.main()
