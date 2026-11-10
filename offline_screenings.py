"""Authenticated, idempotent synchronization of encrypted offline photo captures.

The browser vault owns encryption at rest. This endpoint accepts a decrypted
multipart capture only over the app's authenticated same-origin connection.
"""
from __future__ import annotations

import hashlib
import json
import re
import uuid
from datetime import datetime, timedelta, timezone
from email.parser import BytesParser
from email.policy import default


PATH = "/api/offline/screenings"
OPERATION_ID = re.compile(r"[0-9a-f]{32}\Z")
ALLOWED_FIELDS = {"operation_id", "patient_id", "patient_operation_id", "worker", "location", "duration", "notes", "captured_at"}


class SyncError(ValueError):
    def __init__(self, message, status=400):
        super().__init__(message)
        self.status = status


def ensure_schema(db):
    """May also be called from app.init_db; safe inside an immediate transaction."""
    db.execute("""CREATE TABLE IF NOT EXISTS offline_screening_receipts(
      actor_id TEXT NOT NULL REFERENCES users(id), operation_id TEXT NOT NULL,
      payload_hash TEXT NOT NULL, response_json TEXT NOT NULL, created_at TEXT NOT NULL,
      PRIMARY KEY(actor_id, operation_id)
    )""")
    if "captured_at" not in {row["name"] for row in db.execute("PRAGMA table_info(screenings)")}:
        db.execute("ALTER TABLE screenings ADD COLUMN captured_at TEXT NOT NULL DEFAULT ''")


def parse_upload(handler, runtime):
    content_type = handler.headers.get("Content-Type", "")
    if "\r" in content_type or "\n" in content_type:
        raise SyncError("Invalid upload request.")
    header = BytesParser(policy=default).parsebytes(("Content-Type: " + content_type + "\r\n\r\n").encode("ascii"))
    boundary = header.get_boundary()
    if header.get_content_type() != "multipart/form-data":
        raise SyncError("Screening synchronization requires a multipart image upload.", 415)
    if not boundary or len(boundary) > 200 or not boundary.isascii():
        raise SyncError("Invalid upload boundary.")
    try:
        length = int(handler.headers.get("Content-Length", "0"))
    except ValueError as exc:
        raise SyncError("Invalid upload size.") from exc
    if length <= 0 or length > runtime.MAX_REQUEST:
        raise SyncError("The uploaded image is too large.", 413)
    read_body = getattr(handler, "read_request_body", handler.rfile.read)
    raw = read_body(length)
    if len(raw) != length:
        raise SyncError("The upload was incomplete.")
    message = BytesParser(policy=default).parsebytes(
        ("Content-Type: " + content_type + "\r\nMIME-Version: 1.0\r\n\r\n").encode("ascii") + raw
    )
    if not message.is_multipart() or message.defects:
        raise SyncError("Invalid multipart upload.")
    fields, image = {}, None
    for part in message.iter_parts():
        if part.is_multipart() or part.defects or part.get_content_disposition() != "form-data":
            raise SyncError("Invalid upload part.")
        name = part.get_param("name", header="content-disposition")
        payload = part.get_payload(decode=True)
        if name == "image":
            if image is not None or part.get_filename() is None:
                raise SyncError("Provide exactly one screening image.")
            image = payload
        elif name in ALLOWED_FIELDS and part.get_filename() is None:
            if name in fields:
                raise SyncError("Duplicate upload fields are not allowed.")
            if payload is None or len(payload) > 12_000:
                raise SyncError("Upload field is too long.")
            fields[name] = payload.decode("utf-8")
        else:
            raise SyncError("Unexpected upload field.")
    if not image or len(image) > runtime.MAX_IMAGE:
        raise SyncError("Choose an image smaller than 7 MB.")
    return fields, image


