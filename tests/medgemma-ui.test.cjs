const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "medgemma-ui.js"), "utf8");
const clinician = { id: "doctor-1", username: "qa-doctor", role: "medical_officer" };
const other = { id: "doctor-2", username: "other-doctor", role: "specialist" };

test("older truncated results are explicitly marked unusable as a partial review", async () => {
  const h=await harness({responder:async(url,options,fallback)=>url.startsWith("/api/ai/results/")?{inferences:[{notice:"Experimental",text:"Partial review",runtime:{truncated:true}}]}:fallback(url,options)});
  assert.equal(h.warning().hidden,false);
  assert.match(h.warning().textContent,/Incomplete saved AI output/);
  assert.match(h.warning().textContent,/request a new analysis/);
});

test("Gemini image transfer requires explicit confirmation and sends acknowledgement", async () => {
  for(const consent of [false,true]) {
    const h=await harness({consent,responder:async(url,options,fallback)=>url==="/api/health"?{ai:{available:true,provider:"gemini"}}:fallback(url,options)});
    await h.click();
    assert.match(h.confirmations[0],/Send this screening photograph to Google Gemini/);
    const sent=h.requests.filter(r=>r.url==="/api/ai/jobs"&&r.options?.method==="POST");
    assert.equal(sent.length,consent?1:0);
    if(consent)assert.equal(JSON.parse(sent[0].options.body).acknowledge_google_transfer,true);
  }
});

test("temporary polling failure reconnects to the same job without duplicate submission", async () => {
  let polls=0;
  const h=await harness({responder:async(url,options,fallback)=>{
    if(url==="/api/ai/jobs/job-1" && ++polls===1)throw new Error("Network disconnected");
    return fallback(url,options);
  }});
  const running=h.click();await flush();
  assert.match(h.output().textContent,/Reconnecting/);
  assert.equal(h.button().disabled,true);
  await h.tick();await running;
  assert.match(h.output().textContent,/Synthetic observations/);
  assert.equal(h.requests.filter(r=>r.url==="/api/ai/jobs"&&r.options?.method==="POST").length,1);
});

test("repeated connection failures leave a reconnect instruction and no fabricated result", async () => {
  const h=await harness({responder:async(url,options,fallback)=>{
    if(url==="/api/ai/jobs/job-1")throw new Error("Network disconnected");
    return fallback(url,options);
  }});
  const running=h.click();await flush();
  for(let i=0;i<4;i++)await h.tick();
  await running;
  assert.match(h.output().textContent,/server job may still be running/);
  assert.deepEqual(h.emitted,[]);
  assert.equal(h.requests.filter(r=>r.url==="/api/ai/jobs"&&r.options?.method==="POST").length,1);
});

