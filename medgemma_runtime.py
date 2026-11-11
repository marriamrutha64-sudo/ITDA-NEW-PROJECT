"""Run a private, local MedGemma worker with bounded request concurrency."""
import json
import os
from pathlib import Path
import re
import subprocess
import threading
import time
import inference_lock

MODEL_ID = "google/medgemma-1.5-4b-it"
MODEL_REVISION = "91850547d9f0b2fdd21aa7c5f4f3d1a8a52c243b"
ROOT = Path(__file__).resolve().parent
_slot = threading.BoundedSemaphore(1)
_activity_lock = threading.Lock()
_started_at = None


class InferenceUnavailable(RuntimeError):
    pass


_ORAL_ANATOMY = re.compile(
    r"\b(?:tongue|teeth|tooth|gums?|gingiva|palate|buccal|cheek|lips?|oral mucosa|floor of (?:the )?mouth)\b",
    re.IGNORECASE,
)
_UNRELATED_IMAGE_CLAIM = re.compile(
    r"\b(?:(?:the|this)\s+)?(?:image|photo(?:graph)?|picture)\s+"
    r"(?:is|appears?|seems?)\s+(?:to\s+be\s+)?"
    r"(?:unrelated|not\s+(?:related|relevant)\s+to\s+oral\b)"
    r"|\bunrelated\s*:\s*(?:(?:the|this)\s+)?(?:image|photo(?:graph)?|picture)\b",
    re.IGNORECASE,
)
_NEGATED_ANATOMY = re.compile(
    r"\b(?:no|without|cannot|can't|not|lacks?)\b.{0,55}"
    r"\b(?:tongue|teeth|tooth|gums?|gingiva|palate|buccal|cheek|lips?|oral mucosa|oral anatomy)\b"
    r"|\b(?:tongue|teeth|tooth|gums?|gingiva|palate|buccal|cheek|lips?|oral mucosa|oral anatomy)\b"
    r".{0,25}\b(?:not|no)\b.{0,20}\b(?:visible|identifiable|discernible)\b",
    re.IGNORECASE,
)
_INCONSISTENCY_WARNING = (
    "Generated text may be internally inconsistent: it mentions oral anatomy "
    "while also calling the image unrelated. Review the photograph independently."
)


def assess_output(text):
    """Flag a narrow contradiction without modifying the model's source text.

    This is a text consistency check, not an image or clinical assessment.
    A negative result does not establish that the generated text is correct.
    """
    positive_anatomy = isinstance(text, str) and any(
        _ORAL_ANATOMY.search(line) and not _NEGATED_ANATOMY.search(line)
        for line in text.splitlines()
    )
    inconsistent = bool(positive_anatomy and _UNRELATED_IMAGE_CLAIM.search(text))
    return {"inconsistent": inconsistent,
            "output_warning": _INCONSISTENCY_WARNING if inconsistent else None}


def settings():
    model = Path(os.environ.get("AAROGYA_MEDGEMMA_MODEL_DIR", ROOT / "models" / "medgemma-1.5-4b-it"))
    interpreter = Path(os.environ.get("AAROGYA_MEDGEMMA_PYTHON", ROOT / ".medgemma-venv" / "Scripts" / "python.exe"))
    return model, interpreter


def status():
    if os.environ.get("AAROGYA_AI_PROVIDER", "local") == "gemini":
        import gemini_runtime
        result = gemini_runtime.status()
        with _activity_lock:
            result["busy"] = _started_at is not None
            result["elapsed_seconds"] = int(time.monotonic() - _started_at) if _started_at is not None else None
        return result
    if os.environ.get("AAROGYA_AI_PROVIDER", "local") == "remote":
        import remote_medgemma
        result = remote_medgemma.status()
        with _activity_lock:
            result["busy"] = _started_at is not None
            result["elapsed_seconds"] = int(time.monotonic() - _started_at) if _started_at is not None else None
        return result
    model, interpreter = settings()
    configured = False
    try:
        manifest = json.loads((model / "installation.json").read_text(encoding="utf-8"))
        files = manifest["files"]
        configured = (
            interpreter.is_file() and manifest["model"] == MODEL_ID
            and manifest["revision"] == MODEL_REVISION
            and any(name.endswith(".safetensors") for name in files)
            and "config.json" in files and "tokenizer.json" in files
            and all(Path(name).name == name and size > 0 and (model / name).is_file()
                    and (model / name).stat().st_size == size for name, size in files.items())
        )
    except (OSError, ValueError, KeyError, TypeError):
        pass
    with _activity_lock:
        elapsed = int(time.monotonic() - _started_at) if _started_at is not None else None
    try:
        busy = elapsed is not None or (configured and inference_lock.is_busy(model))
    except OSError:
        configured = False
        busy = False
    return {"available": configured, "model": MODEL_ID, "validated": False,
            "busy": bool(busy), "elapsed_seconds": elapsed,
            "reason": "Local inference configured; oral screening validation is pending." if configured
            else "MedGemma runtime or local weights are missing. No prediction was made."}


