"""HTTP checks for the public Jitsi consultation control plane."""

from contextlib import ExitStack
from datetime import datetime, timedelta, timezone
import http.cookiejar
import json
import os
from pathlib import Path
import re
import tempfile
import threading
import unittest
from unittest.mock import patch
import urllib.error
import urllib.request
from uuid import uuid4

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
            "AAROGYA_PUBLIC_DEMO": "1",
        }))
        cls.password = "synthetic-dryrun-password-123"
        for username, role in (("dryrun-doctor", "medical_officer"),
                               ("dryrun-worker", "health_worker"),
                               ("dryrun-specialist", "specialist"),
                               ("dryrun-admin", "admin")):
            app.create_user(username, cls.password, role, f"Synthetic {role}")
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
            return response.status, json.loads(response.read())

    def login(self, username):
        client = self.client()
        status, result = self.request_json(client, "/api/login", {
            "username": username, "password": self.password,
        })
        self.assertEqual(status, 200)
        return client, result["user"]

    def patient(self, worker, suffix):
        status, result = self.request_json(worker, "/api/patients", {
            "name": f"Synthetic Video {suffix}", "age": 40,
            "village": "Synthetic Village", "phone": f"+1 555 {suffix}", "consent": True,
        })
        self.assertEqual(status, 201)
        return result["patient"]

    def test_clinician_and_guest_receive_exact_same_opaque_room(self):
        doctor, user = self.login("dryrun-doctor")
        worker, _ = self.login("dryrun-worker")
        specialist, _ = self.login("dryrun-specialist")
        admin, _ = self.login("dryrun-admin")
        patient = self.patient(worker, "0111")
        appointment = {
            "patient_id": patient["id"],
            "scheduled_at": datetime.now(timezone.utc).isoformat(),
            "duration_minutes": 15,
        }
        for client, expected in ((self.client(), 401), (worker, 403)):
            self.assertEqual(self.request_json(client, "/api/consultations", appointment)[0], expected)
        for origin in (False, "https://other-origin.example"):
            self.assertEqual(self.request_json(doctor, "/api/consultations", appointment, origin=origin)[0], 403)

        status, result = self.request_json(doctor, "/api/consultations", appointment)
        self.assertEqual(status, 201)
        consultation = result["consultation"]
        consultation_id = consultation["id"]
        self.assertEqual(consultation["video_provider"], "jitsi")
        self.assertNotIn("room_name", consultation)
        self.assertEqual(consultation["meeting_url"], "")
        base = f"/api/consultations/{consultation_id}"
        status, listing = self.request_json(specialist, "/api/consultations")
        self.assertEqual(status, 200)
        self.assertEqual(listing["provider"], "jitsi")
        item = next(row for row in listing["consultations"] if row["id"] == consultation_id)
        self.assertTrue(item["can_join"])
        self.assertEqual(item["video_provider"], "jitsi")
        self.assertEqual(self.request_json(admin, "/api/consultations")[0], 200)
        for client, expected in ((self.client(), 401), (worker, 403)):
            for action in ("join", "invite", "complete", "cancel"):
                self.assertEqual(self.request_json(client, f"{base}/{action}", {})[0], expected)

        status, joined = self.request_json(doctor, f"{base}/join", {})
        self.assertEqual(status, 200)
        self.assertEqual(joined["provider"], "jitsi")
        self.assertRegex(joined["meeting_url"], r"^https://meet\.jit\.si/[0-9a-f]{48}$")
        self.assertNotIn(patient["id"], joined["meeting_url"])
        self.assertNotIn(patient["patient_code"], joined["meeting_url"])
        self.assertNotIn("jwt", joined)
        status, invited = self.request_json(specialist, f"{base}/invite", {})
        self.assertEqual(status, 200)
        self.assertEqual(invited["provider"], "jitsi")
        self.assertEqual(invited["guest_url"], joined["meeting_url"])
        self.assertEqual(invited["join_closes_at"], joined["join_closes_at"])

        status, finished = self.request_json(doctor, f"{base}/complete", {})
        self.assertEqual(status, 200)
        self.assertEqual(finished["status"], "completed")
        self.assertEqual(self.request_json(doctor, f"{base}/join", {})[0], 409)
        self.assertEqual(self.request_json(doctor, f"{base}/invite", {})[0], 409)
        with app.connect() as db:
            audit = db.execute(
                "SELECT action FROM audit_log WHERE entity_type='consultation' AND entity_id=? ORDER BY id",
                (consultation_id,),
            ).fetchall()
        self.assertEqual([row["action"] for row in audit], [
            "created", "opened_meeting_link", "generated_guest_link", "completed",
        ])

    def test_separate_appointments_have_separate_rooms_and_duplicate_is_blocked(self):
        doctor, _ = self.login("dryrun-doctor")
        worker, _ = self.login("dryrun-worker")
        first_patient = self.patient(worker, "0112")
        second_patient = self.patient(worker, "0113")
        start = (datetime.now(timezone.utc) + timedelta(hours=2)).replace(second=0, microsecond=0).isoformat()
        payload = {"patient_id": first_patient["id"], "scheduled_at": start, "duration_minutes": 15}
        status, first = self.request_json(doctor, "/api/consultations", payload)
        self.assertEqual(status, 201)
        status, duplicate = self.request_json(doctor, "/api/consultations", payload)
        self.assertEqual(status, 409)
        self.assertEqual(duplicate["existing_consultation_id"], first["consultation"]["id"])
        status, second = self.request_json(doctor, "/api/consultations", {
            **payload, "patient_id": second_patient["id"],
        })
        self.assertEqual(status, 201)
        first_url = self.request_json(doctor, f"/api/consultations/{first['consultation']['id']}/join", {})[1]["meeting_url"]
        second_url = self.request_json(doctor, f"/api/consultations/{second['consultation']['id']}/join", {})[1]["meeting_url"]
        self.assertNotEqual(first_url, second_url)

    def test_legacy_meet_record_stays_visible_and_cannot_open_as_jitsi(self):
        doctor, user = self.login("dryrun-doctor")
        worker, _ = self.login("dryrun-worker")
        patient = self.patient(worker, "0114")
        consultation_id = str(uuid4())
        start = datetime.now(timezone.utc).isoformat()
        old_link = "https://meet.google.com/mno-pqrs-tuv"
        with app.connect() as db:
            db.execute(
                "INSERT INTO consultations(id,patient_id,room_name,scheduled_at,meeting_url,video_provider,duration_minutes,created_by,created_at) "
                "VALUES(?,?,?,?,?,?,?,?,?)",
                (consultation_id, patient["id"], "legacy-" + consultation_id, start, old_link,
                 "google_meet", 15, user["id"], start),
            )
        status, listing = self.request_json(doctor, "/api/consultations")
        self.assertEqual(status, 200)
        item = next(row for row in listing["consultations"] if row["id"] == consultation_id)
        self.assertEqual(item["video_provider"], "google_meet")
        self.assertEqual(item["meeting_url"], old_link)
        self.assertFalse(item["can_join"])
        for action in ("join", "invite"):
            status, response = self.request_json(doctor, f"/api/consultations/{consultation_id}/{action}", {})
            self.assertEqual(status, 409)
            self.assertIn("Schedule a Jitsi appointment", response["error"])
        self.assertEqual(self.request_json(
            doctor, f"/api/consultations/{consultation_id}/complete", {},
        )[0], 200)

    def test_external_video_does_not_require_embedded_permissions(self):
        with self.client().open(self.base_url + "/", timeout=5) as response:
            csp = response.headers["Content-Security-Policy"]
            self.assertIn("frame-src 'none'", csp)
            self.assertNotIn("meet.jit.si", csp)


if __name__ == "__main__":
    unittest.main()
