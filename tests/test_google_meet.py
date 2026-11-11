"""Legacy consultation migration and Jitsi room validation tests."""

from datetime import datetime, timedelta, timezone
from contextlib import closing
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch
import sqlite3
import unittest

import app


class ConsultationMigrationTests(unittest.TestCase):
    def test_join_window_is_bounded_and_status_aware(self):
        start = datetime.now(timezone.utc)
        appointment = {
            "scheduled_at": start.isoformat(), "duration_minutes": 15, "status": "scheduled",
        }
        self.assertTrue(app.consultation_access_window(appointment)["join_window_open"])
        appointment["status"] = "completed"
        self.assertFalse(app.consultation_access_window(appointment)["join_window_open"])
        appointment["status"] = "scheduled"
        appointment["scheduled_at"] = (start + timedelta(hours=2)).isoformat()
        self.assertFalse(app.consultation_access_window(appointment)["join_window_open"])
        appointment["scheduled_at"] = (start - timedelta(hours=2)).isoformat()
        self.assertFalse(app.consultation_access_window(appointment)["join_window_open"])

    def test_existing_consultations_gain_empty_meeting_url(self):
        with TemporaryDirectory(prefix="aarogya-meet-migration-") as directory:
            root = Path(directory)
            db_path = root / "test.sqlite3"
            with closing(sqlite3.connect(db_path)) as db:
                db.execute("CREATE TABLE consultations(id TEXT PRIMARY KEY, patient_id TEXT, room_name TEXT UNIQUE NOT NULL, scheduled_at TEXT NOT NULL, duration_minutes INTEGER NOT NULL, status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)")
                db.execute("INSERT INTO consultations VALUES(?,?,?,?,?,?,?,?)", (
                    "legacy", "patient", "legacy-room", datetime.now(timezone.utc).isoformat(),
                    15, "scheduled", "doctor", datetime.now(timezone.utc).isoformat(),
                ))
                db.commit()
            with patch.multiple(app, DATA_DIR=root, UPLOAD_DIR=root / "uploads", DB_PATH=db_path):
                app.init_db()
                with app.connect() as db:
                    row = db.execute("SELECT meeting_url,room_name,video_provider FROM consultations WHERE id='legacy'").fetchone()
                    self.assertEqual(row["meeting_url"], "")
                    self.assertEqual(row["room_name"], "legacy-room")
                    self.assertEqual(row["video_provider"], "jitsi")
                app.init_db()

    def test_stored_meet_link_is_tagged_legacy_without_changing_it(self):
        with TemporaryDirectory(prefix="aarogya-provider-migration-") as directory:
            root = Path(directory)
            db_path = root / "test.sqlite3"
            old_link = "https://meet.google.com/mno-pqrs-tuv"
            with closing(sqlite3.connect(db_path)) as db:
                db.execute("CREATE TABLE consultations(id TEXT PRIMARY KEY, patient_id TEXT, room_name TEXT UNIQUE NOT NULL, scheduled_at TEXT NOT NULL, meeting_url TEXT NOT NULL DEFAULT '', duration_minutes INTEGER NOT NULL, status TEXT NOT NULL, created_by TEXT NOT NULL, created_at TEXT NOT NULL)")
                db.execute("INSERT INTO consultations VALUES(?,?,?,?,?,?,?,?,?)", (
                    "legacy-meet", "patient", "a" * 48, datetime.now(timezone.utc).isoformat(),
                    old_link, 15, "scheduled", "doctor", datetime.now(timezone.utc).isoformat(),
                ))
                db.commit()
            with patch.multiple(app, DATA_DIR=root, UPLOAD_DIR=root / "uploads", DB_PATH=db_path):
                app.init_db()
                app.init_db()
                with app.connect() as db:
                    row = db.execute("SELECT meeting_url,room_name,video_provider FROM consultations WHERE id='legacy-meet'").fetchone()
                    self.assertEqual(row["meeting_url"], old_link)
                    self.assertEqual(row["room_name"], "a" * 48)
                    self.assertEqual(row["video_provider"], "google_meet")

    def test_jitsi_room_url_only_accepts_opaque_random_shape(self):
        self.assertEqual(app.jitsi_room_url("a" * 48), "https://meet.jit.si/" + "a" * 48)
        for invalid in ("a" * 47, "A" * 48, "../other-room", "patient-name", "a" * 48 + "?x=1"):
            with self.subTest(invalid=invalid), self.assertRaises(ValueError):
                app.jitsi_room_url(invalid)


if __name__ == "__main__":
    unittest.main()
