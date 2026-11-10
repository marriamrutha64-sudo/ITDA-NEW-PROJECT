# Aarogya Drishti

MedGemma 1.5 4B local inference integration and setup: [MEDGEMMA_SETUP.md](MEDGEMMA_SETUP.md). The official checkpoint is installed on this workstation and completed a real synthetic-image runtime check. Generated observations remain unvalidated for oral screening; see [runtime evidence](qa/medgemma-runtime-check.json).

To present the full app on another device, run `python share_demo.py` and use its temporary HTTPS address. See [SHARE_DEMO.md](SHARE_DEMO.md) for account access, fictional demo data and availability limits.

A mobile-first, installable web prototype for a community oral-health screening and care-coordination workflow. The core application uses Python's standard library and browser APIs. Optional local MedGemma inference has its own Python packages and gated model download; Jitsi video needs a meeting service. A native Android/iOS package has not been built.

See the [evaluation mapping and demonstration runbook](docs/EVALUATION_READINESS.md), [architecture and operational boundaries](docs/ARCHITECTURE.md), and [API/database reference](docs/API_DATABASE.md). The prototype makes no clinical-validation or prize-eligibility claim.

## Current scope

- Sign-in with local user accounts, role checks, a signed HTTP-only session cookie, same-origin write checks, and server-side input validation. Health workers are scoped to records they created; clinician review and administrator access use separate roles.
- SQLite records for patients, screenings, clinician reviews, referrals, follow-ups, diagnostics, treatment progress, specialist escalation, source-linked AI reviews and an administrator-visible audit log. Duplicate patient identities are guarded by a normalized unique database key.
- Patient-specific care stages, immutable linked progress updates, explicit AI disagreement/override and a printable patient summary with a privacy confirmation. These record clinician-authored demonstration information and generate no automatic treatment or diagnostic instructions.
- Clinician/admin consultation appointments with unpredictable, patient-independent Jitsi room names and an explicitly started call. Private mode uses configured JWT credentials; explicitly selected public Jitsi mode supports synthetic demonstrations with the doctor's own host sign-in. Bridge routing and local media diagnostics are implemented, but the reported patient audio problem has not been confirmed resolved by a real two-person call.
- Duplicate patient warning, patient consent confirmation, private image storage outside the public web root, and protected image routes.
- Mobile-friendly patient registration and navigation, phone camera capture through the file picker, English and Telugu interface labels, and installable PWA shell.
- Encrypted offline registration and oral-photo drafts, with minimum patient choices cached inside the unlocked worker vault. A photo can reference an existing permitted patient or a pending registration. Explicit same-worker synchronization sends registrations before photos and safely retries acknowledged operations. Full existing-record browsing, clinician actions, AI and video remain online.
- Image upload checks for file type, dimensions, megapixel limit, and file size. The browser also checks approximate brightness and contrast. These checks do not identify disease or guarantee clinical image quality.
- Local MedGemma runs only after a verified checkpoint installation, using the original checkpoint in bfloat16 precision. A background job reports actual status and persists successful source text separately from clinical assessment, with its model, generation audit and execution provenance. Missing models and failed inference produce explicit errors. Generated text is experimental and unvalidated; no model accuracy or risk score is fabricated.
- Seven project-owner supplied visual references have neutral captions and a full-image dialog in the web/PWA interface. They are public presentation assets, not a labeled clinical dataset.

## Run locally on Windows

For the existing QA presentation workspace, run `python open_demo.py`. It reuses a running public-video demo on port 8001 or starts it locally, then opens the browser. Existing `qa-admin`, `qa-doctor`, and `qa-worker` accounts keep their chosen passwords. This is a local presentation link; other people cannot open your localhost address from their devices.

Open PowerShell in this folder. Use Python 3.10 or newer.

```powershell
$env:AAROGYA_SESSION_SECRET = (python -c "import secrets; print(secrets.token_urlsafe(48))")
python app.py --create-user --username admin --role admin --display-name "District Admin"
python app.py
```

Open <http://127.0.0.1:8000>. The first command prompts for a password without putting it in shell history. Create separate accounts for other roles with `--role health_worker`, `--role medical_officer`, or `--role specialist`. The app has no shared or default demo password.