async function flush() { for (let index = 0; index < 30; index++) await Promise.resolve(); }
function deferred() {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
class Element {
  constructor(tag = "div") { this.tag = tag; this.children = []; this.listeners = new Map(); this.style = {}; this.textContent = ""; this.isConnected = true; }
  set innerHTML(_) { throw new Error("AI output must use textContent."); }
  setAttribute(name, value) { this[name] = value; }
  addEventListener(name, callback) { this.listeners.set(name, callback); }
  append(...children) { this.children.push(...children); }
  querySelector(selector) { return selector === ".medgemma-action" ? this.children.find(child => child.className?.includes("medgemma-action")) : null; }
}

async function harness({ user = clinician, available = true, busy = false, consent = true, responder } = {}) {
  const state = { user: user && { ...user }, language: "en", page: "screening" };
  const row = new Element();
  const link = { closest: () => row, getAttribute: () => "/api/images/synthetic-screening" };
  const list = new Element();
  list.querySelectorAll = () => row.isConnected ? [link] : [];
  const elements = { screeningList: list, languageButton: new Element(), appView: new Element() };
  const events = new Map(), observers = [], requests = [], confirmations = [], emitted = [], toasts = [], timeouts = new Map();
  let timerId = 0;
  const defaultRespond = async (url, options) => {
    if (url === "/api/health") return { ai: { available, busy } };
    if (url.startsWith("/api/ai/results/")) return { inferences: [] };
    if (url === "/api/session") return { authenticated: Boolean(state.user), user: state.user && { ...state.user } };
    if (url.startsWith("/api/ai/jobs?")) return { job: null };
    if (url === "/api/ai/jobs" && options?.method === "POST") return { job: { id: "job-1" } };
    if (url.startsWith("/api/ai/jobs/")) return { job: { status: "succeeded", result: { notice: "Experimental", text: "Synthetic observations" } } };
    throw new Error("Unexpected request: " + url);
  };
  const window = { dispatchEvent(event) { emitted.push(event.type); } };
  vm.runInNewContext(source, {
    state, translations: { en: {}, te: {} }, translate() {},
    showLogin() { state.user = null; }, showApp(value) { state.user = value; }, showToast(value) { toasts.push(value); },
    confirm(message) { confirmations.push(message); return consent; },
    document: { hidden: false, getElementById: id => elements[id] || null, createElement: tag => new Element(tag), addEventListener(name, callback) { events.set(name, callback); } },
    window, Event: class { constructor(type) { this.type = type; } },
    MutationObserver: class { constructor(callback) { this.callback = callback; observers.push(this); } observe(target) { this.target = target; } },
    async fetch(url, options) {
      requests.push({ url, options });
      const data = await (responder ? responder(url, options, defaultRespond) : defaultRespond(url, options));
      return { ok: data?.__status === undefined || data.__status < 400, status: data?.__status || 200, json: async () => data };
    },
    setInterval() {},
    setTimeout(callback, delay) { const id = ++timerId; timeouts.set(id, { callback, delay }); return id; }
  });
  events.get("DOMContentLoaded")();
  await flush();
  return {
    state, row, requests, confirmations, emitted, toasts, timeouts,
    button: () => row.children.find(child => child.tag === "button"),
    output: () => row.children.find(child => child.tag === "pre"),
    warning: () => row.children.find(child => child.className === "ai-conflict-note"),
    meta: () => row.children.find(child => child.className === "ai-source-meta"),
    languageClick: () => elements.languageButton.listeners.get("click")(),
    click() { const button = this.button(); if (!button.disabled && !button.hidden) return button.listeners.get("click")(); },
    forceClick() { return this.button().listeners.get("click")(); },
    enhance() { observers.find(observer => observer.target === list).callback(); },
    async tick() { const next = [...timeouts.entries()][0]; if (next) { timeouts.delete(next[0]); next[1].callback(); await flush(); } }
  };
}

test("health-worker accounts cannot start an AI job, even if a stale button handler is invoked", async () => {
  const h = await harness({ user: { id: "worker-1", role: "health_worker" } });
  assert.equal(h.button().hidden, true);
  await h.forceClick();
  assert.equal(h.requests.filter(request => request.url === "/api/ai/jobs").length, 0);
  assert.equal(h.confirmations.length, 0);
});

test("clinician job uses the opaque screening ID, explicit acknowledgement and plain-text persisted result", async () => {
  const h = await harness();
  await h.click();
  const start = h.requests.find(request => request.url === "/api/ai/jobs");
  assert.deepEqual(JSON.parse(start.options.body), { screening_id: "synthetic-screening", acknowledge_experimental: true });
  assert.equal(start.options.credentials, "same-origin");
  assert.equal(h.confirmations.length, 1);
  assert.match(h.output().textContent, /Experimental\n\nSynthetic observations/);
  assert.deepEqual(h.emitted, ["aarogya-ai-saved"]);
});

test("contradictory saved output is visibly flagged without rewriting its original text", async () => {
  const generated = "Image quality: The image is clear.\nVisible observations: An ulcerated lesion is visible on the tongue.\nUnrelated: The image is unrelated.";
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/results/")
    ? { inferences: [{ notice: "Unvalidated observations", text: generated }] } : fallback(url, options) });
  assert.equal(h.warning().hidden, false);
  assert.equal(h.warning().role, "alert");
  assert.match(h.warning().textContent, /Possible conflicting AI statements/);
  assert.match(h.meta().textContent, /Saved experimental AI output/);
  assert.match(h.output().textContent, /Unrelated: The image is unrelated/);
  assert.match(h.output().textContent, /ulcerated lesion/);
  h.state.language = "te";
  h.languageClick();
  assert.equal(h.warning().hidden, false);
  assert.match(h.warning().textContent, /పరస్పర విరుద్ధమైన/);
  assert.match(h.meta().textContent, /సేవ్ చేసిన/);
});

test("a consistent saved result does not receive a contradiction notice", async () => {
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/results/")
    ? { inferences: [{ notice: "Unvalidated observations", text: "Visible observations: An area of the tongue is visible." }] } : fallback(url, options) });
  assert.equal(h.warning().hidden, true);
  assert.equal(h.warning().textContent, "");
});

