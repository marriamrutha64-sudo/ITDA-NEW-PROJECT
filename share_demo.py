"""Share an isolated synthetic-data demo through a temporary HTTPS tunnel."""
from __future__ import annotations

import argparse
import contextlib
import json
import os
from pathlib import Path
import re
import secrets
import shutil
import socket
import subprocess
import sys
import time
import urllib.error
import urllib.request
import webbrowser


ROOT = Path(__file__).resolve().parent
LOG_DIR = ROOT / ".private-data" / "qa"
STATE_PATH = LOG_DIR / "public-demo-process.json"
LOCK_PATH = LOG_DIR / "public-demo-launch.lock"
URL_PATTERN = re.compile(r"https://(?!api\.)[a-z0-9-]+\.trycloudflare\.com\b")


def cloudflared_path(explicit=None):
    """Find a supplied, installed, or repository-local official executable."""
    if explicit:
        candidate = Path(explicit).expanduser().resolve()
        if not candidate.is_file():
            raise RuntimeError(f"cloudflared was not found at {candidate}.")
        return candidate
    installed = shutil.which("cloudflared")
    candidates = [ROOT / ".private-data" / "tools" / "cloudflared.exe"]
    if installed:
        candidates.insert(0, Path(installed))
    if os.environ.get("LOCALAPPDATA"):
        candidates.append(Path(os.environ["LOCALAPPDATA"]) / "Microsoft" / "WinGet" / "Links" / "cloudflared.exe")
    for variable in ("ProgramFiles", "ProgramFiles(x86)"):
        if os.environ.get(variable):
            candidates.append(Path(os.environ[variable]) / "cloudflared" / "cloudflared.exe")
    for candidate in candidates:
        if candidate.is_file():
            return candidate.resolve()
    raise RuntimeError(
        "Install Cloudflare's client with: winget install --id Cloudflare.cloudflared --exact --source winget\n"
        "Then open a new terminal and retry, or pass --cloudflared with its full executable path."
    )


def process_alive(pid):
    if isinstance(pid, bool) or not isinstance(pid, int) or pid <= 0:
        return False
    if os.name == "nt":
        import ctypes
        from ctypes import wintypes
        kernel = ctypes.WinDLL("kernel32", use_last_error=True)
        kernel.OpenProcess.argtypes = (wintypes.DWORD, wintypes.BOOL, wintypes.DWORD)
        kernel.OpenProcess.restype = wintypes.HANDLE
        kernel.GetExitCodeProcess.argtypes = (wintypes.HANDLE, ctypes.POINTER(wintypes.DWORD))
        kernel.GetExitCodeProcess.restype = wintypes.BOOL
        kernel.CloseHandle.argtypes = (wintypes.HANDLE,)
        kernel.CloseHandle.restype = wintypes.BOOL
        handle = kernel.OpenProcess(0x1000, False, pid)  # PROCESS_QUERY_LIMITED_INFORMATION
        if not handle:
            return False
        try:
            status = wintypes.DWORD()
            return bool(kernel.GetExitCodeProcess(handle, ctypes.byref(status))) and status.value == 259
        finally:
            kernel.CloseHandle(handle)
    try:
        os.kill(pid, 0)
        return True
    except PermissionError:
        return True
    except (OSError, OverflowError):
        return False


def ready(url, timeout=3):
    try:
        request = urllib.request.Request(url + "/api/health", headers={"Cache-Control": "no-cache"})
        with urllib.request.urlopen(request, timeout=timeout) as response:
            payload = json.load(response)
            return (isinstance(payload, dict) and payload.get("ok") is True
                    and payload.get("service") == "aarogya-drishti"
                    and "https://meet.jit.si" in response.headers.get("Content-Security-Policy", ""))
    except (OSError, ValueError, urllib.error.URLError):
        return False


def read_state():
    try:
        state = json.loads(STATE_PATH.read_text(encoding="utf-8"))
        return state if isinstance(state, dict) else {}
    except (OSError, ValueError):
        return {}


