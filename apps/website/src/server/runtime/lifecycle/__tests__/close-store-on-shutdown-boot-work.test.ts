import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import test from "node:test";

import type { SiteStorage } from "#src/platform/site-dir/types";
import { closeStoreOnShutdown, type ShutdownProcess } from "../close-store-on-shutdown.js";

/**
 * @file The default boot's (`index.ts`) store close waits for the boot work the composition started
 * and never awaited, the same race `tovu serve` had (ffa366a90): `legacyPublishCredentialsReady`
 * and `createServingApp`'s `bootWork` (the BYOK tool-registration pass) read the store, and a site
 * stopped seconds after boot closed it under them ("The database connection is not open").
 *
 * Outcome Matrix:
 *   Given boot work registered after the handlers, SIGTERM -> close waits for every pass, then exit(0)
 *   Given a boot pass that never settles, SIGINT           -> close runs after half the bound, logged
 *   Given no bootWork port                                 -> close runs at once (unchanged)
 */

class FakeProcess extends EventEmitter implements ShutdownProcess {
  readonly exits: number[] = [];
  exit(code: number): void {
    this.exits.push(code);
    this.emit("exited");
  }
  exited(): Promise<void> {
    return new Promise((resolve) => this.once("exited", () => resolve()));
  }
}

function postgresStore(close: () => Promise<void>) {
  return { storage: { kind: "postgres", secretRef: "site" } as SiteStorage, close };
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
  let resolve: () => void = () => {};
  return { promise: new Promise<void>((res) => (resolve = res)), resolve };
}

function tick(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}

test("SIGTERM: the store close waits for boot work registered after the handlers, then exits 0", async () => {
  const proc = new FakeProcess();
  const order: string[] = [];
  const legacyWork = deferred();
  const byokWork = deferred();
  // index.ts registers the handlers before createServingApp returns its bootWork, so the port is
  // read when the close starts, not at registration.
  const bootWork: Promise<unknown>[] = [legacyWork.promise];
  closeStoreOnShutdown(
    { store: postgresStore(async () => void order.push("close")), onShutdown: () => order.push("daemon") },
    { proc, bootWork: () => bootWork }
  );
  bootWork.push(byokWork.promise);
  const exited = proc.exited();

  proc.emit("SIGTERM");
  await tick();
  assert.deepEqual(order, ["daemon"], "the store close must wait for the legacy publish-credential tail");
  legacyWork.resolve();
  await tick();
  assert.deepEqual(order, ["daemon"], "the BYOK tool-registration pass is still running");
  byokWork.resolve();
  await exited;

  assert.deepEqual(order, ["daemon", "close"]);
  assert.deepEqual(proc.exits, [0]);
});

test("a boot pass that never settles is abandoned after half the bound; the store still closes", async () => {
  const proc = new FakeProcess();
  const logs: string[] = [];
  let closes = 0;
  closeStoreOnShutdown(
    { store: postgresStore(async () => void (closes += 1)), onShutdown: () => {} },
    { proc, timeoutMs: 200, log: (m) => logs.push(m), bootWork: () => [new Promise<void>(() => {})] }
  );
  const exited = proc.exited();

  proc.emit("SIGINT");
  await exited;

  assert.equal(closes, 1);
  assert.deepEqual(proc.exits, [0]);
  assert.deepEqual(logs, ["[shutdown] boot work did not settle within 100 ms; closing the store anyway"]);
});

test("without a bootWork port the store closes at once", async () => {
  const proc = new FakeProcess();
  let closes = 0;
  closeStoreOnShutdown({ store: postgresStore(async () => void (closes += 1)), onShutdown: () => {} }, { proc });
  const exited = proc.exited();

  proc.emit("SIGTERM");
  await exited;

  assert.equal(closes, 1);
});
