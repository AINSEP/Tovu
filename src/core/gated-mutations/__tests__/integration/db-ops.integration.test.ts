import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb } from "../../../../infra/sqlite/content-db";
import { SqliteDbOpsAdapter } from "../../../../infra/sqlite/db-ops";
import { evaluatePostgresRestoreCapability } from "../../../../infra/postgres/db-ops";
import { stampWatermarkTx } from "../../watermark";

/**
 * @file SPEC-016 C-007 / REQ-19–REQ-21 — the dialect-neutral `db-ops` restore-point capability
 * surface, SQLite adapter (built now) + Postgres capability-evaluation logic (built now; the full
 * Postgres adapter's actual `pg_dump`/blue-green execution is architecturally deferred per
 * `implementation-outline.md`'s "Postgres adapter deferred — no Postgres adapter exists in code
 * yet" note — see this package's `test-certification.md` Known Gaps for that deferral).
 *
 * Assumed seam design:
 *
 * ```ts
 * // src/core/gated-mutations/ports.ts
 * export interface RestoreCapability {
 *   costClass: "cheap" | "expensive" | "unavailable";
 *   kind: "file-snapshot" | "logical-dump" | "external";
 * }
 * export interface DbOpsPort {
 *   getCapabilities(): Promise<{ restorePoint: RestoreCapability }>;
 *   captureRestorePoint(required: { scopeId: string }): Promise<{ artifactRef: string; watermarkAtCapture: number }>;
 * }
 *
 * // src/infra/sqlite/db-ops.ts
 * export class SqliteDbOpsAdapter implements DbOpsPort {
 *   constructor(deps: { db: ContentDb; filePath: string });
 * }
 *
 * // src/infra/postgres/db-ops.ts (pure evaluation logic only — no live pg client here yet)
 * export interface PostgresRestoreToolingConfig {
 *   pgDumpBinaryPath: string | null;
 *   credentialsPresent: boolean;
 *   targetParametersValid: boolean;
 *   externalPitrConfigured: boolean;
 * }
 * export function evaluatePostgresRestoreCapability(config: PostgresRestoreToolingConfig): RestoreCapability;
 * ```
 */

test("AC-28: a SQLite-backed site's getCapabilities() reports costClass='cheap', kind='file-snapshot'", async () => {
  const db = openContentDb(":memory:");
  const adapter = new SqliteDbOpsAdapter({ db, filePath: ":memory:" });

  const caps = await adapter.getCapabilities();

  assert.equal(caps.restorePoint.costClass, "cheap");
  assert.equal(caps.restorePoint.kind, "file-snapshot");
});

