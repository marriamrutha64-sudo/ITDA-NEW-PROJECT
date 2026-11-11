const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");
const jitsiUrl = `https://meet.jit.si/${"a".repeat(48)}`;

function harness({ popupBlocked = false } = {}) {
  const elements = new Map(), requests = [], tabs = [], copied = [], toasts = [];
  let responder = async () => ({});
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      value: "", textContent: "", innerHTML: "", hidden: false, disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      focus() {}, reset() {}, close() { this.closed = true; }, showModal() { this.open = true; },
      removeAttribute(name) { delete this[name]; }, replaceChildren() { this.innerHTML = ""; }
    });
    return elements.get(id);
  };
  const window = {
    location: { origin: "http://127.0.0.1:8001" }, confirm: () => true,
    open(url, target) {
      if (popupBlocked) return null;
      const tab = { initial: url, target, closed: false,
        location: { replace(value) { tab.url = value; } }, close() { this.closed = true; } };
      tabs.push(tab); return tab;
    }
  };
  const context = vm.createContext({
    window, document: { getElementById: element, addEventListener() {}, querySelectorAll: () => [] },
    localStorage: { getItem: () => null }, URL, FormData: class { append() {} },
    navigator: { clipboard: { async writeText(value) { copied.push(value); } } },
    setTimeout: () => 1, clearTimeout() {},
    async fetch(url, options) {
      requests.push({ url, options });
      const body = await responder(url, options);
      return { ok: true, headers: { get: () => "application/json" }, json: async () => body };
    }, toasts
  });
  const run = (code, bindings = {}) => { Object.assign(context, bindings); return vm.runInContext(code, context); };
  run(source);
  run('var realLoadConsultations=loadConsultations;state.user={username:"qa-doctor",role:"medical_officer"};state.page="consultations";showToast=message=>toasts.push(message);loadConsultations=async()=>{};loadPatients=async()=>{};');
  return { element, requests, tabs, copied, toasts, run, respondWith(fn) { responder = fn; } };
}

test("Jitsi URL must match the exact opaque room returned by the server", () => {
  const h = harness();
  for (const invalid of ["http://meet.jit.si/" + "a".repeat(48), "https://meet.jit.si.evil.test/" + "a".repeat(48), jitsiUrl + "/", jitsiUrl + "?jwt=x", jitsiUrl + "#x", "https://meet.jit.si/abc", "javascript:alert(1)"]) {
    assert.equal(h.run(`canonicalJitsiUrl(${JSON.stringify(invalid)})`), "");
  }
  assert.equal(h.run(`canonicalJitsiUrl(" ${jitsiUrl} ")`), jitsiUrl);
});

test("scheduled Jitsi appointments allow joining before and after scheduled time", async () => {
  const h = harness();
  const record = (id, access_state, status = "scheduled", video_provider = "jitsi") => ({
    id, access_state, status, video_provider, can_join: status === "scheduled" && video_provider === "jitsi",
    patient_name: "Synthetic Patient", patient_code: "AD-TEST", patient_id: "",
    scheduled_at: "2026-11-12T12:00:00+00:00", duration_minutes: 15,
  });
  h.respondWith(() => ({ configured: true, provider: "jitsi", consultations: [
    record("upcoming-id", "upcoming"), record("expired-id", "expired"),
    record("legacy-id", "open", "scheduled", "google_meet"), record("completed-id", "completed", "completed"),
  ] }));
  await h.run("realLoadConsultations()");
  const rendered = h.element("consultationList").innerHTML;
  assert.match(rendered, /data-join-consultation="upcoming-id"/);
  assert.match(rendered, /data-join-consultation="expired-id"/);
  assert.doesNotMatch(rendered, /data-join-consultation="legacy-id"/);
  assert.doesNotMatch(rendered, /data-join-consultation="completed-id"/);
  assert.match(rendered, /older appointment used Google Meet/);
  assert.doesNotMatch(rendered, /data-edit-consultation-meet/);
});

test("doctor schedules without manually pasting a meeting link", async () => {
  const h = harness();
  h.element("consultationTime").value = "2026-11-12T17:48";
  h.element("consultPatient").value = "synthetic-patient";
  h.element("consultationDuration").value = "15";
  const button = { disabled: false }, form = { querySelector: () => button, reset() { this.resetCount = (this.resetCount || 0) + 1; } };
  h.respondWith(() => ({ consultation: { id: "synthetic-appointment" } }));
  await h.run("createConsultation(event)", { event: { preventDefault() {}, currentTarget: form } });
  assert.equal(h.requests[0].url, "/api/consultations");
  const body = JSON.parse(h.requests[0].options.body);
  assert.equal(body.patient_id, "synthetic-patient");
  assert.equal(body.duration_minutes, 15);
  assert.equal(body.meeting_url, undefined);
  assert.equal(form.resetCount, 1);
  assert.equal(button.disabled, false);
  assert.doesNotMatch(html, /id="consultationMeetingUrl"|id="consultationMeetingDialog"|id="consultationMicButton"/);
});

test("doctor opens only the server-approved Jitsi room in a separate tab", async () => {
  const h = harness();
  h.respondWith(() => ({ provider: "jitsi", meeting_url: jitsiUrl }));
  await h.run('joinConsultation("opaque-id")');
  assert.equal(h.requests[0].url, "/api/consultations/opaque-id/join");
  assert.equal(h.tabs.length, 1);
  assert.equal(h.tabs[0].initial, "about:blank");
  assert.equal(h.tabs[0].url, jitsiUrl);
  assert.equal(h.tabs[0].opener, null);
  assert.equal(h.element("consultationExternalLink").href, jitsiUrl);
  assert.match(h.element("consultationCallState").textContent, /Settings.*Devices/);
});

test("invalid server room closes the blank tab and never exposes an unsafe link", async () => {
  const h = harness();
  h.respondWith(() => ({ meeting_url: "https://evil.test/" + "a".repeat(48) }));
  await h.run('joinConsultation("opaque-id")');
  assert.equal(h.tabs[0].closed, true);
  assert.equal(h.element("consultationExternalLink").href, undefined);
});

test("blocked popup leaves a usable Jitsi link in the app", async () => {
  const h = harness({ popupBlocked: true });
  h.respondWith(() => ({ meeting_url: jitsiUrl }));
  await h.run('joinConsultation("opaque-id")');
  assert.equal(h.element("consultationExternalLink").href, jitsiUrl);
  assert.match(h.element("consultationCallState").textContent, /blocked the new tab/);
});

test("patient invitation copies the same direct Jitsi room", async () => {
  const h = harness();
  h.respondWith(() => ({ provider: "jitsi", guest_url: jitsiUrl }));
  await h.run('copyConsultationLink("opaque-id")');
  assert.equal(h.requests[0].url, "/api/consultations/opaque-id/invite");
  assert.deepEqual(h.copied, [jitsiUrl]);
  assert.equal(h.element("consultationInviteLink").value, jitsiUrl);
});
