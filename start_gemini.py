"""Launch the existing demo with a privately entered, process-only Gemini key."""
from getpass import getpass
import os
from pathlib import Path
import socket
import subprocess
import sys
from gemini_secret import load_key


def main():
    root = Path(__file__).resolve().parent
    with socket.socket() as probe:
        if probe.connect_ex(("127.0.0.1", 8001)) == 0:
            raise SystemExit("The demo is already running on port 8001. Stop its server after any AI job finishes, then run START GEMINI DEMO.cmd again. No running server was changed.")
    key = os.environ.get("GEMINI_API_KEY", "").strip() or load_key()
    if not key:
        if not sys.stdin.isatty():
            raise SystemExit("Run this launcher in a terminal to enter the Gemini key privately.")
        key = getpass("Gemini API key (hidden; never saved to a file): ").strip()
    if not key or any(c.isspace() for c in key):
        raise SystemExit("A valid API key is required. No server was started.")
    environment = dict(os.environ, GEMINI_API_KEY=key, AAROGYA_AI_PROVIDER="gemini")
    print("Gemini mode: use synthetic/public reference images only. Each analysis asks before sending its image to Google.")
    result = subprocess.run([sys.executable, str(root / "open_demo.py"), "--port", "8001"], cwd=root, env=environment)
    raise SystemExit(result.returncode)


if __name__ == "__main__":
    main()