def validate_fields(fields, image, runtime):
    operation_id = fields.get("operation_id", "").strip().lower()
    if not OPERATION_ID.fullmatch(operation_id):
        raise SyncError("A valid screening operation ID is required.")
    patient_id = runtime.clean(fields, "patient_id", 40)
    patient_operation_id = runtime.clean(fields, "patient_operation_id", 32).lower()
    if bool(patient_id) == bool(patient_operation_id):
        raise SyncError("Choose one patient or one pending patient registration.")
    if patient_operation_id and not OPERATION_ID.fullmatch(patient_operation_id):
        raise SyncError("Invalid pending patient registration ID.")
    captured_at = runtime.clean(fields, "captured_at", 64, required=True)
    try:
        captured = datetime.fromisoformat(captured_at.replace("Z", "+00:00"))
    except ValueError as exc:
        raise SyncError("Capture time must include a valid date and time zone.") from exc
    if captured.tzinfo is None or captured.utcoffset() is None:
        raise SyncError("Capture time must include a time zone.")
    captured = captured.astimezone(timezone.utc)
    if captured > datetime.now(timezone.utc) + timedelta(minutes=10):
        raise SyncError("Capture time is in the future. Check this device's clock.")
    info = runtime.image_info(image)
    if not info:
        raise SyncError("Image is not a supported JPEG, PNG or WebP file.")
    mime, width, height = info
    if min(width, height) < 240 or width * height > 20_000_000:
        raise SyncError("Image dimensions must be at least 240 pixels on each side and no more than 20 megapixels.")
    values = {
        "type": "screening-capture-v1", "patient_id": patient_id,
        "patient_operation_id": patient_operation_id,
        "worker": runtime.clean(fields, "worker", 120, required=True),
        "location": runtime.clean(fields, "location", 80),
        "duration": runtime.clean(fields, "duration", 120),
        "notes": runtime.clean(fields, "notes", 2000),
        "captured_at": captured.isoformat(timespec="milliseconds"),
        "image_sha256": hashlib.sha256(image).hexdigest()
    }
    payload_hash = hashlib.sha256(json.dumps(values, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
    return operation_id, values, payload_hash, (mime, width, height)


def resolve_patient(db, user, values):
    patient_id = values["patient_id"]
    if not patient_id:
        receipt = db.execute(
            "SELECT response_json FROM offline_sync_receipts WHERE actor_id=? AND operation_id=?",
            (user["id"], values["patient_operation_id"]),
        ).fetchone()
        if not receipt:
            raise SyncError("Synchronize this patient's registration with the same account before its photograph.", 409)
        try:
            patient_id = json.loads(receipt["response_json"])["patient"]["id"]
        except (KeyError, TypeError, json.JSONDecodeError) as exc:
            raise SyncError("The patient registration acknowledgement could not be resolved.", 409) from exc
    patient = db.execute("SELECT id,created_by,consent FROM patients WHERE id=?", (patient_id,)).fetchone()
    if not patient or patient["created_by"] != user["id"]:
        raise SyncError("This account cannot synchronize a photograph for the selected patient.", 403)
    if patient["consent"] != 1:
        raise SyncError("Patient consent is required before synchronizing a photograph.", 403)
    return patient_id


def save_capture(user, operation_id, values, payload_hash, image, info, runtime):
    saved_path, committed = None, False
    response, status = None, 201
    try:
        with runtime.connect() as db:
            db.execute("BEGIN IMMEDIATE")
            ensure_schema(db)
            receipt = db.execute(
                "SELECT payload_hash,response_json FROM offline_screening_receipts WHERE actor_id=? AND operation_id=?",
                (user["id"], operation_id),
            ).fetchone()
            if receipt:
                if receipt["payload_hash"] != payload_hash:
                    raise SyncError("This operation ID was already used for a different screening payload or image.", 409)
                response, status = json.loads(receipt["response_json"]), 200
            else:
                patient_id = resolve_patient(db, user, values)
                sid, created = str(uuid.uuid4()), runtime.now_iso()
                mime, width, height = info
                filename = sid + {"image/jpeg": ".jpg", "image/png": ".png", "image/webp": ".webp"}[mime]
                candidate_path = runtime.UPLOAD_DIR / filename
                with candidate_path.open("xb") as output:
                    saved_path = candidate_path
                    output.write(image)
                db.execute(
                    "INSERT INTO screenings(id,patient_id,worker,location,duration,notes,image_name,image_type,image_bytes,image_width,image_height,created_by,created_at,captured_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (sid, patient_id, values["worker"], values["location"], values["duration"], values["notes"],
                     filename, mime, len(image), width, height, user["id"], created, values["captured_at"]),
                )
                db.execute("INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                           (user["id"], "created_from_offline_capture", "screening", sid, created))
                response = {
                    "ok": True, "operation_id": operation_id,
                    "screening": {"id": sid, "patient_id": patient_id, "created_at": created, "captured_at": values["captured_at"]},
                    "quality": {"accepted": True, "width": width, "height": height, "bytes": len(image),
                                "note": "Format headers and image dimensions checked. Lighting, focus and clinical relevance require human review."},
                }
                db.execute("INSERT INTO offline_screening_receipts(actor_id,operation_id,payload_hash,response_json,created_at) VALUES(?,?,?,?,?)",
                           (user["id"], operation_id, payload_hash, json.dumps(response, ensure_ascii=False, separators=(",", ":")), created))
        committed = True
    finally:
        if saved_path is not None and not committed:
            saved_path.unlink(missing_ok=True)
    return response, status


def handle_post(handler, user, path, runtime):
    """Return False for another route; True after responding to this route.

    runtime is the actual app module, providing connect/clean/image_info/limits.
    Invoke after the app's require_user() guard, before its other POST routes.
    """
    if path != PATH:
        return False
    try:
        if not handler.headers.get("Origin") or not handler.same_origin():
            raise SyncError("A same-origin Origin header is required for offline synchronization.", 403)
        if not user:
            raise SyncError("Sign in to synchronize photographs.", 401)
        if user["role"] != "health_worker":
            raise SyncError("Only health workers can synchronize offline photographs.", 403)
        fields, image = parse_upload(handler, runtime)
        operation_id, values, payload_hash, info = validate_fields(fields, image, runtime)
        header_key = handler.headers.get("Idempotency-Key")
        if header_key is not None and header_key.strip().lower() != operation_id:
            raise SyncError("The operation ID does not match the idempotency header.")
        response, status = save_capture(user, operation_id, values, payload_hash, image, info, runtime)
        handler.json(response, status)
    except (SyncError, UnicodeDecodeError, UnicodeEncodeError) as exc:
        handler.json({"error": str(exc)}, getattr(exc, "status", 400))
    except ValueError as exc:
        handler.json({"error": str(exc)}, 400)
    return True
