# Local MedGemma setup

The integration uses the official `google/medgemma-1.5-4b-it` model. It is installed on this workstation and completed a real local inference check on a synthetic gray image. The [runtime evidence](qa/medgemma-runtime-check.json) records that execution. It is not validated for oral cancer screening and does not establish evaluation eligibility.

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

On Windows, the app automatically finds the verified model in `models/medgemma-1.5-4b-it` and the interpreter in `.medgemma-venv/Scripts/python.exe`. The environment variables above override those defaults. [requirements-medgemma.txt](requirements-medgemma.txt) pins the installed runtime versions for reproducibility: torch 2.15.0, transformers 4.57.6, accelerate 1.15.0, Pillow 12.3.0, safetensors 0.8.0, huggingface-hub 0.36.2 and hf-xet 1.8.0. Preserve the model revision and runtime configuration when reproducing a recorded run.

For a resumable installation followed by a synthetic inference check, run `.\.medgemma-venv\Scripts\python.exe -u setup_medgemma.py`. The local check report is written to `.private-data/qa/medgemma-smoke.json`. It proves only whether this computer completed inference on a plain gray image; it does not establish clinical performance. Large weights download in parallel 8 MiB ranges, with completed chunks recorded so interrupted downloads can resume.

This computer has 16 GB RAM and Intel integrated graphics. The worker uses bfloat16 weights to reduce memory requirements. The synthetic CPU inference check completed within the five-minute limit; other inputs may still exceed available memory or time. Inference dependencies use a separate Python 3.12 environment.

For CPU runs, the worker defaults to **eight intra-operation threads and one inter-operation thread**, retaining original **bfloat16 stored weights**. Its default `AAROGYA_MEDGEMMA_CPU_COMPUTE=float32` performs linear, convolution and attention arithmetic in float32, converts outputs back to the expected dtype, and bounds temporary vocabulary-head weight copies. Causal/sliding attention masks remain registered. This avoids retaining a complete second float32 model. `native` restores the earlier arithmetic path; `AAROGYA_MEDGEMMA_THREADS` selects 1 to 8 intra-operation threads. Arithmetic changes can change generated text; no clinical equivalence is claimed. No int8 quantization or reduced-image-resolution path is shipped. The current v4 prompt asks for three short lines (at most 35 words) on quality, directly visible observations, and limits. It no longer asks the model to judge whether every image is unrelated; that wording encouraged contradictory extra lines in earlier output. The model may still ignore the requested format. CPU generation is capped at 64 new tokens (CUDA: 256). Reaching the cap without an end token marks the output incomplete.

The office preparation checks on **11 November 2026** selected the fastest completed local candidate: **203.10 seconds end-to-end**, 51 generated tokens, not truncated, on a uniform gray synthetic image. A native-arithmetic control using the same concise prompt took **246.14 seconds** and produced the same text. Loading was about five seconds; generation remained the main delay. These are single-run observations with system-load and thermal variability, not response-time guarantees. **Sub-minute inference was not achieved.** See [candidate comparison](qa/medgemma-performance-comparison.json). Reopening a saved result does not run inference again. All AI remains local on this laptop.

After the contradictory saved-output report, a first grounded prompt on the project-supplied public tongue reference exceeded the 300-second worker limit and saved no result. The shorter v4 prompt with a 64-token CPU cap completed one run on that reference in **156.14 seconds** (44 tokens, not truncated). It did not call the image unrelated, and the narrow consistency check returned false. The generated text did not follow the requested three-line format. These are single public-reference runtime observations, **not** an oral-health accuracy measurement or clinical validation. See the [completed run](qa/medgemma-v4-public-reference-check.json) and [timeout record](qa/medgemma-v3-public-reference-check.json).

On 10 November 2026, two earlier HTTPS CPU jobs timed out at 300 seconds (the earlier 256-token configuration and a four-thread/96-token attempt). The final original-bfloat16, eight-thread, 96-token configuration completed a standalone gray-image run in 197.64 seconds (79 tokens, not truncated). Its public HTTPS asynchronous check then succeeded in 224.73 seconds, with a 0.188-second submission response, saved exact output and a linked clinician review. A faster int8 trial produced unusable repetitive text and was rejected; it is not shipped. See [HTTP integration evidence](qa/async-ai-runtime-check.json). These are runtime observations, not clinical validation.

## App behavior

Clinicians can request observations on a saved screening from the screening list after explicitly acknowledging that AI is advisory only and must not guide clinical decision-making during the demonstration. The UI submits `POST /api/ai/jobs` and polls the durable job status, so CPU generation does not depend on one long browser request. One job is admitted per server process; the inference runtime also bounds execution. The worker loads the model for each request, so cold starts can be slow. Runtime processing is bounded to five minutes and may fail for memory or timeout reasons.

A successful generation stores its exact text, model identifier, unvalidated notice and generation audit separately from clinical assessments. The `ai_inferences.runtime_json` provenance field retains the model revision, execution device/precision/thread configuration and truncation flag; API records expose it as `runtime`. Reopening a screening can load the saved result. `GET /api/ai/results/{screening_id}` supplies saved source records for clinical review. Missing models, failed or interrupted jobs have explicit failure state and no fabricated replacement output. A server restart marks unfinished jobs interrupted rather than silently resuming them. An OS-level model lock also prevents simultaneous execution by application instances owned by the same OS user and pointing at the same checkpoint. See the [API reference](docs/API_DATABASE.md).

The application flags a narrow text contradiction when a generated result both mentions oral anatomy and says the image is unrelated. This check also runs when older saved results are read. It adds a visible warning and never rewrites the original model text or clinician record. An output with no warning is **not** thereby accurate or clinically usable; the check does not examine image content or measure diagnostic performance.

In Care coordination, choose the patient and screening, inspect the saved AI run and record agreement, disagreement/override, insufficient evidence, or an independent assessment. AI-related dispositions require a genuine inference audit for that screening; a reviewer can select the exact saved run. An independent assessment does not claim AI use. Older audit-only generations whose text was not saved remain labeled unavailable. Recording a review does not validate the underlying model or make it a diagnostic device.

Installing weights does not supply a labeled oral-health dataset, patient-separated splits, confusion matrix, sensitivity/specificity, hidden-set results, or independent clinical validation. The existing gray-image runtime check proves local execution only. See [AI_VALIDATION.md](AI_VALIDATION.md) and the separate [evaluation evidence mapping](docs/EVALUATION_READINESS.md). Do not turn a completed runtime/job check into an oral-cancer accuracy or eligibility claim.

Sources: https://developers.google.com/health-ai-developer-foundations/medgemma and https://huggingface.co/google/medgemma-1.5-4b-it
