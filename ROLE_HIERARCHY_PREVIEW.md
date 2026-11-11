# Role hierarchy preview

This directory is an isolated copy. The working Aarogya Drishti directory, its
database, local server and public tunnel are unchanged.

## Record visibility

| Signed-in role | Patient and linked records visible | Main actions |
| --- | --- | --- |
| Health worker | Patients registered by that worker | Register, screen, view the care journey, schedule follow-up, use offline drafts |
| Medical officer or specialist | Patients registered by any worker or clinical account | All clinical review and care actions, AI review, consultations |
| Administrator | All patients, including administrator-created records | All actions plus audit and oversight |

Every list, dashboard count, patient detail, image, care record, clinical journey,
AI result and consultation is filtered on the server. A patient's creator remains
the ownership key for all linked records. The patient list shows who registered
each patient. Direct URLs and API requests do not bypass the scope.

A worker can read the care journey for a patient they registered, including
subsequent clinician follow-up needed for coordination. The worker cannot create
clinical reviews, referrals, diagnosis or treatment records, or consultations.

The registration uniqueness check remains global to avoid duplicate patients.
When a conflicting record is outside the signed-in user's scope, the response
does not reveal its patient code.

This prototype does not assign individual workers to individual doctors: the
requested doctor scope includes all workers. It remains a synthetic-data research
preview and has not replaced the frozen live app.

## Verification

`python -m unittest discover -s tests -p 'test_*.py' -q`

`node --test tests/*.test.cjs`
