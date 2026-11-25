import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import fsp from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import Database from "better-sqlite3";
import type { SqliteCompactionFs, SqliteCompactionMarker, SqliteCompactionMarkerStore } from "@jini-ai/core/contracts/storage";
import { withIdleTurn } from "@jini-ai/db/kernel";
import { convertToIncrementalVacuum, incrementalVacuumStep } from "@jini-ai/db/sqlite";
import { openSqliteFileKernel, sqliteConnectionOf } from "#src/platform/db/kernel/drivers/sqlite";
import { createDbFreePagesPolicy, type DbFreePagesRequired, type SweepableDatabase } from "./db-free-pages.js";

const nodeFs: SqliteCompactionFs = {
  size: async (f) => fsp.stat(f).then((s) => s.size, (error: NodeJS.ErrnoException) => { if (error.code === "ENOENT") return 0; throw error; }),
  exists: async (f) => fsp.lstat(f).then(() => true, () => false),
  freeBytes: async (d) => fsp.statfs(d).then((s) => s.bavail * s.bsize),
  deviceOf: async (d) => String((await fsp.stat(d)).dev),
  identity: async (f) => { const s = await fsp.stat(f); return `${s.dev}:${s.ino}`; },
  publish: async (from, to) => { await fsp.rename(from, to); },
  removeOwn: async (f) => fsp.rm(f, { force: true }),
  tempDirectory: () => os.tmpdir(),
};

function memoryMarker(): SqliteCompactionMarkerStore {
  let current: SqliteCompactionMarker | undefined;
  return { read: async () => current, write: async (marker) => { current = marker; } };
}

/** A site database with whole free pages: converted (unless `converted: false`) and served by one kernel. */
async function servingDatabase(t: test.TestContext, { converted = true }: { converted?: boolean } = {}) {
  const dir = await fsp.mkdtemp(path.join(os.tmpdir(), "tovu-free-pages-"));
  const filePath = path.join(dir, "content.db");
  const seed = new Database(filePath);
  seed.pragma("journal_mode = WAL");
  seed.exec("CREATE TABLE notes (id INTEGER PRIMARY KEY, body TEXT)");
  const insert = seed.prepare("INSERT INTO notes (body) VALUES (?)");
  seed.transaction(() => { for (let i = 0; i < 400; i++) insert.run("x".repeat(2000)); })();
  seed.close();
  const marker = memoryMarker();
  if (converted) {
    await convertToIncrementalVacuum({ filePath, open: (f, o) => new Database(f, o), marker, holdsRunningLease: () => true, fs: nodeFs, now: () => 1000 });
  }
  const kernel = openSqliteFileKernel<unknown>({ filePath });
  const handle = sqliteConnectionOf({ kernel })!;
  handle.exec("DELETE FROM notes WHERE id > 20");
  t.after(async () => { await kernel.close(); await fsp.rm(dir, { recursive: true, force: true }); });
  const db: SweepableDatabase = { name: "content", filePath, kernel, handle, marker };
  return { db, kernel, handle };
}

function required(db: SweepableDatabase, patch: Partial<DbFreePagesRequired> = {}): DbFreePagesRequired {
  return {
    databases: () => [db], withIdleTurn, incrementalVacuumStep, fs: nodeFs, mono: () => 0,
    yieldTurn: () => new Promise((resolve) => setImmediate(resolve)), signal: new AbortController().signal, ...patch,
  };
}

test("step never runs while a kernel transaction is open", async (t) => {
  const { db, kernel } = await servingDatabase(t);
  let release = () => {};
  const held = new Promise<void>((resolve) => { release = resolve; });
  const tx = kernel.transaction(async () => { await held; });
  await Promise.resolve();
  let steps = 0;
  const policy = createDbFreePagesPolicy(required(db, { incrementalVacuumStep: async (...args) => { steps += 1; return incrementalVacuumStep(...args); } }));
  assert.deepEqual(await policy.run(), [{ database: "content", outcome: { status: "skipped", reason: "busy" } }]);
  assert.equal(steps, 0);
  release();
  await tx;
});

test("unconverted or replaced file is skipped", async (t) => {
  const { db } = await servingDatabase(t, { converted: false });
  const [step] = await createDbFreePagesPolicy(required(db)).run();
  assert.equal(step?.outcome.status === "skipped" && step.outcome.reason, "not-converted");
  const converted = await servingDatabase(t);
  const replaced = { ...nodeFs, identity: async () => "restored-file" };
  const [other] = await createDbFreePagesPolicy(required(converted.db, { fs: replaced })).run();
  assert.equal(other?.outcome.status === "skipped" && other.outcome.reason, "not-converted");
});

test("busy defers and restores timeout", async (t) => {
  const { db, handle } = await servingDatabase(t);
  handle.pragma("busy_timeout = 4321");
  const writer = new Database(db.filePath);
  t.after(() => writer.close());
  writer.exec("BEGIN IMMEDIATE");
  const [step] = await createDbFreePagesPolicy(required(db), { busyTimeoutMs: 1 }).run();
  writer.exec("ROLLBACK");
  assert.equal(step?.outcome.status === "skipped" && step.outcome.reason, "busy");
  assert.equal(handle.pragma("busy_timeout", { simple: true }), 4321);
});

test("report has main and WAL sizes", async (t) => {
  const { db } = await servingDatabase(t);
  const steps = await createDbFreePagesPolicy(required(db), { maxPages: 5, maxStepsPerPass: 1 }).run();
  assert.equal(steps.length, 1);
  const outcome = steps[0]!.outcome;
  assert.equal(outcome.status, "reclaimed");
  if (outcome.status !== "reclaimed") return;
  assert.ok(outcome.before.mainBytes > 0);
  assert.equal(typeof outcome.after.walBytes, "number");
  assert.equal(outcome.before.freePages - outcome.after.freePages, 5);
});

test("stops starting steps after the time budget", async (t) => {
  const { db } = await servingDatabase(t);
  let now = 0;
  const steps = await createDbFreePagesPolicy(required(db, { mono: () => now, yieldTurn: async () => { now += 600; } }), { maxPages: 1, budgetMs: 1_000 }).run();
  // Steps start at t=0 and t=600; at t=1200 the budget is spent, so no third step starts.
  assert.equal(steps.length, 2);
  const aborted = new AbortController();
  aborted.abort();
  assert.deepEqual(await createDbFreePagesPolicy(required(db, { signal: aborted.signal })).run(), []);
  assert.equal((await createDbFreePagesPolicy(required(db), { maxPages: 1, maxStepsPerPass: 3 }).run()).length, 3);
});

test("shutdown drains before closing SQLite", async (t) => {
  const { db } = await servingDatabase(t);
  const order: string[] = [];
  let finish = () => {};
  const gate = new Promise<void>((resolve) => { finish = resolve; });
  const policy = createDbFreePagesPolicy(required(db, { incrementalVacuumStep: async (...args) => { order.push("step-start"); await gate; const outcome = await incrementalVacuumStep(...args); order.push("step-end"); return outcome; } }), { maxStepsPerPass: 1 });
  const pass = policy.run();
  await new Promise((resolve) => setImmediate(resolve));
  const drained = policy.drain().then(() => order.push("drained"));
  finish();
  await drained;
  await pass;
  assert.deepEqual(order, ["step-start", "step-end", "drained"]);
});

test("the policy never opens a second connection", () => {
  const source = readFileSync(new URL("./db-free-pages.ts", import.meta.url), "utf8");
  assert.doesNotMatch(source, /openNativeSqlite|new Database/);
});
