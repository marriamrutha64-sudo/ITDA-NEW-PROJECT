"""Clinician-entered care journey records; this module generates no medical advice."""
from datetime import date, datetime, timezone
import re
import uuid
import json
import medgemma_runtime
import role_visibility


CLINICAL_ROLES = {"admin", "medical_officer", "specialist"}
DIAGNOSTIC_TYPES = {"biopsy", "histopathology", "blood_test", "imaging", "other"}
DIAGNOSTIC_STATUSES = {"ordered", "scheduled", "collected", "processing", "reported", "cancelled"}
TREATMENT_STAGES = {"assessment", "investigation", "treatment", "recovery", "surveillance"}
TREATMENT_STATUSES = {"planned", "active", "completed", "paused", "stopped"}
ESCALATION_STATUSES = {"requested", "accepted", "in_review", "resolved", "cancelled"}
AI_DISPOSITIONS = {"accepted", "disagreed", "insufficient", "independent"}
POST_ROUTES = {
    "/api/diagnostics": ("diagnostics", "diagnostic"),
    "/api/treatments": ("treatments", "treatment"),
    "/api/escalations": ("escalations", "escalation"),
    "/api/ai-reviews": ("ai_reviews", "ai_review"),
}


def init_schema(db):
    """Idempotently extend an existing app database within its caller's transaction."""
    statements = (
        """CREATE TABLE IF NOT EXISTS diagnostics(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
          test_type TEXT NOT NULL CHECK(test_type IN ('biopsy','histopathology','blood_test','imaging','other')),
          ordered_at TEXT NOT NULL, status TEXT NOT NULL CHECK(status IN ('ordered','scheduled','collected','processing','reported','cancelled')),
          facility TEXT NOT NULL DEFAULT '', result_summary TEXT NOT NULL DEFAULT '', report_note TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS treatments(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), plan TEXT NOT NULL,
          stage TEXT NOT NULL CHECK(stage IN ('assessment','investigation','treatment','recovery','surveillance')),
          status TEXT NOT NULL CHECK(status IN ('planned','active','completed','paused','stopped')),
          next_review_date TEXT NOT NULL DEFAULT '', notes TEXT NOT NULL DEFAULT '',
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS escalations(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id), specialty TEXT NOT NULL,
          reason TEXT NOT NULL, priority TEXT NOT NULL CHECK(priority IN ('routine','urgent')),
          status TEXT NOT NULL CHECK(status IN ('requested','accepted','in_review','resolved','cancelled')),
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL)""",
        """CREATE TABLE IF NOT EXISTS ai_reviews(
          id TEXT PRIMARY KEY, patient_id TEXT NOT NULL REFERENCES patients(id),
          screening_id TEXT REFERENCES screenings(id), inference_audit_id INTEGER REFERENCES audit_log(id),
          disposition TEXT NOT NULL CHECK(disposition IN ('accepted','disagreed','insufficient','independent')),
          reason TEXT NOT NULL, assessment TEXT NOT NULL,
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL,
          CHECK((disposition='independent' AND inference_audit_id IS NULL) OR
                (disposition!='independent' AND screening_id IS NOT NULL AND inference_audit_id IS NOT NULL)))""",
        """CREATE TABLE IF NOT EXISTS ai_inferences(
          id TEXT PRIMARY KEY, screening_id TEXT NOT NULL REFERENCES screenings(id), text TEXT NOT NULL,
          model TEXT NOT NULL, notice TEXT NOT NULL, validated INTEGER NOT NULL DEFAULT 0 CHECK(validated=0),
          inference_audit_id INTEGER UNIQUE NOT NULL REFERENCES audit_log(id),
          created_by TEXT NOT NULL REFERENCES users(id), created_at TEXT NOT NULL)""",
    )
    for statement in statements:
        db.execute(statement)
    for table in ("diagnostics", "treatments", "escalations", "ai_reviews"):
        db.execute(f"CREATE INDEX IF NOT EXISTS {table}_patient_created ON {table}(patient_id,created_at DESC)")
    for table in ("diagnostics", "treatments", "escalations"):
        columns = {row[1] for row in db.execute(f"PRAGMA table_info({table})")}
        if "previous_id" not in columns:
            db.execute(f"ALTER TABLE {table} ADD COLUMN previous_id TEXT REFERENCES {table}(id)")
        if "series_id" not in columns:
            db.execute(f"ALTER TABLE {table} ADD COLUMN series_id TEXT")
        db.execute(f"UPDATE {table} SET series_id=id WHERE series_id IS NULL")
    db.execute("CREATE INDEX IF NOT EXISTS ai_inferences_screening_created ON ai_inferences(screening_id,created_at DESC)")
    if "runtime_json" not in {row[1] for row in db.execute("PRAGMA table_info(ai_inferences)")}:
        db.execute("ALTER TABLE ai_inferences ADD COLUMN runtime_json TEXT NOT NULL DEFAULT '{}'")


