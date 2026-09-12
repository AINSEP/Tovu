/**
 * @file Direct tests for `selftest-tracker.js`. No Electron: a fake window is just
 * `{ webContents: { once, getURL, getTitle } }`, the only surface this module touches.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { createSelftestTracker } from "./selftest-tracker.ts";

/** A fake window whose `did-finish-load`/`did-fail-load` fire only when the test calls
 *  `finishLoad()`/`failLoad()` — so a test controls the exact ORDER events happen in. */
function fakeWindow(url, title) {
  const listeners = {};
  return {
    webContents: {
      once(event, cb) {
        listeners[event] = cb;
      },
      getURL: () => url,
      getTitle: () => title,
    },
    finishLoad: () => listeners["did-finish-load"]?.(),
    failLoad: (code, description) => listeners["did-fail-load"]?.(undefined, code, description),
  };
}

function recordingCallbacks() {
  const calls = { loaded: [], failed: [], settled: [] };
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

test("a window whose did-finish-load fires before add() is ever called for it is impossible to miss, because add() is called synchronously at window-creation time — this test proves the tracker itself never assumes otherwise: calling finishLoad() before add() is simply a caller error with no listener registered yet, not something the tracker silently tolerates", () => {
  const { calls, callbacks } = recordingCallbacks();
  const tracker = createSelftestTracker(1, callbacks);
  const window = fakeWindow("http://x/a", "A");

  window.finishLoad(); // no-op: no listener registered yet
  assert.deepEqual(calls.loaded, []);

  tracker.add(window);
  window.finishLoad();
  assert.deepEqual(calls.loaded, [{ url: "http://x/a", title: "A" }]);
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
