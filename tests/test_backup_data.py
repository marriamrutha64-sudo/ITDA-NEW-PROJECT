from contextlib import closing
from pathlib import Path
import sqlite3
import tempfile
import unittest

from backup_data import copy_data


class BackupTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.source = self.root / "source"
        (self.source / "uploads").mkdir(parents=True)
        (self.source / "uploads" / "image.png").write_bytes(b"synthetic-image")
        with closing(sqlite3.connect(self.source / "aarogya.sqlite3")) as db:
            db.execute("CREATE TABLE screenings (image_name TEXT)")
            db.execute("INSERT INTO screenings VALUES ('image.png')")
            db.commit()

    def test_backup_restore_preserves_records_and_images(self):
        backup, restored = self.root / "backup", self.root / "restored"
        self.assertEqual(copy_data(self.source, backup), 2)
        copy_data(backup, restored, restore=True)
        self.assertEqual((restored / "uploads/image.png").read_bytes(), b"synthetic-image")
        with closing(sqlite3.connect(restored / "aarogya.sqlite3")) as db:
            self.assertEqual(db.execute("SELECT image_name FROM screenings").fetchone(), ("image.png",))

    def test_tampered_backup_is_rejected_before_destination_creation(self):
        backup = self.root / "backup"
        copy_data(self.source, backup)
        (backup / "uploads/image.png").write_bytes(b"changed")
        with self.assertRaisesRegex(ValueError, "manifest"):
            copy_data(backup, self.root / "restored", restore=True)
        self.assertFalse((self.root / "restored").exists())

    def test_existing_and_nested_destinations_are_rejected(self):
        for destination in [self.source, self.source / "backup", self.root]:
            with self.assertRaises(ValueError):
                copy_data(self.source, destination)

    def test_missing_referenced_image_is_rejected(self):
        (self.source / "uploads/image.png").unlink()
        with self.assertRaisesRegex(ValueError, "image"):
            copy_data(self.source, self.root / "backup")

    def test_invalid_database_is_rejected(self):
        (self.source / "aarogya.sqlite3").write_bytes(b"invalid")
        with self.assertRaises(sqlite3.DatabaseError):
            copy_data(self.source, self.root / "backup")

