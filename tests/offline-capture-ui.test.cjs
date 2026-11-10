const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "offline-capture-ui.js"), "utf8");
async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }
function deferred() { let resolve, reject; const promise = new Promise((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }

async function harness({ role = "health_worker", locked = false, offline = false, online = true, confirm = true, behavior = {} } = {}) {
  const elements = new Map(), documentEvents = new Map(), windowEvents = new Map(), calls = [];
  const state = { user: { username: "worker", role, display_name: "Synthetic Worker" }, vaultOwner: "worker", offlineMode: offline, language: "en" };
  let choices = [{ value: "patient:patient-1", label: "AD-DEMO · Synthetic Patient" }];
  let queued = [];
  class Element {
    constructor(tag) { this.tagName = tag; this.children = []; this.listeners = new Map(); this.value = ""; this.checked = false; this.files = []; this._text = ""; this.disabled = false; }
    set id(value) { this._id = value; elements.set(value, this); }
    get id() { return this._id; }
    set textContent(value) { this._text = String(value); this.children = []; }
    get textContent() { return this._text + this.children.map(child => child.textContent).join(" "); }
    set innerHTML(value) {
      // Interpret only the module's static template. User strings never pass here.
      assert.match(value, /^<h2 id="offlineCaptureTitle"/);
      for (const [, tag, , id] of value.matchAll(/<(\w+)\b([^>]*\bid="([^"]+)"[^>]*)>/g)) {
        const child = new Element(tag); child.id = id;
      }
    }
    appendChild(child) { this.children.push(child); return child; }
    append(...children) { this.children.push(...children); }
    replaceChildren(...children) { this.children = children; this._text = ""; }
    addEventListener(name, callback) { this.listeners.set(name, callback); }
    reset() {
      this.resets = (this.resets || 0) + 1;
      for (const element of elements.values()) if (["input", "select", "textarea"].includes(element.tagName)) {
        element.value = ""; element.checked = false; element.files = [];
      }
    }
  }
  for (const id of ["page-patients", "offlineDraftList", "appView", "languageButton"]) { const node = new Element("div"); node.id = id; }
  const document = {
    getElementById: id => elements.get(id), createElement: tag => new Element(tag),
    addEventListener(name, callback) { documentEvents.set(name, callback); }
  };
  const contextValid = owner => !locked && state.user?.username === owner && state.vaultOwner === owner;
  const window = {
    addEventListener(name, callback) { windowEvents.set(name, callback); },
    OfflineVault: { async discardOperation(id) { calls.push(["discard", id]); queued = queued.filter(entry => entry.id !== id); } },
    OfflineScreening: {
      async listPatientChoices(options) { calls.push(["choices", options.ownerUsername]); return behavior.choices ? behavior.choices(options) : choices; },
      async listQueued(options) { calls.push(["queued", options.ownerUsername]); return behavior.queued ? behavior.queued(options) : queued; },
      async queueCapture(capture, options) { calls.push(["capture", capture, options]); if (behavior.capture) return behavior.capture(capture, options); },
      async syncQueued(options) { calls.push(["photos", options.ownerUsername]); return behavior.sync ? behavior.sync(options) : { synced: 1, pending: 0, errors: [] }; }
    }
  };
  const api = async () => { calls.push(["api"]); };
  vm.runInNewContext(source, {
    window, document, state, navigator: { onLine: online }, confirm: () => confirm,
    vaultUnlockedForCurrentUser: () => contextValid(state.vaultOwner),
    dateTimeLabel: value => value,
    async syncOfflineDrafts() { calls.push(["registrations"]); if (behavior.registrations) await behavior.registrations(); },
    async loadPatients() { calls.push(["reload-patients"]); }, async loadDashboard() { calls.push(["reload-dashboard"]); }, api,
    MutationObserver: class { constructor(callback) { this.callback = callback; } observe() {} }
  });
  documentEvents.get("DOMContentLoaded")();
  await flush();
  return {
    state, calls, element: id => elements.get(id),
    setQueued(value) { queued = value; }, setChoices(value) { choices = value; },
    refresh() { return windowEvents.get("aarogya-patients-loaded")(); },
    fill(value = "patient:patient-1") {
      elements.get("offlineCapturePatient").value = value;
      elements.get("offlineCaptureWorker").value = "Synthetic Worker";
      elements.get("offlineCaptureArea").value = "Gums";
      elements.get("offlineCaptureDuration").value = "2 weeks";
      elements.get("offlineCaptureNotes").value = "Synthetic notes";
      elements.get("offlineCapturePhoto").files = [{ name: "synthetic.png" }];
      elements.get("offlineCaptureConsent").checked = true;
    },
    submit() { return elements.get("offlineCaptureForm").listeners.get("submit")({ preventDefault() {} }); },
    sync() { return elements.get("offlineCaptureSync").listeners.get("click")(); }
  };
}

function photo(id = "a".repeat(32)) {
  return { id, operation: { location: "Gums", captured_at: "2026-11-10T10:00:00Z", image: { bytes: 12000 } } };
}

test("only an unlocked health-worker vault can expose offline capture or read choices", async () => {
  for (const options of [{ role: "specialist" }, { role: "admin" }, { locked: true }]) {
    const h = await harness(options);
    assert.equal(h.element("offlineCapturePanel").hidden, true);
    assert.equal(h.calls.length, 0);
    await h.submit(); await h.sync();
    assert.equal(h.calls.length, 0);
  }
});

test("form queues the photograph and fields through the vault module without sending an API request", async () => {
  for (const value of ["patient:patient-1", "draft:" + "b".repeat(32)]) {
    const h = await harness();
    h.fill(value);
    await h.submit();
    const saved = h.calls.find(call => call[0] === "capture");
    assert.equal(saved[1].worker, "Synthetic Worker");
    assert.equal(saved[1].notes, "Synthetic notes");
    assert.equal(saved[1].file.name, "synthetic.png");
    assert.equal(saved[1].patientId, value.startsWith("patient:") ? "patient-1" : "");
    assert.equal(saved[1].patientOperationId, value.startsWith("draft:") ? "b".repeat(32) : "");
    assert.equal(saved[2].ownerUsername, "worker");
    assert.equal(saved[2].isCurrentUser("worker"), true);
    assert.equal(h.calls.some(call => ["api", "photos", "registrations"].includes(call[0])), false);
    assert.match(h.element("offlineCaptureStatus").textContent, /encrypted.*not been sent/i);
  }
});

test("busy capture blocks duplicate saves and synchronization until it settles", async () => {
  const capture = deferred();
  const h = await harness({ behavior: { capture: () => capture.promise } });
  h.fill();
  const first = h.submit();
  await h.submit(); await h.sync();
  assert.equal(h.calls.filter(call => call[0] === "capture").length, 1);
  assert.equal(h.calls.some(call => call[0] === "registrations"), false);
  capture.resolve({ operation_id: "c".repeat(32) });
  await first;
  assert.equal(h.element("offlineCaptureSave").disabled, false);
});

test("old-account queued capture cannot overwrite the new account's form or status", async () => {
  const capture = deferred();
  const h = await harness({ behavior: { capture: () => capture.promise } });
  h.fill();
  const first = h.submit();
  h.state.user = { username: "other", role: "health_worker", display_name: "Other Worker" };
  h.state.vaultOwner = "other";
  await h.refresh();
  h.element("offlineCaptureNotes").value = "Other account's current note";
  capture.reject(new Error("Old account save failed"));
  await first;
  assert.doesNotMatch(h.element("offlineCaptureStatus").textContent, /Old account/);
  assert.equal(h.element("offlineCaptureNotes").value, "Other account's current note");
});

test("late old-account vault reads cannot render patient choices after a new owner refresh", async () => {
  const oldChoices = deferred(), oldQueue = deferred();
  const h = await harness({ behavior: {
    choices: options => options.ownerUsername === "worker" ? oldChoices.promise : [{ value: "patient:new", label: "New owner's patient" }],
    queued: options => options.ownerUsername === "worker" ? oldQueue.promise : []
  } });
  h.state.user = { username: "other", role: "health_worker" }; h.state.vaultOwner = "other";
  await h.refresh();
  oldChoices.resolve([{ value: "patient:private", label: "OLD PRIVATE PATIENT" }]);
  oldQueue.resolve([photo()]);
  await flush();
  assert.doesNotMatch(h.element("offlineCapturePatient").textContent, /OLD PRIVATE/);
  assert.match(h.element("offlineCapturePatient").textContent, /New owner's patient/);
  assert.doesNotMatch(h.element("offlineCaptureQueue").textContent, /12 KB/);
});

test("sync commits registrations before photographs and refreshes server records after acknowledgement", async () => {
  const h = await harness();
  await h.sync();
  const relevant = h.calls.map(call => call[0]).filter(name => ["registrations", "photos", "reload-patients", "reload-dashboard"].includes(name));
  assert.deepEqual(relevant, ["registrations", "photos", "reload-patients", "reload-dashboard"]);
  assert.match(h.element("offlineCaptureStatus").textContent, /1 photographs synced; 0 pending/);
});

test("account switch during registration sync prevents any photograph upload", async () => {
  const registrations = deferred();
  const h = await harness({ behavior: { registrations: () => registrations.promise } });
  const syncing = h.sync();
  h.state.user = { username: "other", role: "health_worker" }; h.state.vaultOwner = "other";
  registrations.resolve();
  await syncing;
  assert.equal(h.calls.some(call => call[0] === "photos"), false);
  assert.doesNotMatch(h.element("offlineCaptureStatus").textContent, /photographs synced/);
});

test("offline draft mode cannot invoke authenticated synchronization", async () => {
  const h = await harness({ offline: true, online: false });
  assert.equal(h.element("offlineCaptureSync").disabled, true);
  await h.sync();
  assert.equal(h.calls.some(call => ["photos", "registrations"].includes(call[0])), false);
});

test("discard requires an explicit decision and deletes only the selected vault entry", async () => {
  for (const confirm of [false, true]) {
    const h = await harness({ confirm });
    h.setQueued([photo()]);
    await h.refresh();
    const button = h.element("offlineCaptureQueue").children[0].children[1];
    await button.listeners.get("click")();
    assert.deepEqual(h.calls.filter(call => call[0] === "discard"), confirm ? [["discard", "a".repeat(32)]] : []);
  }
});

test("photo sync conflicts stay visible as pending and do not trigger server-record refresh", async () => {
  const h = await harness({ behavior: { sync: async () => ({ synced: 0, pending: 1, errors: [{ message: "Synchronize this patient's registration first." }] }) } });
  h.setQueued([photo()]); await h.refresh();
  await h.sync();
  assert.match(h.element("offlineCaptureStatus").textContent, /0 photographs synced; 1 pending.*registration first/);
  assert.equal(h.calls.some(call => call[0] === "reload-patients"), false);
  assert.equal(h.element("offlineCaptureQueue").children.length, 1);
});
