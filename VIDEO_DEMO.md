# Jitsi consultation rehearsal

Use fictional patients and synthetic screening records. This local prototype is **not for clinical use**. Public `meet.jit.si` is an external service; do not share real patient information through it.

## Prepare a consultation

1. Sign in to Aarogya as a medical officer or specialist. In Consultations, choose a fictional patient, appointment time and duration. The app creates a long, opaque Jitsi room name for the new appointment. No meeting link needs to be pasted.
2. Choose **Join call** from that appointment. The app opens the server-approved `https://meet.jit.si/...` room in a separate browser tab. On public `meet.jit.si`, the person starting a room must [sign in to Jitsi](https://jitsi.org/blog/authentication-on-meet-jit-si/). Use the Jitsi tab to complete host sign-in and enter the room **before** asking the patient to join.
3. In Aarogya, copy the patient invitation for the same appointment and share it with the intended second-device participant through an approved channel. The invitation uses the same room. Aarogya does not send it automatically.
4. Open the invitation on a second device. If Jitsi shows a wait-for-moderator screen, confirm that the signed-in host has entered the same room and admit the guest if prompted. [Jitsi's join guide](https://jitsi.github.io/handbook/docs/user-guide/user-guide-join-jitsi-meeting/) describes the first-entrant sign-in or moderator wait.

The local app URL `http://127.0.0.1:8001` works only on the host computer. The direct Jitsi room link can open on another internet-connected device. If the second device needs Aarogya's invitation page, use the temporary HTTPS sharing instructions in [SHARE_DEMO.md](SHARE_DEMO.md). Jitsi media runs outside the local Python server and tunnel.

## Check the doctor's microphone

On Aarogya's **Consultations** page, press **Start microphone check** before the call. Allow microphone access for the local app if the browser asks. Stay quiet for 2 seconds, then speak near the webcam microphones for 6 seconds. If the input level barely changes, choose another input or connect a USB headset and repeat the check. The test releases the microphone automatically and saves no audio. It measures local input only.

In the **Jitsi tab**, grant `meet.jit.si` browser microphone and camera access when asked, select the intended input and output devices on Jitsi's prejoin screen, then join and check that the Jitsi microphone is unmuted. Jitsi's [start guide](https://jitsi.github.io/handbook/docs/user-guide/user-guide-start-a-jitsi-meeting/) covers device permission and sign-in. If the patient cannot hear the doctor, check Jitsi mute, selected input device, browser site permission and operating-system microphone permission. Rejoin after changing permissions if needed.

The Aarogya page cannot unmute or inspect the microphone in a separate Jitsi tab. A local input meter or permission prompt is not proof of remote hearing. Only a second person repeating a fresh spoken phrase establishes that direction of audio for that rehearsal.

## Two-device acceptance checklist

| Check | Doctor | Patient | Pass observation |
| --- | --- | --- | --- |
| Host admission | Sign in on the Jitsi tab and enter the saved room first. | Open the exact invitation. | Both see each other in the same room. |
| Doctor to patient | Unmute in Jitsi and say a new phrase. | Listen, then repeat it. | The patient repeats it correctly. |
| Patient to doctor | Listen and repeat a new patient phrase. | Unmute in Jitsi and speak. | The doctor repeats it correctly. |
| Controls | Toggle microphone and camera in Jitsi. | Confirm changes; then test own controls. | Speech and video follow the controls. |
| Recovery | Leave and reopen the same Jitsi link. | Rejoin and repeat both speech checks. | Both directions work again. |
| Finish | Leave Jitsi, then mark the appointment complete in Aarogya. | Leave Jitsi. | No call remains running on either device. |

Use headphones or separate rooms to prevent echo. Appointment status records the care workflow; it cannot end an external Jitsi meeting or revoke a copied public link. A new appointment gets a new opaque room. A source/API test cannot certify actual two-way audio; record the result on the presentation devices.
