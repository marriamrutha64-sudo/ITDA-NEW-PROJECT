# Office demonstration runbook

Use fictional records and synthetic images. The app and generated observations are **NOT FOR CLINICAL USE**. A working demonstration does not establish diagnostic accuracy, clinical validation or production readiness.

## Start and check

Double-click **START OFFICE DEMO.cmd** in the project folder. It selects the installed model Python environment when available, reuses or starts the local presentation server and opens the browser. It keeps existing records and passwords.

Alternatively, from the project folder in PowerShell:

```powershell
python open_demo.py
python scripts/check_office_demo.py --url http://127.0.0.1:8001 --output qa/office-demo-http-preflight.json
```

Open <http://127.0.0.1:8001> on this computer. Existing `qa-worker`, `qa-doctor` and `qa-admin` accounts keep their chosen passwords; there is no universal password. Do not display passwords, browser cookies or the private data folder in a presentation.

The selected setup runs the application and MedGemma on this laptop. No cloud GPU or online AI inference is configured. Local CPU generation can take minutes; saved genuine output and background processing support the rehearsal without claiming a faster model result. Consultations open app-generated rooms on public Jitsi and need internet access; this is not an offline laptop-to-laptop call implementation.

### Measured local AI time

On 11 November 2026 local time, the selected CPU configuration completed one uniform gray 320×320 synthetic-image request in **203.10 seconds** end to end. It generated 51 tokens without truncation. A native-bfloat16 control using the same concise prompt took **246.14 seconds** and produced the same response. The selected float32 arithmetic with original bfloat16 stored weights was about 17.5% faster in this single comparison; **it still takes about 3 minutes 23 seconds** on this laptop. This is runtime evidence, not clinical validation or a guaranteed time for oral photographs.

The checkpoint and normal image preprocessing remain unchanged. CPU linear/attention arithmetic uses float32, including the registered causal/sliding mask behavior. Earlier linear-only, vision-only and int8 experiments were rejected; int8 is not shipped. Loading the model took about five seconds in the successful selected run, so keeping it loaded would not remove the main generation delay. See [selected runtime evidence](../qa/medgemma-speed-attention-check.json) and [native concise control](../qa/medgemma-speed-native-concise.json). For the office demonstration, start a new genuine generation, continue the care workflow, and reopen its saved output when complete. Do not promise a sub-minute response.

The read-only preflight checks health, public PWA files, denial of private-source URLs, and authentication/cache protection on the patient API. It does not run a patient workflow, generate AI output or test sound.

For the laptop-only presentation, use the local address above. If a separate-device demonstration is later selected, `python share_demo.py` supplies a temporary HTTPS URL; see [sharing instructions](../SHARE_DEMO.md). Localhost addresses work only on this PC. Sharing needs the PC, backend and tunnel online. Check Jitsi host sign-in and browser microphone access on the actual presentation network before demonstrating remote consultation.

## Rehearse the workflow

1. As worker, register a fictional person with demonstration consent. Open the saved registration acknowledgement and use Print / Save PDF if needed. Reopen it from the Patients list, then show duplicate protection with a controlled repeated registration.
2. Upload a synthetic image in Oral screening. Demonstrate a rejected undersized input separately; technical image checks do not certify clinical adequacy.
3. As doctor, explicitly acknowledge the experimental warning and start MedGemma. Continue the records demonstration while the background job runs. The result is saved; reopening the screening loads saved output. Do not present an old result as a new live generation. CPU time depends on the host and image; use measured evidence rather than a promised response time.
4. Record an independent demonstration review, or review/override a genuinely saved AI source. Show the selected patient's care stages, simulated diagnostic order and later progress, treatment progress, referral and follow-up. Earlier events should remain visible.
5. Open the patient summary, inspect the privacy prompt and browser print preview, then cancel if a paper copy is unnecessary.
6. As admin, show the audit log and counts. Switch between roles to demonstrate that workers cannot write clinical decisions or inspect another worker's records.
7. On a prepared worker browser, show encrypted offline registration/photo drafts, reconnect, authenticate as the same worker and explicitly sync registration before photo. Browser-only unsynced drafts are outside server backups.
8. Show Telugu navigation and phone layout. Record usability issues; source translations do not replace community or accessibility testing.

After a clinician marks a synthetic consultation appointment complete, open its appointment completion acknowledgement from the Consultations list and use Print / Save PDF. This document confirms the saved appointment status and audit time; it does not establish that a call connected, provide clinical findings, or record a payment. Only medical officers and specialists can open consultation records.

Each workspace tab includes its own care-context illustration with a provenance caption. The original Indian care illustrations and supplied oral reference photographs are presentation assets; the protected screening image in a patient record is the only image presented as case evidence.

## Two-device video and microphone acceptance

Use a doctor device and a second simulated-patient device, preferably with headphones. Scheduling a new consultation creates an opaque Jitsi room. The doctor opens the room first in a separate tab, signs in to public Jitsi and enters it, then copies the same room invitation for the patient. Jitsi sign-in and any guest admission are separate from Aarogya accounts. Use fictional information only on public Jitsi.

Before opening Jitsi, run **Start microphone check** on the Consultations page. Stay quiet for 2 seconds and then speak for 6 seconds. A flat level points to the input device or hardware path; try another microphone or USB headset before the meeting. The check saves no audio and releases the device when it ends.

The Consultations workspace groups appointments as Ready now, Upcoming and Past. Join call and Copy patient link appear for new scheduled Jitsi appointments, including an early preflight or one whose scheduled time passed. Older Google Meet appointments remain visible but require a new appointment for the restored Jitsi flow. Completed and cancelled appointments cannot issue new app call access, though a previously copied public link is outside the app's control. The page artwork illustrates Indian remote care and is not a patient photograph.

- Confirm both participants can see each other.
- Have the doctor say a fresh phrase and ask the patient to repeat it, then reverse the roles. Record each direction separately.
- Test mute/unmute and camera toggle on both devices, then leave and rejoin.
- If one direction is silent, check the mute control and input/output devices in the Jitsi tab, the browser site permission and operating-system microphone permission. Rejoin and repeat the spoken test.

Do not mark audio passed from a moving meter or local device list. Actual remote hearing remains unverified until people confirm it. Aarogya cannot control or inspect the separate Jitsi tab. No recording is required or implemented by this application.

## Before presenting

- Keep the PC powered, with sleep disabled for the demonstration. Close unnecessary heavy applications before a real model run.
- Load the application and reference images on the intended browser/network. Rehearse sign-in, consent, saving, reopening and printing with synthetic data.
- Reopen a genuine saved MedGemma result as a fallback, with its source/provenance and unvalidated notice visible. Report generation failures honestly.
- Confirm two-way spoken audio before promising live consultation.
- Use the [backup and isolated restore commands](../README.md#backup-and-restore-rehearsal) only after stopping the server and AI workers. Store unencrypted backup files on protected storage.

## Evidence and remaining limits

The current office checks are recorded under `qa/office-demo-*`. Passing automated checks is evidence for their stated scope only. Clinical model evaluation and hidden-set results, verified physical two-device sound, permanent reviewed hosting, field usability, a native APK and a production security review remain separate acceptance work. The current Python HTTP server and temporary tunnel are demonstration infrastructure.
