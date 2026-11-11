# API and database reference

The Python server uses SQLite with foreign keys and session-cookie authentication.
Request bodies use JSON unless noted. POST requests must have the same Origin as
the application; public demo mode requires that header. API responses are not
cached. No endpoint described here generates a clinician's diagnosis or treatment
plan. All model observations remain explicitly unvalidated.

## Authentication and access

| Route | Purpose |
| --- | --- |
| `POST /api/login` | `{username,password}`; returns the account and an HttpOnly, SameSite cookie. HTTPS proxy requests receive a Secure cookie. |
| `POST /api/logout` | Expires the session cookie. |
| `GET /api/session` | Returns authentication state and current account. |
| `GET /api/health` | Service and local model installation status; installation does not imply clinical validation. |

Clinical write access means `medical_officer`, `specialist`, or `admin`.
Health workers can read the journey of patients they registered. Saved raw model
output and AI jobs require clinical access. A job can be read by its initiating
clinician or an administrator; another clinician receives 404.

## Patient and consultation APIs

| Route | Purpose |
| --- | --- |
| `GET/POST /api/patients` | List permitted patients or register a consented patient. |
| `GET /api/patients/{id}` | Patient details, screening records, clinical reviews, referrals and follow-ups. |
| `POST /api/screenings` | Multipart image upload with patient and screening fields. |
| `GET /api/images/{screening_id}` | Authorized image access; images are not public static files. |
| `POST /api/reviews` | Clinician-entered observations and review status. |
| `POST /api/referrals`, `POST /api/followups` | Record referral or follow-up details. |
| `GET/POST /api/consultations` | List or schedule clinician appointments. A new appointment generates an opaque 48-character Jitsi room name; list entries include `patient_id`, video provider and, after completion, `completed_at` and `completed_by_name` from the audit event. |
| `POST /api/consultations/{id}/join` | Return `meeting_url` for the generated Jitsi room to an authorized clinician while the appointment is scheduled, including an early connection check. Jitsi opens separately. |
| `POST /api/consultations/{id}/invite` | Return `guest_url` for the same generated Jitsi room on a scheduled appointment. The app does not send it. |
| `POST /api/consultations/{id}/complete` or `/cancel` | End further appointment actions through the application. Completion returns its actual audit timestamp and clinician name. |

The server creates the room name without embedding a patient name, code or
appointment ID. The join and invitation actions build a `https://meet.jit.si/`
URL from that stored name. Older Google Meet appointments remain in history but
cannot be opened through this restored Jitsi flow; schedule a new appointment.
The backend manages appointment access; public Jitsi transports media and
controls admission. The host must sign in on `meet.jit.si` to start the room.
Completion cannot revoke a public meeting link already copied outside the app.
Scheduling the same patient at the same normalized UTC minute while an appointment
remains scheduled returns HTTP 409. Duration and creator do not bypass this check.
Past completed or cancelled appointments can be scheduled again; historical
duplicate records remain visible with distinct appointment references.

## Longitudinal clinical records

`GET /api/patients/{id}/journey` returns:

```json
{
  "patient_id": "...",
  "diagnostics": [], "treatments": [], "escalations": [], "ai_reviews": [],
  "stages": {
    "screening": {"count": 0, "status": "not_recorded"},
    "clinical_review": {"count": 0, "status": "not_recorded"},
    "diagnostics": {"count": 0, "status": "not_recorded"},
    "treatment": {"count": 0, "status": "not_recorded", "stage": ""},
    "specialist": {"count": 0, "status": "not_recorded"}
  }
}
```

Lists are newest first. Stage statuses describe the latest recorded event; they
do not infer a clinical outcome. Counts include historical events.

All four POST routes require `patient_id` and return 201 with the singular record
key (`diagnostic`, `treatment`, `escalation`, or `ai_review`). Each saved record has
an id, creator, creation time and clinician display name. Every mutation writes an
audit record in the same transaction.

