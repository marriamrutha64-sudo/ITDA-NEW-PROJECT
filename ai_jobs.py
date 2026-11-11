"""One bounded background AI job, with durable status and actual output provenance."""
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import re
import threading
import uuid

import clinical_records
import medgemma_runtime
import role_visibility


_active = threading.Lock()


def is_busy():
    return _active.locked()


def init_schema(db):
    """Call once at application startup, never while servicing a request.

    Daemon threads cannot survive a process restart. Persisted unfinished jobs
    are explicitly interrupted rather than being presented as still running.
    """
    db.execute("""CREATE TABLE IF NOT EXISTS ai_jobs(
      id TEXT PRIMARY KEY, screening_id TEXT NOT NULL REFERENCES screenings(id),
      created_by TEXT NOT NULL REFERENCES users(id),
      status TEXT NOT NULL CHECK(status IN ('queued','running','succeeded','failed','interrupted')),
      result_json TEXT, error TEXT, created_at TEXT NOT NULL, started_at TEXT, completed_at TEXT)""")
    db.execute("CREATE INDEX IF NOT EXISTS ai_jobs_actor_created ON ai_jobs(created_by,created_at DESC)")
    db.execute(
        "UPDATE ai_jobs SET status='interrupted',result_json=NULL,error=?,completed_at=? WHERE status IN ('queued','running')",
        ("The application restarted before this job finished. Submit a new job to retry.", datetime.now(timezone.utc).isoformat()),
    )


def _job(row):
    record = dict(row)
    record["result"] = json.loads(record.pop("result_json")) if record.get("result_json") else None
    if isinstance(record["result"], dict):
        record["result"].update(medgemma_runtime.assess_output(record["result"].get("text")))
    record.pop("result_json", None)
    return record


def _fail(runtime, job_id, error):
    with runtime.connect() as db:
        db.execute(
            "UPDATE ai_jobs SET status='failed',error=?,result_json=NULL,completed_at=? WHERE id=?",
            (error, runtime.now_iso(), job_id),
        )


def _run(runtime, user, job_id, screening_id, image_path):
    try:
        with runtime.connect() as db:
            started = db.execute("UPDATE ai_jobs SET status='running',started_at=? WHERE id=? AND status='queued'", (runtime.now_iso(), job_id))
            if not started.rowcount:
                return
        result = runtime.medgemma_runtime.analyze(image_path)
        # Successful result and generation audit share the job's final transaction.
        with runtime.connect() as db:
            saved = clinical_records.record_ai_inference(db, user, screening_id, result, runtime)
            result = {**result, "validated": False, "inference_id": saved["id"], "inference_audit_id": saved["inference_audit_id"]}
            db.execute(
                "UPDATE ai_jobs SET status='succeeded',result_json=?,error=NULL,completed_at=? WHERE id=?",
                (json.dumps(result, ensure_ascii=False), runtime.now_iso(), job_id),
            )
    except Exception as error:
        unavailable = getattr(runtime.medgemma_runtime, "InferenceUnavailable", ())
        message = str(error)[:2000] if isinstance(error, unavailable) else "Local AI processing failed. No inference result was confirmed as saved."
        try:
            _fail(runtime, job_id, message)
        except Exception as storage_error:
            # Avoid printing image paths, generated text or patient information.
            print("AI job status persistence failed:", type(storage_error).__name__)
    finally:
        _active.release()


def _allowed(handler, user):
    if not user:
        handler.json({"error": "Sign in to continue."}, 401)
        return False
    if user["role"] not in clinical_records.CLINICAL_ROLES:
        handler.json({"error": "Only clinical staff can run or view experimental AI jobs."}, 403)
        return False
    return True


