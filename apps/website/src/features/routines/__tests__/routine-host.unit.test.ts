import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import * as fsPromises from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { migrateJiniRoutines } from "@jini-ai/daemon/routines/sqlite";
import { runMigrations } from "@jini-ai/db/migrate";
import { parseRoutineBeacon } from "@tovu/contracts/routines";
import { openNativeSqlite } from "#src/platform/db/kernel/drivers/sqlite";
import { closeRoutineHost, openRoutineSidecar, writeRoutineBeacon } from "../routine-host.js";

/**
 * @file `routine-host`: the routine sidecar opens on its own tuned connection and is migrated before
 * the store sees it; an open failure degrades to `error` availability instead of taking the site
 * down; shutdown fences timers, drains, interrupts only this boot's runs, releases, and closes LAST;
 * the beacon is written atomically and its failure never throws.
 */

const quiet = () => {};

function tempSite(t: { after: (fn: () => void) => void }): string {
  const root = mkdtempSync(path.join(tmpdir(), "routine-host-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  return root;
}

test("sidecar opens ops/routines.db with WAL, busy timeout and foreign keys, migrated, on its own connection", async (t) => {
  const root = tempSite(t);
  const contentDbPath = path.join(root, "data.nosync", "content.db");
  const opened = await openRoutineSidecar({ contentDbPath, openSqlite: openNativeSqlite, runMigrations, migrate: migrateJiniRoutines as never,
    scope: "ws-1", holderId: "boot-1", now: () => 1_000, newId: () => "r-1" });
  assert.equal(opened.ok, true);
  if (!opened.ok) return;
  t.after(() => opened.close());
  assert.equal(opened.handle.pragma("journal_mode", { simple: true }), "wal");
  assert.equal(opened.handle.pragma("busy_timeout", { simple: true }), 5000);
  assert.equal(opened.handle.pragma("foreign_keys", { simple: true }), 1);
  assert.equal(opened.handle.name, path.join(root, "data.nosync", "ops", "routines.db"));
  const routine = await opened.store.create({ name: "Daily", prompt: "p", schedule: { kind: "hourly", minute: 5 }, target: { mode: "create_each_run" } }, { creatorId: "owner-1" });
  assert.equal((await opened.store.get({ id: routine.id }))?.creatorId, "owner-1", "the store reads back its own write");
  assert.equal(existsSync(path.join(root, "data.nosync", "content.db")), false, "never opens the content database");
});

test("migration runs before the borrowed handle reaches the store", async () => {
  const order: string[] = [];
  const handle = { pragma: (text: string) => { order.push(`pragma:${text}`); }, close: () => { order.push("close"); } };
  const opened = await openRoutineSidecar({ contentDbPath: "/s/content.db", openSqlite: () => handle as never, runMigrations: (() => {}) as never,
    migrate: (async ({ runMigrations: runner }: { runMigrations: unknown }) => { assert.equal(typeof runner, "function"); order.push("migrate"); }) as never,
    scope: "ws-1", holderId: "boot-1", now: () => 1, newId: () => "x" },
  { mkdir: () => {}, kernelOf: () => ({}) as never, createStore: (({ db }: { db: unknown }) => { assert.equal(db, handle); order.push("store"); return { store: {}, persistence: {} }; }) as never });
  assert.equal(opened.ok, true);
  assert.deepEqual(order, ["pragma:journal_mode = WAL", "pragma:busy_timeout = 5000", "pragma:foreign_keys = ON", "migrate", "store"]);
});

test("an open or migration failure returns error availability, closes the handle, and does not throw", async () => {
  const logs: unknown[] = [];
  const failedOpen = await openRoutineSidecar({ contentDbPath: "/s/content.db", openSqlite: () => { throw new Error("SQLITE_CANTOPEN"); },
    runMigrations: (() => {}) as never, migrate: (async () => {}) as never, scope: "ws", holderId: "h", now: () => 1, newId: () => "x" },
  { mkdir: () => {}, log: (entry) => { logs.push(entry); } });
  assert.deepEqual({ ok: failedOpen.ok, availability: !failedOpen.ok && failedOpen.availability }, { ok: false, availability: "error" });
  let closed = 0;
  const failedMigrate = await openRoutineSidecar({ contentDbPath: "/s/content.db", openSqlite: () => ({ pragma: () => {}, close: () => { closed += 1; } }) as never,
    runMigrations: (() => {}) as never, migrate: (async () => { throw new Error("history mismatch"); }) as never, scope: "ws", holderId: "h", now: () => 1, newId: () => "x" },
  { mkdir: () => {}, kernelOf: () => ({}) as never, log: (entry) => { logs.push(entry); } });
  assert.equal(failedMigrate.ok, false);
  assert.equal(closed, 1);
  assert.equal(logs.length, 2);
});

function closeHarness(options: { drain?: () => Promise<{ drained: boolean; pendingRunIds: string[] }> } = {}) {
  const order: string[] = [];
  const service = {
    quiesce: () => { order.push("quiesce"); },
    drainActive: (_r: unknown, { timeoutMs }: { timeoutMs: number }) => { order.push(`drain:${timeoutMs}`); return options.drain?.() ?? Promise.resolve({ drained: false, pendingRunIds: ["mine-1"] }); },
    stop: (_r: unknown, { releaseLease }: { releaseLease: boolean }) => { order.push(`stop:release=${releaseLease}`); },
  };
  const persistence = {
    listInFlight: () => [{ id: "mine-1", holderId: "boot-1" }, { id: "theirs-1", holderId: "boot-other" }],
    markInterrupted: ({ runIds, holderId, now }: { runIds: string[]; holderId: string; now: number }) => { order.push(`interrupt:${runIds.join(",")}:${holderId}:${now}`); },
  };
  return { order, service, persistence };
}

test("close quiesces, drains, interrupts only this boot's runs, releases the lease, and closes the DB last", async () => {
  const h = closeHarness();
  await closeRoutineHost({ service: h.service as never, persistence: h.persistence as never, holderId: "boot-1", now: () => 77,
    close: () => { h.order.push("close"); } }, { log: quiet });
  assert.deepEqual(h.order, ["quiesce", "drain:2000", "interrupt:mine-1:boot-1:77", "stop:release=true", "close"]);
});

test("a drain that never settles is cut off by the injected timer at two seconds and the DB still closes", async () => {
  const h = closeHarness({ drain: () => new Promise(() => {}) });
  let fire: (() => void) | undefined;
  let delay = 0;
  const timers = { setTimeout: (cb: () => void, ms: number) => { fire = cb; delay = ms; return 1; }, clearTimeout: () => {} };
  const closing = closeRoutineHost({ service: h.service as never, persistence: h.persistence as never, holderId: "boot-1", now: () => 1,
    drainTimeoutMs: 60_000, close: () => { h.order.push("close"); } }, { timers, log: quiet });
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(delay, 2000, "the drain is capped at two seconds");
  assert.deepEqual(h.order, ["quiesce", "drain:2000"]);
  fire?.();
  await closing;
  assert.deepEqual(h.order.slice(2), ["interrupt:mine-1:boot-1:1", "stop:release=true", "close"]);
});

test("a failing shutdown step is logged and the DB still closes", async () => {
  const h = closeHarness();
  const logs: unknown[] = [];
  const persistence = { ...h.persistence, markInterrupted: () => { throw new Error("SQLITE_BUSY"); } };
  await closeRoutineHost({ service: h.service as never, persistence: persistence as never, holderId: "boot-1", now: () => 1,
    close: () => { h.order.push("close"); } }, { log: (entry) => { logs.push(entry); } });
  assert.deepEqual(h.order.slice(-2), ["stop:release=true", "close"]);
  assert.equal(logs.length, 1);
});

test("beacon is written atomically through a temp file and parses as a v1 beacon", async (t) => {
  const root = tempSite(t);
  const beacon = path.join(root, "ops", "routines-beacon.json");
  const ops: string[] = [];
  const fs = {
    mkdir: async (dir: string, options: { recursive: true }) => { ops.push("mkdir"); await fsPromises.mkdir(dir, options); },
    writeFile: async (file: string, text: string) => { ops.push(`write:${path.basename(file)}`); await fsPromises.writeFile(file, text); },
    rename: async (from: string, to: string) => { ops.push(`rename:${path.basename(from)}->${path.basename(to)}`); await fsPromises.rename(from, to); },
    rm: async (file: string) => { await fsPromises.rm(file, { force: true }); },
  };
  const result = await writeRoutineBeacon({ path: beacon, enabled: 2, now: () => 123, fs });
  assert.deepEqual(result, { ok: true });
  assert.deepEqual(ops, ["mkdir", "write:routines-beacon.json.tmp", "rename:routines-beacon.json.tmp->routines-beacon.json"]);
  assert.deepEqual(parseRoutineBeacon({ text: readFileSync(beacon, "utf8") }), { v: 1, enabled: 2, updatedAt: 123 });
});

test("a beacon write failure logs a diagnostic, never throws, and leaves the previous beacon intact", async (t) => {
  const root = tempSite(t);
  const beacon = path.join(root, "ops", "routines-beacon.json");
  mkdirSync(path.dirname(beacon), { recursive: true });
  writeFileSync(beacon, JSON.stringify({ v: 1, enabled: 1, updatedAt: 1 }));
  const logs: unknown[] = [];
  const fs = {
    mkdir: fsPromises.mkdir as never,
    writeFile: fsPromises.writeFile as never,
    rename: async () => { throw Object.assign(new Error("ENOSPC"), { code: "ENOSPC" }); },
    rm: async (file: string) => { await fsPromises.rm(file, { force: true }); },
  };
  const result = await writeRoutineBeacon({ path: beacon, enabled: 4, now: () => 9, fs }, { log: (entry) => { logs.push(entry); } });
  assert.deepEqual(result, { ok: false });
  assert.equal(logs.length, 1);
  assert.deepEqual(JSON.parse(readFileSync(beacon, "utf8")), { v: 1, enabled: 1, updatedAt: 1 });
  assert.equal(existsSync(`${beacon}.tmp`), false, "the temp file is cleaned up");
});
