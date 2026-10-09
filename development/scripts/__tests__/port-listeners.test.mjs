import assert from "node:assert/strict";
import test from "node:test";
import { listenersOn, parseLsofListeners } from "../port-listeners.mjs";

test("listenersOn passes the exact TCP port to lsof and handles populated, empty and unavailable results", () => {
  const calls = [];
  let result = { status: 0, stdout: "p41207\ncnode\np41310\ncvite\n" };
  const deps = {
    spawnSync: (...args) => { calls.push(args); return result; },
  };
  const populated = listenersOn(7852, deps);
  assert.deepEqual(calls, [["lsof", ["-nP", "-iTCP:7852", "-sTCP:LISTEN", "-F", "pc"], { encoding: "utf8" }]]);
  assert.deepEqual(populated, [{ pid: "41207", command: "node" }, { pid: "41310", command: "vite" }]);
  result = { status: 0, stdout: "" };
  assert.deepEqual(listenersOn(7852, deps), []);
  result = { status: 1, stdout: "p41207\ncnode\n" };
  assert.deepEqual(listenersOn(7852, deps), []);
  result = { status: null, stdout: undefined, error: Object.assign(new Error("missing lsof"), { code: "ENOENT" }) };
  assert.deepEqual(listenersOn(7852, deps), []);
  assert.deepEqual(calls, Array(4).fill(["lsof", ["-nP", "-iTCP:7852", "-sTCP:LISTEN", "-F", "pc"], { encoding: "utf8" }]));
});

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

test("a command line with no pid before it is dropped — the guard the dangling-`p` case never reaches", () => {
  // A `c` with no `p` ahead of it (a read that started mid-record) must not emit `{pid: null, …}`.
  // The fixture below cannot catch this: its second `p` overwrites the first, so the pid is never
  // null by the time a `c` arrives.
  assert.deepEqual(parseLsofListeners(["cvite", "p41310", "cnode", ""].join("\n")), [
    { pid: "41310", command: "node" },
  ]);
});

test("a pid line with no command line after it is dropped, not emitted with an undefined command", () => {
  // `lsof` emits one `c` per `p`, but a truncated read (or a process that exits mid-listing) can
  // leave a dangling `p`. Emitting `{pid, command: undefined}` would print "PID 41207 (undefined)"
  // into the preflight's conflict report.
  const stdout = ["p41207", "p41310", "cvite", ""].join("\n");
  assert.deepEqual(parseLsofListeners(stdout), [{ pid: "41310", command: "vite" }]);
});
