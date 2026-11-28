import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { lstat, mkdtemp, readdir, rm, unlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { selectDatabaseCopiesToPrune } from "@jini-ai/db/sqlite";
import { createCopyCoordinator } from "#src/platform/db/sqlite/copy-coordinator";
import { SqliteDbOpsAdapter } from "#src/platform/db/sqlite/db-ops";
import { createDatabaseCopyPolicy } from "./database-copies.js";

const fs = { readdir, lstat, unlink };
const stamp = (day: number) => `pre-migrations-2026-11-${String(day).padStart(2, "0")}T10-00-00-000Z.db`;

async function opsFixture(t: { after(fn: () => Promise<void>): void }, days: number[]) {
  const opsDir = await mkdtemp(path.join(tmpdir(), "database-copies-"));
  t.after(() => rm(opsDir, { recursive: true, force: true }));
  for (const day of days) await writeFile(path.join(opsDir, stamp(day)), "x".repeat(10));
  return opsDir;
}

function policyFor(opsDir: string, overrides: Partial<Parameters<typeof createDatabaseCopyPolicy>[0]> = {}) {
  return createDatabaseCopyPolicy({
    opsDirs: [opsDir], verify: async () => true, listProtected: async () => [],
    mutex: createCopyCoordinator({}, {}), fs, selectCopies: selectDatabaseCopiesToPrune,
    signal: new AbortController().signal, ...overrides,
  });
}

const names = async (opsDir: string) => (await readdir(opsDir)).sort();

test("default keeps 5", async t => {
  const opsDir = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7, 8]);
  await writeFile(path.join(opsDir, `${stamp(1)}-wal`), "w");
  const policy = policyFor(opsDir);
  assert.deepEqual({ id: policy.id, kind: policy.kind }, { id: "database-copies", kind: "old-copy" });
  assert.deepEqual(await policy.measure(), { bytes: 81, items: 8 });
  const result = await policy.sweep({ now: 0 });
  assert.deepEqual(result, { removed: 3, freedBytes: 31 });
  assert.deepEqual(await names(opsDir), [4, 5, 6, 7, 8].map(stamp));
});

test("no verified copy → nothing removed", async t => {
  const opsDir = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7, 8]);
  const verified: string[] = [];
  // Only the newest copy is torn; every older copy would pass. Older copies must still all stay.
  const policy = policyFor(opsDir, { verify: async ({ path: file }) => { verified.push(path.basename(file)); return !file.endsWith(stamp(8)); } });
  assert.deepEqual(await policy.sweep({ now: 0 }), { removed: 0, freedBytes: 0 });
  assert.deepEqual(verified, [stamp(8)]);
  assert.equal((await names(opsDir)).length, 8);
});

test("a pass waits for backup publication", async t => {
  const opsDir = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7]);
  const mutex = createCopyCoordinator({}, {});
  let publish!: () => void;
  const published = mutex.withCopyPublication({ opsDir, work: () => new Promise<void>(resolve => { publish = resolve; }) }, {});
  const sweep = policyFor(opsDir, { mutex }).sweep({ now: 0 });
  await new Promise(resolve => setTimeout(resolve, 20));
  assert.equal((await names(opsDir)).length, 7, "nothing is removed while a copy is being published");
  // The copy that publication lands is the newest: the waiting pass must anchor on it.
  await writeFile(path.join(opsDir, stamp(9)), "x".repeat(10));
  publish();
  await published;
  assert.deepEqual(await sweep, { removed: 3, freedBytes: 30 });
  assert.deepEqual(await names(opsDir), [4, 5, 6, 7, 9].map(stamp));
});

test("protected restore points kept", async t => {
  const opsDir = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7]);
  const removed = await policyFor(opsDir, { listProtected: async () => [path.join(opsDir, stamp(1))] }).sweep({ now: 0 });
  assert.deepEqual(removed, { removed: 1, freedBytes: 10 });
  assert.deepEqual(await names(opsDir), [1, 3, 4, 5, 6, 7].map(stamp));
  // Unknown protection is no deletion: a journal that cannot be read removes nothing.
  const failing = policyFor(opsDir, { listProtected: async () => { throw new Error("journal locked"); } });
  await assert.rejects(failing.sweep({ now: 0 }), /journal locked/);
  assert.equal((await names(opsDir)).length, 6);
});

