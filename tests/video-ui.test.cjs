const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function makeHarness({ withJitsi = true, confirm = true } = {}) {
  const elements = new Map();
  const requests = [];
  const meetings = [];
  const scripts = [];
  const timers = new Map();
  const confirmations = [];
  const clipboard = [];
  let nextTimer = 0;
  let responder = async () => ({ provider: "public_demo", domain: "meet.jit.si", room_name: "b".repeat(48) });
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, textContent: "", innerHTML: "", value: "", disabled: false,
      classList: { add() {}, remove() {}, toggle() {} },
      replaceChildren() { this.innerHTML = ""; },
      removeAttribute(name) { delete this[name]; }
    });
    return elements.get(id);
  };
  const window = {
    confirm(message) { confirmations.push(message); return confirm; }
  };
  if (withJitsi) window.JitsiMeetExternalAPI = class {
    constructor(domain, options) {
      this.domain = domain;
      this.options = options;
      this.events = new Map();
      this.commands = [];
      this.disposed = false;
      meetings.push(this);
    }
    addListener(name, callback) { this.events.set(name, callback); }
    executeCommand(name) { this.commands.push(name); }
    dispose() { this.disposed = true; }
  };
  const context = vm.createContext({
    window,
    document: {
      getElementById: element,
      addEventListener() {},
      querySelectorAll: () => [],
      createElement() {
        const script = { remove() { this.removed = true; } };
        scripts.push(script);
        return script;
      },
      head: { appendChild() {} }
    },
    localStorage: { getItem: () => null },
    navigator: { clipboard: { async writeText(value) { clipboard.push(value); } } },
    FormData: class { append() {} },
    setTimeout(callback, delay) { const id = ++nextTimer; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    async fetch(url, options) {
      requests.push({ url, options });
      const body = await responder(url, options);
      return { ok: true, headers: { get: () => "application/json" }, json: async () => body };
    },
    __toasts: []
  });
  const run = code => vm.runInContext(code, context);
  run(source);
  run(`state.user={username:"synthetic-doctor",role:"medical_officer"};
       state.page="consultations";state.videoProvider="public_demo";
       state.patients=[{name:"Synthetic Patient Secret",patient_code:"AD-PRIVATE"}];
       showToast=message=>__toasts.push(message);
       loadConsultations=async()=>{};`);
  return {
    run, element, requests, meetings, scripts, timers, confirmations, clipboard,
    respondWith(callback) { responder = callback; }
  };
}

test("public demo join requires acknowledgement and sends no patient details or JWT to Jitsi", async () => {
  const h = makeHarness();
  await h.run("joinConsultation('consultation-opaque')");
  assert.equal(h.confirmations.length, 1);
  assert.match(h.confirmations[0], /synthetic/i);
  assert.equal(JSON.parse(h.requests[0].options.body).acknowledge_demo, true);
  assert.equal(h.meetings.length, 1);
  const meeting = h.meetings[0];
  assert.equal(meeting.domain, "meet.jit.si");
  assert.equal(meeting.options.jwt, undefined);
  assert.equal(meeting.options.userInfo.displayName, "Clinician");
  assert.equal(meeting.options.configOverwrite.startWithAudioMuted, true);
  assert.equal(meeting.options.configOverwrite.startWithVideoMuted, true);
  const serialized = JSON.stringify(meeting.options);
  assert.equal(serialized.includes("Synthetic Patient Secret"), false);
  assert.equal(serialized.includes("AD-PRIVATE"), false);
  assert.equal(h.element("consultationExternalLink").href, `https://meet.jit.si/${"b".repeat(48)}`);
});

test("declining public demo consent prevents join and invitation requests", async () => {
  const h = makeHarness({ confirm: false });
  await h.run("joinConsultation('consultation-opaque')");
  await h.run("copyConsultationLink('consultation-opaque')");
  assert.equal(h.requests.length, 0);
  assert.equal(h.meetings.length, 0);
});

test("public invitation requires acknowledgement and remains accessible when clipboard is used", async () => {
  const h = makeHarness();
  const guestUrl = `https://meet.jit.si/${"c".repeat(48)}`;
  h.respondWith(async () => ({ guest_url: guestUrl, provider: "public_demo" }));
  await h.run("copyConsultationLink('consultation-opaque')");
  assert.equal(JSON.parse(h.requests[0].options.body).acknowledge_demo, true);
  assert.equal(h.element("consultationInvitePanel").hidden, false);
  assert.equal(h.element("consultationInviteLink").value, guestUrl);
  assert.deepEqual(h.clipboard, [guestUrl]);
});