| Route | Required fields and allowed values |
| --- | --- |
| `POST /api/diagnostics` | `test_type`: biopsy, histopathology, blood_test, imaging, other; `ordered_at`: YYYY-MM-DD or timezone-qualified ISO timestamp; `status`: ordered, scheduled, collected, processing, reported, cancelled. Optional `facility` (180 characters), `result_summary`, `report_note` (4,000 each). Reported status requires a summary or note. |
| `POST /api/treatments` | `plan` (4,000); `stage`: assessment, investigation, treatment, recovery, surveillance; `status`: planned, active, completed, paused, stopped. Optional `next_review_date` (YYYY-MM-DD), `notes` (4,000). |
| `POST /api/escalations` | `specialty` (120), `reason` (3,000); `priority`: routine or urgent (default routine); `status`: requested, accepted, in_review, resolved, cancelled (default requested). |
| `POST /api/ai-reviews` | `disposition`: accepted, disagreed, insufficient, independent; `reason` (3,000), `assessment` (5,000). AI-related dispositions require a screening with a recorded inference. Optional positive integer `inference_audit_id` selects the exact generation; otherwise the latest is linked. |

Diagnostics, treatments and escalations are append-only events. To record
progress, submit all fields and optional `previous_id`. It must refer to a record
of the same type and patient. The returned `series_id` remains the first event's
id; previous records remain unchanged.

An independent assessment may omit `screening_id` and cannot claim an inference
audit source. AI review rows include `inference`, `source_text_available`, and
`source_status`. Historical generation audits without saved text are labeled
`historical_text_unavailable`; their text is never invented. Health-worker
journeys omit raw model output and label it `clinical_access_required`.

## Local AI jobs and saved outputs

`POST /api/ai/jobs` takes
`{screening_id,acknowledge_experimental:true}` and immediately returns 202 with a
job id and queued status. The background worker performs actual local inference.
One job is admitted per server process; another request receives 429 and
`Retry-After: 5`. Missing model installation returns 503 without creating a job.

`GET /api/ai/jobs/{id}` returns `{job:{id,screening_id,status,error,result,...}}`.
Statuses are queued, running, succeeded, failed or interrupted. No percentage is
fabricated. A succeeded result contains text, model, notice, `validated:false`,
`inference_id`, and `inference_audit_id`. Failed jobs have no result. Restarted
unfinished jobs are explicitly interrupted and can be resubmitted.
`GET /api/ai/jobs?screening_id={id}` returns the signed-in clinician's latest
job for that screening, allowing the UI to resume a running job after refresh.

`GET /api/ai/results/{screening_id}` returns `{inferences:[...]}` newest first,
including the exact saved output, model, notice and generation audit id. The
`runtime` object preserves the checkpoint revision, execution mode and truncation
flag from the server-produced result (`runtime_json` in SQLite). It is separate
from the clinician's review and is never accepted as a client-supplied inference.
The result and saved-inference read responses also include `inconsistent` and
`output_warning` from a narrow text consistency check. Older raw text is
assessed when read; no saved model output is rewritten. A negative flag does
not establish that the model observation is accurate.
The
legacy synchronous `POST /api/ai/analyze` also persists a successful result, but
the asynchronous route avoids long HTTP requests while CPU inference runs.

Model output, generation audit, and a job's success state commit atomically.
Failure cannot create a saved prediction or generation audit. These records
provide execution provenance, not clinical validation or accuracy evidence.

## Storage and startup

Existing tables: `users`, `patients`, `screenings`, `reviews`, `referrals`,
`followups`, `consultations`, `audit_log`, `offline_sync_receipts`.
`clinical_records.init_schema(db)` adds `diagnostics`, `treatments`,
`escalations`, `ai_reviews`, and `ai_inferences`, with patient/user references and
indexes. `ai_jobs.init_schema(db)` adds the durable job table and marks unfinished
jobs interrupted. Run job schema initialization once at application startup, not
on requests; the deployment uses one server process per database.

Local and public demo servers share a nonblocking OS lock identified by the
canonical model path and OS user. This prevents them from starting two copies of
the same CPU model concurrently. The lock contains no patient data and releases
if its holding process exits. Job state remains scoped to its own database.

Uploaded images remain under the private data directory. Model files, session
secrets, databases and credentials are excluded from application source commits.
