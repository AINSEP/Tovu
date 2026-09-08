/**
 * @file Proof for the `<webview>` guest policy — that an embedded project tab gets the shell's own
 * speech preload (D-10) AND that the page still cannot choose anything for its guest.
 */
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const { applyGuestWebPreferences } = require("./webview-guest-policy.cjs");

const PRELOAD = "/abs/path/to/preload-speech.cjs";

test("the guest is given the shell's preload, so window.tovuVoice exists in an embedded tab", () => {
  // The defect: `delete webPreferences.preload` left the embedded admin with no bridge, so
  // `voice-input-port.ts` found no `window.tovuVoice` and the admin told the operator that voice
  // input needs the desktop app — while running inside it.
  const webPreferences = {};
  applyGuestWebPreferences(webPreferences, { preloadPath: PRELOAD });
  assert.equal(webPreferences.preload, PRELOAD);
});

test("a preload the PAGE asked for is overwritten, never honoured or merged", () => {
  // The property the original `delete` was defending, and it must survive the fix: `webviewTag`
  // lets the page set this attribute, and the page is a site's own admin, not this shell.
  const webPreferences = { preload: "file:///tmp/attacker-chosen.js" };
  applyGuestWebPreferences(webPreferences, { preloadPath: PRELOAD });
  assert.equal(webPreferences.preload, PRELOAD);
});

test("Node stays off and context isolation stays on, whatever the page asked for", () => {
  const webPreferences = { nodeIntegration: true, contextIsolation: false, preload: "/evil.js" };
  applyGuestWebPreferences(webPreferences, { preloadPath: PRELOAD });
  assert.equal(webPreferences.nodeIntegration, false);
  assert.equal(webPreferences.contextIsolation, true);
  assert.equal(webPreferences.preload, PRELOAD);
});

test("a missing preload path throws rather than silently producing a guest with no voice API", () => {
  assert.throws(() => applyGuestWebPreferences({}, {}), /preloadPath is required/);
  assert.throws(() => applyGuestWebPreferences({}, { preloadPath: "" }), /preloadPath is required/);
});

test("main.cjs routes will-attach-webview through this policy, with the speech preload", () => {
  // Source text: `main.cjs` requires "electron" at module scope and cannot be required under plain
  // node --test (see `main-speech-wiring.test.cjs`). Without this, the policy above could be correct
  // and simply not called.
  const source = fs.readFileSync(path.join(__dirname, "..", "main.cjs"), "utf8");
  assert.match(source, /require\("\.\/src\/webview-guest-policy\.cjs"\)/);
  assert.match(
    source,
    /will-attach-webview[\s\S]{0,300}?applyGuestWebPreferences\(webPreferences, \{ preloadPath: SPEECH_PRELOAD_PATH \}\)/,
  );
  assert.doesNotMatch(source, /delete webPreferences\.preload/, "deleting the preload is the defect");
});

test("the preload main.cjs hands the guest is the same file the standalone window gets, and it exists", () => {
  // Same grant, same origin, one file — not a second bridge that could drift from the first.
  const preloadPath = path.join(__dirname, "speech", "preload-speech.cjs");
  assert.equal(fs.existsSync(preloadPath), true, `expected the speech preload at ${preloadPath}`);
  assert.match(fs.readFileSync(preloadPath, "utf8"), /exposeInMainWorld\("tovuVoice"/);
});
