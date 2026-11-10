const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "call-diagnostics.js"), "utf8");

class Element {
  constructor(tag, document) {
    this.tagName = tag;
    this.ownerDocument = document;
    this.children = [];
    this.attributes = {};
    this.listeners = new Map();
    this.disabled = false;
    this._text = "";
  }
  set textContent(value) { this._text = String(value); this.children = []; }
  get textContent() { return this._text + this.children.map(child => child.textContent).join(" "); }
  set innerHTML(_) { throw new Error("Diagnostics must not render HTML strings."); }
  setAttribute(name, value) { this.attributes[name] = String(value); }
  appendChild(child) { child.parentNode = this; this.children.push(child); return child; }
  addEventListener(name, handler) { this.listeners.set(name, handler); }
  removeEventListener(name, handler) { if (this.listeners.get(name) === handler) this.listeners.delete(name); }
  remove() {
    if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(child => child !== this);
    this.parentNode = null;
  }
  click() { if (!this.disabled) return this.listeners.get("click")?.(); }
}

async function flush() {
  for (let index = 0; index < 25; index++) await Promise.resolve();
}

function harness({ language = "en" } = {}) {
  let now = 0;
  let nextTimer = 0;
  const timers = new Map();
  const observers = [];
  const document = { documentElement: { lang: language }, createElement(tag) { return new Element(tag, document); } };
  const container = document.createElement("div");
  const window = {};
  vm.runInNewContext(source, {
    window, document,
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.disconnected = false; observers.push(this); }
      observe() {}
      disconnect() { this.disconnected = true; }
    },
    setTimeout(callback, delay) {
      const id = ++nextTimer;
      timers.set(id, { callback, at: now + delay });
      return id;
    },
    clearTimeout(id) { timers.delete(id); }
  });
  function find(attribute, value, node = container) {
    if (node.attributes[attribute] === value) return node;
    for (const child of node.children) {
      const match = find(attribute, value, child);
      if (match) return match;
    }
    return null;
  }
  return {
    container, timers, window, observers,
    changeLanguage(language) { document.documentElement.lang = language; observers.filter(observer => !observer.disconnected).forEach(observer => observer.callback()); },
    now: () => now,
    value: key => find("data-diagnostic", key)?.textContent,
    button: action => find("data-diagnostic-action", action),
    attach(api, options = {}) { return window.CallDiagnostics.attach(api, { container, ...options }); },
    async advance(duration) {
      const target = now + duration;
      await flush();
      while (true) {
        const due = [...timers.entries()].filter(([, timer]) => timer.at <= target)
          .sort((a, b) => a[1].at - b[1].at || a[0] - b[0])[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].callback();
        await flush();
      }
      now = target;
      await flush();
    }
  };
}

function apiWith(stats, overrides = {}) {
  return {
    async getConnectionStats() { return stats; },
    async isP2pActive() { return true; },
    async isStartSilent() { return false; },
    async isAudioMuted() { return false; },
    async isAudioAvailable() { return true; },
    ...overrides
  };
}

test("checks on explicit click at 0, 3 and 6 seconds and reports only local scalar measurements", async () => {
  const h = harness();
  const queriedAt = [];
  const commands = [];
  const api = apiWith({ bitrate: { audio: { upload: 13.24, download: 4 } }, iceConnected: true,
    transport: [{ ip: "192.168.44.99:443", localip: "10.12.13.14:1234" }], participant: "Secret Person" }, {
    async getConnectionStats() {
      queriedAt.push(h.now());
      return { bitrate: { audio: { upload: 13.24, download: 4 } }, iceConnected: true,
        transport: [{ ip: "192.168.44.99:443" }], participant: "Secret Person" };
    },
    executeCommand(name) { commands.push(name); }
  });
  h.attach(api);
  assert.equal(queriedAt.length, 0);
  const checking = h.button("check").click();
  await flush();
  assert.equal(h.button("check").disabled, true);
  h.button("check").click();
  await h.advance(6000);
  await checking;
  assert.deepEqual(queriedAt, [0, 3000, 6000]);
  assert.equal(h.value("sent"), "13.2 Kbps");
  assert.equal(h.value("received"), "4 Kbps");
  assert.equal(h.value("ice"), "Connected");
  assert.equal(h.value("route"), "Direct peer-to-peer");
  assert.equal(h.value("silent"), "No");
  assert.equal(h.value("microphone"), "Unmuted");
  assert.match(h.value("status"), /Outgoing audio traffic detected/);
  assert.match(h.value("status"), /Incoming audio traffic detected/);
  assert.match(h.value("status"), /does not confirm patient reception or hearing/);
  assert.doesNotMatch(h.container.textContent, /192\.168|10\.12|Secret Person/);
  assert.deepEqual(commands, []);
  assert.equal(h.timers.size, 0);
});

