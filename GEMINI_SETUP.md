# Gemini demo setup

## Health AI workspace

Open **Health AI** in the sidebar. The three task choices are:

- **Oral photos:** opens the existing consented screening and saved clinician-review workflow.
- **Health questions:** enter a general health question or symptom description, with relevant context. Each request is independent, not a persistent conversation.
- **Medical reports:** paste up to 25000 characters or upload a PDF/JPG/PNG/WebP file up to 4 MB; an additional question is optional. Report explanations request exact readable values, units and source ranges. Raw medical scans and unsupported files are not accepted as report inputs.

All signed-in workspace roles can request educational question/report explanations. Oral-photo inference retains its clinician role restriction. Before sending, confirm the Google transfer notice. Use only fictional or public demonstration inputs. The new assistant does not write uploads, questions or answers to patient records or browser storage. Responses clear on sign-out or explicit clear. They are processed by Google's service under the account's data terms.

A saved Windows-encrypted Gemini key is now reused on ordinary application startup when no provider is explicitly selected. Set `AAROGYA_AI_PROVIDER=local` to deliberately retain local-only inference. Local mode does not support questions/reports; it returns an explicit setup error instead of pretending to analyze them.

Live checks completed with Gemini 3.6 Flash: a general educational question in 9.12 seconds and a generated fictional PDF in 13.11 seconds, neither truncated. An earlier question attempt returned a temporary HTTP 503; external-service availability is not guaranteed. See `qa/gemini-all-workflows-check.json`. These checks do not establish diagnostic accuracy, comprehensive disease coverage or clinical validation.

The app supports Google's Gemini image-input API through a server-side adapter. No GPU, model download or extra Python package is required. A working Gemini API key, internet access and available project quota are required. The default model is `gemini-3.6-flash`; set `AAROGYA_GEMINI_MODEL` to another image-capable Gemini model available to your project if necessary.

1. Create a key in https://aistudio.google.com/api-keys using your own account. Do not paste it into chat or browser application code.
2. Let any current AI job finish and stop the existing application server on port 8001. The launcher refuses to replace a running server.
3. Double-click **START GEMINI DEMO.cmd**. If an operator has saved a Windows user-encrypted key, the launcher unlocks it automatically. Otherwise enter your key at the hidden terminal prompt; a typed key stays in process environment memory and is not saved by the launcher. Neither path puts the key in shell command history.
4. Sign in at http://127.0.0.1:8001 using an existing demo account. Open Oral screening. The AI card should say Gemini configured. This confirms configuration only; API access is checked by a real analysis.
5. Save a synthetic or public reference image, then choose **Experimental Gemini observations** on its screening record. Confirm the notice about sending that image to Google. Successful source text and returned model version are saved separately from clinician assessments.

Only the selected image and fixed research prompt are sent. Patient names, record notes, application passwords and local filenames are not included. The photograph itself may still contain identifying information. Use only synthetic or public reference images in this demo. Free-tier content may be used to improve Google products. Paid-tier data treatment does not by itself certify suitability for patient information. Review applicable consent, contractual and data-handling requirements before any use with real patients.

For an existing managed server, set `AAROGYA_AI_PROVIDER=gemini` and `GEMINI_API_KEY` in its secret environment, then restart. Do not put the key in frontend code or committed files. Requests go only to `https://generativelanguage.googleapis.com`; redirects are refused. Both job and synchronous analysis routes require `acknowledge_google_transfer=true` as well as the experimental acknowledgement. The API key is sent in a header, not a URL.

Missing/invalid keys, safety blocks, network failures, unavailable models and quota limits produce explicit errors without fabricated observations or an automatic local fallback. A timed-out request may still consume remote quota. The application serializes AI requests but does not enforce a monetary budget; configure project limits with Google.

After the account holder supplied a key, a real Gemini 3.6 Flash API request completed on a generated 240-by-240 uniform gray PNG in 5.42 seconds. It described the blank image and stated that no oral anatomy was identifiable. No patient image was sent. This confirms this one request and does not establish response-time guarantees or clinical accuracy. The demo server was restarted on port 8001 and its health endpoint confirmed provider `gemini` and availability.

At the account holder's request, the supplied key is stored as Windows DPAPI ciphertext at `.private-data/secrets/gemini.dpapi`, outside the source package and ignored by Git. It can be unlocked only in the matching Windows user context. It is decrypted into the server's process environment at launch; this is not a managed enterprise secret store. To remove the saved credential, stop Gemini mode and remove that single encrypted file. Do not copy it into source archives or shared backups.

Return to local mode by stopping the Gemini server and using **START OFFICE DEMO.cmd** in a normal environment with no `AAROGYA_AI_PROVIDER=gemini` override. The local MedGemma installation and existing records are retained.

Gemini output is experimental image description, not validated oral-disease detection or medical diagnosis. It requires independent clinician review.

## Updated review format

The `oral-review-support-v1` prompt requests possible conditions supported by visible findings, uncertainty, review priority, next examination steps, missing-history questions and general urgent warning signs. It does not establish disease or severity from a photograph, assign a disease stage/risk percentage, or prescribe treatment. Insufficient images should produce insufficient-evidence statements rather than a differential or an all-clear result. These are prompt constraints, not a validated clinical enforcement system; review generated text independently.

The output budget is 4096 tokens, including any model reasoning. New `MAX_TOKENS` responses fail rather than save a partial clinical review. Previously saved truncated outputs remain unchanged and show an explicit warning. Request a new analysis to get the revised format; viewing an old result does not regenerate it. Prompt version is retained in inference metadata.

A real uniform-gray synthetic image check completed in 9.61 seconds without truncation, used all six requested sections, and declined to infer disease or urgency. See `qa/gemini-review-support-check.json`. This checks formatting and one uninformative-image response only, not disease accuracy or reliable severity assessment.

Safety wording references: [NIDCR oral-health warning symptoms](https://www.nidcr.nih.gov/health-info/oral-cancer), [NHS severe throat/airway warning signs](https://www.nhs.uk/symptoms/sore-throat/). Persistent oral sores or red/white patches beyond two weeks warrant professional review; warning signs in the output are general advice, not symptoms observed in a photograph.

Official references checked during implementation:

- https://ai.google.dev/api/generate-content
- https://ai.google.dev/gemini-api/docs/models
- https://ai.google.dev/gemini-api/docs/pricing
