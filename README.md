# Aarogya Drishti

Cloud AI: **Health AI** supports oral-photo review, general health questions and medical-report explanation (text, PDF or supported images). The saved Windows-encrypted Gemini key is reused on startup unless a provider is explicitly selected. See [Gemini setup](GEMINI_SETUP.md). Use fictional/public demo inputs and confirm the Google transfer notice. Live synthetic image, question and PDF requests completed; this does not establish diagnostic accuracy or clinical validation.

MedGemma 1.5 4B local inference integration and setup: [MEDGEMMA_SETUP.md](MEDGEMMA_SETUP.md). The official checkpoint is installed on this workstation and completed a real synthetic-image runtime check. Generated observations remain unvalidated for oral screening; see [runtime evidence](qa/medgemma-runtime-check.json).

The working local application now has an Indian-inspired interface with distinct original care illustrations for each workspace, owner-supplied oral reference photographs, a Drishti emblem, and English/Telugu labels. The patient, screening, clinical review, care, consultation and protected image flows are backed by the local server and SQLite. Saved registrations and completed appointments can be opened as printable acknowledgements. MedGemma jobs persist across page refreshes and resume without starting a duplicate run; see the [interface system](docs/UI_DESIGN_SYSTEM.md).

Office preparation: the fastest completed local synthetic check took **203 seconds**; seconds-long new-image inference was not achieved on this CPU laptop. Saved genuine observations reopen without another run, and independent review can proceed while optional AI runs. See the [office runbook](docs/OFFICE_DEMO.md) and [measured comparison](qa/medgemma-performance-comparison.json).

After an older saved result produced contradictory text, the app now flags possible internal contradictions while preserving the exact model output. A revised local prompt completed one public oral-reference run in **156 seconds** without the unrelated-image claim; it still ignored the requested three-line format. This single result does not establish accuracy. Consultation audio opens in a separate Jitsi tab, where participants select their microphone and confirm hearing directly. See [MedGemma runtime evidence](qa/medgemma-v4-public-reference-check.json) and [local microphone capture evidence](qa/doctor-mic-local-check.json).

To present the full app on another device, run `python share_demo.py` and use its temporary HTTPS address. See [SHARE_DEMO.md](SHARE_DEMO.md) for account access, fictional demo data and availability limits.

A mobile-first, installable web prototype for a community oral-health screening and care-coordination workflow. The core application uses Python's standard library and browser APIs. Optional local MedGemma inference has its own Python packages and gated model download; public Jitsi consultations need internet access. A native Android/iOS package has not been built.

See the [evaluation mapping and demonstration runbook](docs/EVALUATION_READINESS.md), [architecture and operational boundaries](docs/ARCHITECTURE.md), and [API/database reference](docs/API_DATABASE.md). The prototype makes no clinical-validation or prize-eligibility claim.

## Current scope

- Sign-in with local user accounts, role checks, a signed HTTP-only session cookie, same-origin write checks, and server-side input validation. Health workers are scoped to records they created; clinician review and administrator access use separate roles.
- SQLite records for patients, screenings, clinician reviews, referrals, follow-ups, diagnostics, treatment progress, specialist escalation, source-linked AI reviews and an administrator-visible audit log. Duplicate patient identities are guarded by a normalized unique database key.
- Patient-specific care stages, immutable linked progress updates, explicit AI disagreement/override and a printable patient summary with a privacy confirmation. These record clinician-authored demonstration information and generate no automatic treatment or diagnostic instructions.
- Clinician consultation appointments with an app-generated opaque Jitsi room shared through an authorized patient invitation. Jitsi handles admission, microphone and camera in a separate tab. Two-person audio still needs a real hearing check.
- Duplicate patient warning, patient consent confirmation, private image storage outside the public web root, and protected image routes.
- Mobile-friendly patient registration and navigation, phone camera capture through the file picker, English and Telugu interface labels, and installable PWA shell.
- Encrypted offline registration and oral-photo drafts, with minimum patient choices cached inside the unlocked worker vault. A photo can reference an existing permitted patient or a pending registration. Explicit same-worker synchronization sends registrations before photos and safely retries acknowledged operations. Full existing-record browsing, clinician actions, AI and video remain online.
- Image upload checks for file type, dimensions, megapixel limit, and file size. The browser also checks approximate brightness and contrast. These checks do not identify disease or guarantee clinical image quality.
- Local MedGemma runs only after a verified checkpoint installation, using the original checkpoint in bfloat16 precision. A background job reports actual status and persists successful source text separately from clinical assessment, with its model, generation audit and execution provenance. Missing models and failed inference produce explicit errors. Generated text is experimental and unvalidated; no model accuracy or risk score is fabricated.
- Seven project-owner supplied visual references have neutral captions and a full-image dialog in the web/PWA interface. They are public presentation assets, not a labeled clinical dataset.

