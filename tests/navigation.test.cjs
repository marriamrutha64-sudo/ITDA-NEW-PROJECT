const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function harness() {
  const elements = new Map(), messages = [];
  function element(id) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, { id, hidden: true, attributes: {}, dataset: {},
        classList: {
          toggle(name, force) { if (force === undefined) force = !classes.has(name); force ? classes.add(name) : classes.delete(name); },
          contains(name) { return classes.has(name); }, remove(name) { classes.delete(name); }
        },
        setAttribute(name, value) { this.attributes[name] = value; },
        removeAttribute(name) { delete this.attributes[name]; }
      });
    }
    return elements.get(id);
  }
  const pages = ["home", "patients", "references"].map(name => element("page-" + name));
  const nav = ["home", "patients", "references"].map(name => {
    const item = element("nav-" + name); item.dataset.page = name; return item;
  });
  const context = vm.createContext({
    localStorage: { getItem: () => null },
    document: { documentElement: { lang: "en" }, getElementById: element, addEventListener() {}, querySelectorAll(selector) { return selector === ".page" ? pages : selector === ".nav-item" ? nav : []; } },
    window: {}, navigator: {}, setTimeout, clearTimeout
  });
  vm.runInContext(source, context);
  vm.runInContext("state.user={id:'demo-doctor',role:'medical_officer'}", context);
  const originalTranslate = context.translate;
  context.translate = () => {};
  context.showToast = message => messages.push(message);
  context.loadPatients = async () => ({ patients: [] });
  context.loadDashboard = async () => {};
  return { context, element, messages, originalTranslate, value: expression => vm.runInContext(expression, context) };
}

test("patient browsing does not open registration; only explicit register actions do", () => {
  const h = harness(), destinations = [];
  let registrations = 0;
  h.context.goPage = page => { destinations.push(page); vm.runInContext(`state.page=${JSON.stringify(page)}`, h.context); };
  h.context.openPatientDialog = () => registrations++;
  h.context.handleWorkspaceAction({ dataset: { go: "patients" }, hasAttribute: () => false });
  assert.equal(registrations, 0);
  h.context.handleWorkspaceAction({ dataset: { go: "patients" }, hasAttribute: name => name === "data-register" });
  assert.equal(registrations, 1);
  assert.deepEqual(destinations, ["patients", "patients"]);
  assert.match(html, /data-go="patients" data-register><svg[^>]*aria-hidden="true"[^>]*>.*?<\/svg>\s*<span data-i18n="registerPatient"/);
  assert.match(html, /data-go="patients"><span data-i18n="viewPatients"/);
  assert.match(html, /data-go="patients"><span data-i18n="seeAll"/);
});

test("mobile navigation closes on page change and updates its accessibility state", () => {
  const h = harness();
  h.context.setNavigationOpen(true);
  assert.equal(h.element("sidebar").classList.contains("open"), true);
  assert.equal(h.element("navigationBackdrop").hidden, false);
  assert.equal(h.element("menuButton").attributes["aria-expanded"], "true");
  h.context.goPage("references");
  assert.equal(h.element("sidebar").classList.contains("open"), false);
  assert.equal(h.element("navigationBackdrop").hidden, true);
  assert.equal(h.element("menuButton").attributes["aria-expanded"], "false");
  assert.equal(h.element("nav-references").attributes["aria-current"], "page");
  assert.equal(h.element("page-references").classList.contains("active"), true);
});

test("restricted or unknown destinations cannot replace the current worker page", () => {
  const h = harness();
  vm.runInContext("state.user.role='health_worker'", h.context);
  for (const destination of ["consultations", "audit", "unknown"]) h.context.goPage(destination);
  assert.equal(h.value("state.page"), "home");
  vm.runInContext("state.offlineMode=true", h.context);
  h.context.goPage("screening");
  assert.equal(h.value("state.page"), "home");
});

test("administrator can open consultations, while workers cannot open clinical review", () => {
  const h = harness();
  vm.runInContext("state.user.role='admin'", h.context);
  h.context.goPage("consultations");
  assert.equal(h.value("state.page"), "consultations");
  vm.runInContext("state.user.role='health_worker'", h.context);
  h.context.goPage("review");
  assert.equal(h.value("state.page"), "consultations");
});

test("a navigation load failure is reported instead of rejecting without feedback", async () => {
  const h = harness();
  h.context.loadPatients = async () => { throw new Error("Synthetic server unavailable"); };
  h.context.goPage("patients");
  for (let index = 0; index < 8; index++) await Promise.resolve();
  assert.deepEqual(h.messages, ["Synthetic server unavailable"]);
});

