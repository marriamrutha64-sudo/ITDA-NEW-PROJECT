const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "app.js"), "utf8");

function harness() {
  const elements = new Map();
  const element = id => {
    if (!elements.has(id)) {
      elements.set(id, {
        hidden: false,
        disabled: false,
        textContent: "",
        replaceChildren() { this.textContent = ""; }
      });
    }
    return elements.get(id);
  };
  const context = vm.createContext({
    localStorage: { getItem: () => null },
    document: { getElementById: element, addEventListener() {} },
    window: { OfflineVault: { isUnlocked: () => false, lock() {} } },
    navigator: {},
    setTimeout,
    clearTimeout
  });
  vm.runInContext(source, context);
  context.closeConsultationCall = () => {};
  return { context, element };
}

function seedDraftPanel(element) {
  element("offlineDraftPanel").hidden = false;
  element("offlineDraftCount").textContent = "3";
  element("offlineDraftStatus").textContent = "Waiting for authenticated sync";
  element("offlineDraftList").textContent = "Private draft names";
  element("syncDraftsButton").hidden = false;
  element("syncDraftsButton").disabled = false;
}

function assertDraftPanelCleared(element) {
  assert.equal(element("offlineDraftPanel").hidden, true);
  assert.equal(element("offlineDraftCount").textContent, "");
  assert.equal(element("offlineDraftStatus").textContent, "");
  assert.equal(element("offlineDraftList").textContent, "");
  assert.equal(element("syncDraftsButton").hidden, true);
  assert.equal(element("syncDraftsButton").disabled, true);
}

test("signing out clears decrypted registration drafts", () => {
  const h = harness();
  seedDraftPanel(h.element);

  h.context.showLogin();

  assertDraftPanelCleared(h.element);
});

test("refreshing the panel while the vault is locked clears stale draft details", async () => {
  const h = harness();
  seedDraftPanel(h.element);

  await h.context.refreshOfflineDraftPanel();

  assertDraftPanelCleared(h.element);
});
