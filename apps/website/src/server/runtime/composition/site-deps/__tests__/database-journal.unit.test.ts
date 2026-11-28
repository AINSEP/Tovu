import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test, { type TestContext } from "node:test";
import { contentKernel } from "#src/platform/db/content-kernel";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { composeDatabaseJournal } from "../database-journal.js";

/**
 * @file `composeDatabaseJournal` over a real sidecar journal file and a real in-memory content
 * database: the restore-point retention it wires keeps the copy an in-flight publish run may still
 * roll back to (read from the content database's own publish runs), and prunes a finished run's.
 */

type Required = Parameters<typeof composeDatabaseJournal>[0];

function compose(t: TestContext) {
  const savedJournalPath = process.env.TOVU_DATABASE_JOURNAL_DB;
  delete process.env.TOVU_DATABASE_JOURNAL_DB;
  const dir = mkdtempSync(join(tmpdir(), "tovu-database-journal-"));
  const db = openContentDb(":memory:");
  db.$client.prepare("INSERT INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)").run("site-7", "site-7", "site-7", "2031-01-01T00:00:00.000Z");
  const kernel = contentKernel({ store: db });
  const closes: (() => unknown)[] = [];
  const journal = composeDatabaseJournal({
    dbPath: join(dir, "data", "content.db"), workspaceId: "site-7", kernel, storeBound: { dbOps: {} },
    onStoreClose: ({ registration }: { registration: () => unknown }) => { closes.push(registration); },
  } as unknown as Required);
  t.after(async () => {
    for (const close of closes) await close();
    await kernel.close();
    rmSync(dir, { recursive: true, force: true });
    if (savedJournalPath === undefined) delete process.env.TOVU_DATABASE_JOURNAL_DB; else process.env.TOVU_DATABASE_JOURNAL_DB = savedJournalPath;
  });
  return { journal, dir };
}

function publishRun(id: string, phase: "applying" | "applied", restorePointId: string) {
  return { id, workspaceId: "site-7", direction: "import" as const, peerPrincipalId: "peer-1", peerLabel: null, phase, restorePointId,
    changeSetIdsJson: null, actorId: "owner-1", startedAt: "2031-02-01T00:00:00.000Z", finishedAt: null, reportJson: null, itemsJson: null };
}

test("restore-point retention keeps the copy of an in-flight publish run and prunes a finished run's copy past the newest five", async t => {
  const { journal, dir } = compose(t);
  await journal.publishContentRunRepo.save({ record: publishRun("run-live", "applying", "rp-1") });
  await journal.publishContentRunRepo.save({ record: publishRun("run-done", "applied", "rp-2") });
  const backups = join(dir, "backups");
  mkdirSync(backups);
  const copyOf = (n: number) => join(backups, `restore-point-rp${n}-wm1-${n}.db`);
  for (let n = 1; n <= 7; n++) {
    writeFileSync(copyOf(n), "copy");
    await journal.restorePointsRepo.save({ restorePointId: `rp-${n}`, idempotencyKey: `idem-${n}`, trigger: "publish", createdBy: "owner-1",
      createdAt: `2031-02-0${n}T00:00:00.000Z`, artifactRef: copyOf(n) });
  }
  const kept = (await journal.restorePointsRepo.list()).map(row => row.id).sort();
  assert.deepEqual(kept, ["rp-1", "rp-3", "rp-4", "rp-5", "rp-6", "rp-7"]);
  assert.equal(existsSync(copyOf(1)), true, "the in-flight run's copy stays on disk");
  assert.equal(existsSync(copyOf(2)), false, "the finished run's copy is deleted");
});