## Run locally on Windows

For an office presentation on this configured workstation, double-click **START OFFICE DEMO.cmd**. It runs the existing local launcher, opens <http://127.0.0.1:8001>, and preserves the existing QA accounts and records. Sign in with your chosen account password. The launcher does not install Python packages, model weights or video infrastructure; see the [office demo runbook](docs/OFFICE_DEMO.md) for preparation and acceptance checks.

For the existing QA presentation workspace, run `python open_demo.py`. It reuses a running Jitsi-enabled demo on port 8001 or starts it locally, then opens the browser. Existing `qa-admin`, `qa-doctor`, and `qa-worker` accounts keep their chosen passwords. This is a local presentation link; other people cannot open your localhost address from their devices.

Open PowerShell in this folder. Use Python 3.10 or newer.

```powershell
$env:AAROGYA_SESSION_SECRET = (python -c "import secrets; print(secrets.token_urlsafe(48))")
python app.py --create-user --username admin --role admin --display-name "District Admin"
python app.py
```

Open <http://127.0.0.1:8000>. The first command prompts for a password without putting it in shell history. Create separate accounts for other roles with `--role health_worker`, `--role medical_officer`, or `--role specialist`. The app has no shared or default demo password.

Records and uploaded images are stored in `.private-data/` by default. Set `AAROGYA_DATA_DIR` to a protected location to move them. Back up this directory only to a location approved for health information. Never commit it.

## Backup and restore rehearsal

Stop the application server and AI workers before either command. Choose new destinations outside the active data directory on protected storage:

```powershell
python backup_data.py backup --source .private-data --destination C:\AarogyaBackups\demo-01 --server-stopped
python backup_data.py restore --source C:\AarogyaBackups\demo-01 --destination C:\AarogyaRecovery\demo-01 --server-stopped
```

The tool copies the complete data directory, checks SQLite integrity and foreign keys, verifies referenced screening images, and hashes the copied files. Restore checks the backup manifest and refuses existing or nested destinations. Backups are **not encrypted** by this tool; use protected storage. Hashes detect accidental changes, not malicious replacement of both data and manifest. The stopped-server flag is an operator acknowledgement, not automatic process detection. A failed copy leaves its new destination for inspection; use another new destination when retrying. Model weights, environment secrets and browser-only offline drafts are outside this backup. For a rehearsal, start an isolated server against the restored directory and verify login, records and images before any operational switch. No scheduled backup or production recovery certification is supplied.

## Offline registration and oral-photo drafts

On a health worker's first online sign-in, enter an offline drafts passphrase of at least 12 characters to create the device vault. Load Patients once to encrypt the permitted minimum patient choices. Enter the same username and passphrase and choose **Open offline drafts** to unlock it offline. The passphrase is chosen by you; there is no default. Each browser/device/origin has its own vault.

In Patients, create an offline registration or use an encrypted cached patient choice, then save a consented oral-photo draft through **Encrypted offline oral-photo capture**. The photo and notes remain encrypted on that device. The normal online screening form continues to require a connection. Full existing medical records, clinician reviews, referrals, AI and consultations are not available offline.

Reconnect and sign in as the same worker with the same vault passphrase. **Sync drafts now** sends registration drafts; **Sync registrations, then photographs** resolves registrations before uploading queued photos. The server checks session, ownership, consent and operation identity. A lost response can be retried without a duplicate, while conflicts remain queued for review. A matched server acknowledgement is required before removing a photo draft.

