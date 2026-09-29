import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

import { sql } from "kysely";

import { openSqliteFileKernel } from "../../kernel/index.js";
import { journalKernel } from "../database-journal-db.js";
import { SqliteDatabaseLedgerRepo, SqliteMigrationRunsRepo, SqliteRestorePointsRepo } from "../database-journal-repo.js";

/**
 * @file The journal on its kernel (SQLite by design, so no dialect matrix): files the former Drizzle
 * migrations built still open with their rows, the schema step is idempotent, a failed open fails
 * every call, writes roll back with the kernel's transaction, and the restore-point / interrupted-
 * migration flows the Recovery screen and boot reconciliation run end to end.
 */

const MIGRATIONS_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../drizzle-database-journal");

function tempJournalPath(t: { after(fn: () => void): void }): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "journal-kernel-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  return path.join(dir, "database-journal.db");
}

/** Builds a journal file exactly as the old Drizzle migrator did, up to and including `upTo`. */
async function applyLegacyMigrations(filePath: string, upTo: number): Promise<void> {
  const kernel = openSqliteFileKernel(filePath);
  try {
    const files = fs.readdirSync(MIGRATIONS_DIR).filter((name) => name.endsWith(".sql")).sort().slice(0, upTo + 1);
    for (const file of files) {
      const text = fs.readFileSync(path.join(MIGRATIONS_DIR, file), "utf8");
      for (const statement of text.split("--> statement-breakpoint")) {
        if (statement.trim()) await kernel.execute(sql.raw(statement));
      }
    }
  } finally {
    await kernel.close();
  }
}

const LEDGER_ROW = { id: "l1", kind: "core.migration", outcome: "ok", restorePointId: "rp-1", createdAt: "2026-07-01T00:00:00.000Z" };

test("a new file gets all three tables and reopening it is a no-op", async (t) => {
  const filePath = tempJournalPath(t);
  const first = journalKernel(filePath);
  await new SqliteDatabaseLedgerRepo({ db: first, siteId: "s" }).append(LEDGER_ROW);
  await first.close();
  const again = journalKernel(filePath);
  try {
    const ledger = await new SqliteDatabaseLedgerRepo({ db: again, siteId: "s" }).query({ limit: 5 });
    assert.deepEqual(ledger.items.map((row) => row.id), ["l1"]);
    assert.equal(await new SqliteMigrationRunsRepo({ db: again, siteId: "s" }).findNonTerminalForSite("s"), null);
    assert.deepEqual(await new SqliteRestorePointsRepo({ db: again, siteId: "s" }).list(), []);
    const [mode] = await again.query<{ journal_mode: string }>(sql`PRAGMA journal_mode`);
    assert.equal(mode?.journal_mode, "wal");
  } finally {
    await again.close();
  }
});

test("a file built by BOTH old Drizzle migrations opens with its rows intact", async (t) => {
  const filePath = tempJournalPath(t);
  await applyLegacyMigrations(filePath, 1);
  const legacy = openSqliteFileKernel(filePath);
  await legacy.execute(
    sql`INSERT INTO database_ledger (id, site_id, kind, outcome, created_at) VALUES ('old-1', 's', 'restore.executed', 'ok', '2026-07-02T00:00:00.000Z')`
  );
  await legacy.close();
  const kernel = journalKernel(filePath);
  try {
    const ledger = new SqliteDatabaseLedgerRepo({ db: kernel, siteId: "s" });
    await ledger.append(LEDGER_ROW);
    assert.deepEqual((await ledger.query({ limit: 5 })).items.map((row) => row.id), ["old-1", "l1"]);
  } finally {
    await kernel.close();
  }
});

test("a file only the first old migration built gets storage_ledger renamed, rows kept", async (t) => {
  const filePath = tempJournalPath(t);
  await applyLegacyMigrations(filePath, 0);
  const legacy = openSqliteFileKernel(filePath);
  await legacy.execute(
    sql`INSERT INTO storage_ledger (id, site_id, kind, outcome, created_at) VALUES ('old-1', 's', 'restore.executed', 'ok', '2026-07-02T00:00:00.000Z')`
  );
  await legacy.close();
  const kernel = journalKernel(filePath);
  try {
    const items = (await new SqliteDatabaseLedgerRepo({ db: kernel, siteId: "s" }).query({ limit: 5 })).items;
    assert.deepEqual(items, [
      { id: "old-1", kind: "restore.executed", createdAt: "2026-07-02T00:00:00.000Z", restorePointId: null, outcome: "ok" },
    ]);
    const tables = (await kernel.run((db) => db.introspection.getTables())).map((table) => table.name);
    assert.equal(tables.includes("storage_ledger"), false);
  } finally {
    await kernel.close();
  }
});

// The schema is raw DDL now, so drizzle-kit sees no tables there and would generate a migration
// dropping all three; `drizzle-database-journal/` stays only as the legacy-file fixture above.
test("no drizzle-kit target or dist copy points at the journal any more", () => {
  const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../../..");
  const scripts = JSON.parse(fs.readFileSync(path.join(repoRoot, "package.json"), "utf8")).scripts as Record<string, string>;
  const offenders = Object.entries(scripts).filter(([, command]) => /cp -R \S*drizzle-database-journal|database-journal\.config/.test(command));
  assert.deepEqual(offenders.map(([name]) => name), []);
  assert.equal(fs.existsSync(path.join(repoRoot, "apps/website/src/platform/db/drizzle.database-journal.config.ts")), false);
});

