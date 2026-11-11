"""Opt-in server-side adapter for an operator-approved MedGemma GPU endpoint."""
import base64
import json
import os
import time
from pathlib import Path
from urllib import request, error, parse

from medgemma_worker import ORAL_OBSERVATION_PROMPT, PROMPT_VERSION

MODELS = {"google/medgemma-27b-it", "google/medgemma-1.5-4b-it"}


class RemoteUnavailable(RuntimeError):
    pass


def config():
    endpoint = os.environ.get("AAROGYA_REMOTE_AI_URL", "").strip()
    model = os.environ.get("AAROGYA_REMOTE_AI_MODEL", "google/medgemma-27b-it").strip()
    token = os.environ.get("AAROGYA_REMOTE_AI_TOKEN", "").strip()
    parsed = parse.urlsplit(endpoint)
    if (parsed.scheme != "https" or not parsed.hostname or parsed.username or parsed.password
            or parsed.query or parsed.fragment or not parsed.path.endswith("/chat/completions")):
        raise RemoteUnavailable("Configure an HTTPS MedGemma chat/completions endpoint without embedded credentials.")
    if model not in MODELS:
        raise RemoteUnavailable("Select a supported official multimodal MedGemma model.")
    if not token or "\n" in token or "\r" in token:
        raise RemoteUnavailable("Configure the GPU endpoint credential on the application server.")
    if os.environ.get("AAROGYA_REMOTE_AI_APPROVED") != "1":
        raise RemoteUnavailable("Remote AI is disabled until the operator approves this endpoint for screening photographs.")
    return endpoint, model, token


def status():
    try:
        _, model, _ = config()
        return {"available": True, "model": model, "provider": "remote",
                "validated": False, "busy": False, "elapsed_seconds": None,
                "reason": "GPU endpoint configured; reachability and served model are checked during analysis."}
    except (RemoteUnavailable, ValueError):
        return {"available": False, "model": "not_connected", "provider": "remote",
                "validated": False, "busy": False, "elapsed_seconds": None,
                "reason": "GPU endpoint configuration or data-transfer approval is missing or invalid."}


class NoRedirect(request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def analyze(image_path):
    endpoint, model, token = config()
    path = Path(image_path)
    raw = path.read_bytes()
    if not raw or len(raw) > 12 * 1024 * 1024:
        raise RemoteUnavailable("Screening image is empty or too large for the GPU endpoint.")
    if raw.startswith(b"\xff\xd8\xff"):
        mime = "image/jpeg"
    elif raw.startswith(b"\x89PNG\r\n\x1a\n"):
        mime = "image/png"
    elif raw[:4] == b"RIFF" and raw[8:12] == b"WEBP":
        mime = "image/webp"
    else:
        raise RemoteUnavailable("Screening image format is unsupported.")
    payload = {"model": model, "temperature": 0, "max_tokens": 256, "stream": False,
               "messages": [{"role": "user", "content": [
                   {"type": "text", "text": ORAL_OBSERVATION_PROMPT},
                   {"type": "image_url", "image_url": {"url": "data:" + mime + ";base64," + base64.b64encode(raw).decode("ascii")}}
               ]}]}
    req = request.Request(endpoint, data=json.dumps(payload).encode("utf-8"),
                          headers={"Authorization": "Bearer " + token, "Content-Type": "application/json"}, method="POST")
    started = time.monotonic()
    try:
        # Never forward credentials or photographs to a redirect destination.
        with request.build_opener(NoRedirect()).open(req, timeout=280) as response:
            body = response.read(128 * 1024 + 1)
            if len(body) > 128 * 1024:
                raise RemoteUnavailable("GPU endpoint returned an oversized response. No result was saved.")
        result = json.loads(body)
        if result.get("model") != model:
            raise RemoteUnavailable("GPU endpoint did not confirm the requested MedGemma model. No result was saved.")
        choice = result["choices"][0]
        text = choice["message"]["content"]
        if not isinstance(text, str) or not text.strip() or len(text) > 12000:
            raise ValueError("Invalid generated text")
        finish = choice.get("finish_reason")
        if finish not in {"stop", "length"}:
            raise ValueError("Incomplete generation")
    except error.HTTPError as exc:
        raise RemoteUnavailable(f"GPU endpoint rejected the request (HTTP {exc.code}). No result was saved.") from None
    except (error.URLError, TimeoutError, OSError):
        raise RemoteUnavailable("GPU endpoint could not complete the request. No result was saved; the remote request may still be processing.") from None
    except (ValueError, KeyError, IndexError, TypeError):
        raise RemoteUnavailable("GPU endpoint returned an invalid response. No result was saved.") from None
    truncated = finish == "length"
    return {"text": text.strip(), "model": model, "model_revision": None,
            "validated": False, "truncated": truncated,
            "execution": {"provider": "remote", "device": "remote_unverified", "prompt_version": PROMPT_VERSION,
                          "total_seconds": round(time.monotonic() - started, 2), "clinically_validated": False},
            "notice": "NOT FOR CLINICAL USE. Experimental remote MedGemma observations; independent clinician review required."
                      + (" Output reached the token limit and may be incomplete." if truncated else "")}