test("an explicitly negative oral-anatomy statement is not flagged as a contradiction", async () => {
  const generated = "Observations: No tongue or teeth are visible.\nUnrelated: The image is unrelated.";
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/results/")
    ? { inferences: [{ notice: "Unvalidated observations", text: generated, inconsistent: false }] } : fallback(url, options) });
  assert.equal(h.warning().hidden, true);
  assert.equal(h.output().textContent.includes(generated), true);
});

test("runtime warning metadata is visible even when no specific contradiction phrase is present", async () => {
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/results/")
    ? { inferences: [{ notice: "Unvalidated observations", text: "Ambiguous generated content", output_warning: "Inconsistent result" }] } : fallback(url, options) });
  assert.equal(h.warning().hidden, false);
  assert.match(h.warning().textContent, /potentially unreliable/);
  assert.match(h.output().textContent, /Ambiguous generated content/);
});

test("declining experimental review or unavailable model does not start a job", async () => {
  const declined = await harness({ consent: false });
  await declined.click();
  assert.equal(declined.requests.filter(request => request.url === "/api/ai/jobs").length, 0);
  const unavailable = await harness({ available: false });
  assert.equal(unavailable.button().disabled, true);
  assert.match(unavailable.button().textContent, /setup required/);
  assert.equal(unavailable.click(), undefined);
});

test("browser account mismatch refreshes the account without starting inference", async () => {
  const h = await harness({ responder: async (url, options, fallback) => url === "/api/session"
    ? { authenticated: true, user: { ...other } } : fallback(url, options) });
  await h.click();
  assert.equal(h.state.user.id, other.id);
  assert.equal(h.requests.filter(request => request.url === "/api/ai/jobs").length, 0);
  assert.match(h.toasts[0], /account changed/);
});

test("duplicate clicks during session verification cannot start multiple jobs", async () => {
  const session = deferred();
  const h = await harness({ responder: async (url, options, fallback) => url === "/api/session" ? session.promise : fallback(url, options) });
  const first = h.forceClick();
  const second = h.forceClick();
  assert.equal(h.requests.filter(request => request.url === "/api/session").length, 1);
  session.resolve({ authenticated: true, user: { ...clinician } });
  await Promise.all([first, second]);
  assert.equal(h.requests.filter(request => request.url === "/api/ai/jobs").length, 1);
});

test("saved inference response is ignored after logout, account switch, role loss or row removal", async () => {
  for (const change of ["logout", "account", "role", "remove"]) {
    const history = deferred();
    let historyRequests = 0;
    const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/results/")
      ? (++historyRequests === 1 ? history.promise : { inferences: [] }) : fallback(url, options) });
    if (change === "logout") h.state.user = null;
    if (change === "account") h.state.user = { ...other };
    if (change === "role") h.state.user = { ...clinician, role: "health_worker" };
    if (change === "remove") h.row.isConnected = false;
    h.enhance();
    history.resolve({ inferences: [{ notice: "Private prior output", text: "MUST NOT DISPLAY" }] });
    await flush();
    assert.doesNotMatch(h.output().textContent, /MUST NOT DISPLAY/, change);
  }
});

test("a rejected old-user job cannot write its error into a new user's cleared controls", async () => {
  const start = deferred();
  const h = await harness({ responder: async (url, options, fallback) => url === "/api/ai/jobs" ? start.promise : fallback(url, options) });
  const running = h.click();
  await flush();
  h.state.user = { ...other };
  h.enhance();
  start.reject(new Error("Old account private failure"));
  await running;
  assert.doesNotMatch(h.output().textContent, /Old account private failure/);
});

test("polling result is ignored on account change, clinician role loss or disconnected row", async () => {
  for (const change of ["account", "role", "remove"]) {
    const poll = deferred();
    const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/jobs/") ? poll.promise : fallback(url, options) });
    const running = h.click();
    await flush();
    if (change === "account") h.state.user = { ...other };
    if (change === "role") h.state.user = { ...clinician, role: "health_worker" };
    if (change === "remove") h.row.isConnected = false;
    h.enhance();
    poll.resolve({ job: { status: "succeeded", result: { notice: "Private", text: "MUST NOT DISPLAY" } } });
    await running;
    assert.doesNotMatch(h.output().textContent, /MUST NOT DISPLAY/, change);
    assert.deepEqual(h.emitted, [], change);
  }
});