test("AC-30: capturing a restore point for a SQLite-backed site produces a whole-file online-backup copy of content.db, not a partial/logical export", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gated-mutations-db-ops-"));
  const filePath = path.join(tmpDir, "content.db");
  try {
    const db = openContentDb(filePath);
    db.transaction((tx) => {
      stampWatermarkTx({ tx });
      stampWatermarkTx({ tx });
    });

    const adapter = new SqliteDbOpsAdapter({ db, filePath });
    const result = await adapter.captureRestorePoint({ scopeId: "workspace-1" });

    assert.ok(fs.existsSync(result.artifactRef), "capture must produce a real file artifact");
    const copy = new Database(result.artifactRef, { readonly: true });
    const tables = copy
      .prepare("SELECT name FROM sqlite_master WHERE type='table'")
      .all() as Array<{ name: string }>;
    copy.close();
    assert.ok(tables.length > 0, "the artifact must be a whole-file copy containing the full schema, not a partial export");
    assert.equal(result.watermarkAtCapture, 2, "REQ-06: the captured artifact must record the watermark value at capture time");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("AC-29: a Postgres-backed site with no dump/blue-green tooling configured at all reports costClass='unavailable'", () => {
  const caps = evaluatePostgresRestoreCapability({
    pgDumpBinaryPath: null,
    credentialsPresent: false,
    targetParametersValid: false,
    externalPitrConfigured: false,
  });

  assert.equal(caps.costClass, "unavailable");
});

test("AC-33: a Postgres-backed site with pg_dump/blue-green tooling configured and structurally valid reports costClass='expensive', kind='logical-dump'", () => {
  const caps = evaluatePostgresRestoreCapability({
    pgDumpBinaryPath: "/usr/bin/pg_dump",
    credentialsPresent: true,
    targetParametersValid: true,
    externalPitrConfigured: false,
  });

  assert.equal(caps.costClass, "expensive");
  assert.equal(caps.kind, "logical-dump");
});

test("AC-36: a Postgres-backed site with tooling present but non-functional (unresolvable binary path) reports costClass='unavailable', identical to the never-configured case", () => {
  const brokenPath = evaluatePostgresRestoreCapability({
    pgDumpBinaryPath: "/nonexistent/pg_dump",
    credentialsPresent: true,
    targetParametersValid: false, // structurally invalid — e.g. path does not resolve
    externalPitrConfigured: false,
  });
  const neverConfigured = evaluatePostgresRestoreCapability({
    pgDumpBinaryPath: null,
    credentialsPresent: false,
    targetParametersValid: false,
    externalPitrConfigured: false,
  });

  assert.equal(brokenPath.costClass, "unavailable");
  assert.equal(brokenPath.costClass, neverConfigured.costClass);
});

test("AC-37: a site whose only configured restore mechanism is an externally-managed PITR/backup system reports kind='external', costClass='unavailable'", () => {
  const caps = evaluatePostgresRestoreCapability({
    pgDumpBinaryPath: null,
    credentialsPresent: false,
    targetParametersValid: false,
    externalPitrConfigured: true,
  });

  assert.equal(caps.kind, "external");
  assert.equal(caps.costClass, "unavailable");
});

test("REQ-19: getCapabilities() is a pure, side-effect-free static check — calling it twice never mutates observable state", async () => {
  const db = openContentDb(":memory:");
  const adapter = new SqliteDbOpsAdapter({ db, filePath: ":memory:" });

  const first = await adapter.getCapabilities();
  const second = await adapter.getCapabilities();

  assert.deepEqual(first, second);
});

/**
 * @file 2026-07-16 addition — `restoreFromArtifact()`, closing the "ledger-only" gap
 * `server/gated-mutations-composition.ts`'s `buildRestoreHooks` previously disclosed. Verifies
 * the actual restore effect (not just that the call resolves), the atomicity/crash-safety
 * property (no partial state possible), and the `:memory:` no-op path.
 */

test("restoreFromArtifact: swaps content.db's real content to match the captured artifact, and reports restartRequired=true", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gated-mutations-db-ops-restore-"));
  const filePath = path.join(tmpDir, "content.db");
  try {
    const db = openContentDb(filePath);
    db.transaction((tx) => {
      stampWatermarkTx({ tx });
      stampWatermarkTx({ tx }); // watermark = 2 at capture time
    });

    const adapter = new SqliteDbOpsAdapter({ db, filePath });
    const captured = await adapter.captureRestorePoint({ scopeId: "workspace-1" });
    assert.equal(captured.watermarkAtCapture, 2);

    // Mutate further AFTER the capture — this is the state a restore must discard.
    db.transaction((tx) => {
      stampWatermarkTx({ tx });
      stampWatermarkTx({ tx });
      stampWatermarkTx({ tx }); // watermark = 5, post-capture drift
    });

    const restoreResult = await adapter.restoreFromArtifact({ artifactRef: captured.artifactRef });
    assert.equal(restoreResult.restartRequired, true, "a real file-backed site must always require a restart to pick up the swap");

    // Simulates the restart: close the original connection, open a FRESH one at the same path —
    // this is what the running process does not do (by design), but what an operator's restart
    // would. Proves the swap itself was real, not just that the call resolved.
    db.$client.close();
    const reopened = new Database(filePath, { readonly: true });
    const watermarkAfterReopen = reopened
      .prepare("SELECT value FROM database_write_watermark WHERE id = 1")
      .get() as { value: number } | undefined;
    reopened.close();

    assert.ok(watermarkAfterReopen, "the restored file must be a valid, openable database");
    assert.equal(
      watermarkAfterReopen!.value,
      2,
      "the post-capture mutations (watermark 3-5) must be gone — the file must reflect the captured artifact, not the live pre-restore state"
    );
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("restoreFromArtifact: removes stale -wal/-shm sidecars so a fresh boot never tries to replay a mismatched WAL", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gated-mutations-db-ops-restore-wal-"));
  const filePath = path.join(tmpDir, "content.db");
  try {
    const db = openContentDb(filePath); // journal_mode=WAL — produces -wal/-shm sidecars
    db.transaction((tx) => stampWatermarkTx({ tx }));

    const adapter = new SqliteDbOpsAdapter({ db, filePath });
    const captured = await adapter.captureRestorePoint({ scopeId: "workspace-1" });

    // Force a live -wal file to exist at the moment of restore (WAL mode may already have
    // checkpointed it away otherwise) — write directly, this test only needs the file to exist.
    fs.writeFileSync(`${filePath}-wal`, Buffer.from([0, 0, 0, 0]));
    fs.writeFileSync(`${filePath}-shm`, Buffer.from([0, 0, 0, 0]));

    await adapter.restoreFromArtifact({ artifactRef: captured.artifactRef });

    assert.equal(fs.existsSync(`${filePath}-wal`), false, "a stale -wal sidecar must not survive a restore");
    assert.equal(fs.existsSync(`${filePath}-shm`), false, "a stale -shm sidecar must not survive a restore");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("restoreFromArtifact: :memory: mode is a no-op, reports restartRequired=false", async () => {
  const db = openContentDb(":memory:");
  const adapter = new SqliteDbOpsAdapter({ db, filePath: ":memory:" });

  const result = await adapter.restoreFromArtifact({ artifactRef: "/nonexistent/does-not-matter.db" });

  assert.equal(result.restartRequired, false);
});

test("restoreFromArtifact: a missing artifact file throws rather than silently swapping in nothing", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gated-mutations-db-ops-restore-missing-"));
  const filePath = path.join(tmpDir, "content.db");
  try {
    const db = openContentDb(filePath);
    const adapter = new SqliteDbOpsAdapter({ db, filePath });

    await assert.rejects(() => adapter.restoreFromArtifact({ artifactRef: path.join(tmpDir, "does-not-exist.db") }));

    // content.db itself must be untouched by a failed restore attempt.
    assert.ok(fs.existsSync(filePath));
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

test("restoreFromArtifact: never leaves a stray temp file behind on success", async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "gated-mutations-db-ops-restore-tmp-"));
  const filePath = path.join(tmpDir, "content.db");
  try {
    const db = openContentDb(filePath);
    db.transaction((tx) => stampWatermarkTx({ tx }));
    const adapter = new SqliteDbOpsAdapter({ db, filePath });
    const captured = await adapter.captureRestorePoint({ scopeId: "workspace-1" });

    await adapter.restoreFromArtifact({ artifactRef: captured.artifactRef });

    const remaining = fs.readdirSync(tmpDir);
    const strays = remaining.filter((name) => name.includes(".restoring-"));
    assert.deepEqual(strays, [], "the same-directory temp file used for the atomic rename must not survive a successful restore");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});
