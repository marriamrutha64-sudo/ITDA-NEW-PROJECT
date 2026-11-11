"""Open the local synthetic-data presentation, starting its server if needed."""
import argparse
import json
import os
from pathlib import Path
import secrets
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser

ROOT = Path(__file__).resolve().parent


def ready(url):
    try:
        with urllib.request.urlopen(url + "/api/health", timeout=2) as response:
            payload = json.load(response)
            return (payload.get("ok") is True
                    and payload.get("video_provider") == "jitsi"
                    and "AarogyaLocal/" in response.headers.get("Server", ""))
    except (OSError, ValueError, urllib.error.URLError):
        return False


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8001)
    parser.add_argument("--no-browser", action="store_true")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be between 1024 and 65535.")
    url = f"http://127.0.0.1:{args.port}"
    if not ready(url):
        with socket.socket() as probe:
            try:
                probe.bind(("127.0.0.1", args.port))
            except OSError:
                raise SystemExit(f"Port {args.port} is occupied by a different or unconfigured service. Choose --port 8002.")
        logs = ROOT / ".private-data" / "qa"
        logs.mkdir(parents=True, exist_ok=True)
        interpreter = ROOT / ".medgemma-venv" / "Scripts" / "python.exe"
        if not interpreter.is_file():
            interpreter = Path(sys.executable)
        environment = dict(os.environ,
                           AAROGYA_DATA_DIR=str(ROOT / ".private-data" / "manual-qa"),
                           AAROGYA_SESSION_SECRET=secrets.token_urlsafe(48))
        with (logs / f"demo-{args.port}.log").open("ab") as output, (logs / f"demo-{args.port}-errors.log").open("ab") as errors:
            process = subprocess.Popen(
                [str(interpreter), "-u", str(ROOT / "app.py"), "--host", "127.0.0.1", "--port", str(args.port)],
                cwd=ROOT, env=environment, stdin=subprocess.DEVNULL, stdout=output, stderr=errors,
                creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
                start_new_session=os.name != "nt",
            )
        (logs / f"demo-{args.port}-process.json").write_text(json.dumps({"pid": process.pid, "port": args.port}))
        deadline = time.monotonic() + 15
        while not ready(url):
            if process.poll() is not None or time.monotonic() >= deadline:
                raise SystemExit(f"Demo did not start. Check .private-data/qa/demo-{args.port}-errors.log.")
            time.sleep(0.25)
    print(f"Demo ready: {url}")
    print("Use qa-admin, qa-doctor or qa-worker with the password you chose.")
    print("Synthetic data only. Start the Jitsi room in its own tab; the host signs in there.")
    print("This localhost address works on this computer; it is not a public application link.")
    if not args.no_browser:
        webbrowser.open(url, new=2)


if __name__ == "__main__":
    main()
