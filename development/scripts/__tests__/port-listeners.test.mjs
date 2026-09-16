import assert from "node:assert/strict";
import test from "node:test";

import { parseLsofListeners } from "../port-listeners.mjs";

/**
 * @file `parseLsofListeners` — the `lsof -F pc` parse that `development/scripts/dev.mjs`'s port
 * preflight and `development/scripts/dev-desktop.mjs`'s "who is squatting the admin dev port" report
 * both depend on. It lived inline in `dev.mjs` with no test at all until it was shared; these cover
 * the parse itself, which needs no `lsof` on the box to exercise.
 *
 * Run with: `node --test development/scripts/__tests__/port-listeners.test.mjs`
 */

test("parses every pid/command pair out of a two-process -F pc block", () => {
  const stdout = ["p41207", "cnode", "p41310", "cvite", ""].join("\n");
  assert.deepEqual(parseLsofListeners(stdout), [
    { pid: "41207", command: "node" },
    { pid: "41310", command: "vite" },
  ]);
});

test("empty output yields no listeners — the normal 'port is free' case", () => {
  assert.deepEqual(parseLsofListeners(""), []);
});

test("a pid line with no command line after it is dropped, not emitted with an undefined command", () => {
  // `lsof` emits one `c` per `p`, but a truncated read (or a process that exits mid-listing) can
  // leave a dangling `p`. Emitting `{pid, command: undefined}` would print "PID 41207 (undefined)"
  // into the preflight's conflict report.
  const stdout = ["p41207", "p41310", "cvite", ""].join("\n");
  assert.deepEqual(parseLsofListeners(stdout), [{ pid: "41310", command: "vite" }]);
});
