"""A small dependency-free local server for the Aarogya Drishti prototype.

This server is intended for local evaluation and development. Do not expose it to
the public internet without a production deployment and security review.
"""
from __future__ import annotations

import argparse
import base64
import hashlib
import hmac
import json
import mimetypes
import os
import re
import secrets
import sqlite3
import struct
import time
import unicodedata
import uuid
import medgemma_runtime
from getpass import getpass
from datetime import date, datetime, timedelta, timezone
from http import HTTPStatus
from http.cookies import SimpleCookie
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent
DATA_DIR = Path(os.environ.get("AAROGYA_DATA_DIR", ROOT / ".private-data")).resolve()
UPLOAD_DIR = DATA_DIR / "uploads"
DB_PATH = DATA_DIR / "aarogya.sqlite3"
MAX_REQUEST = 8 * 1024 * 1024
MAX_IMAGE = 7 * 1024 * 1024
ROLES = {"admin", "health_worker", "medical_officer", "specialist"}
COOKIE_NAME = "aarogya_session"
SESSION_SECONDS = 8 * 60 * 60


def connect():
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(DB_PATH, timeout=10, factory=ClosingConnection)
    db.row_factory = sqlite3.Row
    db.execute("PRAGMA foreign_keys=ON")
    db.execute("PRAGMA journal_mode=WAL")
    return db


class ClosingConnection(sqlite3.Connection):
    """Preserve sqlite's commit/rollback context behavior and close the handle."""

    def __exit__(self, exc_type, exc_value, traceback):
        try:
            return super().__exit__(exc_type, exc_value, traceback)
        finally:
            self.close()