def _text(data, key, maximum, required=False, default=""):
    value = data.get(key, default)
    if not isinstance(value, str):
        raise ValueError(f"{key.replace('_', ' ').capitalize()} must be text.")
    value = value.strip()
    if required and not value:
        raise ValueError(f"{key.replace('_', ' ').capitalize()} is required.")
    if len(value) > maximum:
        raise ValueError(f"{key.replace('_', ' ').capitalize()} is too long.")
    return value


def _choice(data, key, choices, default=""):
    value = _text(data, key, 80, required=True, default=default)
    if value not in choices:
        raise ValueError(f"Choose a valid {key.replace('_', ' ')}.")
    return value


def _date(data, key, required=False, allow_timestamp=False):
    value = _text(data, key, 40, required=required)
    if not value:
        return ""
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            return date.fromisoformat(value).isoformat()
        if allow_timestamp:
            parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
            if parsed.tzinfo is not None:
                return parsed.astimezone(timezone.utc).isoformat()
    except ValueError:
        pass
    suffix = " or a timezone-qualified ISO timestamp" if allow_timestamp else ""
    raise ValueError(f"{key.replace('_', ' ').capitalize()} must be YYYY-MM-DD{suffix}.")


def _patient(db, patient_id, user):
    row = db.execute("SELECT id,created_by FROM patients WHERE id=?", (patient_id,)).fetchone()
    if not row or not role_visibility.can_view_patient(db, user, patient_id):
        return None
    return row


def _record_rows(db, table, patient_id):
    records = [dict(row) for row in db.execute(
        f"SELECT r.*,u.display_name AS clinician_name FROM {table} r "
        "JOIN users u ON u.id=r.created_by WHERE r.patient_id=? ORDER BY r.created_at DESC,r.rowid DESC",
        (patient_id,),
    ).fetchall()]
    if table == "ai_reviews":
        for record in records:
            _attach_inference(db, record)
    return records


def _inference(row):
    record = dict(row)
    record["validated"] = False
    record["runtime"] = json.loads(record.pop("runtime_json", "{}"))
    record.update(medgemma_runtime.assess_output(record.get("text")))
    return record


def _attach_inference(db, review):
    source = None
    if review["inference_audit_id"] is not None:
        source = db.execute(
            "SELECT id,screening_id,text,model,notice,validated,created_at,inference_audit_id,runtime_json "
            "FROM ai_inferences WHERE inference_audit_id=? AND screening_id=?",
            (review["inference_audit_id"], review["screening_id"]),
        ).fetchone()
    review["inference"] = _inference(source) if source else None
    review["source_text_available"] = bool(source)
    review["source_status"] = "saved" if source else (
        "independent" if review["disposition"] == "independent" else "historical_text_unavailable"
    )


