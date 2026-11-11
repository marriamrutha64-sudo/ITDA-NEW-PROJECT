"""Build a deterministic source-only ZIP; excludes installed data and secrets.

No network calls, accounts, model downloads, or running-server changes occur.
The explicit path allowlist deliberately rejects unreviewed new files.
"""
import argparse
import hashlib
import json
from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parents[1]
ROOT_FILES = """
.gitignore README.md AI_VALIDATION.md MEDGEMMA_SETUP.md GEMINI_SETUP.md SHARE_DEMO.md VIDEO_DEMO.md
app.py ai_jobs.py auth_limits.py backup_data.py clinical_records.py role_visibility.py start_gemini.py gemini_secret.py
download_medgemma.py inference_lock.py medgemma_runtime.py medgemma_worker.py remote_medgemma.py gemini_runtime.py health_assistant.py
medgemma_cpu.py model_transfer.py offline_screenings.py open_demo.py
public_demo_setup.py setup_medgemma.py share_demo.py requirements-medgemma.txt
app.js mic-preflight.js care-records.js gallery.js medgemma-ui.js health-assistant.js
offline-capture-ui.js offline-screening.js offline-vault.js patient-call.js
reference-labels.js service-worker.js index.html patient-call.html styles.css
manifest.json icon.svg OFFICE_PACKAGE_README.txt ROLE_HIERARCHY_PREVIEW.md
""".split() + ["START OFFICE DEMO.cmd", "START GEMINI DEMO.cmd"]
DIRECTORY_FILES = {
    "assets/illustrations": """teleconsultation-india.png care-journey-india.png privacy-stewardship-india.png
        overview-community-india.png overview-clinic-india.png patient-registration-india.png
        oral-screening-setup-india.png clinician-review-india.png visual-reference-india.png""".split(),
    "assets/reference": """clinic-reference.jpg examination-reference.jpg gums-reference.jpg
        outreach-reference.jpg palate-reference.jpg tongue-reference.jpg ulcer-reference-poster.jpg""".split(),
    "docs": "ARCHITECTURE.md API_DATABASE.md EVALUATION_READINESS.md OFFICE_DEMO.md UI_DESIGN_SYSTEM.md".split(),
    "deploy": "Dockerfile compose.yaml Caddyfile README.md".split(),
    "scripts": "start-video-demo.ps1 check_office_demo.py benchmark_medgemma.py package_office_demo.py".split(),
    "tests": """care-records.test.cjs medgemma-ui.test.cjs mic-preflight.test.cjs role-navigation.test.cjs
        navigation.test.cjs offline-capture-ui.test.cjs offline-vault.test.cjs patient-call.test.cjs
        video-ui.test.cjs test_access_and_static.py test_ai_jobs.py test_api.py test_role_visibility.py
        test_auth_limits.py test_backend.py test_backup_data.py test_clinical_records.py
        test_google_meet.py test_inference_lock.py test_medgemma_cpu.py
        test_medgemma_runtime.py test_model_transfer.py test_offline_screenings.py
        test_offline_sync.py test_post_rejection.py test_public_demo_setup.py
        test_video_dryrun.py test_package_office_demo.py""".split(),
    # Only reviewed synthetic/public JSON evidence. Never include raw test logs.
    "qa": """async-ai-runtime-check.json latest-verification.json medgemma-runtime-check.json
        medgemma-speed-check.json medgemma-speed-attention-check.json
        medgemma-speed-native-concise.json medgemma-performance-comparison.json
        office-demo-readiness.json office-demo-http-preflight.json
        office-demo-health-responsiveness.json medgemma-v3-public-reference-check.json
        medgemma-v4-public-reference-check.json jitsi-external-flow-qa.json""".split(),
}
REQUIRED_FILES = set(ROOT_FILES)
for _directory, _names in DIRECTORY_FILES.items():
    if _directory != "qa":
        REQUIRED_FILES.update(f"{_directory}/{name}" for name in _names)


def source_paths(root):
    """Return reviewed ordinary files only; never follow a link into private data."""
    root = Path(root).resolve()
    approved = set(ROOT_FILES)
    for directory, names in DIRECTORY_FILES.items():
        approved.update(f"{directory}/{name}" for name in names)
    missing = sorted(name for name in REQUIRED_FILES if not (root / name).is_file())
    if missing:
        raise ValueError("Required source files are missing: " + ", ".join(missing))
    selected = []
    for name in sorted(approved):
        path = root / name
        if not path.exists():
            continue
        for component in [path, *path.parents]:
            if component == root:
                break
            if component.is_symlink() or getattr(component, "is_junction", lambda: False)():
                raise ValueError("Linked source files/directories are not allowed: " + name)
        if not path.resolve().is_relative_to(root) or not path.is_file():
            raise ValueError("Source path is not an ordinary file inside the project: " + name)
        selected.append((name, path))
    return selected


def build_package(destination, root=ROOT):
    """Create a new ZIP without replacing any existing artifact or source file."""
    root, destination = Path(root).resolve(), Path(destination).resolve()
    payloads = {name: path.read_bytes() for name, path in source_paths(root)}
    manifest = {
        "format_version": 1,
        "package_type": "source-only-office-demonstration",
        "contains_installed_model": False,
        "contains_accounts_or_patient_data": False,
        "clinical_validation": False,
        "files": {name: {"bytes": len(data), "sha256": hashlib.sha256(data).hexdigest()}
                  for name, data in payloads.items()},
    }
    payloads["PACKAGE_MANIFEST.json"] = (json.dumps(manifest, indent=2, sort_keys=True) + "\n").encode("utf-8")
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation protects previous deliverables and prevents overwrites.
    with destination.open("xb") as output:
        with zipfile.ZipFile(output, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=9) as archive:
            for name, data in sorted(payloads.items()):
                metadata = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
                metadata.compress_type = zipfile.ZIP_DEFLATED
                metadata.create_system = 3
                metadata.external_attr = 0o100644 << 16
                archive.writestr(metadata, data, compresslevel=9)
    return {"files": len(payloads), "bytes": destination.stat().st_size,
            "sha256": hashlib.sha256(destination.read_bytes()).hexdigest()}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--output", type=Path, required=True,
                        help="New ZIP path; an existing file is never overwritten")
    args = parser.parse_args()
    try:
        result = build_package(args.output)
    except (OSError, ValueError, zipfile.BadZipFile) as error:
        parser.exit(1, f"Package failed: {error}\n")
    print(json.dumps(result, indent=2))


if __name__ == "__main__":
    main()
