import base64
import hashlib
import hmac
import json
import os
import sqlite3
import tempfile
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

from app import Handler, jitsi_settings, make_jitsi_token


def decode_part(part):
    padding = "=" * (-len(part) % 4)
    return json.loads(base64.urlsafe_b64decode(part + padding))


class ConsultationJwtTests(unittest.TestCase):
    def setUp(self):
        self.secret = "private-jitsi-test-secret-value-at-least-32-chars"
        self.settings = {
            "domain": "meet.example.org",
            "app_id": "aarogya-drishti-test",
            "app_secret": self.secret,
        }

    @patch("app.time.time", return_value=1_800_000_000)
    def test_token_is_signed_and_has_a_short_expiry(self, _clock):
        token, expires_at = make_jitsi_token(self.settings, "ab" * 24)
        encoded_header, encoded_claims, encoded_signature = token.split(".")

        self.assertEqual(decode_part(encoded_header), {"alg": "HS256", "typ": "JWT"})
        unsigned = f"{encoded_header}.{encoded_claims}"
        expected_signature = hmac.new(
            self.secret.encode(), unsigned.encode("ascii"), hashlib.sha256
        ).digest()
        padding = "=" * (-len(encoded_signature) % 4)
        actual_signature = base64.urlsafe_b64decode(encoded_signature + padding)
        self.assertTrue(hmac.compare_digest(actual_signature, expected_signature))

        claims = decode_part(encoded_claims)
        self.assertEqual(claims["iss"], self.settings["app_id"])
        self.assertEqual(claims["aud"], self.settings["app_id"])
        self.assertEqual(claims["sub"], self.settings["domain"])
        self.assertEqual(claims["room"], "ab" * 24)
        self.assertEqual(claims["iat"], 1_800_000_000)
        self.assertLessEqual(claims["nbf"], claims["iat"])
        self.assertEqual(claims["exp"] - claims["iat"], 600)
        self.assertEqual(expires_at, claims["exp"])
        self.assertNotIn("patient", json.dumps(claims).lower())

    @patch("app.time.time", return_value=1_800_000_000)
    def test_each_token_is_bound_to_the_exact_room_not_a_wildcard(self, _clock):
        token, _ = make_jitsi_token(self.settings, "a1" * 24)
        claims = decode_part(token.split(".")[1])
        self.assertEqual(claims["room"], "a1" * 24)
        self.assertNotEqual(claims["room"], "*")
        self.assertNotIn("b2" * 24, token)

        tampered_claims = dict(claims, room="b2" * 24)
        encoded = base64.urlsafe_b64encode(
            json.dumps(tampered_claims, separators=(",", ":")).encode()
        ).rstrip(b"=").decode("ascii")
        forged = f"{token.split('.')[0]}.{encoded}"
        forged_signature = hmac.new(
            self.secret.encode(), forged.encode("ascii"), hashlib.sha256
        ).digest()
        self.assertFalse(hmac.compare_digest(forged_signature, base64.urlsafe_b64decode(token.split(".")[2] + "=" * (-len(token.split(".")[2]) % 4))))

    def test_jitsi_is_not_configured_without_private_host_and_matching_credentials(self):
        keys = {
            "AAROGYA_JITSI_DOMAIN": "",
            "AAROGYA_JITSI_APP_ID": "",
            "AAROGYA_JITSI_APP_SECRET": "",
        }
        with patch.dict(os.environ, keys):
            self.assertIsNone(jitsi_settings())

        invalid = {
            "AAROGYA_JITSI_DOMAIN": "https://meet.example.org/path",
            "AAROGYA_JITSI_APP_ID": "aarogya-drishti",
            "AAROGYA_JITSI_APP_SECRET": self.secret,
        }
        with patch.dict(os.environ, invalid):
            self.assertIsNone(jitsi_settings())


class FakeHandler:
    def __init__(self, path, user, body=None):
        self.path = path
        self.session_user = user
        self.request_body = body or {}
        self.headers = {}
        self.response = None

    def user(self):
        return self.session_user

    def require_user(self, roles=None):
        return Handler.require_user(self, roles)

    def same_origin(self):
        return True

    def body(self):
        return self.request_body

    def json(self, value, status=200, extra_headers=None):
        self.response = (value, status, extra_headers)


