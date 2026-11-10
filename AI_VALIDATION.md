# AI Validation Record

> **Current status: ORAL-SCREENING VALIDATION NOT COMPLETED.** An official MedGemma foundation checkpoint is installed and completed a real synthetic-image inference check. There is no task-specific training dataset, reference-label inventory, patient-separated test set or clinical performance evidence. Measured fields below remain blank; synthetic outputs and upstream published metrics cannot fill them. Experimental generated observations are available with explicit warnings and clinician-only authorization.

Installed foundation model: `google/medgemma-1.5-4b-it`, revision `91850547d9f0b2fdd21aa7c5f4f3d1a8a52c243b`. See [runtime check](qa/medgemma-runtime-check.json). This records execution only; it is not a validation result for oral disease detection.

This template records the AI evidence requested by the AAROHAN Aarogya Drishti final evaluation rules. Completing it does not by itself establish clinical validity or authorize clinical use.

## 1. Model and release identification

- Model name and intended research task: **TODO**
- Model version / release identifier: **TODO**
- Architecture and input/output specification: **TODO**
- Model framework and version: **TODO**
- Checkpoint filename, checksum, size, and storage location: **TODO**
- Preprocessing, rejection rules, decision thresholds, and inference configuration: **TODO**
- Date trained; responsible team; code revision: **TODO**
- Known limitations and unsupported image types/conditions: **TODO**

## 2. Dataset inventory, provenance, and rights

Complete one row per dataset or source. Do not include patient-identifying information in this document.

| Dataset/source and version | Provenance / acquisition method | License and permitted use | Annotation method and reference-label source | Original images | Unique patients (if known) | Included conditions/classes |
|---|---|---|---|---:|---:|---|
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Consent, ethics, de-identification, and authorization for use: **TODO**
- Duplicate-image detection and patient-overlap review method: **TODO**
- Dataset exclusions and reasons: **TODO**

## 3. Patient-level training, validation, and test split

Images from one patient must not cross split boundaries. Record the split method and confirm patient-level separation; do not tune against the hidden evaluation set.

| Split | Patient count | Image count | Class/condition counts | Selection method / date |
|---|---:|---:|---|---|
| Training | TODO | TODO | TODO | TODO |
| Validation | TODO | TODO | TODO | TODO |
| Independent internal test | TODO | TODO | TODO | TODO |

- Patient-level grouping key and split implementation: **TODO**
- Leakage checks and result: **TODO**
- Training procedure, hyperparameters, stopping rule, and random seeds: **TODO**
- Any exclusions, augmentation, class balancing, or preprocessing: **TODO**

## 4. Evaluation results

Report measured values only, with numerator/denominator, confidence intervals where available, the decision threshold, and the exact dataset/split. Include a labeled confusion matrix for every evaluated set. Do not combine sets with different reference-label protocols.

### Confusion matrix

| Reference label \ Model output | TODO class 1 | TODO class 2 | Rejected / no result |
|---|---:|---:|---:|
| TODO class 1 | TODO | TODO | TODO |
| TODO class 2 | TODO | TODO | TODO |
| Invalid / unrelated / poor quality | TODO | TODO | TODO |

### Required metrics

| Evaluation set / condition | Sensitivity | Specificity | Accuracy | F1 score | False positives (count) | False negatives (count) | Rejected cases (count) | Independent test result / source |
|---|---:|---:|---:|---:|---:|---:|---|
| TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO | TODO |

- Per-condition results for normal appearances, benign ulcers, dental conditions, oral potentially malignant disorders, and cancer-suspicious appearances, only where verified reference labels support them: **TODO**
- Metric definitions, averaging method, confidence intervals, and calculation code/revision: **TODO**
- Evaluation date, evaluator, hardware/runtime, and reproducibility details: **TODO**
- Independent test report or artifact reference: **TODO**

## 5. Hidden-dataset examination protocol

The jury's hidden dataset may include confirmed oral cancer, oral potentially malignant disorders, normal oral photographs, aphthous and traumatic ulcers, dental cavities/root canals/restorations, wisdom-tooth extraction/healing sockets, gingivitis/periodontal conditions, and invalid, unrelated, or poor-quality images.

- Confirm hidden images/labels were kept undisclosed until evaluation completed: **TODO**
- Confirm no retraining, threshold tuning, preprocessing changes, or other model modification used hidden test images: **TODO**
- Model/checkpoint identifier and checksum presented to evaluators: **TODO**
- Inference configuration frozen before hidden evaluation: **TODO**
- Procedure for recording every incorrect classification and every rejected case: **TODO**
- Hidden evaluation report / evaluator / date: **TODO**

## 6. Error and rejection log

Record every incorrect classification and every rejected input. Use a non-identifying case code; never place patient names, contact details, or source filenames containing identifiers here.

| Case code | Evaluation set | Reference label | Model output or rejection | Error category | Image validity/quality finding | Review notes |
|---|---|---|---|---|---|---|
| TODO | TODO | TODO | TODO | TODO | TODO | TODO |

## 7. Required safety behavior

Before any evaluation or demonstration, verify and document each item:

- [ ] Every research output clearly displays **NOT FOR CLINICAL USE**.
- [ ] Experimental AI output is never presented as a confirmed cancer diagnosis.
- [ ] The application never declares a patient cancer-free solely from image classification.
- [ ] Invalid-image rejection never displays a cancer prediction; questionnaire risk factors never override rejection.
- [ ] Model failure or timeout is shown as a failure; it is never silently replaced by a fabricated result.
- [ ] The application never issues definitive biopsy or treatment instructions automatically.
- [ ] No unauthorized real patient records or medical photographs are used.
- [ ] A qualified clinician retains independent authority over findings, referrals, and diagnostic decisions.
- [ ] Model limitations and uncertainty are visible to users and evaluators.

Safety verification method, evidence, reviewer, and date: **TODO**

## 8. Sign-off

- Model/data owner: **TODO**
- Independent evaluator: **TODO**
- Safety reviewer: **TODO**
- Artifacts checked (datasets, licenses, code revision, checkpoint, metric report, error log): **TODO**
- Decision and date: **TODO**

**No results have been measured for this workspace. Keep all TODOs blank until the corresponding evidence exists.**