def record_ai_inference(db, user, screening_id, result, runtime):
    """Save only a successful server-produced result and its audit event atomically.

    The caller owns the outer transaction. This helper never runs a model or
    manufactures observations, and must not be exposed as a client POST endpoint.
    """
    if user["role"] not in CLINICAL_ROLES:
        raise ValueError("Only clinical staff can record a model inference.")
    text = _text(result, "text", 12000, required=True)
    model = _text(result, "model", 240, required=True)
    notice = _text(result, "notice", 2000, required=True)
    runtime_json = json.dumps({"model_revision":result.get("model_revision"),
                               "execution":result.get("execution", {}),
                               "truncated":result.get("truncated") is True}, ensure_ascii=False)
    if len(runtime_json) > 12000:
        raise ValueError("Inference execution metadata is too long.")
    if not db.in_transaction:
        db.execute("BEGIN IMMEDIATE")
    if not role_visibility.can_view_screening(db, user, screening_id):
        raise ValueError("Choose a registered screening.")
    record_id, created = str(uuid.uuid4()), runtime.now_iso()
    db.execute("SAVEPOINT save_ai_inference")
    try:
        audit = db.execute(
            "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
            (user["id"], "generated_experimental_observations", "screening", screening_id, created),
        )
        audit_id = audit.lastrowid
        db.execute(
            "INSERT INTO ai_inferences(id,screening_id,text,model,notice,validated,inference_audit_id,created_by,created_at,runtime_json) VALUES(?,?,?,?,?,0,?,?,?,?)",
            (record_id, screening_id, text, model, notice, audit_id, user["id"], created, runtime_json),
        )
        db.execute("RELEASE SAVEPOINT save_ai_inference")
    except Exception:
        db.execute("ROLLBACK TO SAVEPOINT save_ai_inference")
        db.execute("RELEASE SAVEPOINT save_ai_inference")
        raise
    return {"id": record_id, "inference_audit_id": audit_id}


def _summary(records):
    return {"count": len(records), "status": records[0]["status"] if records else "not_recorded"}


def handle_get(handler, user, path, runtime):
    inference_match = re.fullmatch(r"/api/ai/results/([^/]+)", path)
    if inference_match:
        if not user:
            handler.json({"error": "Sign in to continue."}, 401)
            return True
        if user["role"] not in CLINICAL_ROLES:
            handler.json({"error": "Only clinical staff can view model observations."}, 403)
            return True
        screening_id = inference_match.group(1)
        with runtime.connect() as db:
            if len(screening_id) > 40 or not role_visibility.can_view_screening(db, user, screening_id):
                handler.json({"error": "Screening not found."}, 404)
                return True
            rows = db.execute(
                "SELECT id,screening_id,text,model,notice,validated,created_at,inference_audit_id,runtime_json FROM ai_inferences "
                "WHERE screening_id=? ORDER BY created_at DESC,rowid DESC", (screening_id,),
            ).fetchall()
        handler.json({"inferences": [_inference(row) for row in rows]})
        return True
    match = re.fullmatch(r"/api/patients/([^/]+)/journey", path)
    if not match:
        return False
    if not user:
        handler.json({"error": "Sign in to continue."}, 401)
        return True
    patient_id = match.group(1)
    with runtime.connect() as db:
        if len(patient_id) > 40 or not _patient(db, patient_id, user):
            handler.json({"error": "Patient not found or you do not have access."}, 404)
            return True
        records = {table: _record_rows(db, table, patient_id) for table in ("diagnostics", "treatments", "escalations", "ai_reviews")}
        if user["role"] not in CLINICAL_ROLES:
            for review in records["ai_reviews"]:
                if review["inference"] is not None:
                    review.update(inference=None, source_text_available=False, source_status="clinical_access_required")
        screenings = db.execute("SELECT status FROM screenings WHERE patient_id=? ORDER BY created_at DESC,rowid DESC", (patient_id,)).fetchall()
        reviews = db.execute("SELECT status FROM reviews WHERE patient_id=? ORDER BY created_at DESC,rowid DESC", (patient_id,)).fetchall()
        clinical_count = len(reviews) + len(records["ai_reviews"])
        stages = {
            "screening": _summary(screenings),
            "clinical_review": {"count": clinical_count, "status": "recorded" if clinical_count else "not_recorded"},
            "diagnostics": _summary(records["diagnostics"]),
            "treatment": {**_summary(records["treatments"]), "stage": records["treatments"][0]["stage"] if records["treatments"] else ""},
            "specialist": _summary(records["escalations"]),
        }
    handler.json({"patient_id": patient_id, **records, "stages": stages})
    return True


