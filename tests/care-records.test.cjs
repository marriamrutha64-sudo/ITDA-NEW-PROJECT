const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "care-records.js"), "utf8");

function makeHarness({ role = "medical_officer", confirm = true } = {}) {
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.events = {}; this._text = ""; this.hidden = false; this.disabled = false; }
    setAttribute(name, value) {
      this.attributes[name] = String(value);
      if (["hidden", "disabled", "required"].includes(name)) this[name] = true;
    }
    get id() { return this.attributes.id || ""; }
    set id(value) { this.attributes.id = value; }
    get name() { return this.attributes.name || ""; }
    get dataset() { return Object.fromEntries(Object.entries(this.attributes).filter(([key]) => key.startsWith("data-")).map(([key, value]) => [key.slice(5).replace(/-([a-z])/g, (_, char) => char.toUpperCase()), value])); }
    get classList() {
      const element = this;
      return {
        contains(token) { return (element.attributes.class || "").split(" ").includes(token); },
        toggle(token, force) {
          const values = new Set((element.attributes.class || "").split(" ").filter(Boolean));
          if (force ?? !values.has(token)) values.add(token); else values.delete(token);
          element.attributes.class = [...values].join(" ");
        }
      };
    }
    get value() { return this._value ?? (this.tagName === "select" ? this.options[0]?.value || "" : this.attributes.value || ""); }
    set value(value) { this._value = String(value); }
    get options() { return this.children.filter(child => child.tagName === "option"); }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(""); }
    set textContent(value) { this._text = String(value ?? ""); this.children = []; }
    set innerHTML(_) { throw new Error("HTML interpolation is forbidden in this test harness"); }
    append(...nodes) { for (const node of nodes) { node.parentNode = this; this.children.push(node); } }
    insertBefore(node, before) { node.parentNode = this; const at = this.children.indexOf(before); this.children.splice(at < 0 ? this.children.length : at, 0, node); }
    replaceChildren(...nodes) { this.children = []; this._text = ""; if (this.tagName === "select") this._value = undefined; this.append(...nodes); }
    remove() { if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this); }
    matches(selector) {
      if (selector.startsWith(".")) return this.classList.contains(selector.slice(1));
      if (selector.startsWith("#")) return this.id === selector.slice(1);
      if (selector.startsWith("[")) return selector.slice(1, -1) in this.attributes;
      return this.tagName === selector;
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    addEventListener(name, callback) { (this.events[name] ||= []).push(callback); }
    async fire(name) { for (const callback of this.events[name] || []) await callback({ target: this, currentTarget: this, preventDefault() {} }); }
    reset() { for (const control of this.querySelectorAll("input").concat(this.querySelectorAll("select"), this.querySelectorAll("textarea"))) control._value = undefined; }
    setCustomValidity(value) { this.validationMessage = value; }
    reportValidity() { return !this.validationMessage; }
    scrollIntoView() {}
    focus() {}
  }
  const root = new Element("html"), body = new Element("body"), view = new Element("div"), page = new Element("section"), existing = new Element("div");
  root.append(body); body.append(view); view.id = "appView"; view.append(page); page.id = "page-care"; page.setAttribute("class", "page"); existing.setAttribute("class", "workflow-grid"); page.append(existing);
  const document = { readyState: "complete", documentElement: root, body, createElement: tag => new Element(tag), getElementById: id => root.querySelector(`#${id}`) };
  const state = { user: { id: "doctor", username: "demo-clinician", role }, language: "en", offlineMode: false };
  const requests = [], observations = [], windowEvents = {}, confirmations = [];
  const data = {};
  const patients = ["p1", "p2"].map(id => ({ id, patient_code: `DEMO-${id}`, name: `Patient ${id}` }));
  for (const patient of patients) {
    data[patient.id] = {
      detail: { patient, screenings: [{ id: `screen-${patient.id}`, location: "Tongue", created_at: "2026-11-10T12:00:00Z" }], reviews: [], referrals: [], followups: [] },
      journey: { patient_id: patient.id, diagnostics: [], treatments: [], escalations: [], ai_reviews: [], stages: { screening: { count: 1, status: "recorded" } } }
    };
  }
  let responder = async (url, options) => {
    if (options?.method === "POST") return { ok: true };
    if (url === "/api/patients") return { patients };
    const match = url.match(/^\/api\/patients\/(p[12])(\/journey)?$/);
    if (match) return data[match[1]][match[2] ? "journey" : "detail"];
    if (url.startsWith("/api/ai/results/")) return { inferences: [] };
    throw new Error(`Unexpected request ${url}`);
  };
  let prints = 0;
  const window = {
    confirm(message) { confirmations.push(message); return confirm; },
    print() { prints++; },
    addEventListener(name, callback) { windowEvents[name] = callback; }
  };
  const context = vm.createContext({
    document, state, window, MutationObserver: class { constructor(callback) { observations.push(callback); } observe() {} },
    api: async (url, options) => { requests.push({ url, options }); return responder(url, options); },
    goPage: () => page.classList.toggle("active", true),
    Date
  });
  vm.runInContext(source, context);
  return {
    state, data, patients, requests, document, window, page, view, confirmations,
    get prints() { return prints; },
    get(id) { const node = document.getElementById(id); assert.ok(node, `Missing #${id}`); return node; },
    notify() { observations.forEach(callback => callback()); },
    respondWith(callback) { responder = callback; },
    open: id => window.CareRecords.openPatient(id),
    afterPrint: () => windowEvents.afterprint()
  };
}
const tick = () => new Promise(resolve => setImmediate(resolve));

