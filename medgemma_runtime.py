"""Run a private, local MedGemma worker with bounded request concurrency."""
import json
import os
from pathlib import Path
import subprocess
import threading

MODEL_ID = "google/medgemma-1.5-4b-it"
MODEL_REVISION = "91850547d9f0b2fdd21aa7c5f4f3d1a8a52c243b"
ROOT = Path(__file__).resolve().parent
_slot = threading.BoundedSemaphore(1)


class InferenceUnavailable(RuntimeError):
    pass


def settings():
    model = Path(os.environ.get("AAROGYA_MEDGEMMA_MODEL_DIR", ROOT / "models" / "medgemma-1.5-4b-it"))
    interpreter = Path(os.environ.get("AAROGYA_MEDGEMMA_PYTHON", ROOT / ".medgemma-venv" / "Scripts" / "python.exe"))
    return model, interpreter


def status():
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
    return {"available": configured, "model": MODEL_ID, "validated": False,
            "reason": "Local inference configured; oral screening validation is pending." if configured
            else "MedGemma runtime or local weights are missing. No prediction was made."}


def analyze(image_path):
    if not status()["available"]:
        raise InferenceUnavailable(status()["reason"])
    if not _slot.acquire(blocking=False):
        raise InferenceUnavailable("MedGemma is busy. Retry after the current analysis finishes.")
    try:
        worker = Path(__file__).with_name("medgemma_worker.py")
        model, interpreter = settings()
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
        return {"text": text.strip(), "model": MODEL_ID, "validated": False,
                "notice": "NOT FOR CLINICAL USE. Unvalidated generated observations; clinician review is required. No diagnostic accuracy or confidence is established."}
    finally:
        _slot.release()
