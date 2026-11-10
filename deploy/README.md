# Synthetic-data preview deployment

> **Demo only.** This stack is not for clinical use or real patient information. Use synthetic records and images only. TLS through Caddy does not make the application production-ready: the app still uses Python's development `http.server`, SQLite, and a single-host data volume; it has no configured backup/recovery, production security review, or clinical AI model.

## Prerequisite

Install Docker Desktop (Windows/macOS) or Docker Engine with the Docker Compose v2 plugin (Linux), and make sure the Docker daemon is running. Docker is not currently available in the workspace, so this scaffold has not been built or run here.

## Local preview

Run these commands from this `deploy` directory. Create a private environment file and generate a fresh session secret; do not commit `.env`.

```powershell
Copy-Item .env.example .env
python -c "import secrets; print(secrets.token_urlsafe(48))"
```

Paste the generated value into `AAROGYA_SESSION_SECRET` in `.env`. Keep `DOMAIN=localhost` and `BIND_ADDRESS=127.0.0.1` for a local-only preview, then start the stack:

```powershell
docker compose up --build -d
```

Caddy uses its local certificate authority for `localhost`; a browser may show a trust warning until that local root certificate is trusted. Open `https://localhost`.

The database and uploaded demo images persist in the Docker volume named `deploy_app-data`. Create the first administrator interactively; there is no embedded default account or password:

```powershell
docker compose exec app python app.py --create-user --username demo-admin --role admin --display-name "Demo Admin"
```

Enter a unique password of at least 12 characters when prompted. Create only synthetic demo accounts and records.

Stop the preview with `docker compose down`. Removing volumes with `docker compose down --volumes` permanently deletes this preview's SQLite database, uploaded images, and Caddy certificate state.

## Public synthetic-data preview

For an internet-accessible demo, use a host you control, set `DOMAIN` to its real DNS name and `BIND_ADDRESS=0.0.0.0` in `.env`, point the DNS record at the host, and allow inbound TCP ports 80/443 and UDP 443. Caddy will request and renew HTTPS certificates. This makes the demo publicly reachable; never enter real health information. Use unique credentials and keep `.env` private.

No Jitsi/video service is included in this compose stack.