test("a copy open in Recovery is kept", async t => {
  const opsDir = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7]);
  const mutex = createCopyCoordinator({}, {});
  const artifactRef = path.join(opsDir, stamp(1));
  let finishRestore!: () => void;
  const holds: string[] = [];
  const coordinator = { ...mutex, holdCopy: <T>(required: { path: string; work: () => Promise<T> }, optional = {}) => {
    holds.push(required.path);
    return mutex.holdCopy({ path: required.path, work: async () => { await new Promise<void>(resolve => { finishRestore = resolve; }); return required.work(); } }, optional);
  } };
  const adapter = new SqliteDbOpsAdapter({ db: { $client: {} } as never, filePath: path.join(opsDir, "missing-site", "content.db"), copies: coordinator });
  const restore = adapter.restoreFromArtifact({ artifactRef });
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.deepEqual(holds, [artifactRef]);
  assert.deepEqual(await policyFor(opsDir, { mutex }).sweep({ now: 0 }), { removed: 1, freedBytes: 10 });
  assert.deepEqual(await names(opsDir), [1, 3, 4, 5, 6, 7].map(stamp));
  finishRestore();
  await restore.catch(() => undefined);
  assert.equal(mutex.held().size, 0, "the hold ends with the restore, even a failed one");
});

test("foreign file in ops is ignored", async t => {
  const opsDir = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7]);
  const foreign = ["notes.db", "pre-migrations-latest.db", "restore-point-s-wm1-1.db", `${stamp(0)}-wal`, "pre-compact-content-1.db"];
  for (const name of foreign) await writeFile(path.join(opsDir, name), "f");
  assert.deepEqual(await policyFor(opsDir).sweep({ now: 0 }), { removed: 2, freedBytes: 20 });
  assert.deepEqual(await names(opsDir), [...foreign, ...[3, 4, 5, 6, 7].map(stamp)].sort());
});

test("an abort between ops folders stops the pass before the next folder", async t => {
  const first = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7]);
  const second = await opsFixture(t, [1, 2, 3, 4, 5, 6, 7]);
  const controller = new AbortController();
  const coordinator = createCopyCoordinator({}, {});
  const entered: string[] = [];
  const mutex = {
    held: coordinator.held,
    runExclusive: async <T>(required: { opsDir: string; work: () => Promise<T> }) => {
      entered.push(required.opsDir);
      const result = await coordinator.runExclusive(required);
      controller.abort();
      return result;
    },
  };
  const policy = createDatabaseCopyPolicy({ opsDirs: [first, second], verify: async () => true, listProtected: async () => [],
    mutex, fs, selectCopies: selectDatabaseCopiesToPrune, signal: controller.signal });
  assert.deepEqual(await policy.sweep({ now: 0 }), { removed: 2, freedBytes: 20 });
  assert.deepEqual(entered, [first]);
  assert.deepEqual(await names(first), [3, 4, 5, 6, 7].map(stamp));
  assert.equal((await names(second)).length, 7, "the folder after the abort is never entered");
});

test("migration callback uses pruneMigrationCopies", () => {
  const contentDb = readFileSync(new URL("../../../../platform/db/sqlite/content-db.ts", import.meta.url), "utf8");
  assert.match(contentDb, /onBackupComplete:[\s\S]*?pruneMigrationCopies\(/);
  assert.match(contentDb, /withCopyPublication\(\{ opsDir[\s\S]*?migrateContentDatabase/);
  assert.doesNotMatch(contentDb, /pruneDatabaseCopies/);
  const policy = readFileSync(new URL("./database-copies.ts", import.meta.url), "utf8");
  assert.match(policy, /runExclusive\([\s\S]*?pruneMigrationCopies\(/);
});