test("health worker reads authorized journey but cannot submit clinical changes", async () => {
  const h = makeHarness({ role: "health_worker" });
  await h.open("p1");
  assert.equal(h.get("care-diagnostics-form").parentNode.hidden, true);
  assert.equal(h.get("care-diagnostics-form").children[0].disabled, true);
  await h.get("care-diagnostics-form").fire("submit");
  assert.equal(h.requests.some(request => request.options?.method === "POST"), false);
  assert.match(h.get("careJourney").textContent, /Health workers can view/);
});

test("diagnostic progress links to a prior immutable record", async () => {
  const h = makeHarness();
  h.data.p1.journey.diagnostics = [{ id: "diag-1", test_type: "biopsy", status: "ordered", ordered_at: "2026-11-10", facility: "Demo Lab", clinician_name: "Demo doctor", created_at: "2026-11-10T12:00:00Z" }];
  await h.open("p1");
  const section = h.get("care-diagnostics-heading").parentNode;
  const progress = section.querySelectorAll("button").find(button => button.textContent === "Record progress");
  await progress.fire("click");
  assert.equal(h.get("care-diagnostics-facility").value, "Demo Lab");
  h.get("care-diagnostics-status").value = "processing";
  await h.get("care-diagnostics-form").fire("submit");
  const payload = JSON.parse(h.requests.find(request => request.url === "/api/diagnostics").options.body);
  assert.equal(payload.previous_id, "diag-1");
  assert.equal(payload.patient_id, "p1");
  assert.equal(payload.status, "processing");
  assert.equal(payload.test_type, "biopsy");
});

test("reported diagnostic result requires clinician-entered content", async () => {
  const h = makeHarness(); await h.open("p1");
  h.get("care-diagnostics-status").value = "reported";
  await h.get("care-diagnostics-form").fire("submit");
  assert.match(h.get("care-diagnostics-result_summary").validationMessage, /result summary/);
  assert.equal(h.requests.some(request => request.url === "/api/diagnostics"), false);
});

test("AI override submits the selected genuine saved inference reference", async () => {
  const h = makeHarness();
  h.respondWith(async (url, options) => {
    if (options?.method === "POST") return {};
    if (url === "/api/patients") return { patients: h.patients };
    if (url === "/api/patients/p1") return h.data.p1.detail;
    if (url.endsWith("/journey")) return h.data.p1.journey;
    if (url.startsWith("/api/ai/results/")) return { inferences: [{ id: "real-result", text: "<script>unsafe text</script>", model: "MedGemma", inconsistent: true, inference_audit_id: 17, created_at: "2026-11-10T12:00:00Z" }] };
  });
  await h.open("p1");
  const screening = h.get("care-ai_reviews-screening_id"); screening.value = "screen-p1"; await screening.fire("change");
  assert.equal(h.get("care-ai-inference").value, "17");
  assert.match(h.get("care-ai_reviews-form").textContent, /<script>unsafe text<\/script>/);
  assert.match(h.get("care-ai_reviews-form").textContent, /Possible inconsistency/);
  assert.equal(h.get("care-ai_reviews-form").querySelectorAll("script").length, 0);
  h.get("care-ai_reviews-disposition").value = "disagreed";
  h.get("care-ai_reviews-reason").value = "Advisory observation lacks evidence";
  h.get("care-ai_reviews-assessment").value = "Independent demonstration assessment";
  await h.get("care-ai_reviews-form").fire("submit");
  const body = JSON.parse(h.requests.find(request => request.url === "/api/ai-reviews").options.body);
  assert.equal(body.inference_audit_id, 17); assert.equal(body.disposition, "disagreed"); assert.equal(body.screening_id, "screen-p1");
});