test("leaving while join request is pending prevents a late iframe and clears the call", async () => {
  const h = makeHarness();
  let finish;
  h.respondWith(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.run("joinConsultation('consultation-opaque')");
  h.run("closeConsultationCall()");
  finish({ provider: "public_demo", domain: "meet.jit.si", room_name: "d".repeat(48) });
  await pending;
  assert.equal(h.meetings.length, 0);
  assert.equal(h.element("consultationCallPanel").hidden, true);
  assert.equal(h.run("state.activeConsultation"), null);
});

test("navigating away before join completes prevents iframe creation", async () => {
  const h = makeHarness();
  let finish;
  h.respondWith(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.run("joinConsultation('consultation-opaque')");
  h.run("state.page='patients';closeConsultationCall()");
  finish({ provider: "public_demo", domain: "meet.jit.si", room_name: "e".repeat(48) });
  await pending;
  assert.equal(h.meetings.length, 0);
});

test("Jitsi script timeout rejects the pending load and allows retry", async () => {
  const h = makeHarness({ withJitsi: false });
  const pending = h.run("loadJitsiApi('meet.jit.si')");
  const timer = [...h.timers.values()].find(entry => entry.delay === 20000);
  assert.ok(timer);
  timer.callback();
  await assert.rejects(pending, /20 seconds/i);
  assert.equal(h.scripts[0].removed, true);
  assert.equal(h.run("state.jitsiScriptPromise"), null);
});

test("meeting permission and network errors update the visible call status", async () => {
  const h = makeHarness();
  await h.run("joinConsultation('consultation-opaque')");
  const meeting = h.meetings[0];
  for (const event of ["cameraError", "micError"]) {
    meeting.events.get(event)({});
    assert.match(h.element("consultationCallState").textContent, /camera or microphone/i);
  }
  for (const event of ["errorOccurred", "peerConnectionFailure"]) {
    meeting.events.get(event)({});
    assert.match(h.element("consultationCallState").textContent, /connection failed/i);
  }
  meeting.events.get("videoConferenceJoined")({});
  assert.match(h.element("consultationCallState").textContent, /connected to the meeting/i);
  h.run("closeConsultationCall()");
  assert.equal(meeting.disposed, true);
  assert.deepEqual(meeting.commands, ["hangup"]);
});

test("events from a disposed meeting cannot alter or close a newer call", async () => {
  const h = makeHarness();
  await h.run("joinConsultation('first-consultation')");
  const oldMeeting = h.meetings[0];
  await h.run("joinConsultation('second-consultation')");
  const currentMeeting = h.meetings[1];
  assert.equal(oldMeeting.disposed, true);
  currentMeeting.events.get("videoConferenceJoined")({});
  const connectedStatus = h.element("consultationCallState").textContent;

  for (const event of ["cameraError", "micError", "errorOccurred", "peerConnectionFailure", "videoConferenceJoined", "videoConferenceLeft"]) {
    oldMeeting.events.get(event)({});
    assert.equal(h.element("consultationCallState").textContent, connectedStatus, event);
    assert.equal(h.run("state.jitsiApi"), currentMeeting, event);
    assert.equal(h.run("state.activeConsultation"), "second-consultation", event);
    assert.equal(h.element("consultationCallPanel").hidden, false, event);
    assert.equal(currentMeeting.disposed, false, event);
  }
  assert.deepEqual(currentMeeting.commands, []);
});

test("appointment save uses the form captured before the browser clears currentTarget", async () => {
  const h = makeHarness();
  h.element("consultationTime").value = "2026-11-10T17:48";
  h.element("consultPatient").value = "synthetic-patient";
  h.element("consultationDuration").value = "15";
  h.run(`var resetCount=0, refreshCount=0;
    var submitButton={disabled:false};
    var testEvent={preventDefault(){},currentTarget:{querySelector:()=>submitButton,reset(){resetCount++;}}};
    loadPatients=async()=>{};loadConsultations=async()=>{refreshCount++;};`);
  let finish;
  h.respondWith(() => new Promise(resolve => { finish = resolve; }));
  const pending = h.run("createConsultation(testEvent)");
  h.run("testEvent.currentTarget=null");
  finish({consultation:{id:"synthetic-appointment"}});
  await pending;
  assert.equal(h.run("resetCount"), 1);
  assert.equal(h.run("refreshCount"), 1);
  assert.equal(h.element("consultationFormError").textContent, "");
  assert.equal(h.run("submitButton.disabled"), false);
});

for (const handler of ["submitScreening", "saveReview", "saveReferral", "saveFollowup"]) {
  test(`${handler} retains its form after asynchronous event dispatch ends`, async () => {
    const h = makeHarness();
    h.element("oralImage").files = [{name:"synthetic.png"}];
    h.run(`var resetCount=0;
      var testEvent={preventDefault(){},currentTarget:{reset(){resetCount++;}}};
      loadScreenings=async()=>{};loadReviews=async()=>{};loadCare=async()=>{};loadDashboard=async()=>{};`);
    let finish;
    h.respondWith(() => new Promise(resolve => { finish = resolve; }));
    const pending = h.run(`${handler}(testEvent)`);
    h.run("testEvent.currentTarget=null");
    finish({});
    await pending;
    assert.equal(h.run("resetCount"), 1);
    assert.equal(h.run("__toasts.some(message=>/null|currentTarget/.test(message))"), false);
  });
}