def _ai_source(db, data, patient_id, disposition):
    screening_id = _text(data, "screening_id", 40)
    if screening_id and not db.execute(
        "SELECT 1 FROM screenings WHERE id=? AND patient_id=?", (screening_id, patient_id),
    ).fetchone():
        raise ValueError("Choose a screening belonging to this patient.")
    if disposition == "independent":
        if data.get("inference_audit_id") not in (None, ""):
            raise ValueError("An independent assessment cannot claim an AI inference source.")
        return screening_id or None, None
    if not screening_id:
        raise ValueError("Choose the screening whose AI output was reviewed.")
    source_id = data.get("inference_audit_id")
    params = [screening_id]
    query = "SELECT id FROM audit_log WHERE entity_type='screening' AND entity_id=? AND action='generated_experimental_observations'"
    if source_id not in (None, ""):
        if isinstance(source_id, bool) or not isinstance(source_id, int) or source_id <= 0:
            raise ValueError("Inference audit id must be a positive integer.")
        query += " AND id=?"
        params.append(source_id)
    row = db.execute(query + " ORDER BY id DESC LIMIT 1", params).fetchone()
    if not row:
        raise ValueError("No recorded AI inference exists for this screening. Choose an independent assessment instead.")
    return screening_id, row["id"]


def handle_post(handler, user, path, runtime):
    route = POST_ROUTES.get(path)
    if not route:
        return False
    if not user:
        handler.json({"error": "Sign in to continue."}, 401)
        return True
    if user["role"] not in CLINICAL_ROLES:
        handler.json({"error": "Only clinical staff can record this clinical decision."}, 403)
        return True
    data = handler.body()
    patient_id = _text(data, "patient_id", 40, required=True)
    table, kind = route
    if table == "diagnostics":
        values = {
            "test_type": _choice(data, "test_type", DIAGNOSTIC_TYPES),
            "ordered_at": _date(data, "ordered_at", required=True, allow_timestamp=True),
            "status": _choice(data, "status", DIAGNOSTIC_STATUSES),
            "facility": _text(data, "facility", 180),
            "result_summary": _text(data, "result_summary", 4000),
            "report_note": _text(data, "report_note", 4000),
        }
        if values["status"] == "reported" and not (values["result_summary"] or values["report_note"]):
            raise ValueError("A reported test requires a result summary or report note.")
    elif table == "treatments":
        values = {
            "plan": _text(data, "plan", 4000, required=True),
            "stage": _choice(data, "stage", TREATMENT_STAGES),
            "status": _choice(data, "status", TREATMENT_STATUSES),
            "next_review_date": _date(data, "next_review_date"),
            "notes": _text(data, "notes", 4000),
        }
    elif table == "escalations":
        values = {
            "specialty": _text(data, "specialty", 120, required=True),
            "reason": _text(data, "reason", 3000, required=True),
            "priority": _choice(data, "priority", {"routine", "urgent"}, default="routine"),
            "status": _choice(data, "status", ESCALATION_STATUSES, default="requested"),
        }
    else:
        values = {
            "disposition": _choice(data, "disposition", AI_DISPOSITIONS),
            "reason": _text(data, "reason", 3000, required=True),
            "assessment": _text(data, "assessment", 5000, required=True),
        }
    record_id, created = str(uuid.uuid4()), runtime.now_iso()
    with runtime.connect() as db:
        db.execute("BEGIN IMMEDIATE")
        if not _patient(db, patient_id, user):
            handler.json({"error": "Patient not found."}, 404)
            return True
        if table == "ai_reviews":
            values["screening_id"], values["inference_audit_id"] = _ai_source(db, data, patient_id, values["disposition"])
        else:
            previous_id = _text(data, "previous_id", 40)
            series_id = record_id
            if previous_id:
                previous = db.execute(f"SELECT series_id FROM {table} WHERE id=? AND patient_id=?", (previous_id, patient_id)).fetchone()
                if not previous:
                    raise ValueError("Choose a previous record of this type belonging to this patient.")
                series_id = previous["series_id"]
            values.update(previous_id=previous_id or None, series_id=series_id)
        record = {"id": record_id, "patient_id": patient_id, **values, "created_by": user["id"], "created_at": created}
        columns = ",".join(record)
        placeholders = ",".join("?" for _ in record)
        db.execute(f"INSERT INTO {table}({columns}) VALUES({placeholders})", tuple(record.values()))
        db.execute(
            "INSERT INTO audit_log(actor_id,action,entity_type,entity_id,created_at) VALUES(?,?,?,?,?)",
            (user["id"], "created", kind, record_id, created),
        )
        row = db.execute(
            f"SELECT r.*,u.display_name AS clinician_name FROM {table} r JOIN users u ON u.id=r.created_by WHERE r.id=?",
            (record_id,),
        ).fetchone()
        result = dict(row)
        if table == "ai_reviews":
            _attach_inference(db, result)
    handler.json({kind: result}, 201)
    return True