def handle_get(handler, user, path, runtime):
    if path == "/api/ai/jobs":
        if not _allowed(handler, user):
            return True
        from urllib.parse import parse_qs, urlparse
        screening_ids = parse_qs(urlparse(handler.path).query).get("screening_id", [])
        if len(screening_ids) != 1 or not screening_ids[0] or len(screening_ids[0]) > 40:
            handler.json({"error": "Choose a valid screening."}, 400)
            return True
        # Resume only the signed-in clinician's own job. Other clinicians may
        # access saved inferences through the separate clinical result route.
        with runtime.connect() as db:
            if not role_visibility.can_view_screening(db, user, screening_ids[0]):
                handler.json({"error": "Screening not found."}, 404)
                return True
            row = db.execute(
                "SELECT * FROM ai_jobs WHERE screening_id=? AND created_by=? "
                "ORDER BY created_at DESC,rowid DESC LIMIT 1",
                (screening_ids[0], user["id"]),
            ).fetchone()
        handler.json({"job": _job(row) if row else None})
        return True
    match = re.fullmatch(r"/api/ai/jobs/([^/]+)", path)
    if not match:
        return False
    if not _allowed(handler, user):
        return True
    job_id = match.group(1)
    with runtime.connect() as db:
        row = db.execute("SELECT * FROM ai_jobs WHERE id=?", (job_id,)).fetchone() if len(job_id) <= 40 else None
        visible = bool(row and role_visibility.can_view_screening(db, user, row["screening_id"]))
    if not visible or (row["created_by"] != user["id"] and user["role"] != "admin"):
        handler.json({"error": "AI job not found."}, 404)
        return True
    handler.json({"job": _job(row)})
    return True


def handle_post(handler, user, path, runtime):
    if path != "/api/ai/jobs":
        return False
    if not _allowed(handler, user):
        return True
    data = handler.body()
    if data.get("acknowledge_experimental") is not True:
        raise ValueError("Acknowledge that generated observations are experimental and unvalidated.")
    if os.environ.get("AAROGYA_AI_PROVIDER", "local") == "gemini" and data.get("acknowledge_google_transfer") is not True:
        raise ValueError("Confirm sending the screening photograph to Google Gemini before requesting analysis.")
    screening_id = runtime.clean(data, "screening_id", 40, required=True)
    with runtime.connect() as db:
        row = db.execute("SELECT image_name FROM screenings WHERE id=?", (screening_id,)).fetchone()
        if row and not role_visibility.can_view_screening(db, user, screening_id):
            row = None
    if not row:
        handler.json({"error": "Screening not found."}, 404)
        return True
    upload_dir = Path(runtime.UPLOAD_DIR).resolve()
    image_path = (upload_dir / row["image_name"]).resolve()
    if image_path.parent != upload_dir or not image_path.is_file():
        handler.json({"error": "Screening image unavailable."}, 404)
        return True
    status = runtime.medgemma_runtime.status()
    if not status.get("available"):
        handler.json({"error": "AI analysis is unavailable. No job or prediction was created."}, 503)
        return True
    if not _active.acquire(blocking=False):
        handler.json({"error": "An AI job is already running. Retry after it finishes."}, 429, {"Retry-After": "5"})
        return True
    job_id, created = str(uuid.uuid4()), runtime.now_iso()
    try:
        with runtime.connect() as db:
            db.execute("INSERT INTO ai_jobs(id,screening_id,created_by,status,created_at) VALUES(?,?,?,'queued',?)", (job_id, screening_id, user["id"], created))
            db.execute(
                "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
                (user["id"], "queued", "ai_job", job_id, created),
            )
        worker = threading.Thread(target=_run, args=(runtime, dict(user), job_id, screening_id, image_path), daemon=True, name="aarogya-ai-job")
        worker.start()
    except Exception:
        try:
            _fail(runtime, job_id, "The AI worker could not start. Submit a new job to retry.")
        finally:
            _active.release()
        raise
    handler.json({"job": {"id": job_id, "screening_id": screening_id, "status": "queued", "created_at": created}}, 202)
    return True
