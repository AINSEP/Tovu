import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { missingDbPathMessage } from "../backfill-db-path.js";

/**
 * @file Data-safety proof for `migrate-page-embed-markers.ts` — the two guards every sibling
 * `backfill-*`/`convert-*`/`migrate-*` script in this directory now shares (see
 * `backfill-reset-admin-password.ts`'s own regression tests, the worked example this file follows):
 * a dry run must never migrate the schema or write anything, and a `--db` that does not already
 * exist must fail loudly via `resolveExistingDbPath` rather than silently opening (and migrating) a
 * brand-new empty database.
 *
 * Runs the real script as a child process (`execFileSync`), same reasoning every sibling
 * `development/scripts/*.test.ts` file already gives for its own identical choice: `main()` runs
 * unconditionally at import time (here via `void main();`, uncaught rejections included — see that
 * call site's own lack of a `.catch()` — so a bad `--db` surfaces as a nonzero exit either way), so
 * a child process is the only way to invoke it without also inheriting this test runner's own
 * argv/cwd.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");
const SCRIPT = path.join("development", "scripts", "migrate-page-embed-markers.ts");

function tmpDir(prefix: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

/** Counts real tables in a SQLite file via a fresh read-only connection — never through the
 *  content-db helpers under test, so this stays an independent witness of the file's actual state. */
function countTables(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true, fileMustExist: true });
  try {
    const row = db.prepare("SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'").get() as { n: number };
    return row.n;
  } finally {
    db.close();
  }
}

function runScript(dbPath: string, extraArgs: string[] = []): string {
  return execFileSync("node", ["--import", "tsx", SCRIPT, "--db", dbPath, ...extraArgs], {
    cwd: REPO_ROOT,
    encoding: "utf8",
  });
}

test("migrate-page-embed-markers: a dry run against a not-yet-migrated content.db must not migrate it — asserted on the actual file, not a log line", () => {
  const scratch = tmpDir("migrate-page-embed-markers-nomigrate-");
  const dbPath = path.join(scratch, "content.db");

  // A bare SQLite file with zero tables. Nothing has ever opened this through `openContentDb`, so if
  // the dry-run path calls it unconditionally (the defect), the ENTIRE schema gets created — not a
  // subtle diff, a jump from 0 tables to the full migrated set.
  new Database(dbPath).close();
  assert.equal(countTables(dbPath), 0, "fixture must start with zero tables");
  const bytesBefore = fs.readFileSync(dbPath);

  assert.throws(
    () => runScript(dbPath),
    /Command failed/,
    "a dry run against an unmigrated db must fail loudly (no such table: posts), not silently succeed"
  );

  assert.equal(countTables(dbPath), 0, "dry run must not have created any tables — it must never call migrate()");
  assert.deepEqual(fs.readFileSync(dbPath), bytesBefore, "dry run must not modify the database file at all");

  fs.rmSync(scratch, { recursive: true, force: true });
});

test("migrate-page-embed-markers: a mistyped --db path fails loudly and creates nothing, instead of silently opening an empty database", () => {
  const scratch = tmpDir("migrate-page-embed-markers-missingdb-");
  const missing = path.join(scratch, "content.db"); // deliberately never created

  let stderr = "";
  try {
    runScript(missing);
    assert.fail("expected the script to throw");
  } catch (err) {
    stderr = `${(err as { stderr?: string }).stderr ?? ""}`;
  }
  assert.equal(stderr.includes(missingDbPathMessage(path.resolve(missing))), true, `expected the exact missing-db message. Got:\n${stderr}`);
  // The defect this guards: a typo'd path used to open (and migrate) a brand-new empty db and report
  // a false "no stored Page body carries a retired data-embed-type attribute" instead of the real
  // problem — no such database.
  assert.doesNotMatch(stderr, /no stored Page body carries/);
  assert.equal(fs.existsSync(missing), false, "the script must not have created a database at the missing path");

  fs.rmSync(scratch, { recursive: true, force: true });
});
