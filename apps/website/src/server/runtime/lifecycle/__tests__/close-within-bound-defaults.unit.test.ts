import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import type { SiteStorage } from "#src/platform/site-dir/types";
import { closeStoreOnShutdown, closeWithinBound, type ShutdownProcess } from "../close-store-on-shutdown.js";

/**
 * @file The defaults and the non-Error/failed-daemon paths of the bounded shutdown close that the
 * per-dialect matrix (`close-store-on-shutdown.test.ts`) does not reach: with no `log` the message
 * goes to stderr (`console.error`), with no `timeoutMs` the bound is the documented 4 s, a non-Error
 * rejection is still named, and a daemon whose tree-stop REJECTED is logged rather than lost —
 * after the store has closed and the process still exits 0.
 */

test("closeWithinBound with no options logs a hung close to console.error after the default 4000 ms bound, then resolves", async (t) => {
  t.mock.timers.enable({ apis: ["setTimeout"] });
  const errors = t.mock.method(console, "error", () => {});
  let settled = false;
  const done = closeWithinBound(() => new Promise<void>(() => {}), { label: "the hung store" }).then(() => { settled = true; });
  t.mock.timers.tick(3_999);
  await Promise.resolve();
  assert.equal(settled, false);
  t.mock.timers.tick(1);
  await done;
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [["[shutdown] the hung store did not close within 4000 ms; exiting anyway"]]);
});

test("closeWithinBound names a non-Error rejection by its string form and still resolves", async () => {
  const logged: string[] = [];
  await closeWithinBound(() => Promise.reject("disk vanished"), { label: "the sqlite store", timeoutMs: 1_000, log: (message) => logged.push(message) });
  assert.deepEqual(logged, ["[shutdown] closing the sqlite store failed: disk vanished"]);
});

class FakeProcess extends EventEmitter implements ShutdownProcess {
  readonly exits: number[] = [];
  exit(code: number): void {
    this.exits.push(code);
    this.emit("exited");
  }
}

test("closeStoreOnShutdown: a daemon stop that rejects is logged to console.error by default, after the store closed, and the process exits 0", async (t) => {
  const errors = t.mock.method(console, "error", () => {});
  const order: string[] = [];
  const proc = new FakeProcess();
  const store = { storage: { kind: "sqlite" } as SiteStorage, close: async () => { order.push("store closed"); } };
  closeStoreOnShutdown(
    { store, onShutdown: () => { order.push("daemon stop"); return Promise.reject(new Error("tree-stop failed")); } },
    { proc, timeoutMs: 400 },
  );
  const exited = new Promise((resolve) => proc.once("exited", resolve));
  proc.emit("SIGTERM");
  await exited;
  assert.deepEqual(order, ["daemon stop", "store closed"]);
  assert.deepEqual(proc.exits, [0]);
  assert.deepEqual(errors.mock.calls.map((call) => call.arguments), [["[shutdown] closing the sqlite store failed: tree-stop failed"]]);
});