test("a late response for the previous patient cannot replace the selected patient's records", async () => {
  const h = makeHarness(); let finish;
  h.respondWith(async url => {
    if (url === "/api/patients") return { patients: h.patients };
    if (url === "/api/patients/p1") return new Promise(resolve => { finish = resolve; });
    if (url === "/api/patients/p1/journey") return h.data.p1.journey;
    if (url === "/api/patients/p2") return h.data.p2.detail;
    if (url === "/api/patients/p2/journey") return h.data.p2.journey;
  });
  const old = h.open("p1"); await tick(); await h.open("p2");
  finish(h.data.p1.detail); await old;
  assert.equal(h.get("careJourneyPatient").value, "p2");
  h.get("care-treatments-plan").value = "Demonstration plan";
  await h.get("care-treatments-form").fire("submit");
  const body = JSON.parse(h.requests.find(request => request.url === "/api/treatments").options.body);
  assert.equal(body.patient_id, "p2");
});

test("logout clears patient content and ignores pending patient requests", async () => {
  const h = makeHarness(); let finish;
  h.respondWith(async url => {
    if (url === "/api/patients") return { patients: h.patients };
    if (url === "/api/patients/p1") return new Promise(resolve => { finish = resolve; });
    return h.data.p1.journey;
  });
  const pending = h.open("p1"); await tick();
  h.state.user = null; h.view.hidden = true; h.notify();
  finish(h.data.p1.detail); await pending;
  assert.equal(h.get("careJourneyPatient").value, "");
  assert.equal(h.get("careJourneyPatient").disabled, true);
  assert.equal(h.get("care-diagnostics-form").children[0].disabled, true);
});

test("switching language preserves unsaved clinical text and translates local labels", async () => {
  const h = makeHarness(); await h.open("p1");
  h.get("care-treatments-plan").value = "Unsubmitted clinician draft";
  h.state.language = "te"; h.notify();
  assert.equal(h.get("care-treatments-plan").value, "Unsubmitted clinician draft");
  assert.equal(h.get("careJourneyHeading").textContent, "రోగి ప్రయాణం మరియు నివేదికలు");
  assert.equal(h.get("care-diagnostics-test_type").options[0].textContent, "బయాప్సీ");
});

test("print requires explicit confirmation and safely renders patient-provided text", async () => {
  const declined = makeHarness({ confirm: false }); await declined.open("p1");
  const print = declined.get("careJourney").querySelectorAll("button").find(button => button.textContent === "Print patient summary");
  await print.fire("click"); assert.equal(declined.prints, 0); assert.equal(declined.document.getElementById("carePrintReport"), null);
  const h = makeHarness(); h.data.p1.detail.patient.name = "<img src=x onerror=alert(1)>";
  h.data.p1.journey.ai_reviews = [{ id: "review-1", disposition: "disagreed", clinician_name: "Doctor", created_at: "2026-11-10T12:00:00Z", screening_id: "screen-p1", inference_audit_id: 17, inference: { text: "Original contradictory output", inconsistent: true } }];
  await h.open("p1"); assert.equal(h.prints, 0);
  await h.get("careJourney").querySelectorAll("button").find(button => button.textContent === "Print patient summary").fire("click");
  assert.equal(h.prints, 1); assert.equal(h.confirmations.length, 1);
  const report = h.get("carePrintReport");
  assert.match(report.textContent, /<img src=x onerror=alert\(1\)>/); assert.equal(report.querySelectorAll("img").length, 0);
  assert.match(report.textContent, /AI output is advisory only/);
  assert.match(report.textContent, /Possible inconsistency/);
  assert.match(report.textContent, /Original contradictory output/);
  h.afterPrint(); assert.equal(h.document.getElementById("carePrintReport"), null);
});

test("failed writes preserve draft input and show the server failure", async () => {
  const h = makeHarness(); await h.open("p1");
  h.respondWith(async () => { throw new Error("Demo connection failed"); });
  h.get("care-treatments-plan").value = "Preserve this draft";
  await h.get("care-treatments-form").fire("submit");
  assert.equal(h.get("care-treatments-plan").value, "Preserve this draft");
  assert.match(h.get("careJourney").textContent, /Demo connection failed/);
});
