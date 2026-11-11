AAROGYA DRISHTI - SOURCE-ONLY OFFICE DEMONSTRATION PACKAGE

This archive contains application source, public interface/reference assets,
tests, documentation, preview deployment files and reviewed public/synthetic
QA JSON evidence. PACKAGE_MANIFEST.json lists every included source file with
its byte count and SHA-256 digest. It is an integrity inventory, not a signed
security certificate. See docs/OFFICE_DEMO.md for the demonstration sequence.
The application includes bilingual printable registration and completed-
appointment acknowledgements. They are not payment receipts or clinical reports.

This is not a portable installation or a clinically validated product.
NOT FOR CLINICAL USE. Use fictional people and synthetic images in the demo.
The supplied public reference photographs are presentation references, not a
labeled clinical dataset or proof of training/evaluation rights.

WHAT MUST BE CONFIGURED SEPARATELY

- Python 3.10 or newer for the core application. Node.js is needed for the
  JavaScript test suite. Optional MedGemma dependencies use a separate Python
  environment; see MEDGEMMA_SETUP.md and requirements-medgemma.txt.
- The gated official MedGemma checkpoint, its verified installation and model
  access. Model weights and the existing workstation virtual environment are
  excluded. Missing model/runtime produces an explicit unavailable state.
- Local user accounts and passwords. No existing accounts, password hashes,
  session secrets or default passwords are included. Follow README.md to
  create accounts interactively in the intended data directory. When using
  the office launcher, that directory is .private-data/manual-qa. The names
  qa-admin, qa-doctor and qa-worker in the runbook refer to accounts already
  configured on the original workstation; they are not embedded credentials.
- An app-generated public Jitsi room, Jitsi/browser microphone permissions
  and network access. The host signs in to start the room in a separate tab.
  Public Jitsi is for synthetic cases only. A real two-device spoken-
  audio and camera rehearsal remains necessary; test traffic is not proof of
  remote hearing.
- Any tunnel helper and internet access needed for cross-device HTTPS sharing.
  The source archive does not provision permanent hosting or external services.

STARTING THE DEMO

On the existing, configured workstation, double-click START OFFICE DEMO.cmd.
It launches/reuses the local presentation app and opens the browser. It does
not include the missing setup on another computer. Extract this package first,
configure runtime/model/accounts as above, then follow README.md and the office
runbook. A localhost URL works only on the computer running the application.
Use the documented share_demo.py process for temporary cross-device access.

For a fresh Windows extraction, create an office administrator in the launcher's
data directory from PowerShell in the extracted project folder:
  $env:AAROGYA_DATA_DIR = Join-Path (Get-Location) '.private-data\manual-qa'
  python app.py --create-user --username office-admin --role admin --display-name "Office Demo Admin"
Choose and confirm your own password at the hidden prompts, then run
START OFFICE DEMO.cmd and sign in as office-admin. For additional roles, repeat
account creation with health_worker, medical_officer or specialist. These steps
do not install the separately documented MedGemma runtime/model.

EXCLUDED INTENTIONALLY

Patient/account databases, uploaded private images, .private-data, model weights,
virtual environments, .git, environment files, credentials/secrets, raw QA logs,
and obsolete draft files IDEX.HTML, JAVASCRIPT and database.py are excluded.
Unsynced encrypted browser drafts are also outside a source package.

BACKUP AND VALIDATION

This source ZIP is not a patient-data backup. backup_data.py has a separate
stopped-server backup and isolated restore process; its output must be protected
and is never part of this archive. See README.md for scope and limitations.
QA JSON records are dated checkpoints with explicit evidence limits. They do
not certify clinical accuracy, production security, field usability or live
two-way media. Check the current tests and rehearse on the presentation devices.

REBUILDING

From the project root:
  python scripts/package_office_demo.py --output C:\AarogyaPackages\office-source.zip

Choose a new output filename each time. The builder uses only Python's standard
library, makes no network requests, and uses a reviewed path allowlist. Update
that allowlist deliberately when adding a new distributable source file. Files
with identical contents produce the same archive bytes in the same Python/zlib
environment; included source timestamps do not affect the ZIP.
