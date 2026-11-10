"""Create a separate synthetic-only database for a temporary public demo.

Only the three explicitly named demo login credentials are read from manual QA.
Patient records, consultations, audit history, and uploaded images are never
copied from that database. Run before starting the public demo server, because
the app's database paths are temporarily switched while its schema is created.
"""
from __future__ import annotations

import sqlite3
import struct
import threading
import uuid
import zlib
from contextlib import closing
from pathlib import Path

import app


_SETUP_LOCK = threading.Lock()
_ACCOUNTS = (
    ("qa-admin", "admin", "Demo Admin"),
    ("qa-doctor", "medical_officer", "Demo Doctor"),
    ("qa-worker", "health_worker", "Demo Worker"),
)
_PATIENT_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "aarogya:public-demo:patient:1"))
_SCREENING_ID = str(uuid.uuid5(uuid.NAMESPACE_URL, "aarogya:public-demo:screening:1"))
_IMAGE_NAME = f"{_SCREENING_ID}.png"


def _read_demo_accounts(source: Path) -> list[sqlite3.Row]:
    """Read an allowlist of user fields, opening the source strictly read-only."""
    if not source.is_file():
        raise RuntimeError(
            "The manual QA database is missing. Create qa-admin (admin), "
            "qa-doctor (medical_officer), and qa-worker (health_worker) in "
            ".private-data/manual-qa using app.py --create-user, then retry. "
            "Existing passwords are required; the public demo never invents or resets them."
        )
    try:
        with closing(sqlite3.connect(source.as_uri() + "?mode=ro", uri=True)) as db:
            db.row_factory = sqlite3.Row
            rows = db.execute(
                "SELECT id, username, password_hash, role FROM users "
                "WHERE username IN (?, ?, ?)",
                tuple(account[0] for account in _ACCOUNTS),
            ).fetchall()
    except sqlite3.Error as error:
        raise RuntimeError("Cannot read demo login accounts from .private-data/manual-qa.") from error
    by_name = {row["username"]: row for row in rows}
    invalid = [
        username for username, role, _ in _ACCOUNTS
        if username not in by_name or by_name[username]["role"] != role
        or not by_name[username]["id"] or not by_name[username]["password_hash"]
    ]
    if invalid:
        raise RuntimeError(
            "Missing or incorrectly configured demo accounts: " + ", ".join(invalid)
            + ". In .private-data/manual-qa, create qa-admin with role admin, "
            "qa-doctor with role medical_officer, and qa-worker with role health_worker "
            "using app.py --create-user, then retry. No passwords were reset."
        )
    return [by_name[username] for username, _, _ in _ACCOUNTS]


