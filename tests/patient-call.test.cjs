const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "patient-call.js"), "utf8");
const room = "a".repeat(48);

function harness({ hash = `#room=${room}`, loaded = true, consent = true, constructorError } = {}) {
  const elements = new Map(), scripts = [], meetings = [], diagnosticCalls = [], timers = new Map(), events = new Map();
  let timerId = 0;
  function element(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: id === "patientExternal", disabled: false, textContent: "", listeners: new Map(),
      addEventListener(name, listener) { this.listeners.set(name, listener); },
      replaceChildren() { this.cleared = true; }
    });
    return elements.get(id);
  }
  class FakeJitsi {
    constructor(domain, options) {
      if (constructorError) throw new Error(constructorError);
      this.domain = domain; this.options = options; this.events = new Map(); this.commands = [];
      meetings.push(this);
    }
    addListener(name, listener) { this.events.set(name, listener); }
    executeCommand(name) { this.commands.push(name); }
    dispose() { this.disposed = true; }
  }
  const window = {
    addEventListener(name, listener) { events.set(name, listener); },
    CallDiagnostics: {
      attach(api, options) {
        const controller = { api, options, detached: false, detach() { this.detached = true; } };
        diagnosticCalls.push(controller);
        return controller;
      }
    }
  };
  if (loaded) window.JitsiMeetExternalAPI = FakeJitsi;
  vm.runInNewContext(source, {
    window, location: { hash }, URLSearchParams, confirm: () => consent,
    document: {
      getElementById: element,
      createElement() { const script = { remove() { this.removed = true; } }; scripts.push(script); return script; },
      head: { appendChild() {} }
    },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); }
  });
  return {
    element, scripts, meetings, diagnosticCalls, timers, events, window,
    async click(id) { const button = element(id); if (!button.disabled) return button.listeners.get("click")?.(); },
    installJitsi() { window.JitsiMeetExternalAPI = FakeJitsi; }
  };
}

test("patient invitation validates its opaque room before exposing a link or starting Jitsi", async () => {
  for (const hash of ["", "#room=../private", "#room=https%3A%2F%2Fevil.example", "#room=" + "A".repeat(48)]) {
    const h = harness({ hash });
    assert.equal(h.element("patientJoin").disabled, true);
    assert.equal(h.element("patientExternal").hidden, true);
    await h.element("patientJoin").listeners.get("click")();
    assert.equal(h.meetings.length, 0);
    assert.equal(h.scripts.length, 0);
  }
});

test("patient joins with bridge transport, incoming playback enabled and microphone initially muted", async () => {
  const h = harness();
  assert.equal(h.meetings.length, 0);
  await h.click("patientJoin");
  const meeting = h.meetings[0];
  assert.equal(meeting.domain, "meet.jit.si");
  assert.equal(meeting.options.roomName, room);
  assert.equal(meeting.options.jwt, undefined);
  assert.equal(meeting.options.configOverwrite.p2p.enabled, false);
  assert.equal(meeting.options.configOverwrite.startSilent, false);
  assert.equal(meeting.options.configOverwrite.startWithAudioMuted, true);
  assert.equal(meeting.options.configOverwrite.startWithVideoMuted, true);
  assert.equal(h.diagnosticCalls[0].options.role, "patient");
  assert.equal(h.diagnosticCalls[0].api, meeting);
  assert.equal(h.element("patientExternal").href, `https://meet.jit.si/${room}#config.startSilent=false&config.startWithAudioMuted=true&config.p2p.enabled=false`);
  assert.deepEqual(meeting.commands, []);
  meeting.events.get("videoConferenceJoined")();
  assert.match(h.element("patientCallStatus").textContent, /Connected.*Check audio stream/);
});

test("leaving during script loading prevents a late meeting and permits a clean subsequent join", async () => {
  const h = harness({ loaded: false });
  const joining = h.click("patientJoin");
  assert.equal(h.scripts.length, 1);
  await h.click("patientLeave");
  h.installJitsi();
  h.scripts[0].onload();
  await joining;
  assert.equal(h.meetings.length, 0);
  assert.equal(h.element("patientJoin").disabled, false);
  assert.match(h.element("patientCallStatus").textContent, /left the call/);
  await h.click("patientJoin");
  assert.equal(h.meetings.length, 1);
});

test("script timeout and network failure leave a retryable patient page", async () => {
  const h = harness({ loaded: false });
  const joining = h.click("patientJoin");
  [...h.timers.values()].find(timer => timer.delay === 20000).callback();
  await joining;
  assert.equal(h.scripts[0].removed, true);
  assert.equal(h.element("patientJoin").disabled, false);
  assert.match(h.element("patientCallStatus").textContent, /too long/);
  const retrying = h.click("patientJoin");
  assert.equal(h.scripts.length, 2);
  h.scripts[1].onerror();
  await retrying;
  assert.match(h.element("patientCallStatus").textContent, /Could not load Jitsi/);
  assert.equal(h.element("patientJoin").disabled, false);
});

test("explicit bridge retry disposes the old call and ignores its late events", async () => {
  const h = harness();
  await h.click("patientJoin");
  const first = h.meetings[0];
  await h.diagnosticCalls[0].options.onRelayRetry();
  assert.equal(h.meetings.length, 2);
  assert.equal(first.disposed, true);
  assert.deepEqual(first.commands, ["hangup"]);
  assert.equal(h.diagnosticCalls[0].detached, true);
  const current = h.meetings[1];
  current.events.get("videoConferenceJoined")();
  const status = h.element("patientCallStatus").textContent;
  for (const name of ["videoConferenceLeft", "videoConferenceJoined", "micError", "errorOccurred"]) {
    first.events.get(name)();
    assert.equal(h.element("patientCallStatus").textContent, status);
    assert.equal(current.disposed, undefined);
  }
});

test("declining bridge retry leaves the active call untouched", async () => {
  const h = harness({ consent: false });
  await h.click("patientJoin");
  await h.diagnosticCalls[0].options.onRelayRetry();
  assert.equal(h.meetings.length, 1);
  assert.deepEqual(h.meetings[0].commands, []);
  assert.equal(h.diagnosticCalls[0].detached, false);
});

test("pagehide releases the current call and diagnostics", async () => {
  const h = harness();
  await h.click("patientJoin");
  h.events.get("pagehide")();
  assert.equal(h.meetings[0].disposed, true);
  assert.equal(h.diagnosticCalls[0].detached, true);
  assert.equal(h.element("patientVideo").cleared, true);
  assert.equal(h.element("patientJoin").disabled, false);
});

test("constructor and microphone errors remain actionable without silently activating a device", async () => {
  const failed = harness({ constructorError: "Synthetic constructor error" });
  await failed.click("patientJoin");
  assert.match(failed.element("patientCallStatus").textContent, /Synthetic constructor error/);
  assert.equal(failed.element("patientJoin").disabled, false);
  const h = harness();
  await h.click("patientJoin");
  h.meetings[0].events.get("micError")();
  assert.match(h.element("patientCallStatus").textContent, /still listen/);
  assert.deepEqual(h.meetings[0].commands, []);
});
