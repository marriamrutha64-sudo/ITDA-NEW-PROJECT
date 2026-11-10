import sqlite3
import tempfile
import unittest
from contextlib import closing
from pathlib import Path

import app
import public_demo_setup


class PublicDemoSetupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="aarogya-public-demo-test-")
        self.root = Path(self.temp.name)
        self.source_dir = self.root / ".private-data" / "manual-qa"
        self.source_dir.mkdir(parents=True)
        self.source_path = self.source_dir / "aarogya.sqlite3"
        self.original_paths = app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH
        with closing(sqlite3.connect(self.source_path)) as db:
            db.executescript("""
                CREATE TABLE users(id TEXT PRIMARY KEY, username TEXT UNIQUE,
                    password_hash TEXT, role TEXT, display_name TEXT, created_at TEXT);
                CREATE TABLE patients(id TEXT, name TEXT);
                INSERT INTO patients VALUES('private-patient', 'Private source patient');
            """)
            for index, (username, role, _) in enumerate(public_demo_setup._ACCOUNTS):
                db.execute("INSERT INTO users VALUES(?,?,?,?,?,?)", (
                    f"source-user-{index}", username, f"test-hash-{index}", role,
                    "Private source display name", "2020-01-01T00:00:00+00:00",
                ))
            db.execute("INSERT INTO users VALUES(?,?,?,?,?,?)", (
                "unlisted", "private-user", "private-hash", "admin", "Private user", "2020",
            ))
            db.commit()
        (self.source_dir / "uploads").mkdir()
        (self.source_dir / "uploads" / "private-clinical-photo.png").write_bytes(b"private-photo")

    def tearDown(self):
        app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH = self.original_paths
        self.temp.cleanup()

    def connect_destination(self, directory):
        db = sqlite3.connect(directory / "aarogya.sqlite3")
        db.row_factory = sqlite3.Row
        return db

    def test_only_allowlisted_accounts_and_synthetic_data_are_created(self):
        directory, accounts = public_demo_setup.prepare_public_demo(self.root)
        self.assertEqual(directory, self.root / ".private-data" / "public-demo")
        self.assertEqual(accounts, ["qa-admin", "qa-doctor", "qa-worker"])
        self.assertEqual((app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH), self.original_paths)
        with closing(self.connect_destination(directory)) as db:
            users = db.execute("SELECT * FROM users ORDER BY username").fetchall()
            self.assertEqual([user["username"] for user in users], accounts)
            self.assertEqual([user["display_name"] for user in users], ["Demo Admin", "Demo Doctor", "Demo Worker"])
            for index, user in enumerate(users):
                self.assertTrue(user["id"] == f"source-user-{index}")
                self.assertTrue(user["password_hash"] == f"test-hash-{index}")
            patients = db.execute("SELECT * FROM patients").fetchall()
            self.assertEqual(len(patients), 1)
            self.assertEqual(patients[0]["name"], "Synthetic Demo Patient")
            self.assertEqual(patients[0]["consent"], 1)
            self.assertEqual(patients[0]["created_by"], "source-user-2")
            screenings = db.execute("SELECT * FROM screenings").fetchall()
            self.assertEqual(len(screenings), 1)
            self.assertIn("not an oral photograph", screenings[0]["notes"])
            image_path = directory / "uploads" / screenings[0]["image_name"]
            self.assertEqual(app.image_info(image_path.read_bytes()), ("image/png", 320, 320))
            self.assertEqual(len(list((directory / "uploads").iterdir())), 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM consultations").fetchone()[0], 0)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log WHERE action='seeded_synthetic_demo'").fetchone()[0], 2)
            self.assertEqual(db.execute("PRAGMA foreign_key_check").fetchall(), [])
        self.assertEqual((self.source_dir / "uploads" / "private-clinical-photo.png").read_bytes(), b"private-photo")
        with closing(sqlite3.connect(self.source_path)) as db:
            self.assertEqual(db.execute("SELECT name FROM patients").fetchone()[0], "Private source patient")

    def test_rerun_preserves_destination_passwords_records_and_audit(self):
        directory, _ = public_demo_setup.prepare_public_demo(self.root)
        with closing(self.connect_destination(directory)) as db:
            db.execute("UPDATE users SET password_hash='changed-public-password' WHERE username='qa-admin'")
            db.execute("UPDATE patients SET history='Synthetic presenter edits' WHERE id=?", (public_demo_setup._PATIENT_ID,))
            db.commit()
        public_demo_setup.prepare_public_demo(self.root)
        with closing(self.connect_destination(directory)) as db:
            self.assertTrue(db.execute("SELECT password_hash FROM users WHERE username='qa-admin'").fetchone()[0] == "changed-public-password")
            self.assertEqual(db.execute("SELECT history FROM patients").fetchone()[0], "Synthetic presenter edits")
            self.assertEqual(db.execute("SELECT COUNT(*) FROM patients").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM screenings").fetchone()[0], 1)
            self.assertEqual(db.execute("SELECT COUNT(*) FROM audit_log").fetchone()[0], 2)

    def test_missing_source_account_fails_before_destination_creation(self):
        with closing(sqlite3.connect(self.source_path)) as db:
            db.execute("DELETE FROM users WHERE username='qa-doctor'")
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "qa-doctor.*create qa-admin"):
            public_demo_setup.prepare_public_demo(self.root)
        self.assertFalse((self.root / ".private-data" / "public-demo").exists())
        self.assertEqual((app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH), self.original_paths)

    def test_existing_wrong_role_rolls_back_and_restores_app_paths(self):
        directory, _ = public_demo_setup.prepare_public_demo(self.root)
        with closing(self.connect_destination(directory)) as db:
            db.execute("UPDATE users SET role='health_worker' WHERE username='qa-doctor'")
            db.commit()
        with self.assertRaisesRegex(RuntimeError, "qa-doctor has an unexpected role"):
            public_demo_setup.prepare_public_demo(self.root)
        self.assertEqual((app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH), self.original_paths)


if __name__ == "__main__":
    unittest.main()