test("server connection state survives translation and language changes", async () => {
  const h = harness();
  h.context.api = async () => ({ ok: true });
  await h.context.refreshAll();
  h.originalTranslate();
  assert.equal(h.element("syncLabel").textContent, "Local server connected");
  vm.runInContext("state.language='te'", h.context);
  h.originalTranslate();
  assert.equal(h.element("syncLabel").textContent, h.value('t("serverOnline")'));
  assert.equal(h.context.document.documentElement.lang, "te");
});

test("sidebar keeps care navigation and account controls accessible in both languages", () => {
  const h = harness();
  assert.match(html, /class="nav-group"[\s\S]*?data-page="home"[\s\S]*?data-page="patients"[\s\S]*?data-page="screening"[\s\S]*?data-page="review"[\s\S]*?data-page="care"/);
  assert.match(html, /data-page="consultations" data-video-only hidden/);
  assert.match(html, /data-page="audit" data-admin-only hidden/);
  assert.match(html, /id="logoutButton"[^>]*>[\s\S]*?data-i18n="signOut"/);
  h.originalTranslate();
  assert.equal(h.element("languageChoice").textContent, "తెలుగు");
  assert.equal(h.element("languageButton").attributes["aria-label"], "Switch to Telugu");
  assert.equal(h.element("roleLabel").textContent, "Medical officer");
  vm.runInContext("state.language='te'", h.context);
  h.originalTranslate();
  assert.equal(h.element("languageChoice").textContent, "English");
  assert.match(h.element("languageButton").attributes["aria-label"], /[\u0C00-\u0C7F]/);
  assert.match(h.element("roleLabel").textContent, /[\u0C00-\u0C7F]/);
});

test("topbar describes the current care page in the selected language", () => {
  const h = harness();
  assert.match(html, /class="topbar-context"[\s\S]*?id="pageTitle"[\s\S]*?id="pageContext"/);
  h.originalTranslate();
  assert.equal(h.element("pageContext").textContent, "See care activity across this workspace.");
  vm.runInContext("state.page='patients';state.language='te'", h.context);
  h.originalTranslate();
  assert.match(h.element("pageContext").textContent, /[\u0C00-\u0C7F]/);
  assert.equal(h.element("pageContext").textContent, h.value('t("contextPatients")'));
});

test("workspace stories use distinct illustrative artwork while keeping the oral gallery", () => {
  for (const name of [
    "overview-community-india.png", "overview-clinic-india.png", "patient-registration-india.png",
    "oral-screening-setup-india.png", "clinician-review-india.png", "care-journey-india.png",
    "teleconsultation-india.png", "privacy-stewardship-india.png", "visual-reference-india.png"
  ]) {
    assert.equal(html.split(`src="/assets/illustrations/${name}"`).length - 1, 1, `${name} should appear on one workspace story`);
    assert.ok(fs.existsSync(path.join(__dirname, "..", "assets", "illustrations", name)), `${name} should exist`);
  }
  assert.match(html, /class="reference-grid"[\s\S]*?src="\/assets\/reference\/gums-reference\.jpg"/);
  assert.match(html, /class="reference-grid"[\s\S]*?src="\/assets\/reference\/palate-reference\.jpg"/);
});

test("registration acknowledgement reads the saved record and escapes patient text", async () => {
  const h = harness();
  h.element("receiptDialog").showModal = function () { this.open = true; };
  h.context.api = async path => {
    assert.equal(path, "/api/patients/saved-patient");
    return { patient: { id: "saved-patient", name: "Synthetic <script>alert(1)</script>", patient_code: "AD-SAVED", created_at: "2026-11-11T10:00:00Z" } };
  };
  await h.context.openRegistrationReceipt("saved-patient");
  assert.equal(h.element("receiptDialog").open, true);
  assert.equal(h.element("receiptTitle").textContent, "Registration acknowledgement");
  assert.match(h.element("receiptDetails").innerHTML, /AD-SAVED/);
  assert.match(h.element("receiptDetails").innerHTML, /&lt;script&gt;/);
  assert.doesNotMatch(h.element("receiptDetails").innerHTML, /<script>/);
  assert.match(h.context.patientRow({ id: "saved-patient", name: "Synthetic", patient_code: "AD-SAVED", age: 40, village: "Test", created_at: "2026-11-11T10:00:00Z" }), /data-registration-receipt="saved-patient"/);
});