def save_state(state):
    temporary = STATE_PATH.with_suffix(".json.tmp")
    temporary.write_text(json.dumps(state, indent=2) + "\n", encoding="utf-8")
    temporary.replace(STATE_PATH)


@contextlib.contextmanager
def launcher_lock():
    """Avoid duplicate background services if the launcher is opened twice."""
    LOG_DIR.mkdir(parents=True, exist_ok=True)
    for attempt in range(2):
        try:
            descriptor = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY, 0o600)
            break
        except FileExistsError:
            try:
                owner = int(LOCK_PATH.read_text(encoding="ascii").strip())
            except (OSError, ValueError):
                raise RuntimeError(f"Another launch is in progress, or its lock is incomplete: {LOCK_PATH}")
            if process_alive(owner):
                raise RuntimeError("A demo launch is already in progress. Wait for that terminal to finish.")
            if attempt:
                raise RuntimeError("Could not acquire the demo launch lock. Retry shortly.")
            LOCK_PATH.unlink(missing_ok=True)
    try:
        with os.fdopen(descriptor, "w", encoding="ascii") as lock:
            lock.write(str(os.getpid()))
        yield
    finally:
        LOCK_PATH.unlink(missing_ok=True)


def background(command, log_path, environment=None):
    with log_path.open("ab") as output:
        return subprocess.Popen(
            command, cwd=ROOT, env=environment, stdin=subprocess.DEVNULL,
            stdout=output, stderr=subprocess.STDOUT,
            creationflags=subprocess.CREATE_NO_WINDOW if os.name == "nt" else 0,
            start_new_session=os.name != "nt",
        )


def check_port(port):
    with socket.socket() as probe:
        try:
            probe.bind(("127.0.0.1", port))
        except OSError as exc:
            raise RuntimeError(
                f"Port {port} is already in use without a healthy saved public demo. "
                "Choose another --port; existing services were left running."
            ) from exc


def tunnel_urls(log_path):
    try:
        with log_path.open("rb") as log:
            log.seek(0, os.SEEK_END)
            log.seek(max(0, log.tell() - 128 * 1024))
            content = log.read().decode("utf-8", errors="replace")
        return list(dict.fromkeys(URL_PATTERN.findall(content)))
    except OSError:
        return []


