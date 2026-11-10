# Aarogya Drishti

MedGemma 1.5 4B local inference integration and setup: [MEDGEMMA_SETUP.md](MEDGEMMA_SETUP.md). The optional integration requires separately downloaded gated weights and a compatible inference environment. Generated observations remain unvalidated for oral screening; no real model run has been completed in this workspace.

A mobile-first, installable web prototype for a community oral-health screening and care-coordination workflow. It uses only Python's standard library and browser APIs; no paid service or external runtime package is required.

## Current scope

- Sign-in with local user accounts, role checks, a signed HTTP-only session cookie, same-origin write checks, and server-side input validation. Health workers are scoped to records they created; clinician review and administrator access use separate roles.
- SQLite records for patients, screenings, clinician reviews, referrals, follow-ups, and an administrator-visible audit log with record-view events. Duplicate patient identities are guarded by a normalized unique database key.
- Clinician/admin consultation appointments with unpredictable, patient-independent Jitsi room names, short-lived room-scoped JWTs, and an explicitly started embedded call. The video area stays unavailable until a private Jitsi domain and matching JWT credentials are configured.
- Duplicate patient warning, patient consent confirmation, private image storage outside the public web root, and protected image routes.
- Mobile-friendly patient registration and navigation, phone camera capture through the file picker, English and Telugu interface labels, and installable PWA shell.
- Limited offline workflow for new patient registrations: encrypted IndexedDB drafts can be manually synchronized by the same authenticated health-worker account. Offline screening photos and existing-record browsing are not supported.
- Image upload checks for file type, dimensions, megapixel limit, and file size. The browser also checks approximate brightness and contrast. These checks do not identify disease or guarantee clinical image quality.
- The AI status and analysis endpoint clearly report that no model is installed. No predictions are fabricated.

## Run locally on Windows

Open PowerShell in this folder. Use Python 3.10 or newer.

```powershell
$env:AAROGYA_SESSION_SECRET = (python -c "import secrets; print(secrets.token_urlsafe(48))")
python app.py --create-user --username admin --role admin --display-name "District Admin"
python app.py
```

Open <http://127.0.0.1:8000>. The first command prompts for a password without putting it in shell history. Create separate accounts for other roles with `--role health_worker`, `--role medical_officer`, or `--role specialist`. The app has no shared or default demo password.

Records and uploaded images are stored in `.private-data/` by default. Set `AAROGYA_DATA_DIR` to a protected location to move them. Back up this directory only to a location approved for health information. Never commit it.

## Offline patient registration drafts

On a health worker's first online sign-in, enter an offline drafts passphrase of at least 12 characters to create the device vault. Enter the same username and passphrase and choose **Open offline drafts** to unlock it while offline. Only new patient registration forms can be saved offline; screening photos, existing-patient records, reviews, referrals, and consultations are not available in offline mode. The app queues a registration only when the browser reports that it is offline. When connected, sign in with the same health-worker account, unlock the same vault passphrase, and choose **Sync drafts now**. The server validates the current session and role, and safely replays the same operation ID if a response was lost.

Draft payloads are encrypted with Web Crypto AES-GCM and PBKDF2 before IndexedDB storage; the passphrase and derived key are not stored. This is not a security certification. Browser storage is best-effort and can be cleared or evicted, so reconnect and sync promptly. If a server conflict occurs, the draft remains encrypted until you resolve or explicitly discard it. This prototype does not sync drafts in the background, across devices, or without a live server session.

## Private Jitsi video configuration

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

The supplied AAROHAN evaluation rules require a trained model, documented dataset provenance and licenses, patient-separated training/validation/testing, a saved checkpoint, confusion matrix and metrics, hidden-data evaluation, secure deployment, and end-to-end testing. This workspace contains no model, data inventory, labels, checkpoint, or validation results. Those items cannot be truthfully supplied by adapting a UI repository. Until an authorized model and evidence are added, AI inference is disabled and this prototype is **not for clinical use**.

Other production requirements remain before deployment with real patient information: security and privacy review, encrypted server storage and transport, stronger operational access controls, clinician and field-worker usability validation, offline screening/photo capture and broader synchronization, backup/recovery, and an HTTPS hosting environment. The PWA caches only its public interface shell; server patient records and images are never cached for offline browsing.

The built-in HTTP server is for localhost development only. Do not expose it directly to the internet. A live deployment needs a production WSGI/ASGI server behind HTTPS, managed secrets, protected persistent storage, backup policy, and security review.

## Open-source references

This prototype borrows workflow ideas, not source code, from:

- [Intelehealth technology overview](https://intelehealth.org/technology/): community health worker intake, structured history capture, remote clinician review, and follow-up.
- [Intelehealth community health worker Android app](https://github.com/Intelehealth/intelehealth-fhw-mobileapp) (MPL-2.0): mobile-first, low-bandwidth field workflow reference.
- [Intelehealth doctor web app](https://github.com/Intelehealth/Intelehealth-Doctor-WebApp) (MPL-2.0): clinician-side review workflow reference.
- [OpenMRS Android client](https://github.com/openmrs/openmrs-contrib-android-client): patient records, sync, and offline-capable mobile client patterns.

Review each upstream repository's current license and notices before reusing any code or assets. This project does not include copied upstream source.
