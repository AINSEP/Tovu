import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import test, { after } from "node:test";

import Database from "better-sqlite3";

import { childProcessCoverageEnv } from "#src/contracts/core/child-process-coverage-env";
import { openDatabaseJournalDb } from "#src/platform/db/sqlite/database-journal-db";
import { migrationRuns } from "#src/platform/db/sqlite/database-journal-schema";

const require = createRequire(import.meta.url);

/**
 * @file 2026-09-06 composition-root fix — proves `tovu export` actually runs the
 * `database-migration-reconciliation` scan before crawling a site, mirroring
 * `serve-command-boot-lifecycle.integration.test.ts`'s own "prove the wiring, not just that the
 * function exists" approach for the identical class of gap on the `serve` boot path.
 *
 * Before this fix, `cli/commands/export.ts` never ran `runBootLifecycle`/`buildBootModules` (or
 * this scan directly) at all, so a site left mid-migration by a crash (a real, non-terminal
 * `migration_runs` row in the sidecar `ops/database-journal.db`, ADR-041 §3) would have been
 * exported from possibly-inconsistent data with no warning whatsoever.
 */

const CLI_MAIN = path.resolve(import.meta.dirname, "../../main.ts");
const TSX_LOADER = require.resolve("tsx");

const WORKER_COVERAGE_DIR = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-export-migration-recovery-worker-coverage-"));
after(() => fs.rmSync(WORKER_COVERAGE_DIR, { recursive: true, force: true }));

function runCli(args: string[], timeoutMs = 120000): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", TSX_LOADER, CLI_MAIN, ...args], {
    encoding: "utf8",
    timeout: timeoutMs,
    env: childProcessCoverageEnv(WORKER_COVERAGE_DIR),
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

function mkTempParent(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-cli-export-migration-recovery-"));
}

/** Reads the freshly-`init`'d site's single workspace id via a raw, read-only connection — never
 *  through any code this test is proving, so this stays an independent witness. */
function readWorkspaceId(dbPath: string): string {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT id FROM workspaces LIMIT 1").get() as { id: string } | undefined;
    if (!row) throw new Error(`no workspace row found in ${dbPath}`);
    return row.id;
  } finally {
    db.close();
  }
}

/** Plants a non-terminal `migration_runs` row for `siteId` directly in the sidecar
 *  `ops/database-journal.db` — the same fixture shape a real crash mid-migration leaves behind
 *  (ADR-041 §3). Built via the real schema/opener this feature ships (`openDatabaseJournalDb`,
 *  `migrationRuns`), not hand-rolled SQL, so a schema drift here fails this test's OWN setup rather
 *  than silently proving nothing. */
function plantInterruptedMigration(installDir: string, siteId: string): void {
  const journalPath = path.join(installDir, "ops", "database-journal.db");
  // `tovu init` never creates `ops/` (only the real composition root does, on first boot) — this
  // fixture plants the row BEFORE any boot has run, so it must create the directory itself.
  fs.mkdirSync(path.dirname(journalPath), { recursive: true });
  const journal = openDatabaseJournalDb(journalPath);
  const now = new Date().toISOString();
  journal
    .insert(migrationRuns)
    .values({
      id: "run-interrupted-1",
      siteId,
      dialect: "sqlite",
      status: "APPLYING", // not in MIGRATION_RUN_TERMINAL_STATUSES — must be detected as non-terminal
      createdAt: now,
      updatedAt: now,
    })
    .run();
}

test("tovu export refuses (EXPORT_BLOCKED_PENDING_RECOVERY, exit 7) when a crash-interrupted migration is detected, and writes nothing at all", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const outDir = path.join(parent, "out");

  assert.equal(runCli(["init", installDir]).status, 0);
  const siteId = readWorkspaceId(path.join(installDir, "content.db"));
  plantInterruptedMigration(installDir, siteId);

  const result = runCli(["export", installDir, "--out", outDir]);
  assert.equal(result.status, 7, `stderr: ${result.stderr}`);
  assert.match(result.stderr, /^tovu: EXPORT_BLOCKED_PENDING_RECOVERY:/m);
  assert.equal(
    fs.existsSync(outDir),
    false,
    "a blocked export must write nothing at all — the refusal happens before exportSite() ever runs"
  );
});

test("tovu export against a healthy (no interrupted migration) site is unaffected by the new scan", (t) => {
  const parent = mkTempParent();
  t.after(() => fs.rmSync(parent, { recursive: true, force: true }));
  const installDir = path.join(parent, "site");
  const outDir = path.join(parent, "out");

  assert.equal(runCli(["init", installDir]).status, 0);

  const result = runCli(["export", installDir, "--out", outDir]);
  assert.equal(result.status, 0, `stderr: ${result.stderr}`);
  assert.ok(fs.existsSync(path.join(outDir, "index.html")), "a healthy export must still write its output tree");
});
