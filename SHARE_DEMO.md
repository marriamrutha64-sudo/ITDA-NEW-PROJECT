# Present the full application from another device

Run from the repository:

```powershell
python share_demo.py
```

It prints a temporary `https://...trycloudflare.com` address. Open that exact address on any Internet-connected phone, tablet, or computer. Use `qa-doctor`, `qa-admin`, or `qa-worker` and the password already chosen for that account. Sign in again on the HTTPS address; localhost sessions do not transfer.

The launcher creates `.private-data/public-demo` with fictional records and a generated DEMO image. It reads only the three QA account credential rows locally; existing patient records, uploaded clinical images, audit history and consultation records are not copied. Data entered through the public link must also be synthetic.

Keep the host PC awake and online. Both its Python server and Cloudflare tunnel must remain running. Rerunning the launcher reuses the healthy tunnel. Restarting the tunnel produces a different URL. This is temporary presentation access, not permanent hosting or a clinical deployment.

The public demo requires same-origin POST requests and uses signed Secure/HttpOnly session cookies on HTTPS. Sign-in attempts are throttled; wait five minutes if a 429 message appears. This is a prototype with a development server and in-memory throttling, not a completed production security review.

## Present the workflow

1. Use `qa-doctor` to show the fictional patient, generated screening image, clinical review, referral, follow-up and consultation scheduling.
2. Schedule a new consultation for a fictional patient and open its generated Jitsi room in a separate tab. The doctor signs in to Jitsi and enters first. Copy the same room invitation to a second device and verify spoken audio in both directions. Jitsi media runs separately from the application tunnel.
3. Use `qa-admin` for the audit log.
4. Use `qa-worker` for offline registration drafts and manual sync. Each device/browser/HTTPS hostname has its own vault; prepare it online first.
5. MedGemma is installed locally and passed a synthetic runtime check. Experimental observations remain unvalidated for oral screening. The generated DEMO image is nonclinical and must not be presented as model accuracy evidence.

The saved URL and process IDs are in `.private-data/qa/public-demo-process.json`. Backend and tunnel logs are in the same private directory. Models, account databases, credentials and runtime logs are excluded from Git.

## Cloudflare client

The official Cloudflare client is already installed on this workstation. On another Windows host, install it with:

```powershell
winget install --id Cloudflare.cloudflared --exact --source winget
```

The launcher also accepts `--cloudflared C:\path\to\cloudflared.exe`. It uses a loopback backend on port 8003 and leaves the local demo on port 8001 running.

Cloudflare Quick Tunnels have no uptime guarantee, allow 200 in-flight requests and do not support server-sent events. See [official Quick Tunnel documentation](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/). Stable hosting independent of this PC requires a separate deployment.