def start_demo(client, port, data_dir, accounts, timeout):
    deadline = time.monotonic() + timeout
    local_url = f"http://127.0.0.1:{port}"
    state = read_state()
    matching = state.get("port") == port and state.get("data_dir") == str(data_dir)
    if not matching and (process_alive(state.get("backend_pid")) or process_alive(state.get("tunnel_pid"))):
        raise RuntimeError(
            f"A presentation is already recorded on port {state.get('port')}. "
            "Reuse that --port or stop its recorded processes before starting another presentation."
        )
    backend_ok = matching and process_alive(state.get("backend_pid")) and ready(local_url)
    if backend_ok and process_alive(state.get("tunnel_pid")):
        url = state.get("url", "")
        candidates = [url] if isinstance(url, str) and URL_PATTERN.fullmatch(url) else []
        candidates.extend(tunnel_urls(LOG_DIR / "public-demo-tunnel.log"))
        for candidate in dict.fromkeys(candidates):
            if ready(candidate):
                state["url"] = candidate
                save_state(state)
                return candidate, True
        raise RuntimeError(
            "The saved tunnel process is still running but its public health check failed. "
            f"Retry shortly, or inspect {state.get('tunnel_log', LOG_DIR / 'public-demo-tunnel.log')}. "
            "Existing services were left running."
        )
    if not backend_ok and matching and process_alive(state.get("tunnel_pid")):
        raise RuntimeError("A saved tunnel is still running but its backend is unhealthy. Inspect the public-demo logs first.")
    created = []
    try:
        if not backend_ok:
            check_port(port)
            interpreter = ROOT / ".medgemma-venv" / "Scripts" / "python.exe"
            if not interpreter.is_file():
                interpreter = Path(sys.executable)
            environment = dict(os.environ, AAROGYA_DATA_DIR=str(data_dir),
                               AAROGYA_VIDEO_PROVIDER="public_demo", AAROGYA_PUBLIC_DEMO="1",
                               AAROGYA_SESSION_SECRET=secrets.token_urlsafe(48))
            backend_log = LOG_DIR / "public-demo-backend.log"
            process = background(
                [str(interpreter), "-u", str(ROOT / "app.py"), "--host", "127.0.0.1", "--port", str(port)],
                backend_log, environment,
            )
            created.append(process)
            state = {"backend_pid": process.pid, "tunnel_pid": None, "url": None, "port": port,
                     "data_dir": str(data_dir), "accounts": list(accounts), "backend_log": str(backend_log)}
            save_state(state)
            while not ready(local_url):
                if process.poll() is not None or time.monotonic() >= deadline:
                    raise RuntimeError(f"The synthetic demo backend did not become ready. Inspect {backend_log}.")
                time.sleep(0.4)
        tunnel_log = LOG_DIR / "public-demo-tunnel.log"
        # Start a new log so an expired hostname cannot be mistaken for this launch.
        tunnel_log.write_text("", encoding="utf-8")
        tunnel = background(
            [str(client), "--no-autoupdate", "tunnel", "--url", local_url, "--protocol", "http2"], tunnel_log,
        )
        created.append(tunnel)
        state.update(tunnel_pid=tunnel.pid, url=None, tunnel_log=str(tunnel_log))
        save_state(state)
        while time.monotonic() < deadline:
            if tunnel.poll() is not None:
                raise RuntimeError(f"Cloudflare's tunnel exited. Inspect {tunnel_log}; check Internet access and outbound port 7844.")
            for url in tunnel_urls(tunnel_log):
                if ready(url, timeout=min(4, max(0.2, deadline - time.monotonic()))):
                    state.update(url=url, started_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
                    save_state(state)
                    return url, False
            time.sleep(0.7)
        raise RuntimeError(f"The public HTTPS address did not become ready within {timeout} seconds. Inspect {tunnel_log} and retry.")
    except BaseException:
        # Only clean up processes started by this invocation, using their handles.
        for process in reversed(created):
            if process.poll() is None:
                process.terminate()
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    process.kill()
                    process.wait(timeout=5)
        raise


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--port", type=int, default=8003)
    parser.add_argument("--cloudflared", help="Full path to the cloudflared executable")
    parser.add_argument("--timeout", type=int, default=120, help="Startup deadline in seconds (default: 120)")
    parser.add_argument("--browser", action="store_true", help="Open the public URL in this PC's browser")
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        parser.error("Port must be between 1024 and 65535.")
    if not 10 <= args.timeout <= 120:
        parser.error("Timeout must be between 10 and 120 seconds.")
    try:
        client = cloudflared_path(args.cloudflared)
        with launcher_lock():
            from public_demo_setup import prepare_public_demo
            data_dir, accounts = prepare_public_demo()
            accounts = list(accounts)
            url, reused = start_demo(client, args.port, Path(data_dir).resolve(), accounts, args.timeout)
        print("Existing presentation reused." if reused else "Your temporary presentation is ready.")
        print(url)
        print("Open this HTTPS address on any Internet-connected phone, tablet, or computer.")
        print("Accounts: " + ", ".join(accounts) + ". Use the passwords already configured for them.")
        print("Synthetic cases only. The doctor signs into public Jitsi separately for video.")
        print("Keep this PC awake and online. The Python server and Cloudflare tunnel must keep running.")
        print("This temporary link changes after restarting the tunnel; it is not permanent hosting.")
        print(f"Process details and private logs: {STATE_PATH}")
        if args.browser:
            webbrowser.open(url, new=2)
    except (ImportError, OSError, RuntimeError, ValueError) as exc:
        print(f"Could not share the demo: {exc}", file=sys.stderr)
        return 1
    except KeyboardInterrupt:
        print("Launch cancelled. Existing services were left running.", file=sys.stderr)
        return 130
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