def analyze(image_path):
    global _started_at
    if not status()["available"]:
        raise InferenceUnavailable(status()["reason"])
    if not _slot.acquire(blocking=False):
        raise InferenceUnavailable("MedGemma is busy. Retry after the current analysis finishes.")
    with _activity_lock:
        _started_at = time.monotonic()
    process_lock = None
    try:
        if os.environ.get("AAROGYA_AI_PROVIDER", "local") == "gemini":
            import gemini_runtime
            try:
                result = gemini_runtime.analyze(image_path)
            except gemini_runtime.GeminiUnavailable as exc:
                raise InferenceUnavailable(str(exc)) from None
            result.update(assess_output(result["text"]))
            return result
        if os.environ.get("AAROGYA_AI_PROVIDER", "local") == "remote":
            import remote_medgemma
            try:
                result = remote_medgemma.analyze(image_path)
            except remote_medgemma.RemoteUnavailable as exc:
                raise InferenceUnavailable(str(exc)) from None
            result.update(assess_output(result["text"]))
            return result
        worker = Path(__file__).with_name("medgemma_worker.py")
        model, interpreter = settings()
        try:
            process_lock = inference_lock.try_acquire(model)
        except OSError as exc:
            raise InferenceUnavailable("Could not acquire the local model execution lock.") from exc
        if process_lock is None:
            raise InferenceUnavailable("MedGemma is busy in another app instance. Retry after its analysis finishes.")
        environment = dict(os.environ, HF_HUB_OFFLINE="1", TRANSFORMERS_OFFLINE="1", HF_HUB_DISABLE_TELEMETRY="1")
        try:
            completed = subprocess.run(
                [str(interpreter), str(worker)],
                input=json.dumps({"image_path": str(image_path), "model_dir": str(model)}),
                text=True, encoding="utf-8", capture_output=True, timeout=300, env=environment,
            )
        except (OSError, subprocess.TimeoutExpired) as exc:
            raise InferenceUnavailable("Local model could not finish within five minutes. No result was saved.") from exc
        if completed.returncode:
            raise InferenceUnavailable("Local MedGemma failed. Check runtime dependencies, model access and available memory.")
        try:
            result = json.loads(completed.stdout)
            text = result["text"]
            if not isinstance(text, str) or not text.strip() or len(text) > 12000:
                raise ValueError("Invalid output")
        except (ValueError, KeyError, TypeError) as exc:
            raise InferenceUnavailable("Local model returned an invalid result.") from exc
        truncated = result.get("truncated") is True
        execution = result.get("execution", {})
        execution = {**execution, **{key: result[key] for key in ("load_seconds", "preprocess_seconds", "generation_seconds", "total_seconds", "generated_tokens") if key in result}}
        assessment = assess_output(text)
        return {"text": text.strip(), "model": MODEL_ID, "model_revision": MODEL_REVISION, "validated": False, "truncated": truncated,
                **assessment,
                "execution": execution,
                "notice": "NOT FOR CLINICAL USE. Unvalidated generated observations; clinician review is required. No diagnostic accuracy or confidence is established."
                + (" Output reached the demo token limit and may be incomplete." if truncated else "")
                + (" " + assessment["output_warning"] if assessment["output_warning"] else "")}
    finally:
        inference_lock.release(process_lock)
        with _activity_lock:
            _started_at = None
        _slot.release()