test("an old run's completion cannot unlock a newer user's in-progress job", async () => {
  const firstStart = deferred(), secondStart = deferred();
  let starts = 0;
  const h = await harness({ responder: async (url, options, fallback) => url === "/api/ai/jobs"
    ? (++starts === 1 ? firstStart.promise : secondStart.promise) : fallback(url, options) });
  const first = h.click();
  await flush();
  h.state.user = { ...other };
  h.enhance();
  const second = h.click();
  await flush();
  assert.equal(starts, 2);
  firstStart.resolve({ job: { id: "old-job" } });
  await first;
  assert.equal(h.button().disabled, true);
  assert.match(h.button().textContent, /processing/);
  secondStart.resolve({ job: { id: "current-job" } });
  await second;
  assert.match(h.output().textContent, /Synthetic observations/);
});

test("pending analysis polls on a bounded timer and reports backend failures without a saved event", async () => {
  let polls = 0;
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/jobs/")
    ? { job: ++polls === 1 ? { status: "running" } : { status: "failed", error: "Synthetic inference failure" } }
    : fallback(url, options) });
  const running = h.click();
  await flush();
  assert.equal(h.timeouts.size, 1);
  assert.match(h.output().textContent, /running.*\d+s elapsed/);
  assert.match(h.output().textContent, /saved automatically/);
  assert.equal([...h.timeouts.values()][0].delay, 2000);
  await h.tick();
  await running;
  assert.match(h.output().textContent, /Synthetic inference failure/);
  assert.deepEqual(h.emitted, []);
  assert.equal(h.button().disabled, false);
});

test("reopening saved inference shows its recorded model time without starting another job", async () => {
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/results/")
    ? { inferences: [{ notice: "Experimental", text: "Previously generated synthetic output", model: "google/medgemma-1.5-4b-it", runtime: { execution: { total_seconds: 12.2 } } }] }
    : fallback(url, options) });
  assert.match(h.output().textContent, /Previously generated synthetic output/);
  assert.match(h.meta().textContent, /Model processing time: 12s/);
  assert.match(h.meta().textContent, /Source: local google\/medgemma-1\.5-4b-it/);
  assert.match(h.meta().textContent, /reopening does not run the model again/);
  assert.equal(h.requests.filter(item => item.url === "/api/ai/jobs").length, 0);
});

test("reopening a running job resumes its saved ID without creating a second inference", async () => {
  const running = deferred();
  let polls = 0;
  const h = await harness({ responder: async (url, options, fallback) => {
    if (url.startsWith("/api/ai/jobs?")) return { job: { id: "saved-job", status: "running" } };
    if (url === "/api/ai/jobs/saved-job") return ++polls === 1
      ? { job: { status: "running" } } : running.promise;
    return fallback(url, options);
  } });
  assert.equal(h.requests.filter(item => item.url === "/api/ai/jobs" && item.options?.method === "POST").length, 0);
  assert.match(h.output().textContent, /running/);
  assert.equal(h.button().disabled, true);
  await h.tick();
  running.resolve({ job: { status: "succeeded", result: { notice: "Saved advisory", text: "Persisted synthetic result" } } });
  await flush();
  assert.match(h.output().textContent, /Persisted synthetic result/);
  assert.equal(h.button().disabled, false);
  assert.equal(h.requests.filter(item => item.url === "/api/ai/jobs" && item.options?.method === "POST").length, 0);
});

test("a late job lookup from the previous account cannot reveal or resume its result", async () => {
  const oldLookup = deferred();
  let lookups = 0;
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/jobs?")
    ? (++lookups === 1 ? oldLookup.promise : { job: null }) : fallback(url, options) });
  h.state.user = { ...other };
  h.enhance();
  oldLookup.resolve({ job: { id: "old-private-job", status: "running" } });
  await flush();
  assert.equal(h.requests.filter(item => item.url === "/api/ai/jobs/old-private-job").length, 0);
  assert.doesNotMatch(h.output().textContent, /old-private-job/);
});

test("a slow saved-history response cannot replace a newer completed inference", async () => {
  const history = deferred();
  const h = await harness({ responder: async (url, options, fallback) => url.startsWith("/api/ai/results/")
    ? history.promise : fallback(url, options) });
  await h.click();
  assert.match(h.output().textContent, /Synthetic observations/);
  history.resolve({ inferences: [{ notice: "Older saved result", text: "Stale observations" }] });
  await flush();
  assert.match(h.output().textContent, /Synthetic observations/);
  assert.doesNotMatch(h.output().textContent, /Stale observations/);
});