test("a file that is not a database fails every call with the open error", async (t) => {
  const filePath = tempJournalPath(t);
  fs.writeFileSync(filePath, "this is not a sqlite database, just some text long enough to be a header ".repeat(4));
  const kernel = journalKernel(filePath);
  await assert.rejects(kernel.ready, /not a database/);
  await assert.rejects(new SqliteMigrationRunsRepo({ db: kernel, siteId: "s" }).findNonTerminalForSite("s"), /not a database/);
  await kernel.close();
});

test("journal writes inside a failed kernel transaction roll back together", async (t) => {
  const kernel = journalKernel(tempJournalPath(t));
  try {
    const ledger = new SqliteDatabaseLedgerRepo({ db: kernel, siteId: "s" });
    const runs = new SqliteMigrationRunsRepo({ db: kernel, siteId: "s" });
    const points = new SqliteRestorePointsRepo({ db: kernel, siteId: "s" });
    await assert.rejects(
      kernel.transaction(async () => {
        await points.save({ restorePointId: "rp-1", idempotencyKey: "k1", trigger: "manual", createdAt: "2026-07-01T00:00:00.000Z", createdBy: "u1" });
        await runs.insert({ id: "run-1", dialect: "sqlite", status: "APPLYING", createdAt: "t", updatedAt: "t" });
        await ledger.append(LEDGER_ROW);
        throw new Error("boom");
      }),
      /boom/
    );
    assert.deepEqual(await points.list(), []);
    assert.equal(await runs.findNonTerminalForSite("s"), null);
    assert.deepEqual((await ledger.query({ limit: 5 })).items, []);
  } finally {
    await kernel.close();
  }
});

test("restore-point flow: save with defaults, dedupe by idempotency key per site, list newest-first", async (t) => {
  const kernel = journalKernel(tempJournalPath(t));
  try {
    const points = new SqliteRestorePointsRepo({ db: kernel, siteId: "s" });
    const other = new SqliteRestorePointsRepo({ db: kernel, siteId: "other" });
    await points.save({ restorePointId: "rp-1", idempotencyKey: "k1", trigger: "manual", createdAt: "2026-07-01T00:00:00.000Z", createdBy: "u1" });
    await points.save({
      restorePointId: "rp-2",
      idempotencyKey: "k2",
      trigger: "pre-migration-auto",
      createdAt: "2026-07-02T00:00:00.000Z",
      createdBy: "u1",
      costClass: "expensive",
      kind: "vacuum-into",
      artifactRef: "ops/rp-2.db",
      watermarkAtCapture: 42,
      capturedSchemaVersion: 7,
      capturedSchemaTag: "0007_x",
    });
    await other.save({ restorePointId: "rp-x", idempotencyKey: "k1", trigger: "manual", createdAt: "2026-07-03T00:00:00.000Z", createdBy: "u2" });
    assert.deepEqual(await points.findByIdempotencyKey("k1"), { restorePointId: "rp-1", idempotencyKey: "k1" });
    assert.equal(await points.findByIdempotencyKey("nope"), null);
    await assert.rejects(
      points.save({ restorePointId: "rp-3", idempotencyKey: "k1", trigger: "manual", createdAt: "t", createdBy: "u1" }),
      /UNIQUE/
    );
    assert.deepEqual(await points.list(), [
      { id: "rp-2", trigger: "pre-migration-auto", costClass: "expensive", kind: "vacuum-into", watermarkAtCapture: 42, createdAt: "2026-07-02T00:00:00.000Z", artifactRef: "ops/rp-2.db" },
      { id: "rp-1", trigger: "manual", costClass: "cheap", kind: "file-snapshot", watermarkAtCapture: null, createdAt: "2026-07-01T00:00:00.000Z", artifactRef: "" },
    ]);
  } finally {
    await kernel.close();
  }
});

test("interrupted-migration flow: detect, record once per boot, update state, resolve", async (t) => {
  const kernel = journalKernel(tempJournalPath(t));
  try {
    const runs = new SqliteMigrationRunsRepo({ db: kernel, siteId: "s" });
    const ledger = new SqliteDatabaseLedgerRepo({ db: kernel, siteId: "s" });
    await runs.insert({ id: "run-1", dialect: "sqlite", status: "PLANNED", createdAt: "t0", updatedAt: "t0" });
    await runs.updateState({ id: "run-1", status: "APPLYING", revisionSeqAtQuiesce: 9, quiesceIntegrity: "chokepoint-only", blueTouched: true, restorePointId: "rp-1", updatedAt: "t1" });
    // undefined fields are left alone; the status still moves
    await runs.updateState({ id: "run-1", status: "VERIFYING", updatedAt: "t2" });
    const [row] = await kernel.run((db) => db.selectFrom("migration_runs").selectAll().where("id", "=", "run-1").execute());
    assert.deepEqual(
      [row?.status, row?.revision_seq_at_quiesce, row?.quiesce_integrity, row?.blue_touched, row?.restore_point_id, row?.updated_at],
      ["VERIFYING", 9, "chokepoint-only", 1, "rp-1", "t2"]
    );
    assert.deepEqual(await runs.findNonTerminalForSite("s"), { id: "run-1", status: "VERIFYING" });

    await ledger.appendInterruptedRow({ siteId: "s", migrationRunId: "run-1" });
    await ledger.appendInterruptedRow({ siteId: "s", migrationRunId: "run-1" });
    const interrupted = (await ledger.query({ kind: "migration.interrupted", limit: 5 })).items;
    assert.equal(interrupted.length, 1);
    assert.equal(interrupted[0]?.outcome, "blocked_pending_recovery");

    await runs.markResolved({ id: "run-1" });
    assert.equal(await runs.findNonTerminalForSite("s"), null);
  } finally {
    await kernel.close();
  }
});
