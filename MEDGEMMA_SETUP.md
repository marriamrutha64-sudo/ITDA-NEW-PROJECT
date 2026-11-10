# Local MedGemma setup

The integration targets the official `google/medgemma-1.5-4b-it` model. Once installed, it can generate experimental observations for clinician review. No real model run has been completed here. It is not validated for oral cancer screening and does not establish evaluation eligibility.

## Install

1. Sign in at https://huggingface.co/google/medgemma-1.5-4b-it and review/accept Google's access conditions yourself.
2. Install Python 3.12, then run these commands from the repository in PowerShell:

```powershell
py -3.12 -m venv .medgemma-venv
.\.medgemma-venv\Scripts\python.exe -m pip install -r requirements-medgemma.txt
.\.medgemma-venv\Scripts\hf.exe auth login
.\.medgemma-venv\Scripts\python.exe download_medgemma.py
$env:AAROGYA_MEDGEMMA_PYTHON = "$PWD\.medgemma-venv\Scripts\python.exe"
$env:AAROGYA_MEDGEMMA_MODEL_DIR = "$PWD\models\medgemma-1.5-4b-it"
python app.py
```

Keep Hugging Face tokens in the local login credential store; do not paste them into chat or Git. Weights are excluded from Git. The download requires authenticated model access. The installer pins the upstream checkpoint revision and verifies file sizes and published LFS SHA-256 checksums before writing its installation manifest. The app stays unavailable until that manifest and all listed files are present. Model inference uses local files only and disables Hugging Face network access in the worker.

On Windows, the app automatically finds the verified model in `models/medgemma-1.5-4b-it` and the interpreter in `.medgemma-venv/Scripts/python.exe`. The environment variables above override those defaults.

For a resumable installation followed by a synthetic inference check, run `.\.medgemma-venv\Scripts\python.exe -u setup_medgemma.py`. The local check report is written to `.private-data/qa/medgemma-smoke.json`. It proves only whether this computer completed inference on a plain gray image; it does not establish clinical performance. Large weights download in parallel 8 MiB ranges, with completed chunks recorded so interrupted downloads can resume.

This computer has 16 GB RAM and Intel integrated graphics. The worker uses bfloat16 weights to reduce memory requirements. CPU inference may still exceed available memory or the five-minute request limit. A compatible CUDA GPU host is preferable; successful inference has not been demonstrated here. Python 3.15 is the current app interpreter, so inference dependencies use a separate Python 3.12 environment.

## App behavior

Clinicians can request observations on a saved screening from the screening list. Only one local request runs at once. Outputs are displayed as text, are not automatically saved as clinical assessments, and carry an unvalidated notice. Each attempt is separate from a human review. The worker loads the model for each request, so cold starts can be slow.

Installing weights does not supply a labeled oral-health dataset, patient-separated splits, confusion matrix, sensitivity/specificity, hidden-set results, or independent clinical validation. See AI_VALIDATION.md.

Sources: https://developers.google.com/health-ai-developer-foundations/medgemma and https://huggingface.co/google/medgemma-1.5-4b-it
