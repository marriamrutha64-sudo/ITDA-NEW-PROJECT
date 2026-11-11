"""Focused unit coverage for backend validation and security helpers."""
import struct
import sys
import unittest
from datetime import datetime, timedelta, timezone
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import app


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

    def test_google_meet_link_requires_exact_host_and_code(self):
        valid = "https://meet.google.com/mno-pqrs-tuv"
        self.assertEqual(app.validate_meeting_url(valid), valid)
        self.assertEqual(app.validate_meeting_url(valid + "/"), valid)
        with self.assertRaisesRegex(ValueError, "Create a real meeting"):
            app.validate_meeting_url("https://meet.google.com/abc-defg-hij")
        for invalid in (
            "http://meet.google.com/mno-pqrs-tuv", "https://meet.google.com.evil/mno-pqrs-tuv",
            "https://meet.google.com/landing", "https://meet.google.com/mno-pqrs-tuv?authuser=0",
            "https://meet.google.com/mno-pqrs-tuv#fragment", "https://user@meet.google.com/mno-pqrs-tuv",
            "https://meet.google.com/mno-pqrs-tuv/extra", "javascript:alert(1)", None,
        ):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                app.validate_meeting_url(invalid)

    def test_image_header_parser_returns_supported_dimensions(self):
        png = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\x0dIHDR" + struct.pack(">II", 640, 480)
        self.assertEqual(app.image_info(png), ("image/png", 640, 480))
        self.assertIsNone(app.image_info(b"not an image"))


if __name__ == "__main__":
    unittest.main()
