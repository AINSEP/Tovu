import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { resolveExistingDbPath, missingDbPathMessage } from "../backfill-db-path.js";

/**
 * @file Regression proof for the 2026-09-02 defect: every AAD backfill script defaulted to
 * `<repo>/infra/content.db`, a path that does not exist. `openContentDb` creates-and-migrates on
 * open, so running any of them without `--db` produced a fresh empty database and then reported
 * "0 row(s) would be migrated" — a convincing all-clear from a security-remediation script that
 * had not looked at the real data at all.
 */

const REPO_ROOT = path.resolve(import.meta.dirname, "../../..");

const SCRIPTS = [
  "backfill-composio-config-aad.ts",
  "backfill-connector-credential-aad.ts",
  "backfill-execution-credential-aad.ts",
  "backfill-media-provider-credential-aad.ts",
  "backfill-site-assistant-credential-aad.ts",
  "backfill-external-mcp-aad.ts",
] as const;

function runExpectingFailure(script: string, dbPath: string): { status: number | null; output: string } {
  try {
    const stdout = execFileSync("node", ["--import", "tsx", path.join("development", "scripts", script), "--db", dbPath], {
      cwd: REPO_ROOT,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { status: 0, output: stdout };
  } catch (error) {
    const err = error as { status?: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? null, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

test("resolveExistingDbPath: returns the resolved path when the database is really there", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-db-path-"));
  const dbPath = path.join(scratch, "content.db");
  fs.writeFileSync(dbPath, "");

  assert.equal(resolveExistingDbPath(dbPath), path.resolve(dbPath));
});

test("resolveExistingDbPath: throws the exact loud message, naming the path it looked for", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-db-path-"));
  const missing = path.join(scratch, "infra", "content.db");

  assert.throws(
    () => resolveExistingDbPath(missing),
    (error: unknown) => {
      assert.ok(error instanceof Error);
      assert.equal(error.message, missingDbPathMessage(path.resolve(missing)));
      assert.match(error.message, /refusing to create one/);
      // The operator must be able to see WHICH path was checked, or the fix is unactionable.
      assert.ok(error.message.includes(path.resolve(missing)));
      return true;
    },
  );
});

test("resolveExistingDbPath: rejects a directory as loudly as a missing file", () => {
  const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-db-path-"));

  assert.throws(() => resolveExistingDbPath(scratch), { message: missingDbPathMessage(path.resolve(scratch)) });
});

for (const script of SCRIPTS) {
  test(`${script}: exits non-zero and creates NOTHING when the database is absent`, () => {
    const scratch = fs.mkdtempSync(path.join(os.tmpdir(), "backfill-db-path-"));
    const missing = path.join(scratch, "infra", "content.db");

    const { status, output } = runExpectingFailure(script, missing);

    assert.notEqual(status, 0, `${script} exited 0 against a nonexistent database`);
    assert.ok(
      output.includes(missingDbPathMessage(path.resolve(missing))),
      `${script} did not emit the exact missing-database message. Got:\n${output}`,
    );
    // The actual defect: a fresh database appearing where the operator pointed at nothing.
    assert.equal(fs.existsSync(missing), false, `${script} CREATED a database at a path that did not exist`);
    // And it must never claim a clean result it never looked for.
    assert.ok(!/would be migrated/.test(output), `${script} reported a migration count without a real database`);
  });
}

/**
 * The guard only ever sees the path a script actually resolves, so a script whose DEFAULT names a
 * database that really exists never reaches it — which is what `backfill-external-mcp-aad.ts` did
 * until 2026-09-06 (it defaulted to `sites/tovu-com/content.db`, a live site database, so a
 * forgotten `--db` ran against production instead of erroring).
 *
 * Asserted against the source text rather than by invoking each script with no `--db`: a regression
 * here would point that invocation at a real database, which is the precise outcome this test
 * exists to forbid. The second assertion keeps the first one meaningful — the shared default is
 * only a guaranteed refusal for as long as nothing is created at it.
 */
test("every AAD backfill script defaults --db to a path this repo never creates", () => {
  for (const script of SCRIPTS) {
    const source = fs.readFileSync(path.join(REPO_ROOT, "development", "scripts", script), "utf8");
    const declaration = /^const DEFAULT_DB_PATH = (.+);$/m.exec(source);
    assert.equal(
      declaration?.[1],
      'path.join(REPO_ROOT, "infra", "content.db")',
      `${script} does not default --db to the deliberately absent infra/content.db — omitting --db must be refused, never run against a real database`,
    );
  }

  assert.equal(
    fs.existsSync(path.join(REPO_ROOT, "infra", "content.db")),
    false,
    "infra/content.db now exists — the shared default is no longer a guaranteed refusal",
  );
});