def patient_identity_key(name, age, village, phone):
    """Return a stable key for the app's duplicate-patient identity rule."""
    def normalized_text(value):
        return " ".join(unicodedata.normalize("NFKC", str(value or "")).casefold().split())

    phone_text = str(phone or "").strip()
    digits = "".join(character for character in phone_text if character.isdigit())
    normalized_phone = ("+" if phone_text.startswith("+") else "") + digits
    identity = json.dumps(
        [normalized_text(name), int(age), normalized_text(village), normalized_phone],
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(identity.encode("utf-8")).hexdigest()


def migrate_patient_identity_key(db):
    """Backfill normalized keys, preserving any legacy duplicate rows."""
    columns = {row["name"] for row in db.execute("PRAGMA table_info(patients)")}
    if "identity_key" not in columns:
        db.execute("ALTER TABLE patients ADD COLUMN identity_key TEXT")

    rows = db.execute(
        "SELECT id, name, age, village, phone, created_at FROM patients"
    ).fetchall()
    groups = {}
    for row in rows:
        key = patient_identity_key(row["name"], row["age"], row["village"], row["phone"])
        groups.setdefault(key, []).append(row)

    # Keep all existing records. For any historical duplicate group, one
    # canonical row owns the normalized key and older extras receive isolated
    # legacy keys. New registrations will then match the canonical row.
    for key, group in groups.items():
        group.sort(key=lambda row: (row["created_at"], row["id"]))
        for index, row in enumerate(group):
            stored_key = key if index == 0 else f"legacy:{row['id']}"
            db.execute("UPDATE patients SET identity_key=? WHERE id=?", (stored_key, row["id"]))

    db.execute(
        "CREATE UNIQUE INDEX IF NOT EXISTS patients_identity_key_unique ON patients(identity_key)"
    )


def init_db():
    with connect() as db:
        db.executescript("""
        CREATE TABLE IF NOT EXISTS users(
          id TEXT PRIMARY KEY, username TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
          role TEXT NOT NULL CHECK(role IN ('admin','health_worker','medical_officer','specialist')),
          display_name TEXT NOT NULL, created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS patients(
          id TEXT PRIMARY KEY, patient_code TEXT UNIQUE NOT NULL, name TEXT NOT NULL,
          age INTEGER NOT NULL, gender TEXT NOT NULL DEFAULT '', phone TEXT NOT NULL DEFAULT '',
          village TEXT NOT NULL, district TEXT NOT NULL DEFAULT '', history TEXT NOT NULL DEFAULT '',
          symptoms TEXT NOT NULL DEFAULT '', identity_key TEXT, consent INTEGER NOT NULL DEFAULT 0,
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS patients_created ON patients(created_at DESC);
        CREATE TABLE IF NOT EXISTS screenings(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), worker TEXT NOT NULL,
          location TEXT NOT NULL DEFAULT '', duration TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
          image_name TEXT NOT NULL, image_type TEXT NOT NULL, image_bytes INTEGER NOT NULL,
          image_width INTEGER NOT NULL, image_height INTEGER NOT NULL,
          status TEXT NOT NULL DEFAULT 'Awaiting clinical review', created_by TEXT NOT NULL REFERENCES users(id),
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS reviews(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), screening_id TEXT,
          reviewer TEXT NOT NULL, status TEXT NOT NULL, observations TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS referrals(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), facility TEXT NOT NULL,
          department TEXT NOT NULL DEFAULT '', reason TEXT NOT NULL, appointment_date TEXT NOT NULL DEFAULT '',
          status TEXT NOT NULL DEFAULT 'Open', created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS followups(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), due_date TEXT NOT NULL,
          notes TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'Scheduled',
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS consultations(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
          room_name TEXT UNIQUE NOT NULL, scheduled_at TEXT NOT NULL,
          duration_minutes INTEGER NOT NULL CHECK(duration_minutes IN (15,30,45,60)),
          status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','completed','cancelled')),
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS consultations_schedule ON consultations(scheduled_at DESC);
        CREATE TABLE IF NOT EXISTS audit_log(
          id INTEGER PRIMARY KEY AUTOINCREMENT, actor_id TEXT NOT NULL REFERENCES users(id),
          action TEXT NOT NULL, entity_type TEXT NOT NULL, entity_id TEXT NOT NULL,
          created_at TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS offline_sync_receipts(
          actor_id TEXT NOT NULL REFERENCES users(id), operation_id TEXT NOT NULL,
          payload_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL,
          PRIMARY KEY(actor_id, operation_id)
        );
        """)
        db.execute("BEGIN IMMEDIATE")
        migrate_patient_identity_key(db)


def now_iso():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def pw_hash(password: str, salt: bytes | None = None) -> str:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
    return f"scrypt${salt.hex()}${digest.hex()}"


def verify_password(password: str, stored: str) -> bool:
    try:
        scheme, salt_hex, digest_hex = stored.split("$", 2)
        if scheme != "scrypt":
            return False
        salt, expected = bytes.fromhex(salt_hex), bytes.fromhex(digest_hex)
        actual = hashlib.scrypt(password.encode("utf-8"), salt=salt, n=2**14, r=8, p=1)
        return hmac.compare_digest(actual, expected)
    except (ValueError, TypeError):
        return False


def session_secret():
    secret = os.environ.get("AAROGYA_SESSION_SECRET", "")
    if len(secret) < 32:
        raise RuntimeError("Set AAROGYA_SESSION_SECRET to a random secret of at least 32 characters before starting the server.")
    return secret.encode("utf-8")


def jitsi_settings():
    """Return configured private Jitsi connection settings, never a public default."""
    domain = os.environ.get("AAROGYA_JITSI_DOMAIN", "").strip().lower()
    app_id = os.environ.get("AAROGYA_JITSI_APP_ID", "").strip()
    app_secret = os.environ.get("AAROGYA_JITSI_APP_SECRET", "")
    labels = domain.split(".")
    valid_domain = (
        2 <= len(labels) <= 10 and len(domain) <= 253
        and all(1 <= len(label) <= 63 and re.fullmatch(r"[a-z0-9](?:[a-z0-9-]*[a-z0-9])?", label) for label in labels)
    )
    if not valid_domain or not app_id or len(app_id) > 128 or len(app_secret) < 32:
        return None
    return {"domain": domain, "app_id": app_id, "app_secret": app_secret}


def b64url(data):
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def make_jitsi_token(settings, room_name):
    """Create a short-lived HS256 token scoped to exactly one opaque room."""
    now = int(time.time())
    header = {"alg": "HS256", "typ": "JWT"}
    claims = {
        "aud": settings["app_id"],
        "iss": settings["app_id"],
        "sub": settings["domain"],
        "room": room_name,
        "iat": now,
        "nbf": now - 10,
        "exp": now + 10 * 60,
        "context": {"user": {"name": "Clinician"}},
    }
    header_part = b64url(json.dumps(header, separators=(",", ":")).encode())
    claims_part = b64url(json.dumps(claims, separators=(",", ":")).encode())
    unsigned = f"{header_part}.{claims_part}"
    signature = hmac.new(settings["app_secret"].encode("utf-8"), unsigned.encode("ascii"), hashlib.sha256).digest()
    return f"{unsigned}.{b64url(signature)}", now + 10 * 60


def parse_appointment_time(value):
    try:
        parsed = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError as exc:
        raise ValueError("Choose a valid appointment date and time.") from exc
    if parsed.tzinfo is None:
        raise ValueError("Appointment time must include a time zone.")
    parsed = parsed.astimezone(timezone.utc)
    now = datetime.now(timezone.utc)
    if parsed < now - timedelta(minutes=5):
        raise ValueError("Choose an appointment time that has not passed.")
    if parsed > now + timedelta(days=365):
        raise ValueError("Appointment time must be within the next year.")
    return parsed.isoformat(timespec="minutes")


def make_session(user_id):
    expires = int(time.time()) + SESSION_SECONDS
    body = f"{user_id}.{expires}"
    sig = hmac.new(session_secret(), body.encode(), hashlib.sha256).hexdigest()
    return f"{body}.{sig}"


def read_session(token):
    try:
        user_id, expiry, signature = token.rsplit(".", 2)
        body = f"{user_id}.{expiry}"
        expected = hmac.new(session_secret(), body.encode(), hashlib.sha256).hexdigest()
        if int(expiry) < time.time() or not hmac.compare_digest(signature, expected):
            return None
        with connect() as db:
            row = db.execute("SELECT id, username, role, display_name FROM users WHERE id=?", (user_id,)).fetchone()
        return dict(row) if row else None
    except (ValueError, RuntimeError):
        return None


def image_info(data: bytes):
    """Read image dimensions from PNG/JPEG/WebP headers without third-party code."""
    if data.startswith(b"\x89PNG\r\n\x1a\n") and len(data) >= 24:
        return "image/png", *struct.unpack(">II", data[16:24])
    if data.startswith(b"\xff\xd8"):
        i = 2
        while i + 9 < len(data):
            if data[i] != 0xFF:
                i += 1
                continue
            while i < len(data) and data[i] == 0xFF:
                i += 1
            if i >= len(data):
                break
            marker = data[i]; i += 1
            if marker in (0xD8, 0xD9) or 0xD0 <= marker <= 0xD7:
                continue
            if i + 2 > len(data):
                break
            length = int.from_bytes(data[i:i+2], "big")
            if length < 2 or i + length > len(data):
                break
            if marker in {0xC0,0xC1,0xC2,0xC3,0xC5,0xC6,0xC7,0xC9,0xCA,0xCB,0xCD,0xCE,0xCF}:
                height, width = struct.unpack(">HH", data[i+3:i+7])
                return "image/jpeg", width, height
            i += length
    if data.startswith(b"RIFF") and data[8:12] == b"WEBP" and len(data) >= 30:
        kind = data[12:16]
        if kind == b"VP8X":
            width = 1 + int.from_bytes(data[24:27], "little")
            height = 1 + int.from_bytes(data[27:30], "little")
            return "image/webp", width, height
        if kind == b"VP8 " and len(data) >= 30:
            width = int.from_bytes(data[26:28], "little") & 0x3FFF
            height = int.from_bytes(data[28:30], "little") & 0x3FFF
            return "image/webp", width, height
    return None


class Handler(BaseHTTPRequestHandler):
    server_version = "AarogyaLocal/1.0"
    def log_message(self, fmt, *args):
        # Avoid logging patient data or request bodies.
        if self.path.startswith("/api/"):
            super().log_message("%s", self.command + " " + urlparse(self.path).path)
        else:
            super().log_message(fmt, *args)

    def send_headers(self, status=200, content_type="application/json; charset=utf-8", length=None):
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("X-Frame-Options", "DENY")
        jitsi = jitsi_settings()
        jitsi_origin = f"https://{jitsi['domain']}" if jitsi else ""
        script_sources = "'self'" + (f" {jitsi_origin}" if jitsi else "")
        frame_sources = jitsi_origin or "'none'"
        self.send_header("Content-Security-Policy", f"default-src 'self'; img-src 'self' blob: data:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; script-src {script_sources}; connect-src 'self'; frame-src {frame_sources}; frame-ancestors 'none'; base-uri 'self'; form-action 'self'")
        self.send_header("Cache-Control", "no-store" if self.path.startswith("/api/") else "no-cache")
        if length is not None:
            self.send_header("Content-Length", str(length))

    def json(self, value, status=200, extra_headers=None):
        data = json.dumps(value, ensure_ascii=False, separators=(",", ":")).encode()
        self.send_headers(status, length=len(data))
        for key, val in (extra_headers or {}).items():
            self.send_header(key, val)
        self.end_headers(); self.wfile.write(data)

    def body(self):
        length = int(self.headers.get("Content-Length", "0"))
        if length <= 0 or length > MAX_REQUEST:
            raise ValueError("Request body is empty or exceeds the allowed size.")
        raw = self.rfile.read(length)
        if self.headers.get("Content-Type", "").startswith("application/json"):
            result = json.loads(raw)
            if not isinstance(result, dict):
                raise ValueError("Expected a JSON object.")
            return result
        return raw

    def user(self):
        jar = SimpleCookie(self.headers.get("Cookie", ""))
        morsel = jar.get(COOKIE_NAME)
        return read_session(morsel.value) if morsel else None

    def require_user(self, roles=None):
        user = self.user()
        if not user:
            self.json({"error": "Sign in to continue."}, 401); return None
        if roles and user["role"] not in roles and user["role"] != "admin":
            self.json({"error": "Your account does not have access to this action."}, 403); return None
        return user

    def same_origin(self):
        origin = self.headers.get("Origin")
        if not origin:
            return True
        parsed = urlparse(origin)
        host = self.headers.get("Host", "")
        return parsed.netloc.lower() == host.lower() and parsed.scheme in ("http", "https")

    def audit(self, user, action, kind, entity):
        with connect() as db:
            db.execute("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                       (user["id"], action, kind, entity, now_iso()))

    def do_GET(self):
        path = urlparse(self.path).path
        if path.startswith("/api/"):
            if path == "/api/session":
                user = self.user()
                self.json({"authenticated": bool(user), "user": user})
                return
            if path == "/api/health":
                self.json({"ok": True, "ai": medgemma_runtime.status()})
                return
            if path == "/api/consultations":
                user = self.require_user({"medical_officer", "specialist"})
                if not user: return
                settings = jitsi_settings()
                with connect() as db:
                    rows = db.execute(
                        "SELECT c.id,c.scheduled_at,c.duration_minutes,c.status,c.created_at,"
                        "p.name AS patient_name,p.patient_code "
                        "FROM consultations c JOIN patients p ON p.id=c.patient_id "
                        "ORDER BY c.scheduled_at DESC LIMIT 200"
                    ).fetchall()
                self.json({"configured": bool(settings), "consultations": [dict(row) for row in rows]})
                return
            user = self.require_user()
            if not user: return
            with connect() as db:
                if path == "/api/dashboard":
                    scope = "WHERE created_by=?" if user["role"] == "health_worker" else ""
                    args = (user["id"],) if scope else ()
                    patients = db.execute(f"SELECT COUNT(*) FROM patients {scope}", args).fetchone()[0]
                    screening_scope = "AND created_by=?" if user["role"] == "health_worker" else ""
                    screening_args = (user["id"],) if screening_scope else ()
                    pending = db.execute("SELECT COUNT(*) FROM screenings WHERE status='Awaiting clinical review' " + screening_scope, screening_args).fetchone()[0]
                    due_scope = "AND p.created_by=?" if user["role"] == "health_worker" else ""
                    due_args = (date.today().isoformat(), date.fromordinal(date.today().toordinal()+7).isoformat()) + ((user["id"],) if due_scope else ())
                    due = db.execute("SELECT COUNT(*) FROM followups f JOIN patients p ON p.id=f.patient_id WHERE f.status='Scheduled' AND f.due_date BETWEEN ? AND ? " + due_scope, due_args).fetchone()[0]
                    referral_scope = "AND p.created_by=?" if user["role"] == "health_worker" else ""
                    referral_args = (user["id"],) if referral_scope else ()
                    referrals = db.execute("SELECT COUNT(*) FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE r.status='Open' " + referral_scope, referral_args).fetchone()[0]
                    recent = db.execute("SELECT id,patient_code,name,age,gender,village,district,created_at FROM patients " + scope + " ORDER BY created_at DESC LIMIT 6", args).fetchall()
                    self.json({"patients": patients, "screenings": pending, "followups": due, "referrals": referrals, "recent": [dict(row) for row in recent]})
                    return
                if path == "/api/audit":
                    if user["role"] != "admin":
                        self.json({"error": "Administrator access is required."}, 403); return
                    rows = db.execute(
                        "SELECT u.display_name AS actor_name, a.action, a.entity_type, a.entity_id, a.created_at "
                        "FROM audit_log a JOIN users u ON u.id=a.actor_id "
                        "ORDER BY a.id DESC LIMIT 100"
                    ).fetchall()
                    self.json({"records": [dict(row) for row in rows]}); return
                if path == "/api/patients":
                    scope = "WHERE created_by=?" if user["role"] == "health_worker" else ""
                    args = (user["id"],) if scope else ()
                    rows = db.execute("SELECT id,patient_code,name,age,gender,village,district,created_at FROM patients " + scope + " ORDER BY created_at DESC LIMIT 500", args).fetchall()
                    self.json({"patients": [dict(row) for row in rows]}); return
                if path.startswith("/api/patients/"):
                    patient_id = path.rsplit("/", 1)[-1]
                    if not patient_id or len(patient_id) > 40:
                        self.json({"error": "Patient not found."}, 404); return
                    row = db.execute("SELECT * FROM patients WHERE id=?", (patient_id,)).fetchone()
                    if not row or (user["role"] == "health_worker" and row["created_by"] != user["id"]):
                        self.json({"error": "Patient not found or you do not have access."}, 404); return
                    screenings = db.execute("SELECT id,location,duration,notes,image_type,image_bytes,image_width,image_height,status,created_at FROM screenings WHERE patient_id=? ORDER BY created_at DESC", (patient_id,)).fetchall()
                    reviews = db.execute("SELECT reviewer,status,observations,created_at FROM reviews WHERE patient_id=? ORDER BY created_at DESC", (patient_id,)).fetchall()
                    referrals = db.execute("SELECT facility,department,reason,appointment_date,status,created_at FROM referrals WHERE patient_id=? ORDER BY created_at DESC", (patient_id,)).fetchall()
                    followups = db.execute("SELECT due_date,notes,status,created_at FROM followups WHERE patient_id=? ORDER BY due_date", (patient_id,)).fetchall()
                    db.execute("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"], "viewed", "patient", patient_id, now_iso()))
                    self.json({"patient": dict(row), "screenings": [dict(item) for item in screenings], "reviews": [dict(item) for item in reviews], "referrals": [dict(item) for item in referrals], "followups": [dict(item) for item in followups]}); return
                if path == "/api/screenings":
                    screen_scope = "WHERE s.created_by=?" if user["role"] == "health_worker" else ""
                    screen_args = (user["id"],) if screen_scope else ()
                    rows = db.execute("SELECT s.*,p.patient_code,p.name patient_name FROM screenings s JOIN patients p ON p.id=s.patient_id " + screen_scope + " ORDER BY s.created_at DESC LIMIT 100", screen_args).fetchall()
                    self.json({"screenings": [dict(row) for row in rows]}); return
                if path == "/api/reviews":
                    if user["role"] not in {"admin", "medical_officer", "specialist"}:
                        self.json({"error": "Clinical reviewer access is required."}, 403); return
                    rows = db.execute("SELECT r.*,p.patient_code,p.name patient_name FROM reviews r JOIN patients p ON p.id=r.patient_id ORDER BY r.created_at DESC LIMIT 100").fetchall()
                    self.json({"reviews": [dict(row) for row in rows]}); return
                if path == "/api/care":
                    care_scope = "WHERE p.created_by=?" if user["role"] == "health_worker" else ""
                    care_args = (user["id"],) if care_scope else ()
                    refs = db.execute("SELECT r.*,p.patient_code,p.name patient_name FROM referrals r JOIN patients p ON p.id=r.patient_id " + care_scope + " ORDER BY r.created_at DESC LIMIT 100", care_args).fetchall()
                    follows = db.execute("SELECT f.*,p.patient_code,p.name patient_name FROM followups f JOIN patients p ON p.id=f.patient_id " + care_scope + " ORDER BY f.due_date LIMIT 100", care_args).fetchall()
                    self.json({"referrals": [dict(row) for row in refs], "followups": [dict(row) for row in follows]}); return
                if path.startswith("/api/images/"):
                    image_id = path.rsplit("/", 1)[-1]
                    row = db.execute("SELECT s.image_name,s.image_type,s.created_by AS screening_owner,p.created_by AS patient_owner FROM screenings s JOIN patients p ON p.id=s.patient_id WHERE s.id=?", (image_id,)).fetchone()
                    if not row or (user["role"] == "health_worker" and user["id"] not in (row["screening_owner"], row["patient_owner"])):
                        self.json({"error": "Image not found."}, 404); return
                    file_path = (UPLOAD_DIR / row["image_name"]).resolve()
                    if file_path.parent != UPLOAD_DIR or not file_path.exists():
                        self.json({"error": "Image unavailable."}, 404); return
                    data = file_path.read_bytes()
                    self.send_headers(200, row["image_type"], len(data)); self.send_header("Content-Disposition", "inline; filename=screening-image"); self.end_headers(); self.wfile.write(data); return
            self.json({"error": "Not found."}, 404); return
        if path == "/" or path in ("/index.html", "/app.js", "/medgemma-ui.js", "/styles.css", "/offline-vault.js", "/manifest.json", "/service-worker.js", "/icon.svg"):
            name = "index.html" if path == "/" else path.lstrip("/")
            file_path = (ROOT / name).resolve()
            if file_path.parent != ROOT or not file_path.exists():
                self.send_error(404); return
            data = file_path.read_bytes()
            kind = mimetypes.guess_type(name)[0] or "application/octet-stream"
            self.send_headers(200, kind + ("; charset=utf-8" if kind.startswith(("text/", "application/javascript", "application/json")) else ""), len(data))
            self.end_headers(); self.wfile.write(data); return
        self.send_error(404)

    def do_POST(self):
        path = urlparse(self.path).path
        if path.startswith("/api/") and not self.same_origin():
            self.json({"error": "Request origin rejected."}, 403); return
        if path == "/api/offline/patients" and not self.headers.get("Origin"):
            self.json({"error": "An Origin header is required for offline synchronization."}, 403); return
        try:
            if path == "/api/login":
                data = self.body()
                username = str(data.get("username", "")).strip().lower()
                password = str(data.get("password", ""))
                with connect() as db:
                    row = db.execute("SELECT * FROM users WHERE username=?", (username,)).fetchone()
                if not row or not verify_password(password, row["password_hash"]):
                    self.json({"error": "Username or password is incorrect."}, 401); return
                token = make_session(row["id"])
                secure = "; Secure" if self.headers.get("X-Forwarded-Proto") == "https" else ""
                self.json({"user": {"id":row["id"],"username":row["username"],"role":row["role"],"display_name":row["display_name"]}}, extra_headers={"Set-Cookie": f"{COOKIE_NAME}={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={SESSION_SECONDS}" + secure}); return
            if path == "/api/logout":
                self.json({"ok": True}, extra_headers={"Set-Cookie": f"{COOKIE_NAME}=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0"}); return
            user = self.require_user()
            if not user: return
            if path == "/api/offline/patients":
                if user["role"] != "health_worker":
                    self.json({"error": "Only health workers can synchronize patient registrations."}, 403); return
                operation_id = self.headers.get("Idempotency-Key", "").strip().lower()
                if not re.fullmatch(r"[0-9a-f]{32}", operation_id):
                    self.json({"error": "A valid operation idempotency key is required."}, 400); return

                data = self.body()
                payload_hash = hashlib.sha256(
                    json.dumps(data, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
                ).hexdigest()
                name = clean(data, "name", 120, required=True)
                village = clean(data, "village", 120, required=True)
                age = int(data.get("age", 0))
                if age < 1 or age > 120:
                    raise ValueError("Age must be between 1 and 120.")
                if data.get("consent") is not True:
                    raise ValueError("Patient consent is required.")
                phone = clean(data, "phone", 24)
                if phone and not all(ch.isdigit() or ch in "+ -()" for ch in phone):
                    raise ValueError("Enter a valid mobile number.")
                identity_key = patient_identity_key(name, age, village, phone)

                response_status = 201
                response_body = None
                with connect() as db:
                    db.execute("BEGIN IMMEDIATE")
                    receipt = db.execute(
                        "SELECT payload_hash,response_json FROM offline_sync_receipts WHERE actor_id=? AND operation_id=?",
                        (user["id"], operation_id),
                    ).fetchone()
                    if receipt:
                        if receipt["payload_hash"] != payload_hash:
                            response_status = 409
                            response_body = {"error": "This idempotency key was already used for a different patient payload."}
                        else:
                            response_status = 200
                            response_body = json.loads(receipt["response_json"])
                    else:
                        duplicate = db.execute(
                            "SELECT patient_code FROM patients WHERE identity_key=? LIMIT 1", (identity_key,)
                        ).fetchone()
                        if duplicate:
                            response_status = 409
                            response_body = {
                                "error": "A record with this name, age, village and mobile number already exists.",
                                "duplicate": duplicate["patient_code"],
                            }
                        else:
                            patient_id = str(uuid.uuid4())
                            patient_code = f"AD-{date.today().year}-{secrets.token_hex(3).upper()}"
                            created = now_iso()
                            db.execute(
                                "INSERT INTO patients(id,patient_code,name,age,gender,phone,village,district,history,symptoms,identity_key,consent,created_by,created_at) "
                                "VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                (
                                    patient_id, patient_code, name, age, clean(data, "gender", 30), phone, village,
                                    clean(data, "district", 120), clean(data, "history", 4000),
                                    clean(data, "symptoms", 4000), identity_key, 1, user["id"], created,
                                ),
                            )
                            db.execute(
                                "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                                (user["id"], "created", "patient", patient_id, created),
                            )
                            # Store a minimal receipt, not a second copy of the patient record.
                            response_body = {
                                "ok": True,
                                "operation_id": operation_id,
                                "patient": {"id": patient_id, "patient_code": patient_code, "created_at": created},
                            }
                            db.execute(
                                "INSERT INTO offline_sync_receipts(actor_id,operation_id,payload_hash,response_json,created_at) VALUES(?,?,?,?,?)",
                                (
                                    user["id"], operation_id, payload_hash,
                                    json.dumps(response_body, ensure_ascii=False, separators=(",", ":")), created,
                                ),
                            )
                self.json(response_body, response_status)
                return
            if path == "/api/consultations":
                user = self.require_user({"medical_officer", "specialist"})
                if not user: return
                data = self.body()
                patient_id = clean(data, "patient_id", 40, required=True)
                scheduled_at = parse_appointment_time(data.get("scheduled_at", ""))
                try:
                    duration = int(data.get("duration_minutes", 30))
                except (TypeError, ValueError) as exc:
                    raise ValueError("Choose a valid appointment length.") from exc
                if duration not in {15, 30, 45, 60}:
                    raise ValueError("Appointment length must be 15, 30, 45 or 60 minutes.")
                consultation_id = str(uuid.uuid4())
                # Room slugs are independent random values: no patient identifier or name is encoded.
                room_name = secrets.token_hex(24)
                created = now_iso()
                with connect() as db:
                    if not db.execute("SELECT 1 FROM patients WHERE id=?", (patient_id,)).fetchone():
                        raise ValueError("Choose a registered patient.")
                    db.execute(
                        "INSERT INTO consultations(id,patient_id,room_name,scheduled_at,duration_minutes,created_by,created_at) "
                        "VALUES(?,?,?,?,?,?,?)",
                        (consultation_id, patient_id, room_name, scheduled_at, duration, user["id"], created),
                    )
                    db.execute(
                        "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                        (user["id"], "created", "consultation", consultation_id, created),
                    )
                    row = db.execute(
                        "SELECT c.id,c.scheduled_at,c.duration_minutes,c.status,c.created_at,"
                        "p.name AS patient_name,p.patient_code FROM consultations c "
                        "JOIN patients p ON p.id=c.patient_id WHERE c.id=?",
                        (consultation_id,),
                    ).fetchone()
                self.json({"consultation": dict(row)}, 201)
                return
            consultation_action = re.fullmatch(r"/api/consultations/([0-9a-f-]{36})/(join|cancel|invite)", path)
            if consultation_action:
                user = self.require_user({"medical_officer", "specialist"})
                if not user: return
                consultation_id, action = consultation_action.groups()
                with connect() as db:
                    row = db.execute(
                        "SELECT id,room_name,status FROM consultations WHERE id=?",
                        (consultation_id,),
                    ).fetchone()
                    if not row:
                        self.json({"error": "Appointment not found."}, 404)
                        return
                    if row["status"] != "scheduled":
                        self.json({"error": "Only scheduled appointments can be joined or changed."}, 409)
                        return
                    if action == "cancel":
                        db.execute("UPDATE consultations SET status='cancelled' WHERE id=?", (consultation_id,))
                        db.execute(
                            "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                            (user["id"], "cancelled", "consultation", consultation_id, now_iso()),
                        )
                        self.json({"ok": True})
                        return
                    settings = jitsi_settings()
                    if not settings:
                        self.json({"error": "Video consultation is not configured. Contact an administrator."}, 503)
                        return
                    if action == "invite":
                        db.execute(
                            "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                            (user["id"], "generated_guest_link", "consultation", consultation_id, now_iso()),
                        )
                        self.json({"guest_url": f"https://{settings['domain']}/{row['room_name']}"})
                        return
                    token, expires_at = make_jitsi_token(settings, row["room_name"])
                    db.execute(
                        "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                        (user["id"], "joined", "consultation", consultation_id, now_iso()),
                    )
                self.json({
                    "domain": settings["domain"],
                    "room_name": row["room_name"],
                    "jwt": token,
                    "expires_at": expires_at,
                })
                return
            if path == "/api/patients":
                data = self.body()
                name = clean(data, "name", 120, required=True); village = clean(data, "village", 120, required=True)
                age = int(data.get("age", 0))
                if age < 1 or age > 120: raise ValueError("Age must be between 1 and 120.")
                if data.get("consent") is not True: raise ValueError("Patient consent is required.")
                phone = clean(data, "phone", 24)
                if phone and not all(ch.isdigit() or ch in "+ -()" for ch in phone): raise ValueError("Enter a valid mobile number.")
                identity_key = patient_identity_key(name, age, village, phone)
                with connect() as db:
                    # Acquire SQLite's write reservation before checking so
                    # concurrent submissions cannot both pass the lookup.
                    db.execute("BEGIN IMMEDIATE")
                    dupe = db.execute("SELECT patient_code FROM patients WHERE identity_key=? LIMIT 1", (identity_key,)).fetchone()
                    if dupe:
                        self.json({"error": "A record with this name, age, village and mobile number already exists.", "duplicate": dupe["patient_code"]}, 409); return
                    pid = str(uuid.uuid4()); code = f"AD-{date.today().year}-{secrets.token_hex(3).upper()}"; created = now_iso()
                    try:
                        db.execute("INSERT INTO patients(id,patient_code,name,age,gender,phone,village,district,history,symptoms,identity_key,consent,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                                   (pid,code,name,age,clean(data,"gender",30),phone,village,clean(data,"district",120),clean(data,"history",4000),clean(data,"symptoms",4000),identity_key,1,user["id"],created))
                    except sqlite3.IntegrityError:
                        # The unique index is the final guard if another writer
                        # bypasses this request's duplicate lookup.
                        dupe = db.execute("SELECT patient_code FROM patients WHERE identity_key=? LIMIT 1", (identity_key,)).fetchone()
                        if dupe:
                            self.json({"error": "A record with this name, age, village and mobile number already exists.", "duplicate": dupe["patient_code"]}, 409); return
                        raise
                    db.execute("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"],"created","patient",pid,created))
                    patient = dict(db.execute("SELECT * FROM patients WHERE id=?", (pid,)).fetchone())
                self.json({"patient": patient}, 201); return
            if path == "/api/screenings":
                user = self.require_user({"health_worker", "medical_officer"})
                if not user: return
                ctype = self.headers.get("Content-Type", "")
                if not ctype.startswith("multipart/form-data;"):
                    self.json({"error": "Screening must be submitted as a multipart image upload."}, 415); return
                request_length = int(self.headers.get("Content-Length", "0"))
                if not request_length or request_length > MAX_REQUEST: raise ValueError("The uploaded image is too large.")
                raw = self.rfile.read(request_length)
                boundary = ctype.split("boundary=",1)[1].strip().strip('"').encode()
                fields, image = parse_multipart(raw, boundary)
                patient_id = fields.get("patient_id", "")
                with connect() as db:
                    if not db.execute("SELECT 1 FROM patients WHERE id=?", (patient_id,)).fetchone(): raise ValueError("Choose a registered patient.")
                    if not image or len(image) > MAX_IMAGE: raise ValueError("Choose an image smaller than 7 MB.")
                    info = image_info(image)
                    if not info: raise ValueError("Image is not a supported JPEG, PNG or WebP file.")
                    mime, width, height = info
                    if min(width, height) < 240 or width * height > 20_000_000: raise ValueError("Image dimensions must be at least 240 pixels on each side and no more than 20 megapixels.")
                    sid = str(uuid.uuid4()); filename = sid + (".jpg" if mime=="image/jpeg" else ".png" if mime=="image/png" else ".webp")
                    (UPLOAD_DIR / filename).write_bytes(image); created=now_iso()
                    db.execute("INSERT INTO screenings(id,patient_id,worker,location,duration,notes,image_name,image_type,image_bytes,image_width,image_height,created_by,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)",
                               (sid,patient_id,clean(fields,"worker",120,required=True),clean(fields,"location",80),clean(fields,"duration",120),clean(fields,"notes",2000),filename,mime,len(image),width,height,user["id"],created))
                    db.execute("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)", (user["id"],"created","screening",sid,created))
                    row=db.execute("SELECT s.*,p.patient_code,p.name patient_name FROM screenings s JOIN patients p ON p.id=s.patient_id WHERE s.id=?", (sid,)).fetchone()
                self.json({"screening":dict(row),"quality":{"accepted":True,"width":width,"height":height,"bytes":len(image),"note":"Format and image dimensions checked. Blur, lighting and clinical relevance require human review."}},201); return
            if path == "/api/reviews":
                user = self.require_user({"medical_officer", "specialist"})
                if not user: return
                data=self.body(); patient_id=clean(data,"patient_id",40,required=True)
                status=clean(data,"status",80,required=True); observations=clean(data,"observations",5000,required=True)
                with connect() as db:
                    if not db.execute("SELECT 1 FROM patients WHERE id=?",(patient_id,)).fetchone(): raise ValueError("Choose a registered patient.")
                    rid=str(uuid.uuid4()); created=now_iso()
                    db.execute("INSERT INTO reviews(id,patient_id,reviewer,status,observations,created_by,created_at) VALUES(?,?,?,?,?,?,?)",(rid,patient_id,clean(data,"reviewer",120,required=True),status,observations,user["id"],created))
                    db.execute("UPDATE screenings SET status='Reviewed' WHERE patient_id=? AND status='Awaiting clinical review'",(patient_id,))
                    db.execute("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",(user["id"],"created","review",rid,created))
                    row=db.execute("SELECT r.*,p.patient_code,p.name patient_name FROM reviews r JOIN patients p ON p.id=r.patient_id WHERE r.id=?",(rid,)).fetchone()
                self.json({"review":dict(row)},201); return
            if path in ("/api/referrals", "/api/followups"):
                data=self.body(); pid=clean(data,"patient_id",40,required=True); created=now_iso(); eid=str(uuid.uuid4())
                with connect() as db:
                    if not db.execute("SELECT 1 FROM patients WHERE id=?",(pid,)).fetchone(): raise ValueError("Choose a registered patient.")
                    if path.endswith("referrals"):
                        if user["role"] not in {"admin","medical_officer","specialist"}: self.json({"error":"Only clinical staff can create a referral."},403); return
                        values=(clean(data,"facility",180,required=True),clean(data,"department",120),clean(data,"reason",3000,required=True),clean(data,"appointment_date",20))
                        if values[3] and not valid_date(values[3]): raise ValueError("Choose a valid appointment date.")
                        db.execute("INSERT INTO referrals(id,patient_id,facility,department,reason,appointment_date,created_by,created_at) VALUES(?,?,?,?,?,?,?,?)",(eid,pid,*values,user["id"],created)); kind="referral"
                        row=db.execute("SELECT r.*,p.patient_code,p.name patient_name FROM referrals r JOIN patients p ON p.id=r.patient_id WHERE r.id=?",(eid,)).fetchone()
                    else:
                        due=clean(data,"due_date",20,required=True)
                        if not valid_date(due): raise ValueError("Choose a valid follow-up date.")
                        db.execute("INSERT INTO followups(id,patient_id,due_date,notes,created_by,created_at) VALUES(?,?,?,?,?,?)",(eid,pid,due,clean(data,"notes",2000),user["id"],created)); kind="followup"
                        row=db.execute("SELECT f.*,p.patient_code,p.name patient_name FROM followups f JOIN patients p ON p.id=f.patient_id WHERE f.id=?",(eid,)).fetchone()
                    db.execute("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",(user["id"],"created",kind,eid,created))
                self.json({kind:dict(row)},201); return
            if path == "/api/ai/analyze":
                if not medgemma_runtime.status()["available"]:
                    self.json({"error":"AI analysis is unavailable: no trained, validated model is installed. No prediction was made."},503); return
                user = self.require_user({"medical_officer", "specialist"})
                if not user: return
                data = self.body()
                if data.get("acknowledge_experimental") is not True:
                    raise ValueError("Acknowledge that the generated output is experimental and unvalidated.")
                sid = clean(data, "screening_id", 40, required=True)
                with connect() as db:
                    row = db.execute("SELECT image_name FROM screenings WHERE id=?", (sid,)).fetchone()
                if not row:
                    self.json({"error": "Screening not found."}, 404); return
                image_path = (UPLOAD_DIR / row["image_name"]).resolve()
                if image_path.parent != UPLOAD_DIR or not image_path.is_file():
                    self.json({"error": "Screening image unavailable."}, 404); return
                try:
                    result = medgemma_runtime.analyze(image_path)
                except medgemma_runtime.InferenceUnavailable as exc:
                    self.json({"error": str(exc)}, 503); return
                self.audit(user, "generated_experimental_observations", "screening", sid)
                self.json(result); return
            self.json({"error":"Not found."},404)
        except (ValueError, json.JSONDecodeError, UnicodeDecodeError) as exc:
            self.json({"error":str(exc)},400)
        except sqlite3.IntegrityError:
            self.json({"error":"The record could not be saved because of a data integrity conflict."},409)
        except Exception as exc:
            print("Request failed:", type(exc).__name__)
            self.json({"error":"The request failed. No record was confirmed as saved."},500)

    def do_HEAD(self):
        self.send_error(405)


