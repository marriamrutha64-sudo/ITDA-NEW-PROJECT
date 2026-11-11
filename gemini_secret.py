"""Read a Windows user-bound encrypted key; never store plaintext credentials."""
import os
from pathlib import Path
import subprocess

KEY_PATH = Path(__file__).resolve().parent / ".private-data" / "secrets" / "gemini.dpapi"


def load_key():
    if os.name != "nt" or not KEY_PATH.is_file():
        return ""
    literal = str(KEY_PATH).replace("'", "''")
    script = "$ErrorActionPreference='Stop'; $secret=Get-Content -Raw -LiteralPath '" + literal + "' | ConvertTo-SecureString; [Console]::Write(([System.Net.NetworkCredential]::new('', $secret)).Password)"
    result = subprocess.run(["powershell.exe", "-NoProfile", "-NonInteractive", "-Command", script],
                            capture_output=True, text=True, timeout=15,
                            creationflags=subprocess.CREATE_NO_WINDOW)
    if result.returncode:
        raise RuntimeError("Saved Gemini key could not be unlocked by this Windows user.")
    return result.stdout.strip()