class ConsultationRouteTests(unittest.TestCase):
    def setUp(self):
        self.temp_dir = tempfile.TemporaryDirectory()
        self.secret = "private-jitsi-test-secret-value-at-least-32-chars"
        self.database_path = Path(self.temp_dir.name) / "consultations.sqlite3"
        db = sqlite3.connect(self.database_path)
        try:
            db.executescript("""
                CREATE TABLE consultations(
                    id TEXT PRIMARY KEY, patient_id TEXT, room_name TEXT, status TEXT,
                    scheduled_at TEXT, duration_minutes INTEGER, created_by TEXT, created_at TEXT
                );
                CREATE TABLE patients(id TEXT PRIMARY KEY, name TEXT, patient_code TEXT);
                CREATE TABLE audit_log(
                    id INTEGER PRIMARY KEY, actor_id TEXT, action TEXT,
                    entity_type TEXT, entity_id TEXT, created_at TEXT
                );
                INSERT INTO consultations VALUES(
                    '11111111-1111-4111-8111-111111111111','patient-internal-id',
                    'aabbccddeeff00112233445566778899aabbccddeeff0011','scheduled',
                    '2030-01-01T12:00+00:00',30,'doctor-id','2029-12-01T00:00+00:00'
                );
                INSERT INTO patients VALUES('patient-internal-id','Patient Example','AD-2030-ABC123');
            """)
        finally:
            db.close()
        self.connections = []
        self.connect_patch = patch("app.connect", side_effect=self.connect_test_db)
        self.connect_patch.start()
        self.env_patch = patch.dict(os.environ, {
            "AAROGYA_JITSI_DOMAIN": "",
            "AAROGYA_JITSI_APP_ID": "",
            "AAROGYA_JITSI_APP_SECRET": "",
        })
        self.env_patch.start()

    def tearDown(self):
        self.env_patch.stop()
        self.connect_patch.stop()
        for db in self.connections:
            db.close()
        self.temp_dir.cleanup()

    def connect_test_db(self):
        db = sqlite3.connect(self.database_path)
        db.row_factory = sqlite3.Row
        self.connections.append(db)
        return db

    def test_admin_can_access_consultation_area_but_call_reports_unconfigured(self):
        admin = FakeHandler("/api/consultations", {"id": "admin-id", "role": "admin"})
        Handler.do_GET(admin)
        self.assertEqual(admin.response[1], 200)
        self.assertFalse(admin.response[0]["configured"])

        join = FakeHandler(
            "/api/consultations/11111111-1111-4111-8111-111111111111/join",
            {"id": "admin-id", "role": "admin"},
        )
        Handler.do_POST(join)
        self.assertEqual(join.response[1], 503)
        self.assertIn("not configured", join.response[0]["error"].lower())

    def test_health_worker_is_rejected_from_consultation_routes(self):
        handler = FakeHandler(
            "/api/consultations/11111111-1111-4111-8111-111111111111/join",
            {"id": "worker-id", "role": "health_worker"},
        )
        Handler.do_POST(handler)
        self.assertEqual(handler.response[1], 403)

    def test_patient_guest_link_is_not_returned_when_jitsi_is_unconfigured(self):
        handler = FakeHandler(
            "/api/consultations/11111111-1111-4111-8111-111111111111/invite",
            {"id": "clinician-id", "role": "medical_officer"},
        )
        Handler.do_POST(handler)
        self.assertEqual(handler.response[1], 503)
        self.assertNotIn("guest_url", handler.response[0])

    def test_appointment_creation_generates_unique_random_rooms_without_returning_them(self):
        scheduled_at = (datetime.now(timezone.utc) + timedelta(minutes=30)).isoformat()
        body = {
            "patient_id": "patient-internal-id",
            "scheduled_at": scheduled_at,
            "duration_minutes": 30,
        }
        admin = {"id": "admin-id", "role": "admin"}
        created = []
        for _ in range(2):
            handler = FakeHandler("/api/consultations", admin, body)
            Handler.do_POST(handler)
            self.assertEqual(handler.response[1], 201)
            self.assertNotIn("room_name", handler.response[0]["consultation"])
            created.append(handler.response[0]["consultation"]["id"])

        with self.connect_test_db() as db:
            rooms = [row[0] for row in db.execute(
                "SELECT room_name FROM consultations WHERE id IN (?,?)", created
            )]
        self.assertEqual(len(rooms), 2)
        self.assertNotEqual(rooms[0], rooms[1])
        for room in rooms:
            self.assertRegex(room, r"^[0-9a-f]{48}$")
            self.assertNotIn("patient", room.lower())
            self.assertNotIn("Patient Example", room)
            self.assertNotIn("patient-internal-id", room)

    def test_configured_invitation_url_contains_only_private_host_and_random_room(self):
        config = {
            "AAROGYA_JITSI_DOMAIN": "meet.private.example.org",
            "AAROGYA_JITSI_APP_ID": "aarogya-drishti",
            "AAROGYA_JITSI_APP_SECRET": self.secret,
        }
        handler = FakeHandler(
            "/api/consultations/11111111-1111-4111-8111-111111111111/invite",
            {"id": "admin-id", "role": "admin"},
        )
        with patch.dict(os.environ, config):
            Handler.do_POST(handler)
        guest_url = handler.response[0]["guest_url"]
        self.assertEqual(handler.response[1], 200)
        self.assertTrue(guest_url.startswith("https://meet.private.example.org/"))
        self.assertNotIn("Patient Example", guest_url)
        self.assertNotIn("patient-internal-id", guest_url)
        self.assertNotIn("AD-2030-ABC123", guest_url)

    @patch("app.time.time", return_value=1_800_000_000)
    def test_configured_admin_join_receives_room_scoped_token_without_patient_details(self, _clock):
        config = {
            "AAROGYA_JITSI_DOMAIN": "meet.private.example.org",
            "AAROGYA_JITSI_APP_ID": "aarogya-drishti",
            "AAROGYA_JITSI_APP_SECRET": self.secret,
        }
        handler = FakeHandler(
            "/api/consultations/11111111-1111-4111-8111-111111111111/join",
            {"id": "admin-id", "role": "admin"},
        )
        with patch.dict(os.environ, config):
            Handler.do_POST(handler)
        self.assertEqual(handler.response[1], 200)
        data = handler.response[0]
        claims = decode_part(data["jwt"].split(".")[1])
        self.assertEqual(claims["room"], data["room_name"])
        self.assertEqual(claims["exp"] - claims["iat"], 600)
        for private_value in ("Patient Example", "patient-internal-id", "AD-2030-ABC123"):
            self.assertNotIn(private_value, json.dumps(data))


if __name__ == "__main__":
    unittest.main()
