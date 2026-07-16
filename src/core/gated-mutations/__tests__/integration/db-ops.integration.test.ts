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