def _synthetic_png() -> bytes:
    """Generate a nonclinical checkerboard visibly marked DEMO, using stdlib."""
    width = height = 320
    pixels = bytearray(width * height * 3)
    for y in range(height):
        for x in range(width):
            color = (213, 238, 235) if (x // 40 + y // 40) % 2 else (246, 249, 248)
            start = (y * width + x) * 3
            pixels[start:start + 3] = bytes(color)
    letters = (
        ("11110", "10001", "10001", "10001", "10001", "10001", "11110"),
        ("11111", "10000", "10000", "11110", "10000", "10000", "11111"),
        ("10001", "11011", "10101", "10101", "10001", "10001", "10001"),
        ("01110", "10001", "10001", "10001", "10001", "10001", "01110"),
    )
    scale = 10
    for letter_index, letter in enumerate(letters):
        for row, bits in enumerate(letter):
            for col, bit in enumerate(bits):
                if bit == "1":
                    for dy in range(scale):
                        for dx in range(scale):
                            x = 45 + (letter_index * 6 + col) * scale + dx
                            y = 125 + row * scale + dy
                            start = (y * width + x) * 3
                            pixels[start:start + 3] = bytes((14, 104, 100))

    def chunk(kind: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data))

    scanlines = b"".join(
        b"\x00" + pixels[y * width * 3:(y + 1) * width * 3] for y in range(height)
    )
    return (
        b"\x89PNG\r\n\x1a\n"
        + chunk(b"IHDR", struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
        + chunk(b"tEXt", b"Description\x00Synthetic DEMO graphic, not a clinical photograph")
        + chunk(b"IDAT", zlib.compress(scanlines))
        + chunk(b"IEND", b"")
    )


def prepare_public_demo(root: Path | str = app.ROOT) -> tuple[Path, list[str]]:
    """Prepare isolated demo data, retaining destination passwords and records.

    Return ``(data_directory, usernames)``. The credentials keep their existing
    manual-QA passwords on the first run; subsequent runs preserve any password
    already stored in the public-demo database. No secret is returned or printed.
    This setup must finish before an app HTTP server is started in this process.
    """
    root = Path(root).resolve()
    source = root / ".private-data" / "manual-qa" / "aarogya.sqlite3"
    data_dir = root / ".private-data" / "public-demo"
    accounts = _read_demo_accounts(source)
    with _SETUP_LOCK:
        original_paths = app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH
        try:
            app.DATA_DIR = data_dir
            app.UPLOAD_DIR = data_dir / "uploads"
            app.DB_PATH = data_dir / "aarogya.sqlite3"
            app.init_db()
            created_at = app.now_iso()
            with app.connect() as db:
                db.execute("BEGIN IMMEDIATE")
                destination = {}
                for source_user, (username, role, display_name) in zip(accounts, _ACCOUNTS):
                    existing = db.execute(
                        "SELECT id, role FROM users WHERE username=?", (username,)
                    ).fetchone()
                    if existing:
                        if existing["role"] != role:
                            raise RuntimeError(
                                f"Public demo account {username} has an unexpected role. "
                                "Resolve the account role before sharing this demo."
                            )
                        destination[username] = existing["id"]
                        continue
                    if db.execute("SELECT 1 FROM users WHERE id=?", (source_user["id"],)).fetchone():
                        raise RuntimeError(
                            f"Public demo account ID conflict for {username}. "
                            "Resolve the conflicting demo account before retrying."
                        )
                    db.execute(
                        "INSERT INTO users(id, username, password_hash, role, display_name, created_at) "
                        "VALUES(?,?,?,?,?,?)",
                        (source_user["id"], username, source_user["password_hash"], role,
                         display_name, created_at),
                    )
                    destination[username] = source_user["id"]
                worker_id = destination["qa-worker"]
                setup_actor = destination["qa-admin"]
                if not db.execute("SELECT 1 FROM patients WHERE id=?", (_PATIENT_ID,)).fetchone():
                    name, age, village = "Synthetic Demo Patient", 35, "Demo Village (synthetic)"
                    db.execute(
                        "INSERT INTO patients(id, patient_code, name, age, gender, phone, village, "
                        "district, history, symptoms, identity_key, consent, created_by, created_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (_PATIENT_ID, "DEMO-001", name, age, "Prefer not to say", "", village,
                         "Demo District (synthetic)",
                         "Synthetic example only. This record does not represent a person.",
                         "Demonstration record; no clinical symptoms are asserted.",
                         app.patient_identity_key(name, age, village, ""), 1, worker_id, created_at),
                    )
                    db.execute(
                        "INSERT INTO audit_log(actor_id, action, entity_type, entity_id, created_at) "
                        "VALUES(?,?,?,?,?)",
                        (setup_actor, "seeded_synthetic_demo", "patient", _PATIENT_ID, created_at),
                    )
                if not db.execute("SELECT 1 FROM screenings WHERE id=?", (_SCREENING_ID,)).fetchone():
                    image = _synthetic_png()
                    image_path = app.UPLOAD_DIR / _IMAGE_NAME
                    if image_path.exists() and image_path.read_bytes() != image:
                        raise RuntimeError("The synthetic demo image path contains a different file.")
                    image_path.write_bytes(image)
                    db.execute(
                        "INSERT INTO screenings(id, patient_id, worker, location, duration, notes, "
                        "image_name, image_type, image_bytes, image_width, image_height, created_by, created_at) "
                        "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (_SCREENING_ID, _PATIENT_ID, "Demo Worker", "Synthetic demonstration", "Demo only",
                         "Generated DEMO graphic only; not an oral photograph. Do not use for "
                         "clinical interpretation or model validation.", _IMAGE_NAME, "image/png",
                         len(image), 320, 320, worker_id, created_at),
                    )
                    db.execute(
                        "INSERT INTO audit_log(actor_id, action, entity_type, entity_id, created_at) "
                        "VALUES(?,?,?,?,?)",
                        (setup_actor, "seeded_synthetic_demo", "screening", _SCREENING_ID, created_at),
                    )
        finally:
            app.DATA_DIR, app.UPLOAD_DIR, app.DB_PATH = original_paths
    return data_dir, [account[0] for account in _ACCOUNTS]


if __name__ == "__main__":
    directory, usernames = prepare_public_demo()
    print(f"Synthetic demo prepared: {directory}")
    print("Sign in using an existing demo-account password: " + ", ".join(usernames))
