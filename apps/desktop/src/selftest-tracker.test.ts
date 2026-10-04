/**
 * @file Direct tests for `selftest-tracker.ts`. No Electron: a fake window is just
 * `{ webContents: { on, once, getURL, getTitle } }`, the only surface this module touches.
 */
import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

import { createSelftestTracker } from "./selftest-tracker.ts";
import type { SelftestCallbacks } from "./selftest-tracker.ts";

/** Every call `recordingCallbacks` saw, one array per callback. */
interface RecordedCalls {
  loaded: Parameters<SelftestCallbacks["onWindowLoaded"]>[0][];
  failed: Parameters<SelftestCallbacks["onWindowFailed"]>[0][];
  settled: Parameters<SelftestCallbacks["onAllSettled"]>[0][];
}

/** A fake window whose `did-finish-load`/`did-fail-load` fire only when the test calls
 *  `finishLoad()`/`failLoad()` — so a test controls the exact ORDER events happen in. */
function fakeWindow(url: string, title: string) {
  const contents = Object.assign(new EventEmitter(), { getURL: () => url, getTitle: () => title });
  return {
    webContents: contents,
    finishLoad: () => contents.emit("did-finish-load"),
    failLoad: (code: number, description: string, isMainFrame = true) => contents.emit("did-fail-load", undefined, code, description, url, isMainFrame),
  };
}

function recordingCallbacks(): { calls: RecordedCalls; callbacks: SelftestCallbacks } {
  const calls: RecordedCalls = { loaded: [], failed: [], settled: [] };
  return {
    calls,
    callbacks: {
      onWindowLoaded: (info) => calls.loaded.push(info),
      onWindowFailed: (info) => calls.failed.push(info),
      onAllSettled: (info) => calls.settled.push(info),
    },
  };
}

test("a single window: onAllSettled fires once it finishes loading", () => {
  const { calls, callbacks } = recordingCallbacks();
  const tracker = createSelftestTracker(1, callbacks);
  const window = fakeWindow("http://x/a", "A");

  tracker.add(window);
  window.finishLoad();

  assert.deepEqual(calls.loaded, [{ url: "http://x/a", title: "A" }]);
  assert.deepEqual(calls.settled, [{ failed: false }]);
});

test("two windows, added one at a time: the FIRST window finishing before the SECOND is even added does not settle early", () => {
  const { calls, callbacks } = recordingCallbacks();
  const tracker = createSelftestTracker(2, callbacks);

  const first = fakeWindow("http://x/a", "A");
  tracker.add(first);
  first.finishLoad(); // window 2 does not exist yet at this point

  assert.deepEqual(calls.settled, [], "must not settle after only 1 of the expected 2 windows has loaded");

  const second = fakeWindow("http://x/b", "B");
  tracker.add(second);
  second.finishLoad();

  assert.deepEqual(calls.loaded, [
    { url: "http://x/a", title: "A" },
    { url: "http://x/b", title: "B" },
  ]);
  assert.deepEqual(calls.settled, [{ failed: false }]);
});

// F2.4/F3.5: execute main's actual createWindow body; a load may complete immediately.
test("createWindow registers the tracker before navigation can finish", () => {
  const source = fs.readFileSync(new URL("../main.ts", import.meta.url), "utf8");
  const parsed = ts.createSourceFile("main.ts", source, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === "createWindow");
  assert.ok(declaration);
  const compiled = ts.transpileModule(declaration.getText(parsed), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
  }).outputText;
  const { calls, callbacks } = recordingCallbacks();
  class BrowserWindow {
    webContents = fakeWindow("http://x/a", "A").webContents;
    on() { return this; }
    loadURL() {
      assert.equal(this.webContents.listenerCount("did-finish-load"), 1);
      this.webContents.emit("did-finish-load");
    }
  }
  const create = runInNewContext(`${compiled}\ncreateWindow`, {
    BrowserWindow, SELFTEST: true, SPEECH_PRELOAD_PATH: "/speech.js", URL,
    selftestTracker: createSelftestTracker(1, callbacks),
    installAppWindowNavigationPolicy: () => {}, shell: { openExternal: () => {} },
  });
  create("http://x/a", "A");
  assert.deepEqual(calls.loaded, [{ url: "http://x/a", title: "A" }]);
  assert.deepEqual(calls.settled, [{ failed: false }]);
});

test("a failed load reports failure and settles with failed:true, without waiting for the other window", () => {
  const { calls, callbacks } = recordingCallbacks();
  const tracker = createSelftestTracker(2, callbacks);

  const first = fakeWindow("http://x/a", "A");
  const second = fakeWindow("http://x/b", "B");
  tracker.add(first);
  tracker.add(second);

  first.failLoad(-2, "net::ERR_FAILED");

  assert.deepEqual(calls.failed, [{ url: "http://x/a", code: -2, description: "net::ERR_FAILED" }]);
  assert.deepEqual(calls.settled, [{ failed: true }]);
});

test("a second failure after the first is already reported is ignored — onAllSettled fires exactly once", () => {
  const { calls, callbacks } = recordingCallbacks();
  const tracker = createSelftestTracker(2, callbacks);

  const first = fakeWindow("http://x/a", "A");
  const second = fakeWindow("http://x/b", "B");
  tracker.add(first);
  tracker.add(second);

  first.failLoad(-2, "net::ERR_FAILED");
  second.failLoad(-2, "net::ERR_FAILED");

  assert.equal(calls.failed.length, 1);
  assert.equal(calls.settled.length, 1);
});

test("a successful load after a failure elsewhere does not also settle as success", () => {
  const { calls, callbacks } = recordingCallbacks();
  const tracker = createSelftestTracker(2, callbacks);

  const first = fakeWindow("http://x/a", "A");
  const second = fakeWindow("http://x/b", "B");
  tracker.add(first);
  tracker.add(second);

  first.failLoad(-2, "net::ERR_FAILED");
  second.finishLoad();

  assert.deepEqual(calls.settled, [{ failed: true }], "only the original failure settlement, never a second success one");
});

// F3.2/F3.3/F6.2: Electron delivers the URL and frame flag, and once removes its listener.
for (const [code, isMainFrame] of [[-2, false], [-3, true]] as const) {
  test(`nonfatal load (${code}, main frame ${isMainFrame}) does not fail or consume the fatal-load listener`, () => {
    const { calls, callbacks } = recordingCallbacks();
    const tracker = createSelftestTracker(1, callbacks);
    const window = fakeWindow("http://x/a", "A");
    tracker.add(window);
    window.failLoad(code, "ignored load", isMainFrame);
    assert.deepEqual(calls.failed, []);
    assert.deepEqual(calls.settled, []);
    window.failLoad(-2, "net::ERR_FAILED", true);
    assert.deepEqual(calls.failed, [{ url: "http://x/a", code: -2, description: "net::ERR_FAILED" }]);
    assert.deepEqual(calls.settled, [{ failed: true }]);
  });
}