test("successful online registration opens its saved acknowledgement", async () => {
  const h = harness(), requests = [];
  for (const [id, value] of Object.entries({ patientName: "Synthetic Person", age: "40", gender: "Female", mobile: "", village: "Test", district: "Test", history: "", symptoms: "" })) h.element(id).value = value;
  h.element("consent").checked = true;
  h.element("patientDialog").close = function () { this.open = false; };
  h.element("receiptDialog").showModal = function () { this.open = true; };
  h.context.api = async (path, options) => {
    requests.push(path);
    if (path === "/api/patients" && options?.method === "POST") return { patient: { id: "new-patient", patient_code: "AD-NEW" } };
    if (path === "/api/patients/new-patient") return { patient: { id: "new-patient", name: "Synthetic Person", patient_code: "AD-NEW", created_at: "2026-11-11T10:00:00Z" } };
    throw new Error(`Unexpected request ${path}`);
  };
  await h.context.submitPatient({ preventDefault() {}, currentTarget: { reset() {} } });
  assert.deepEqual(requests, ["/api/patients", "/api/patients/new-patient"]);
  assert.equal(h.element("receiptDialog").open, true);
  assert.match(h.element("receiptDetails").innerHTML, /AD-NEW/);
});

test("completion acknowledgement requires a completed saved appointment", async () => {
  const h = harness();
  h.element("receiptDialog").showModal = function () { this.open = true; };
  const appointment = { id: "appointment-1", patient_name: "Synthetic Person", patient_code: "AD-SYN", status: "scheduled", scheduled_at: "2026-11-11T10:00:00Z" };
  h.context.api = async path => { assert.equal(path, "/api/consultations"); return { consultations: [appointment] }; };
  await h.context.openCompletionReceipt("appointment-1");
  assert.notEqual(h.element("receiptDialog").open, true);
  assert.equal(h.messages.length, 1);
  appointment.status = "completed";
  appointment.completed_at = "2026-11-11T11:00:00Z";
  appointment.completed_by_name = "QA Doctor";
  await h.context.openCompletionReceipt("appointment-1");
  assert.equal(h.element("receiptDialog").open, true);
  assert.equal(h.element("receiptTitle").textContent, "Appointment completion acknowledgement");
  assert.match(h.element("receiptDetails").innerHTML, /QA Doctor/);
  assert.match(h.element("receiptDetails").innerHTML, /appointment-1/);
  assert.match(html, /id="printReceipt"[^>]*data-i18n="receiptPrint"/);
  assert.match(html, /not a clinical report or payment receipt/i);
});

test("marking an appointment complete opens only its saved completion acknowledgement", async () => {
  const h = harness(), requests = [];
  h.context.window.confirm = () => true;
  h.element("receiptDialog").showModal = function () { this.open = true; };
  h.context.loadConsultations = async () => {};
  h.context.api = async (path, options) => {
    requests.push(path);
    if (path === "/api/consultations/appointment-1/complete" && options?.method === "POST") return {};
    if (path === "/api/consultations") return { consultations: [{ id: "appointment-1", patient_name: "Synthetic Person", patient_code: "AD-SYN", status: "completed", scheduled_at: "2026-11-11T10:00:00Z", completed_at: "2026-11-11T11:00:00Z", completed_by_name: "QA Doctor" }] };
    throw new Error(`Unexpected request ${path}`);
  };
  await h.context.completeConsultation("appointment-1");
  assert.deepEqual(requests, ["/api/consultations/appointment-1/complete", "/api/consultations"]);
  assert.equal(h.element("receiptDialog").open, true);
  assert.match(h.element("receiptDetails").innerHTML, /QA Doctor/);
});

test("screening cards retain protected image links for clinician AI controls", async () => {
  const h = harness();
  h.context.api = async path => {
    assert.equal(path, "/api/screenings");
    return { screenings: [{ id: "synthetic-screening", patient_name: "Synthetic Person", patient_code: "AD-SYN", location: "Tongue", status: "Awaiting clinical review", image_width: 738, image_height: 411, created_at: "2026-11-11T10:00:00Z" }] };
  };
  await h.context.loadScreenings();
  const markup = h.element("screeningList").innerHTML;
  assert.match(markup, /class="record-copy"/);
  assert.match(markup, /class="screening-record-media"/);
  assert.match(markup, /href="\/api\/images\/synthetic-screening"/);
  assert.match(markup, /requires clinician assessment/);
});
