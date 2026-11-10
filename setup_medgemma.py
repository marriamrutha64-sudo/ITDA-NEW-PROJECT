"""Finish a resumable model install, then attempt a synthetic local inference check."""
import json
from pathlib import Path
import subprocess
import sys
from datetime import datetime, timezone

ROOT = Path(__file__).resolve().parent


def main():
    result = subprocess.run([sys.executable, "-u", str(ROOT / "download_medgemma.py")], cwd=ROOT)
    if result.returncode:
        print("Download interrupted. Rerun setup_medgemma.py to resume completed chunks.", flush=True)
        return result.returncode
    from PIL import Image
    import medgemma_runtime
    qa_dir = ROOT / ".private-data" / "qa"
    qa_dir.mkdir(parents=True, exist_ok=True)
    image = qa_dir / "synthetic-medgemma.png"
    Image.new("RGB", (256, 256), (128, 128, 128)).save(image)
    report = {"timestamp": datetime.now(timezone.utc).isoformat(), "model": medgemma_runtime.MODEL_ID,
              "revision": medgemma_runtime.MODEL_REVISION, "synthetic_input": True,
              "clinical_validation": False}
    print("Download verified. Running a synthetic local inference check (five-minute limit).", flush=True)
    try:
        output = medgemma_runtime.analyze(image)
        report.update({"inference_passed": True, "generated_text": output["text"]})
        print("Synthetic inference completed. This is a runtime check, not clinical validation.", flush=True)
        exit_code = 0
    except medgemma_runtime.InferenceUnavailable as error:
        report.update({"inference_passed": False, "error": str(error)})
        print(f"Model downloaded but inference check failed: {error}", flush=True)
        exit_code = 1
    (qa_dir / "medgemma-smoke.json").write_text(json.dumps(report, indent=2), encoding="utf-8")
    return exit_code


if __name__ == "__main__":
    raise SystemExit(main())
