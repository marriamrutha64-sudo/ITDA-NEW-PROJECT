# Aarogya Drishti

A mobile-first, installable web prototype for a community oral-health screening and care-coordination workflow. It uses only Python's standard library and browser APIs; no paid service or external runtime package is required.

## Current scope

- Sign-in with local user accounts, role checks, a signed HTTP-only session cookie, same-origin write checks, and server-side input validation. Health workers are scoped to records they created; clinician review and administrator access use separate roles.
- SQLite records for patients, screenings, clinician reviews, referrals, follow-ups, and an administrator-visible audit log with record-view events. Duplicate patient identities are guarded by a normalized unique database key.
- Duplicate patient warning, patient consent confirmation, private image storage outside the public web root, and protected image routes.
- Mobile-friendly patient registration and navigation, phone camera capture through the file picker, English and Telugu interface labels, and installable PWA shell.
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

## Evaluation status and limits

The supplied AAROHAN evaluation rules require a trained model, documented dataset provenance and licenses, patient-separated training/validation/testing, a saved checkpoint, confusion matrix and metrics, hidden-data evaluation, secure deployment, and end-to-end testing. This workspace contains no model, data inventory, labels, checkpoint, or validation results. Those items cannot be truthfully supplied by adapting a UI repository. Until an authorized model and evidence are added, AI inference is disabled and this prototype is **not for clinical use**.

Other production requirements remain before deployment with real patient information: security and privacy review, encrypted storage and transport, stronger operational access controls, clinician and field-worker usability validation, robust mobile offline capture/synchronization, backup/recovery, and an HTTPS hosting environment. The current PWA caches only its public interface shell. Patient records and images are not cached or queued for offline sync.

The built-in HTTP server is for localhost development only. Do not expose it directly to the internet. A live deployment needs a production WSGI/ASGI server behind HTTPS, managed secrets, protected persistent storage, backup policy, and security review.

## Open-source references

This prototype borrows workflow ideas, not source code, from:

- [Intelehealth technology overview](https://intelehealth.org/technology/): community health worker intake, structured history capture, remote clinician review, and follow-up.
- [Intelehealth community health worker Android app](https://github.com/Intelehealth/intelehealth-fhw-mobileapp) (MPL-2.0): mobile-first, low-bandwidth field workflow reference.
- [Intelehealth doctor web app](https://github.com/Intelehealth/Intelehealth-Doctor-WebApp) (MPL-2.0): clinician-side review workflow reference.
- [OpenMRS Android client](https://github.com/openmrs/openmrs-contrib-android-client): patient records, sync, and offline-capable mobile client patterns.

Review each upstream repository's current license and notices before reusing any code or assets. This project does not include copied upstream source.