def clean(data, key, maximum, required=False):
    value = str(data.get(key, "")).strip()
    if len(value) > maximum: raise ValueError(f"{key.replace('_',' ').capitalize()} is too long.")
    if required and not value: raise ValueError(f"{key.replace('_',' ').capitalize()} is required.")
    return value


def valid_date(value):
    try: date.fromisoformat(value); return True
    except ValueError: return False


def parse_multipart(raw, boundary):
    fields={}; image=b""
    if not boundary or len(boundary)>200: raise ValueError("Invalid upload request.")
    for part in raw.split(b"--"+boundary):
        if not part or part in (b"--\r\n",b"--"): continue
        head, sep, content = part.lstrip(b"\r\n").partition(b"\r\n\r\n")
        if not sep: continue
        content=content.removesuffix(b"\r\n").removesuffix(b"--\r\n")
        disposition=next((line for line in head.split(b"\r\n") if line.lower().startswith(b"content-disposition:")),b"").decode("latin1")
        import re
        name=re.search(r'name="([^"]+)"',disposition); filename=re.search(r'filename="([^"]*)"',disposition)
        if not name: continue
        if filename:
            if filename.group(1): image=content
        else: fields[name.group(1)]=content.decode("utf-8","replace")
    return fields,image


def create_user(username, password, role, display_name):
    if role not in ROLES: raise SystemExit(f"Role must be one of: {', '.join(sorted(ROLES))}")
    if len(password)<12: raise SystemExit("Password must contain at least 12 characters.")
    init_db()
    with connect() as db:
        try:
            db.execute("INSERT INTO users(id,username,password_hash,role,display_name,created_at) VALUES(?,?,?,?,?,?)",
                       (str(uuid.uuid4()),username.strip().lower(),pw_hash(password),role,display_name.strip() or username,now_iso()))
        except sqlite3.IntegrityError:
            raise SystemExit("That username already exists.")


def main():
    parser=argparse.ArgumentParser(description="Run the Aarogya Drishti local prototype")
    parser.add_argument("--create-user",action="store_true",help="Create a local account")
    parser.add_argument("--username"); parser.add_argument("--role",choices=sorted(ROLES),default="admin"); parser.add_argument("--display-name",default="")
    parser.add_argument("--host",default="127.0.0.1"); parser.add_argument("--port",type=int,default=8000)
    args=parser.parse_args()
    init_db()
    if args.create_user:
        if not args.username: parser.error("--create-user requires --username")
        password=getpass("Choose a password (12+ characters): ")
        confirmation=getpass("Confirm password: ")
        if password != confirmation: raise SystemExit("Passwords did not match.")
        create_user(args.username,password,args.role,args.display_name); print("User created."); return
    try: session_secret()
    except RuntimeError as exc: raise SystemExit(str(exc))
    print(f"Aarogya Drishti available at http://{args.host}:{args.port} (local evaluation only)")
    ThreadingHTTPServer((args.host,args.port),Handler).serve_forever()


if __name__=="__main__": main()
