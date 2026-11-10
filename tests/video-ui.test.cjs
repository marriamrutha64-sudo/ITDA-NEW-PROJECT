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
    location:{origin:"https://demo.example"},
    confirm(message) { confirmations.push(message); return confirm; }
  };
  if (withJitsi) window.JitsiMeetExternalAPI = class {
    constructor(domain, options) {
      this.domain = domain;
      this.options = options;
      this.events = new Map();
      this.commands = [];
      this.disposed = false;
      this.audioMuted = true;
      this.audioAvailable = true;
      meetings.push(this);
    }
    addListener(name, callback) { this.events.set(name, callback); }
    executeCommand(name) { this.commands.push(name); }
    async isAudioMuted() { return this.audioMuted; }
    async isAudioAvailable() { return this.audioAvailable; }
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

async function enterMeeting(h, id = "consultation-opaque") {
  await h.run(`joinConsultation(${JSON.stringify(id)})`);
  const meeting = h.meetings.at(-1);
  await meeting.events.get("videoConferenceJoined")({});
  await h.run("Promise.resolve()");
  return meeting;
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
  assert.equal(meeting.options.configOverwrite.startSilent, false);
  assert.equal(meeting.options.configOverwrite.p2p.enabled, false);
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
  const audibleGuestUrl = `https://demo.example/patient-call.html#room=${"c".repeat(48)}`;
  h.respondWith(async () => ({ guest_url: guestUrl, provider: "public_demo" }));
  await h.run("copyConsultationLink('consultation-opaque')");
  assert.equal(JSON.parse(h.requests[0].options.body).acknowledge_demo, true);
  assert.equal(h.element("consultationInvitePanel").hidden, false);
  assert.equal(h.element("consultationInviteLink").value, audibleGuestUrl);
  assert.deepEqual(h.clipboard, [audibleGuestUrl]);
});

test("a local clinician copies a reachable direct Jitsi invitation for the second device", async () => {
  const h=makeHarness();
  h.run('window.location.origin="http://127.0.0.1:8001"');
  const guestUrl=`https://meet.jit.si/${"c".repeat(48)}`;
  h.respondWith(async()=>({guest_url:guestUrl,provider:"public_demo"}));
  await h.run("copyConsultationLink('consultation-opaque')");
  assert.equal(h.element("consultationInviteLink").value,guestUrl+"#config.startSilent=false&config.startWithAudioMuted=true&config.p2p.enabled=false");
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

test("meeting camera and network errors update the visible call status", async () => {
  const h = makeHarness();
  await h.run("joinConsultation('consultation-opaque')");
  const meeting = h.meetings[0];
  meeting.events.get("cameraError")({});
  assert.match(h.element("consultationCallState").textContent, /camera/i);
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

test("joined meeting reports its muted microphone without activating it", async () => {
  const h = makeHarness();
  const meeting = await enterMeeting(h);
  assert.equal(h.run("state.callAudio.joined"), true);
  assert.equal(h.run("state.callAudio.muted"), true);
  assert.equal(h.run("state.callAudio.available"), true);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /muted|microphone off/i);
  assert.equal(h.element("consultationUnmuteButton").disabled, false);
  assert.deepEqual(meeting.commands, []);
});

test("microphone mute and availability events update the visible audio state", async () => {
  const h = makeHarness();
  const meeting = await enterMeeting(h);
  meeting.events.get("audioMuteStatusChanged")({ muted: false });
  assert.equal(h.run("state.callAudio.muted"), false);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /microphone.*on|unmuted/i);
  meeting.events.get("audioMuteStatusChanged")({ muted: true });
  assert.equal(h.run("state.callAudio.muted"), true);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /muted|microphone off/i);
  meeting.events.get("audioAvailabilityChanged")({ available: false });
  assert.equal(h.run("state.callAudio.available"), false);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /unavailable|not available|cannot access|permission|blocked/i);
  meeting.events.get("audioAvailabilityChanged")({ available: true });
  assert.equal(h.run("state.callAudio.available"), true);
  assert.deepEqual(meeting.commands, []);
});

test("explicit microphone action unmutes only a confirmed muted microphone", async () => {
  const h = makeHarness();
  const meeting = await enterMeeting(h);
  await h.run("turnConsultationMicrophoneOn()");
  assert.deepEqual(meeting.commands, ["toggleAudio"]);
  assert.equal(h.run("state.callAudio.pending"), false);
  meeting.audioMuted = false;
  meeting.events.get("audioMuteStatusChanged")({ muted: false });
  await h.run("turnConsultationMicrophoneOn()");
  assert.deepEqual(meeting.commands, ["toggleAudio"], "an already unmuted microphone must not be toggled off");
  assert.equal(h.run("state.callAudio.pending"), false);
});

test("unavailable microphone does not activate devices through the explicit action", async () => {
  const h = makeHarness();
  const meeting = await enterMeeting(h);
  meeting.audioAvailable = false;
  meeting.events.get("audioAvailabilityChanged")({ available: false });
  await h.run("turnConsultationMicrophoneOn()");
  assert.deepEqual(meeting.commands, []);
  assert.equal(h.run("state.callAudio.pending"), false);
});

