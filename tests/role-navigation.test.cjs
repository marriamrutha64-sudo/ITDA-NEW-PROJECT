const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "index.html"), "utf8");

function harness() {
  const elements = new Map();
  function element(id, attrs = []) {
    if (!elements.has(id)) {
      const classes = new Set();
      elements.set(id, {
        id, hidden: false, dataset: {}, textContent: "",
        hasAttribute: name => attrs.includes(name),
        setAttribute() {}, removeAttribute() {},
        classList: { toggle(name, value) { value ? classes.add(name) : classes.delete(name); }, contains(name) { return classes.has(name); } }
      });
    }
    return elements.get(id);
  }
  const nav = [element("home"), element("patients"), element("review", ["data-clinician-only"]),
    element("consultations", ["data-video-only"]), element("audit", ["data-admin-only"])];
  nav.forEach(item => { item.dataset.page = item.id; });
  const pages = nav.map(item => element("page-" + item.id));
  const document = {
    documentElement: { lang: "en" }, getElementById: element, addEventListener() {},
    querySelectorAll(selector) {
      if (selector === "[data-page]" || selector === ".nav-item") return nav;
      if (selector === ".page") return pages;
      if (selector === "[data-admin-only]") return [nav[4]];
      if (selector === "[data-clinician-only]") return [nav[2]];
      if (selector === "[data-video-only]") return [nav[3]];
      return [];
    }
  };
  const context = vm.createContext({ document, window: {}, navigator: {},
    localStorage: { getItem: () => null }, setTimeout, clearTimeout });
  vm.runInContext(source, context);
  context.translate = () => {};
  context.refreshAll = async () => {};
  context.vaultUnlockedForCurrentUser = () => false;
  return { context, element, nav };
}

test("worker sees a field workspace without clinical, video, or audit actions", () => {
  const h = harness();
  h.context.showApp({ id: "w", username: "preview-worker", display_name: "Preview Worker", role: "health_worker" });
  assert.equal(h.element("roleScopeTitle").dataset.i18n, "roleWorkerTitle");
  assert.equal(h.element("patientsScopeDescription").dataset.i18n, "roleWorkerPatients");
  assert.equal(h.element("patients").hidden, false);
  for (const id of ["review", "consultations", "audit", "reviewForm", "referralForm"])
    assert.equal(h.element(id).hidden, true, id);
  assert.match(html, /data-page="review" data-clinician-only/);
});

test("doctor gets clinical options and administrator gets every option", () => {
  const h = harness();
  h.context.showApp({ id: "d", username: "preview-doctor", display_name: "Preview Doctor", role: "medical_officer" });
  assert.equal(h.element("roleScopeTitle").dataset.i18n, "roleDoctorTitle");
  assert.equal(h.element("review").hidden, false);
  assert.equal(h.element("consultations").hidden, false);
  assert.equal(h.element("audit").hidden, true);
  h.context.showApp({ id: "a", username: "preview-admin", display_name: "Preview Admin", role: "admin" });
  assert.equal(h.element("roleScopeTitle").dataset.i18n, "roleAdminTitle");
  for (const id of ["review", "consultations", "audit", "reviewForm", "referralForm"])
    assert.equal(h.element(id).hidden, false, id);
});
