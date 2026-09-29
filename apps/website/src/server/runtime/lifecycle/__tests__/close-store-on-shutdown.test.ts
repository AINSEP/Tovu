import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { OWNER_LOCK_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { openSiteStore, PG_SOCKET_ENV, PGLITE_DATA_DIR_NAME } from "#src/server/runtime/composition/open-site-store";
import { closeStoreOnShutdown, type ShutdownProcess } from "../close-store-on-shutdown.js";

/**
 * @file The default boot closes a PGlite/Postgres store on shutdown; SQLite is untouched.
 *
 * Outcome Matrix:
 *   Given a sqlite store                          -> nothing registered, returns false
 *   Given a pg store, SIGTERM                      -> daemon shutdown, store closed, then exit(0)
 *   Given a pg store whose close hangs             -> exit(0) after the bound, logged
 *   Given a pg store whose close rejects           -> exit(0), logged
 *   Given a pg store, the event loop drains        -> store closed (beforeExit), no exit call
 *   Given a pg store, process.exit elsewhere       -> daemon shutdown on `exit`
 *   Given a real PGlite owner, SIGINT              -> socket file and owner lock gone before exit
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

function fakeStore(kind: SiteStorage["kind"], close: () => Promise<void>) {
  const storage = (kind === "sqlite" ? { kind } : kind === "pglite" ? { kind } : { kind, secretRef: "site" }) as SiteStorage;
  return { storage, close };
}

test("sqlite: nothing is registered and the caller keeps the daemon's own handlers", () => {
  const proc = new FakeProcess();
  const registered = closeStoreOnShutdown({ store: fakeStore("sqlite", async () => {}), onShutdown: () => {} }, { proc });
  assert.equal(registered, false);
  assert.deepEqual(proc.eventNames(), []);
});

test("SIGTERM on a pg site: the daemon is shut down, the store closes, then the process exits 0", async () => {
  const proc = new FakeProcess();
  const order: string[] = [];
  const registered = closeStoreOnShutdown(
    {
      store: fakeStore("postgres", async () => {
        order.push("close");
      }),
      onShutdown: () => order.push("daemon"),
    },
    { proc }
  );
  assert.equal(registered, true);
  const exited = proc.exited();
  proc.emit("SIGTERM");
  await exited;
  assert.deepEqual(order, ["daemon", "close"]);
  assert.deepEqual(proc.exits, [0]);
});

test("a store that never closes does not hold the exit past the bound", async () => {
  const proc = new FakeProcess();
  const logs: string[] = [];
  closeStoreOnShutdown(
    { store: fakeStore("pglite", () => new Promise<void>(() => {})), onShutdown: () => {} },
    { proc, timeoutMs: 50, log: (m) => logs.push(m) }
  );
  const exited = proc.exited();
  proc.emit("SIGINT");
  await exited;
  assert.deepEqual(proc.exits, [0]);
  assert.deepEqual(logs, ["[shutdown] the pglite store did not close within 50 ms; exiting anyway"]);
});

test("a store whose close fails is logged and the process still exits 0", async () => {
  const proc = new FakeProcess();
  const logs: string[] = [];
  closeStoreOnShutdown(
    { store: fakeStore("pglite", async () => Promise.reject(new Error("boom"))), onShutdown: () => {} },
    { proc, log: (m) => logs.push(m) }
  );
  const exited = proc.exited();
  proc.emit("SIGHUP");
  await exited;
  assert.deepEqual(proc.exits, [0]);
  assert.deepEqual(logs, ["[shutdown] closing the pglite store failed: boom"]);
});

test("a normal exit (the event loop drains) closes the store without calling exit; `exit` shuts the daemon down", async () => {
  const proc = new FakeProcess();
  let closes = 0;
  let daemonShutdowns = 0;
  closeStoreOnShutdown(
    {
      store: fakeStore("pglite", async () => {
        closes += 1;
      }),
      onShutdown: () => (daemonShutdowns += 1),
    },
    { proc }
  );
  proc.emit("beforeExit");
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(closes, 1);
  assert.deepEqual(proc.exits, []);
  proc.emit("exit");
  assert.equal(daemonShutdowns, 1);
});

test("a real PGlite owner: SIGINT releases the socket file and the owner lock before the process exits", async () => {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "r1f2-shutdown-"));
  const socketDir = fs.mkdtempSync("/tmp/r1f2-");
  const socketPath = path.join(socketDir, ".s.PGSQL.5432");
  try {
    const store = await openSiteStore(
      { storage: { kind: "pglite" }, dbPath: path.join(siteDir, "content.db"), chatDbPath: path.join(siteDir, "chat.db"), role: "owner" },
      { env: { [PG_SOCKET_ENV]: socketPath } }
    );
    const lockPath = path.join(siteDir, PGLITE_DATA_DIR_NAME, OWNER_LOCK_FILE);
    assert.ok(fs.existsSync(socketPath) && fs.existsSync(lockPath), "the owner serves and holds the lock");

    const proc = new FakeProcess();
    const seenAtExit: boolean[] = [];
    proc.once("exited", () => seenAtExit.push(fs.existsSync(socketPath), fs.existsSync(lockPath)));
    closeStoreOnShutdown({ store, onShutdown: () => {} }, { proc, timeoutMs: 30_000 });
    const exited = proc.exited();
    proc.emit("SIGINT");
    await exited;
    assert.deepEqual(seenAtExit, [false, false], "socket and lock are gone by the time exit is called");
  } finally {
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.rmSync(socketDir, { recursive: true, force: true });
  }
});
