/**
 * @file Behavioural proof for `quit-drain-gate.js`, the decision `main.js`'s `before-quit` makes for
 * every quit attempt. See that file's header for the defect: a second Cmd+Q during the drain quit
 * Electron before the parallel `server.stop()` calls finished.
 */
import test from "node:test";
import assert from "node:assert/strict";

import { decideBeforeQuit } from "./quit-drain-gate.js";

test("with nothing open and nothing tearing down, the quit goes straight through", () => {
  assert.equal(decideBeforeQuit({ phase: "idle", nothingToDrain: true }), "proceed");
});

test("the first quit with something to stop starts the drain", () => {
  assert.equal(decideBeforeQuit({ phase: "idle", nothingToDrain: false }), "drain");
});

test("a quit attempt while the drain is in flight is held, not let through", () => {
  // The second Cmd+Q (or menu Quit, SIGTERM, app.quit()) re-enters before-quit mid-drain. Let
  // through, Electron exits before the parallel server.stop() calls finish and strands detached
  // tovu serve children.
  assert.equal(decideBeforeQuit({ phase: "draining", nothingToDrain: false }), "hold");
});

test("a quit attempt mid-drain is held even once the counts already read empty", () => {
  // site-supervisor.js drops a site from openSites the moment its child exits, before the drain's
  // promise chain reaches its own closing app.quit(). An empty count is not a finished drain.
  assert.equal(decideBeforeQuit({ phase: "draining", nothingToDrain: true }), "hold");
});

test("every repeated attempt during one drain is held, never just the first", () => {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    assert.equal(decideBeforeQuit({ phase: "draining", nothingToDrain: attempt % 2 === 0 }), "hold", `attempt ${attempt}`);
  }
});

test("the drain's own closing quit goes through, whatever the counts say", () => {
  assert.equal(decideBeforeQuit({ phase: "drained", nothingToDrain: true }), "proceed");
  assert.equal(decideBeforeQuit({ phase: "drained", nothingToDrain: false }), "proceed");
});

test("an unknown phase throws instead of being read as idle", () => {
  assert.throws(
    () => decideBeforeQuit({ phase: "drainig", nothingToDrain: false }),
    { name: "TypeError", message: 'decideBeforeQuit: unknown quit phase "drainig"' },
  );
  assert.throws(
    () => decideBeforeQuit({ phase: undefined, nothingToDrain: true }),
    { name: "TypeError", message: "decideBeforeQuit: unknown quit phase undefined" },
  );
});
