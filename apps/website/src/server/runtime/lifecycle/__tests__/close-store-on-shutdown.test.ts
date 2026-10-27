import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { EventEmitter } from "node:events";
import { once } from "node:events";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { PassThrough } from "node:stream";
import test from "node:test";

import { OWNER_LOCK_FILE } from "#src/platform/db/kernel/drivers/pglite-owner";
import type { SiteStorage } from "#src/platform/site-dir/types";
import { openSiteStore, PGLITE_DATA_DIR_NAME } from "#src/server/runtime/composition/open-site-store";
import { closeStoreOnShutdown, type ShutdownProcess } from "../close-store-on-shutdown.js";

/**
 * @file Every storage dialect closes through the same bounded shutdown.
 *
 * Outcome Matrix:
 *   Given a sqlite store, SIGTERM                 -> closes before exit, returns true
 *   Given a sqlite store, its stopOnEnd stream ends -> same stop: daemon, close, exit(0)
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

test("T47/runtime-0#3: beforeExit stops the daemon before closing its shared store", async () => {
  const proc = new FakeProcess();
  const order: string[] = [];
  let releaseDaemon!: () => void;
  let storeClosed!: () => void;
  const daemonStopped = new Promise<void>((resolve) => { releaseDaemon = resolve; });
  const closed = new Promise<void>((resolve) => { storeClosed = resolve; });
  closeStoreOnShutdown({
    store: fakeStore("sqlite", async () => { order.push("store"); storeClosed(); }),
    onShutdown: () => { order.push("daemon"); return daemonStopped; },
  }, { proc });

  proc.emit("beforeExit");
  try {
    await new Promise<void>((resolve) => setImmediate(resolve));
    assert.deepEqual(order, ["daemon"], "the store must stay open while the daemon is stopping");
  } finally {
    releaseDaemon();
    await closed;
  }
  assert.deepEqual(order, ["daemon", "store"]);
  assert.deepEqual(proc.exits, []);
});

test("real signals use the default process, close once across SIGTERM/SIGINT, and run the exit handler after closing", { timeout: 15_000 }, async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "shutdown-signals-"));
  const resultPath = path.join(dir, "result.json");
  const moduleUrl = new URL("../close-store-on-shutdown.ts", import.meta.url).href;
  const child = spawn(process.execPath, ["--import", "tsx", "--input-type=module", "--eval", `
    import { writeFileSync } from 'node:fs';
    import { closeStoreOnShutdown } from ${JSON.stringify(moduleUrl)};
    const order = [];
    let closes = 0;
    let shutdowns = 0;
    // Keep beforeExit from starting a normal-exit close before the parent sends SIGTERM.
    const keepAlive = setInterval(() => {}, 1000);
    closeStoreOnShutdown({
      store: { storage: { kind: 'postgres' }, close: async () => {
        closes++;
        order.push('close');
        const released = new Promise(resolve => process.once('message', resolve));
        process.send('closing');
        await released;
        order.push('closed');
      } },
      onShutdown: () => {
        clearInterval(keepAlive);
        order.push('daemon');
        if (++shutdowns === 2) process.send('second-signal');
      },
    });
    process.on('exit', () => writeFileSync(${JSON.stringify(resultPath)}, JSON.stringify({ order, closes })));
    process.send('ready');
  `], { stdio: ["ignore", "pipe", "pipe", "ipc"] });
  const exited = once(child, "exit");
  try {
    assert.equal((await once(child, "message"))[0], "ready");
    const closing = once(child, "message");
    child.kill("SIGTERM");
    assert.equal((await closing)[0], "closing");
    const secondSignal = once(child, "message");
    child.kill("SIGINT");
    assert.equal((await secondSignal)[0], "second-signal");
    child.send("release");
    assert.deepEqual(await exited, [0, null]);
    assert.deepEqual(JSON.parse(fs.readFileSync(resultPath, "utf8")), {
      order: ["daemon", "close", "daemon", "closed", "daemon"], closes: 1,
    });
  } finally {
    if (child.exitCode === null) child.kill("SIGKILL");
    await exited;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// Windows: the desktop has no SIGTERM to send, so it closes `tovu serve`'s stdin pipe instead.
test("sqlite: the end of the stopOnEnd stream runs the same stop as a signal", async () => {
  const proc = new FakeProcess();
  const stdin = new PassThrough();
  const order: string[] = [];
  closeStoreOnShutdown(
    { store: fakeStore("sqlite", async () => { order.push("store"); }), onShutdown: () => { order.push("daemon"); } },
    { proc, stopOnEnd: stdin }
  );
  const exited = proc.exited();
  stdin.end();
  await exited;
  assert.deepEqual(order, ["daemon", "store"]);
  assert.deepEqual(proc.exits, [0]);
});

test("sqlite: shutdown owns the signals and closes the store before exit", async () => {
  const proc = new FakeProcess();
  let closed = false;
  const registered = closeStoreOnShutdown({ store: fakeStore("sqlite", async () => { closed = true; }), onShutdown: () => {} }, { proc });
  assert.equal(registered, true);
  const exited = proc.exited();
  proc.emit("SIGTERM");
  await exited;
  assert.equal(closed, true);
  assert.deepEqual(proc.exits, [0]);
});

// SQLite removes the WAL/SHM only on the last connection's close; a daemon closing at the same
// instant left chat.db's sidecars behind in a live desktop Stop.
test("shutdown closes the owner store after the daemon has stopped, so ours is the last connection", async () => {
  const proc = new FakeProcess();
  const order: string[] = [];
  let release!: () => void;
  const daemonStopped = new Promise<void>((resolve) => { release = resolve; });
  closeStoreOnShutdown({
    store: fakeStore("sqlite", async () => { order.push("store"); }),
    onShutdown: () => daemonStopped.then(() => { order.push("daemon"); }),
  }, { proc, stopServing: async () => { order.push("listener"); } });
  const exited = proc.exited();
  proc.emit("SIGTERM");
  await new Promise<void>((resolve) => setImmediate(resolve));
  assert.deepEqual(order, ["listener"]);
  release();
  await exited;
  assert.deepEqual(order, ["listener", "daemon", "store"]);
  assert.deepEqual(proc.exits, [0]);
});

test("an unresponsive daemon delays the store close by only a quarter of the bound", async () => {
  const proc = new FakeProcess();
  const order: string[] = [];
  closeStoreOnShutdown({
    store: fakeStore("sqlite", async () => { order.push("store"); }),
    onShutdown: () => new Promise<void>(() => {}),
  }, { proc, timeoutMs: 200, log: () => {} });
  const exited = proc.exited();
  proc.emit("SIGTERM");
  await new Promise<void>((resolve) => setTimeout(resolve, 100));
  assert.deepEqual(order, ["store"], "the store closes at timeoutMs / 4 although the daemon never settles");
  await exited;
  assert.deepEqual(proc.exits, [0]);
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
  try {
    const store = await openSiteStore({
      storage: { kind: "pglite" },
      dbPath: path.join(siteDir, "content.db"),
      chatDbPath: path.join(siteDir, "chat.db"),
      role: "owner",
    });
    const socketPath = store.pgliteSocketPath!;
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
  }
});