Records and uploaded images are stored in `.private-data/` by default. Set `AAROGYA_DATA_DIR` to a protected location to move them. Back up this directory only to a location approved for health information. Never commit it.

## Offline registration and oral-photo drafts

On a health worker's first online sign-in, enter an offline drafts passphrase of at least 12 characters to create the device vault. Load Patients once to encrypt the permitted minimum patient choices. Enter the same username and passphrase and choose **Open offline drafts** to unlock it offline. The passphrase is chosen by you; there is no default. Each browser/device/origin has its own vault.

In Patients, create an offline registration or use an encrypted cached patient choice, then save a consented oral-photo draft through **Encrypted offline oral-photo capture**. The photo and notes remain encrypted on that device. The normal online screening form continues to require a connection. Full existing medical records, clinician reviews, referrals, AI and consultations are not available offline.

Reconnect and sign in as the same worker with the same vault passphrase. **Sync drafts now** sends registration drafts; **Sync registrations, then photographs** resolves registrations before uploading queued photos. The server checks session, ownership, consent and operation identity. A lost response can be retried without a duplicate, while conflicts remain queued for review. A matched server acknowledgement is required before removing a photo draft.

Draft payloads are encrypted with Web Crypto AES-GCM and PBKDF2 before IndexedDB storage; the passphrase and derived key are not stored. This is not a security certification. Browser storage is best-effort and can be cleared or evicted, so reconnect and sync promptly. If a server conflict occurs, the draft remains encrypted until you resolve or explicitly discard it. This prototype does not sync drafts in the background, across devices, or without a live server session.

## Private Jitsi video configuration

For the explicitly selected synthetic-data public Jitsi demo, see [VIDEO_DEMO.md](VIDEO_DEMO.md) and run `scripts/start-video-demo.ps1`. Public demo mode is enabled only by `AAROGYA_VIDEO_PROVIDER=public_demo`; it does not use private JWT credentials and requires the doctor's own Jitsi sign-in.

Video calls use the Jitsi Meet External API from the configured self-hosted Jitsi domain. There is no default `meet.jit.si` fallback. If any setting below is missing or invalid, the Consultation area continues to allow appointment records and displays “Video consultation is not configured”; Join and patient-link actions remain unavailable.

Set these variables in the server process environment. The application secret must match the `JWT_APP_SECRET` configured on the private Jitsi server and must be at least 32 characters. Keep it in a deployment secret manager or protected environment file; never commit it.

```powershell
$env:AAROGYA_JITSI_DOMAIN = "meet.example.org"
$env:AAROGYA_JITSI_APP_ID = "aarogya-drishti"
$env:AAROGYA_JITSI_APP_SECRET = "replace-with-the-same-random-secret-set-on-jitsi"
```

Configure the Jitsi deployment with the matching `JWT_APP_ID` and `JWT_APP_SECRET`, `ENABLE_AUTH=1`, `AUTH_TYPE=jwt`, and guest access with a lobby so patients can join without an Aarogya Drishti clinician account and wait to be admitted. Use a real HTTPS domain and certificate. Disable recording and streaming on the Jitsi server (`ENABLE_RECORDING=0`, `ENABLE_LIVESTREAMING=0`, `ENABLE_TRANSCRIPTIONS=0`, `DISABLE_LOCAL_RECORDING=1`) and do not deploy Jibri or a recording service. The app also hides recording/streaming controls in its iframe configuration; the Jitsi server settings are the enforcement layer.

Consultations are available only to medical officers, specialists, and administrators. Each saved appointment gets a random 192-bit room name unrelated to patient details. A clinician starts the call with Join; the server then creates an HS256 JWT valid for 10 minutes and restricted to that one room. The token exists only in the no-store API response and in memory for the active call. The optional copy action returns a guest URL containing only the private Jitsi domain and random room name; share it through an approved channel. The application does not send invitations.

Jitsi's Docker deployment needs a production host with the Jitsi `PUBLIC_URL`, HTTPS, and network access to ports 80/tcp, 443/tcp, and 10000/udp. The Jitsi software is open source, but hosting and media bandwidth still require infrastructure. The local prototype server itself is not suitable for public deployment; follow the production hosting and security review requirements below.

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