test("microphone access errors have a specific visible message and do not activate audio", async () => {
  const h = makeHarness();
  const meeting = await enterMeeting(h);
  meeting.events.get("micError")({ type: "gum.permission_denied", message: "Microphone permission denied" });
  assert.equal(h.run("state.callAudio.available"), false);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /microphone/i);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /permission|allow|blocked|access|unavailable/i);
  assert.doesNotMatch(h.element("consultationMicrophoneStatus").textContent, /camera or microphone/i);
  assert.deepEqual(meeting.commands, []);
});

test("leaving during an explicit microphone check prevents late device activation", async () => {
  const h = makeHarness();
  const oldMeeting = await enterMeeting(h, "old-consultation");
  let finishMuteCheck;
  oldMeeting.isAudioMuted = () => new Promise(resolve => { finishMuteCheck = resolve; });
  const pending = h.run("turnConsultationMicrophoneOn()");
  assert.equal(h.run("state.callAudio.pending"), true);
  h.run("closeConsultationCall()");
  const currentMeeting = await enterMeeting(h, "current-consultation");
  const currentStatus = h.element("consultationMicrophoneStatus").textContent;
  finishMuteCheck(true);
  await pending;
  assert.deepEqual(oldMeeting.commands, ["hangup"]);
  assert.deepEqual(currentMeeting.commands, []);
  assert.equal(h.run("state.jitsiApi"), currentMeeting);
  assert.equal(h.run("state.callAudio.pending"), false);
  assert.equal(h.element("consultationMicrophoneStatus").textContent, currentStatus);
});

test("a newer unmute event prevents a pending explicit action from toggling audio off", async () => {
  const h = makeHarness();
  const meeting = await enterMeeting(h);
  let finishMuteCheck;
  meeting.isAudioMuted = () => new Promise(resolve => { finishMuteCheck = resolve; });
  const pending = h.run("turnConsultationMicrophoneOn()");
  meeting.events.get("audioMuteStatusChanged")({ muted: false });
  finishMuteCheck(true);
  await pending;
  assert.equal(h.run("state.callAudio.muted"), false);
  assert.equal(h.run("state.callAudio.pending"), false);
  assert.deepEqual(meeting.commands, [], "a stale muted=true snapshot must not toggle an already unmuted microphone");
});

test("late microphone status queries from a disposed meeting cannot change the current call", async () => {
  const h = makeHarness();
  const oldMeeting = await enterMeeting(h, "old-consultation");
  let finishMuteCheck;
  let finishAvailabilityCheck;
  oldMeeting.isAudioMuted = () => new Promise(resolve => { finishMuteCheck = resolve; });
  oldMeeting.isAudioAvailable = () => new Promise(resolve => { finishAvailabilityCheck = resolve; });
  const pending = h.run("refreshConsultationAudio(state.jitsiApi,state.callGeneration)");
  h.run("closeConsultationCall()");
  const currentMeeting = await enterMeeting(h, "current-consultation");
  const currentStatus = h.element("consultationMicrophoneStatus").textContent;
  finishMuteCheck(false);
  finishAvailabilityCheck(false);
  await pending;
  assert.equal(h.run("state.jitsiApi"), currentMeeting);
  assert.equal(h.run("state.callAudio.muted"), true);
  assert.equal(h.run("state.callAudio.available"), true);
  assert.equal(h.element("consultationMicrophoneStatus").textContent, currentStatus);
  assert.deepEqual(currentMeeting.commands, []);
});

test("newer microphone events take precedence over pending status query results", async () => {
  const h = makeHarness();
  const meeting = await enterMeeting(h);
  let finishMuteCheck;
  let finishAvailabilityCheck;
  meeting.isAudioMuted = () => new Promise(resolve => { finishMuteCheck = resolve; });
  meeting.isAudioAvailable = () => new Promise(resolve => { finishAvailabilityCheck = resolve; });
  const pending = h.run("refreshConsultationAudio(state.jitsiApi,state.callGeneration)");
  meeting.events.get("audioMuteStatusChanged")({ muted: false });
  meeting.events.get("audioAvailabilityChanged")({ available: false });
  meeting.events.get("micError")({ type: "gum.permission_denied", message: "Microphone permission denied" });
  finishMuteCheck(true);
  finishAvailabilityCheck(true);
  await pending;
  assert.equal(h.run("state.callAudio.muted"), false, "stale query must not overwrite newer unmute event");
  assert.equal(h.run("state.callAudio.available"), false, "stale query must not clear newer access error");
  assert.equal(h.run("state.callAudio.error"), true);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /microphone/i);
  assert.match(h.element("consultationMicrophoneStatus").textContent, /permission|allow|blocked|access|unavailable/i);
  assert.deepEqual(meeting.commands, []);
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
