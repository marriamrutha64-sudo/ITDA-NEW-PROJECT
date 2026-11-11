"""Measure real local inference on a synthetic image; never patient data."""
import argparse
from datetime import datetime, timezone
import json
from pathlib import Path
import sys
import tempfile
import time

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import medgemma_runtime


def main():
    from PIL import Image
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    deadline = time.monotonic() + 330
    while medgemma_runtime.status()["busy"]:
        if time.monotonic() > deadline:
            raise SystemExit("Model remains busy; benchmark did not run")
        time.sleep(2)
    with tempfile.TemporaryDirectory(prefix="aarogya-speed-") as directory:
        image = Path(directory) / "synthetic.png"
        Image.new("RGB", (320, 320), (128, 128, 128)).save(image)
        started = time.perf_counter()
        result = medgemma_runtime.analyze(image)
        elapsed = time.perf_counter() - started
    evidence = {"checked_at_utc": datetime.now(timezone.utc).isoformat(),
                "input": "Uniform gray 320x320 synthetic image; no patient data",
                "elapsed_seconds": round(elapsed, 2), "clinical_validation": False,
                "result": result}
    args.output.write_text(json.dumps(evidence, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"elapsed_seconds": round(elapsed, 2), "execution": result["execution"]}), flush=True)


if __name__ == "__main__":
    main()
