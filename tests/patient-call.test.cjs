const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const source = fs.readFileSync(path.join(__dirname, "..", "patient-call.js"), "utf8");
const html = fs.readFileSync(path.join(__dirname, "..", "patient-call.html"), "utf8");

function run(hash) {
  const status = { textContent: "" };
  vm.runInNewContext(source, {
    document: { getElementById(id) { return id === "patientCallStatus" ? status : null; } },
    location: { hash }, URLSearchParams
  });
  return status.textContent;
}

test("an older invitation asks for the current Jitsi link", () => {
  assert.match(run("#room=" + "a".repeat(48)), /Ask the clinician to copy the patient link/);
  assert.match(html, /current Jitsi link/);
  assert.doesNotMatch(html, /external_api\.js|JitsiMeetExternalAPI|<iframe/i);
});

test("patient guidance covers host first and microphone check", () => {
  assert.match(html, /after the clinician has joined/);
  assert.match(html, /Allow microphone access in Jitsi/);
  assert.match(html, /short spoken phrase/);
  assert.match(html, /href="\/"/);
  assert.equal(run(""), "");
});