test("patient zero incoming stream and muted microphone remain distinct from a hearing claim", async () => {
  const h = harness();
  h.attach(apiWith({ bitrate: { audio: { upload: 0, download: 0 } }, iceConnected: false }, {
    async isAudioMuted() { return true; }, async isP2pActive() { return false; }
  }), { role: "patient" });
  const checking = h.button("check").click();
  await h.advance(6000);
  await checking;
  assert.equal(h.value("received"), "0 Kbps");
  assert.equal(h.value("sent"), "0 Kbps");
  assert.equal(h.value("microphone"), "Muted");
  assert.equal(h.value("route"), "Jitsi bridge");
  assert.equal(h.value("ice"), "Not connected");
  assert.match(h.value("status"), /No incoming audio traffic detected/);
  assert.match(h.value("status"), /clinician to check outgoing audio/);
});

test("missing, negative and nonnumeric measurements are Unavailable rather than invented zeroes", async () => {
  const h = harness();
  const readings = [
    { bitrate: { audio: { upload: -1, download: Infinity } }, iceConnected: "true" },
    { bitrate: { audio: { upload: "0", download: null } } },
    {}
  ];
  h.attach(apiWith({}, {
    async getConnectionStats() { return readings.shift(); },
    async isP2pActive() { return undefined; },
    async isStartSilent() { return "false"; },
    async isAudioAvailable() { return undefined; },
    async isAudioMuted() { return null; }
  }));
  const checking = h.button("check").click();
  await h.advance(6000);
  await checking;
  for (const name of ["sent", "received", "ice", "route", "silent", "microphone"]) {
    assert.equal(h.value(name), "Unavailable", name);
  }
  assert.match(h.value("status"), /measurements are unavailable or incomplete/);
  assert.doesNotMatch(h.value("status"), /No outgoing audio traffic detected|No incoming audio traffic detected/);
});

test("an older API with no supported diagnostics completes without calling unsupported methods", async () => {
  const h = harness();
  h.attach({}, { role: "patient" });
  const checking = h.button("check").click();
  await h.advance(6000);
  await checking;
  assert.equal(h.value("sent"), "Unavailable");
  assert.equal(h.value("received"), "Unavailable");
  assert.match(h.value("status"), /did not provide incoming audio measurements/);
  assert.equal(h.button("check").disabled, false);
  assert.equal(h.timers.size, 0);
});

test("hanging API requests time out at 3 seconds per request and later settlement cannot change results", async () => {
  const h = harness();
  const finish = [];
  const queriedAt = [];
  h.attach(apiWith({}, {
    getConnectionStats() {
      queriedAt.push(h.now());
      return new Promise(resolve => finish.push(resolve));
    },
    isP2pActive() { throw new Error("private transport details"); },
    async isAudioAvailable() { throw new Error("private device details"); }
  }));
  const checking = h.button("check").click();
  await h.advance(8999);
  assert.equal(h.button("check").disabled, true);
  await h.advance(1);
  await checking;
  assert.deepEqual(queriedAt, [0, 3000, 6000]);
  assert.equal(h.value("sent"), "Unavailable");
  const status = h.value("status");
  finish.forEach(resolve => resolve({ bitrate: { audio: { upload: 42, download: 42 } } }));
  await flush();
  assert.equal(h.value("status"), status);
  assert.equal(h.value("sent"), "Unavailable");
  assert.doesNotMatch(h.container.textContent, /private transport|private device/);
  assert.equal(h.timers.size, 0);
});

test("patient silent mode has specific rejoin guidance even if RTP is present", async () => {
  const h = harness();
  h.attach(apiWith({ bitrate: { audio: { upload: 1, download: 20 } } }, {
    async isStartSilent() { return true; }
  }), { role: "patient" });
  const checking = h.button("check").click();
  await h.advance(6000);
  await checking;
  assert.equal(h.value("silent"), "Yes");
  assert.match(h.value("status"), /Incoming playback is disabled/);
  assert.match(h.value("status"), /Leave and rejoin with normal audio/);
});

test("detach cancels timers and stale responses cannot alter a replacement instance", async () => {
  const h = harness();
  let finish;
  const first = h.attach(apiWith({}, {
    getConnectionStats() { return new Promise(resolve => { finish = resolve; }); }
  }));
  const checking = h.button("check").click();
  await flush();
  const oldButton = h.button("check");
  first.detach();
  assert.equal(h.timers.size, 0);
  assert.equal(h.container.children.length, 0);
  h.attach(apiWith({ bitrate: { audio: { upload: 5, download: 5 } } }));
  finish({ bitrate: { audio: { upload: 999, download: 999 } } });
  await checking;
  await flush();
  assert.equal(h.value("sent"), "Unavailable");
  assert.equal(h.value("status"), "No stream check has run yet.");
  assert.equal(oldButton.listeners.size, 0);
  first.detach();
  assert.equal(h.container.children.length, 1);
});

