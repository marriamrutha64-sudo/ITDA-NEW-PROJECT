const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "mic-preflight.js"), "utf8");

function harness({ denied = false } = {}) {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) elements.set(id, {
      textContent: "", value: "", disabled: false, hidden: false, style: {}, dataset: {},
      options: id === "micPreflightDevice" ? [{ value: "", textContent: "" }] : [],
      add(option) { this.options.push(option); },
      replaceChildren(option) { this.options = [option]; },
      addEventListener(name, fn) { this[`on_${name}`] = fn; },
      classList: { contains: () => true }
    });
    return elements.get(id);
  };
  let clock = 0;
  let interval;
  let stopped = false;
  let closed = false;
  let level = 0.01;
  const document = {
    documentElement: { lang: "en" }, hidden: false,
    getElementById: element, addEventListener() {}
  };
  class AudioContext {
    createMediaStreamSource() { return { connect() {} }; }
    createAnalyser() {
      return { fftSize: 0, getFloatTimeDomainData(values) { values.fill(level); } };
    }
    async resume() {}
    async close() { closed = true; }
  }
  const window = { AudioContext };
  const navigator = { mediaDevices: {
    async getUserMedia() {
      if (denied) throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      return { getTracks: () => [{ stop() { stopped = true; } }] };
    },
    async enumerateDevices() { return [{ kind: "audioinput", deviceId: "realtek", label: "Realtek microphone" }]; }
  } };
  const context = vm.createContext({
    window, document, navigator, MutationObserver: class { observe() {} },
    Option: class { constructor(text, value) { this.textContent = text; this.value = value; } },
    AudioContext, Float32Array, Math, performance: { now: () => clock },
    setInterval(fn) { interval = fn; return 1; }, clearInterval() { interval = null; }
  });
  vm.runInContext(source, context);
  return {
    element, get stopped() { return stopped; }, get closed() { return closed; },
    start() { element("micPreflightStart").on_click(); },
    async tick(count, amplitude) {
      level = amplitude;
      for (let index = 0; index < count; index++) {
        clock += 100;
        interval?.();
      }
      await new Promise(setImmediate);
    },
    async flush() { await new Promise(setImmediate); }
  };
}

test("spoken input rises over the quiet baseline and releases capture", async () => {
  const app = harness();
  app.start();
  await app.flush();
  assert.equal(app.element("micPreflightStatus").textContent.includes("Stay quiet"), true);
  await app.tick(20, 0.01);
  await app.tick(65, 0.1);
  assert.match(app.element("micPreflightStatus").textContent, /input level rose/i);
  assert.equal(app.stopped, true);
  assert.equal(app.closed, true);
  assert.equal(app.element("micPreflightStart").disabled, false);
});

test("flat input is reported without claiming that speech was heard", async () => {
  const app = harness();
  app.start();
  await app.flush();
  await app.tick(85, 0.01);
  assert.match(app.element("micPreflightStatus").textContent, /barely changed/i);
  assert.equal(app.stopped, true);
});

test("permission denial gives recovery guidance and closes audio context", async () => {
  const app = harness({ denied: true });
  app.start();
  await app.flush();
  assert.match(app.element("micPreflightStatus").textContent, /Allow it for this site/i);
  assert.equal(app.closed, true);
  assert.equal(app.element("micPreflightStart").disabled, false);
});
