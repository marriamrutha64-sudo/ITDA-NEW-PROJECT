"""Read-only office-demo preflight against a running Aarogya server.

Checks public assets and unauthenticated access boundaries. Does not sign in,
create records, invoke AI, access patient data, or activate cameras/microphones.
"""
import argparse
from datetime import datetime, timezone
import hashlib
import json
from pathlib import Path
import re
import sys
import urllib.error
import urllib.parse
import urllib.request

ROOT = Path(__file__).resolve().parents[1]


def fetch(base, path):
    request = urllib.request.Request(base + path, headers={"Cache-Control": "no-cache"})
    try:
        response = urllib.request.urlopen(request, timeout=10)
    except urllib.error.HTTPError as error:
        response = error
    with response:
        return response.status, response.headers, response.read()


def check(base):
    parsed = urllib.parse.urlsplit(base)
    if parsed.scheme not in {"http", "https"} or not parsed.netloc or parsed.username or parsed.password or parsed.path not in {"", "/"} or parsed.query or parsed.fragment:
        raise ValueError("URL must be an HTTP(S) origin without credentials, path, query or fragment")
    base = base.rstrip("/")
    checks = []
    health = {}
    status, headers, body = fetch(base, "/api/health")
    try:
        health = json.loads(body)
    except (ValueError, UnicodeError):
        pass
    checks.append({"check": "application health", "passed": status == 200 and health.get("ok") is True and "AarogyaLocal/" in headers.get("Server", "")})
    shell = re.search(r"const SHELL\s*=\s*(\[.*?\]);", (ROOT / "service-worker.js").read_text(encoding="utf-8"), re.S)
    if shell is None:
        raise ValueError("Unable to read the public PWA asset inventory")
    paths = set(json.loads(shell.group(1))) | {"/service-worker.js", "/index.html"}
    for path in sorted(paths):
        local = ROOT / ("index.html" if path == "/" else path.lstrip("/"))
        status, _, body = fetch(base, path)
        checks.append({"check": "public asset", "path": path,
                       "passed": status == 200 and body == local.read_bytes(),
                       "http_status": status, "sha256": hashlib.sha256(body).hexdigest() if status == 200 else None})
    for path in ("/app.py", "/.env", "/.git/config", "/.private-data/aarogya.sqlite3"):
        status, _, _ = fetch(base, path)
        checks.append({"check": "private source denied", "path": path, "passed": status == 404, "http_status": status})
    status, headers, _ = fetch(base, "/api/patients")
    checks.append({"check": "patient API requires sign-in", "passed": status == 401, "http_status": status})
    checks.append({"check": "patient response is not cached", "passed": "no-store" in headers.get("Cache-Control", "")})
    return {"checked_at_utc": datetime.now(timezone.utc).isoformat(),
            "passed": all(item["passed"] for item in checks), "checks": checks,
            "ai_available": bool(health.get("ai", {}).get("available")),
            "ai_busy": bool(health.get("ai", {}).get("busy")),
            "scope": "Read-only HTTP preflight; no authenticated patient workflow or model inference executed",
            "not_verified": ["Actual two-person video/audio on separate devices", "Clinical AI performance",
                             "Authenticated office-demo rehearsal", "Production hosting/security", "Phone accessibility and offline field usability"]}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--url", default="http://127.0.0.1:8001")
    parser.add_argument("--output", type=Path)
    args = parser.parse_args()
    try:
        report = check(args.url)
    except (OSError, ValueError, urllib.error.URLError) as error:
        parser.exit(1, f"Preflight could not complete ({type(error).__name__}). Check the URL and running server.\n")
    if args.output:
        args.output.write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    failed = [item for item in report["checks"] if not item["passed"]]
    print(f"Office demo preflight: {len(report['checks']) - len(failed)}/{len(report['checks'])} checks passed.")
    for item in failed:
        print(f"FAILED: {item['check']} {item.get('path', '')}")
    print("Live two-person audio, authenticated rehearsal and clinical validation remain separate checks.")
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
