/**
 * @file Proof for the `<webview>` guest policy — that an embedded project tab gets the shell's own
 * speech preload (D-10) AND that the page still cannot choose anything for its guest.
 */
import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

import { admitGuestSource, applyGuestWebPreferences } from "./webview-guest-policy.ts";
import type { GuestWebPreferences } from "./webview-guest-policy.ts";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const PRELOAD = "/abs/path/to/preload-speech.cjs";

test("the guest is given the shell's preload, so window.tovuVoice exists in an embedded tab", () => {
  // The defect: `delete webPreferences.preload` left the embedded admin with no bridge, so
  // `voice-input-port.ts` found no `window.tovuVoice` and the admin told the operator that voice
  // input needs the desktop app — while running inside it.
  const webPreferences: GuestWebPreferences = {};
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
  // @ts-expect-error -- no preloadPath: the type rejects it, and this asserts the runtime does too.
  assert.throws(() => applyGuestWebPreferences({}, {}), /preloadPath is required/);
  assert.throws(() => applyGuestWebPreferences({}, { preloadPath: "" }), /preloadPath is required/);
});

test("main.ts routes will-attach-webview through this policy, with the speech preload", () => {
  // Source text: `main.ts` requires "electron" at module scope and cannot be required under plain
  // node --test (see `main-speech-wiring.test.ts`). Without this, the policy above could be correct
  // and simply not called.
  const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");
  assert.match(source, /from "\.\/src\/webview-guest-policy\.ts"/);
  assert.match(
    source,
    /will-attach-webview[\s\S]{0,300}?applyGuestWebPreferences\(webPreferences, \{ preloadPath: SPEECH_PRELOAD_PATH \}\)/,
  );
  assert.doesNotMatch(source, /delete webPreferences\.preload/, "deleting the preload is the defect");
});

test("the preload main.ts hands the guest is the same file the standalone window gets, and its source exists", () => {
  // Same grant, same origin, one file — not a second bridge that could drift from the first. The
  // `.cts` SOURCE is checked, not the compiled `dist/speech/preload-speech.cjs`: tests run before
  // any build (`npm run package` runs its gates first), and `preload-speech.test.ts` checks what
  // this source compiles to.
  const preloadSourcePath = path.join(__dirname, "speech", "preload-speech.cts");
  assert.equal(fs.existsSync(preloadSourcePath), true, `expected the speech preload source at ${preloadSourcePath}`);
  assert.match(fs.readFileSync(preloadSourcePath, "utf8"), /exposeInMainWorld\("tovuVoice"/);
});

/** A `will-attach-webview` event stand-in that counts `preventDefault` calls. */
function attachEvent() {
  const event = { prevented: 0, preventDefault: () => void (event.prevented += 1) };
  return event;
}

const SUPERVISED = "http://127.0.0.1:4567/admin/";
const isSupervised = (src: string) => src === SUPERVISED;

test("a guest whose src is a supervised site is admitted, and the attach is not prevented", () => {
  const event = attachEvent();
  assert.equal(admitGuestSource(event, { src: SUPERVISED }, { isAllowedSource: isSupervised }), true);
  assert.equal(event.prevented, 0);
});

test("a guest whose src is any other origin is refused by preventing the attach", () => {
  // The defect: `will-attach-webview` never read `params.src`, so a `<webview>` pointed anywhere
  // attached and received the speech preload.
  for (const src of ["https://attacker.example/admin", "http://127.0.0.1:4567@evil.example/admin/", "file:///etc/passwd"]) {
    const event = attachEvent();
    assert.equal(admitGuestSource(event, { src }, { isAllowedSource: isSupervised }), false, src);
    assert.equal(event.prevented, 1, src);
  }
});

test("a guest with no src, or a non-string src, is refused without asking the predicate", () => {
  const asked: string[] = [];
  const isAllowedSource = (src: string) => {
    asked.push(src);
    return true;
  };
  for (const params of [{}, { src: undefined }, { src: 42 }, { src: { toString: () => SUPERVISED } }]) {
    const event = attachEvent();
    assert.equal(admitGuestSource(event, params, { isAllowedSource }), false);
    assert.equal(event.prevented, 1);
  }
  assert.deepEqual(asked, []);
});

test("a predicate that throws refuses the attach instead of throwing out of Electron's callback", () => {
  // A throw escaping a guest callback blanks the whole sites-home window in this app; refusing is
  // the only safe answer when the check itself fails.
  const event = attachEvent();
  const isAllowedSource = () => {
    throw new Error("openSites was not ready");
  };
  assert.equal(admitGuestSource(event, { src: SUPERVISED }, { isAllowedSource }), false);
  assert.equal(event.prevented, 1);
});

test("main.ts checks the guest's src against the supervised sites before applying its preferences", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "main.ts"), "utf8");
  assert.match(
    source,
    /on\("will-attach-webview", \(event, webPreferences, params\) => \{\s*if \(!admitGuestSource\(event, params, \{ isAllowedSource: isSupervisedGuestUrl \}\)\) return;\s*applyGuestWebPreferences\(webPreferences, \{ preloadPath: SPEECH_PRELOAD_PATH \}\);/,
  );
});