Draft payloads are encrypted with Web Crypto AES-GCM and PBKDF2 before IndexedDB storage; the passphrase and derived key are not stored. This is not a security certification. Browser storage is best-effort and can be cleared or evicted, so reconnect and sync promptly. If a server conflict occurs, the draft remains encrypted until you resolve or explicitly discard it. This prototype does not sync drafts in the background, across devices, or without a live server session.

## Jitsi consultations

When a clinician schedules a new appointment, the application generates an opaque Jitsi room name. See the [two-device video guide](VIDEO_DEMO.md). Authorized clinicians can open that room for an early audio check or copy the patient invitation while the appointment remains scheduled. Both actions use the same room URL. The application does not send invitations or host the media.

Jitsi opens in its own browser tab. On public `meet.jit.si`, the person starting a room must sign in; later guests may wait for the host. Microphone, camera, speaker selection, sign-in and admission are handled by Jitsi, the browser and the devices. The application cannot unmute the Jitsi tab, verify remote hearing, or end a meeting by marking an appointment complete. Share the link only with the intended participant through an approved channel. A previously shared public link may remain usable after an app appointment is completed or cancelled.

Only medical officers and specialists can schedule or open consultation records. The server creates a 48-character hexadecimal Jitsi room name for each new appointment. Older Google Meet appointments remain visible in the history but are not silently redirected to Jitsi; schedule a new appointment to use the restored flow. Public `meet.jit.si` is for synthetic demonstration data only. This external service requires internet access and a real two-device sound check. The local prototype server itself is not suitable for public deployment; follow the production hosting and security review requirements below.

## Evaluation status and limits

The supplied presentation DOCX has seven criteria totaling 100 marks and requires advisory-only AI during the demonstration; see the exact [criterion mapping](docs/EVALUATION_READINESS.md). The separately supplied 12 November final-rule PDF also asks for dataset/model evidence, confusion matrix and metrics, hidden-data examination, security and end-to-end testing. They are distinct sources. An official MedGemma foundation checkpoint is installed and runs locally, but this workspace has no task-specific labeled oral-health evaluation set, confusion matrix, required performance metrics or independent clinical validation. A synthetic runtime check supplies execution evidence only. This prototype remains **not for clinical use** and does not claim mandatory eligibility has been met.

Before any deployment with real patient information, security/privacy review, protected server storage and transport, operational access controls, clinician/worker usability testing, backup/recovery and reviewed hosting remain necessary. Server SQLite/uploads are not encrypted by the application at rest. The PWA cache holds public interface/reference assets; explicitly prepared offline patient choices and drafts are encrypted separately in IndexedDB. See [storage and backup boundaries](docs/ARCHITECTURE.md).

Temporary HTTPS sharing depends on the host PC and tunnel remaining online; permanent hosting is not configured. The Docker/Caddy preview has not been built/run in this workspace, and a native mobile wrapper is not supplied. Actual two-way Jitsi audio still requires verification with doctor and patient on separate devices.

The built-in HTTP server is for localhost development only. Do not expose it directly to the internet. A live deployment needs a production WSGI/ASGI server behind HTTPS, managed secrets, protected persistent storage, backup policy, and security review.

## Open-source references

This prototype borrows workflow ideas, not source code, from:

- [Intelehealth technology overview](https://intelehealth.org/technology/): community health worker intake, structured history capture, remote clinician review, and follow-up.
- [Intelehealth community health worker Android app](https://github.com/Intelehealth/intelehealth-fhw-mobileapp) (MPL-2.0): mobile-first, low-bandwidth field workflow reference.
- [Intelehealth doctor web app](https://github.com/Intelehealth/Intelehealth-Doctor-WebApp) (MPL-2.0): clinician-side review workflow reference.
- [OpenMRS Android client](https://github.com/openmrs/openmrs-contrib-android-client): patient records, sync, and offline-capable mobile client patterns.

Review each upstream repository's current license and notices before reusing any code or assets. This project does not include copied upstream source.
