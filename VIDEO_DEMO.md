# Public Jitsi consultation demo

This mode connects the Aarogya Drishti prototype to **public `meet.jit.si` for synthetic-data demonstrations only**. Use fictional patient details, test accounts, and simulated discussion. Do not enter or discuss real patient information. The public service's terms and privacy policy apply; this mode is not a private clinical deployment.

## Start on Windows

From the repository's PowerShell terminal, stop an existing local Aarogya server with Ctrl+C in its own terminal. Then run:

```powershell
.\scripts\start-video-demo.ps1 -UseManualQaData
```

This reuses `.private-data/manual-qa`, sets `AAROGYA_VIDEO_PROVIDER=public_demo` only for the server process, and generates a fresh session secret without printing or saving it. It listens at `http://127.0.0.1:8000`. Existing browser sessions must sign in again after a restart. If port 8000 is busy, stop the existing server or choose `-Port 8001` and open the matching address.

For a separate empty demo database, omit `-UseManualQaData`. The default folder is `.private-data/video-demo`. The launcher creates no accounts and embeds no passwords. Create an account in the selected directory before starting, if needed:

```powershell
$env:AAROGYA_DATA_DIR = "$PWD\.private-data\manual-qa"
python app.py --create-user --username qa-doctor --role medical_officer --display-name "QA Doctor"
```

Choose a password of at least 12 characters at the terminal prompt. If the account already exists, use its existing password. For the separate database, use `$PWD\.private-data\video-demo` instead. A clinician or administrator can manage consultations; an offline drafts passphrase is not needed for this doctor account.

## Complete a two-person call

1. Sign in to the local app as a doctor or administrator. Register a fictional patient if no synthetic record exists.
2. Open **Consultations**, choose that patient, and save an appointment for now or within the next 15 minutes. Join/link actions open 15 minutes before the scheduled start and close 30 minutes after its scheduled duration.
3. Start the call using the consultation's join action. **Browser handoff:** the doctor must personally complete the public Jitsi sign-in when prompted. This account is separate from the Aarogya login. Allow camera and microphone only when ready to test them.
4. Copy the patient invitation link. It should contain `https://meet.jit.si/` and a long random room name, with no patient name or ID. Open it on a second device or a separate browser session as the simulated patient. The patient does not need an Aarogya account.
5. If the meeting lobby is enabled, request to join as the patient and admit that request from the doctor's meeting controls. Verify actual lobby behavior rather than assuming it from the application appointment state.
6. Confirm that each participant can hear and see the other. Test mute, camera toggle, leave, and rejoin. Use headphones or physically separate devices to avoid audio feedback.
7. Leave the meeting on both devices. Update the application's appointment state as appropriate.

The local app can remain bound to localhost because the patient joins the public Jitsi URL directly. Sharing `http://127.0.0.1:8000` with another person will not share the local app; that address refers to their own computer.

## Expected limits and recovery

- Cancelling or completing an appointment changes the app record. It does **not** revoke an active Jitsi meeting, expire an already-copied public room URL, or eject participants. End/leave the meeting in Jitsi as well. Treat the invitation URL as private for the duration of the demo.
- Public Jitsi meeting creation requires the doctor's own sign-in. The app cannot silently complete that account login. Guests can join without creating a public Jitsi account.
- If embedded sign-in, camera, or microphone fails, use the available external meeting link in a separate browser tab, then check the browser permissions and device selection. Blocking third-party browser content can affect embedded meetings.
- A two-person media test is still required. Passing application API tests does not prove camera/microphone access, guest admission, media connectivity, or the public service's availability.
- Public `meet.jit.si` meetings are limited to 95 minutes as announced on October 9, 2026. Public-service policies can change.
- For private patient consultations, deploy a private Jitsi service and configure the application's private provider; see README.md. The public demo does not supply private JWT enforcement or clinical deployment evidence.

## Completion checklist

- [ ] Doctor signs in to Aarogya and saves an appointment for a fictional patient.
- [ ] Doctor personally completes public Jitsi sign-in.
- [ ] Simulated patient joins the exact invitation URL from a separate session/device.
- [ ] Guest admission/lobby behavior is observed and checked.
- [ ] Audio and video work in both directions; mute, camera toggle, leave and rejoin work.
- [ ] Both participants leave; the app appointment state is updated.
- [ ] No real health information was entered, displayed, or discussed.

Official references: [Jitsi authentication policy](https://jitsi.org/blog/authentication-on-meet-jit-si/), [public-service privacy supplement](https://jitsi.org/meet-jit-si-privacy/), [95-minute meeting limit](https://jitsi.org/blog/changes-coming/).
