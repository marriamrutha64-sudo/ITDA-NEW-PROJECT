"""Focused unit coverage for backend validation and security helpers."""
import base64
import hashlib
import hmac
import json
import os
import struct
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


def decode_segment(segment):
    return json.loads(base64.urlsafe_b64decode(segment + "=" * (-len(segment) % 4)))


class BackendHelpersTest(unittest.TestCase):
    def test_password_hash_verifies_only_original_password(self):
        encoded = app.pw_hash("correct horse battery staple")
        self.assertTrue(app.verify_password("correct horse battery staple", encoded))
        self.assertFalse(app.verify_password("incorrect", encoded))
        self.assertFalse(app.verify_password("anything", "malformed"))

    def test_patient_identity_key_normalizes_name_village_and_phone_format(self):
        first = app.patient_identity_key("  Asha   Rao ", 36, "Köya", "+91 98765-43210")
        second = app.patient_identity_key("asha rao", 36, "KÖYA", "+91 (98765) 43210")
        self.assertEqual(first, second)
        self.assertNotEqual(first, app.patient_identity_key("asha rao", 37, "köya", "+91 98765 43210"))

    def test_appointment_parser_requires_timezone_and_rejects_past(self):
        future = (datetime.now(timezone.utc) + timedelta(minutes=10)).isoformat()
        self.assertTrue(app.parse_appointment_time(future).endswith("+00:00"))
        with self.assertRaisesRegex(ValueError, "time zone"):
            app.parse_appointment_time("2030-01-01T10:00")
        past = (datetime.now(timezone.utc) - timedelta(hours=1)).isoformat()
        with self.assertRaisesRegex(ValueError, "has not passed"):
            app.parse_appointment_time(past)

    def test_jitsi_token_is_hmac_signed_and_scoped_to_one_room(self):
        settings = {
            "domain": "video.example.org",
            "app_id": "aarogya-demo",
            "app_secret": "test-only-secret-value-that-is-long-enough",
        }
        token, expires = app.make_jitsi_token(settings, "a" * 48)
        header, claims, signature = token.split(".")
        self.assertEqual(decode_segment(header), {"alg": "HS256", "typ": "JWT"})
        payload = decode_segment(claims)
        self.assertEqual(payload["aud"], settings["app_id"])
        self.assertEqual(payload["iss"], settings["app_id"])
        self.assertEqual(payload["sub"], settings["domain"])
        self.assertEqual(payload["room"], "a" * 48)
        self.assertLessEqual(payload["exp"] - payload["iat"], 600)
        self.assertEqual(expires, payload["exp"])
        unsigned = f"{header}.{claims}".encode("ascii")
        expected = hmac.new(settings["app_secret"].encode(), unsigned, hashlib.sha256).digest()
        actual = base64.urlsafe_b64decode(signature + "=" * (-len(signature) % 4))
        self.assertTrue(hmac.compare_digest(expected, actual))

    def test_jitsi_is_disabled_without_valid_private_server_configuration(self):
        clean_env = {
            key: value
            for key, value in os.environ.items()
            if not key.startswith("AAROGYA_JITSI_")
        }
        with patch.dict(os.environ, clean_env, clear=True):
            self.assertIsNone(app.jitsi_settings())
        with patch.dict(
            os.environ,
            {
                "AAROGYA_JITSI_DOMAIN": "meet.example.org",
                "AAROGYA_JITSI_APP_ID": "aarogya",
                "AAROGYA_JITSI_APP_SECRET": "x" * 32,
            },
            clear=False,
        ):
            self.assertEqual(app.jitsi_settings()["domain"], "meet.example.org")

    def test_image_header_parser_returns_supported_dimensions(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", 640, 480)
        self.assertEqual(app.image_info(png), ("image/png", 640, 480))
        self.assertIsNone(app.image_info(b"not an image"))


if __name__ == "__main__":
    unittest.main()
