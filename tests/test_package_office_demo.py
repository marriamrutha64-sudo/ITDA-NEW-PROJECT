"""Source packaging excludes private material even when it exists in the tree."""
import hashlib
import json
from pathlib import Path
import tempfile
import unittest
import zipfile

from scripts.package_office_demo import REQUIRED_FILES, build_package


class OfficeSourcePackageTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="aarogya-package-test-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name) / "project"
        self.root.mkdir()
        for name in REQUIRED_FILES:
            self.write(name, "synthetic source fixture")

    def write(self, name, content):
        path = self.root / name
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content, encoding="utf-8")
        return path

    def test_only_reviewed_source_assets_and_qa_evidence_are_included(self):
        private_marker = "DO-NOT-SHARE-SYNTHETIC-PRIVATE-MARKER"
        excluded = [
            ".private-data/aarogya.sqlite3", ".private-data/uploads/photo.jpg",
            "models/medgemma-1.5-4b-it/model.safetensors", ".medgemma-venv/Scripts/python.exe",
            ".venv/secrets.py", ".git/config", ".env", "deploy/.env", "deploy/.env.example",
            "credentials.json", "secrets.txt", "scripts/credentials.py", "tests/test_credentials.py",
            "IDEX.HTML", "JAVASCRIPT", "database.py", "qa/private.json", "qa/office-demo-python-tests.log",
        ]
        for name in excluded:
            self.write(name, private_marker)
        self.write("assets/reference/clinic-reference.jpg", "synthetic public reference")
        self.write("qa/office-demo-readiness.json", '{"clinical_validation":false}')
        self.write("scripts/package_office_demo.py", "synthetic public builder fixture")
        destination = self.root.parent / "demo.zip"
        result = build_package(destination, root=self.root)
        with zipfile.ZipFile(destination) as archive:
            names = set(archive.namelist())
            self.assertTrue(REQUIRED_FILES.issubset(names))
            self.assertIn("assets/reference/clinic-reference.jpg", names)
            self.assertIn("qa/office-demo-readiness.json", names)
            self.assertTrue(names.isdisjoint(excluded))
            self.assertFalse(any(private_marker.encode() in archive.read(name) for name in names))
            manifest = json.loads(archive.read("PACKAGE_MANIFEST.json"))
            self.assertFalse(manifest["contains_installed_model"])
            self.assertFalse(manifest["contains_accounts_or_patient_data"])
            self.assertFalse(manifest["clinical_validation"])
            self.assertEqual(set(manifest["files"]), names - {"PACKAGE_MANIFEST.json"})
            for name, details in manifest["files"].items():
                data = archive.read(name)
                self.assertEqual(details, {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()})
        self.assertEqual(result["files"], len(names))

    def test_repeated_build_is_deterministic_and_existing_output_is_never_replaced(self):
        first, second = self.root.parent / "first.zip", self.root.parent / "second.zip"
        build_package(first, root=self.root)
        build_package(second, root=self.root)
        self.assertEqual(first.read_bytes(), second.read_bytes())
        before = first.read_bytes()
        with self.assertRaises(FileExistsError):
            build_package(first, root=self.root)
        self.assertEqual(first.read_bytes(), before)

    def test_missing_required_source_fails_before_creating_archive(self):
        (self.root / "app.py").unlink()
        destination = self.root.parent / "missing.zip"
        with self.assertRaisesRegex(ValueError, "Required source"):
            build_package(destination, root=self.root)
        self.assertFalse(destination.exists())

    def test_allowlisted_symlink_cannot_import_private_data(self):
        private = self.write(".private-data/secret.txt", "synthetic private text")
        link = self.root / "app.py"
        link.unlink()
        try:
            link.symlink_to(private)
        except OSError:
            self.skipTest("This account cannot create symbolic links")
        destination = self.root.parent / "linked.zip"
        with self.assertRaisesRegex(ValueError, "Linked source"):
            build_package(destination, root=self.root)
        self.assertFalse(destination.exists())