test("attaching to the same container replaces and cancels its previous controller", async () => {
  const h = harness();
  const first = h.attach({ getConnectionStats: () => new Promise(() => {}) });
  const checking = h.button("check").click();
  await flush();
  h.attach({});
  await checking;
  assert.equal(h.container.children.length, 1);
  assert.equal(h.timers.size, 0);
  first.detach();
  assert.equal(h.container.children.length, 1);
});

test("bridge retry invokes only its user callback and prevents duplicate or concurrent requests", async () => {
  const h = harness();
  let calls = 0;
  let finishRetry;
  const controller = h.attach(apiWith({ bitrate: { audio: { upload: 2, download: 3 } } }), {
    onRelayRetry() { calls++; return new Promise(resolve => { finishRetry = resolve; }); }
  });
  assert.equal(calls, 0);
  const checking = h.button("check").click();
  assert.equal(h.button("relay").disabled, true);
  h.button("relay").click();
  assert.equal(calls, 0);
  await h.advance(6000);
  await checking;
  const retrying = h.button("relay").click();
  h.button("relay").click();
  h.button("check").click();
  assert.equal(calls, 1);
  assert.equal(h.button("check").disabled, true);
  finishRetry();
  await retrying;
  assert.equal(h.button("relay").disabled, false);
  assert.equal(h.button("check").disabled, false);
  controller.detach();
});

test("bridge errors display a generic retry message without exposing callback details", async () => {
  const h = harness();
  h.attach({}, { onRelayRetry: async () => { throw new Error("Secret room and IP"); } });
  await h.button("relay").click();
  assert.match(h.value("status"), /Could not retry this call/);
  assert.doesNotMatch(h.container.textContent, /Secret room and IP/);
});

test("Telugu diagnostics explain the stream check and retain the hearing limitation", async () => {
  const h = harness({ language: "te-IN" });
  h.attach(apiWith({ bitrate: { audio: { upload: 4, download: 20 } }, iceConnected: true }), { role: "patient", onRelayRetry() {} });
  assert.match(h.button("check").textContent, /ఆడియో ప్రసారాన్ని తనిఖీ/);
  assert.match(h.button("relay").textContent, /బ్రిడ్జ్ ద్వారా మళ్లీ/);
  assert.match(h.container.textContent, /వైద్యుని 6 సెకన్లు/);
  assert.match(h.container.textContent, /ఆడియోను రికార్డ్ చేయదు/);
  const checking = h.button("check").click();
  assert.match(h.value("status"), /6 సెకన్లలో 3 నమూనాలను/);
  await h.advance(6000); await checking;
  assert.match(h.value("status"), /అందుకుంటున్న ఆడియో డేటా గుర్తించబడింది/);
  assert.match(h.value("status"), /మాటలు వినిపిస్తున్నాయని నిర్ధారించదు/);
  assert.match(h.button("check").textContent, /మళ్లీ తనిఖీ/);
  assert.equal(h.value("received"), "20 Kbps");
});

test("changing document language translates the completed summary without another API check", async () => {
  const h = harness();
  let queries = 0;
  h.attach(apiWith({}, { async getConnectionStats() { queries++; return { bitrate: { audio: { upload: 0, download: 0 } } }; } }));
  const checking = h.button("check").click();
  await h.advance(6000); await checking;
  h.changeLanguage("te");
  assert.match(h.value("status"), /పంపుతున్న ఆడియో డేటా కనిపించలేదు/);
  assert.equal(queries, 3);
  h.changeLanguage("fr");
  assert.match(h.value("status"), /No outgoing audio traffic detected/);
  assert.equal(h.button("check").textContent, "Check audio stream again");
  assert.equal(queries, 3);
});

test("Telugu retry failure remains generic and detach releases its language observer", async () => {
  const h = harness({ language: "te" });
  const controller = h.attach({}, { onRelayRetry() { throw new Error("Private connection detail"); } });
  await h.button("relay").click();
  assert.match(h.value("status"), /మళ్లీ చేరలేకపోయాం/);
  assert.doesNotMatch(h.container.textContent, /Private connection detail/);
  controller.detach();
  assert.ok(h.observers.every(observer => observer.disconnected));
  h.changeLanguage("en");
  assert.equal(h.container.children.length, 0);
});
