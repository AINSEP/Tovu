import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
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

test("every backfill, convert, migrate and cleanup CLI refuses its effective default in an isolated repository", async (t) => {
  const scriptsDir = path.join(REPO_ROOT, "development", "scripts");
  const scripts = fs.readdirSync(scriptsDir).filter((name) => {
    if (!/^(backfill-|convert-|migrate-|cleanup-).*\.ts$/.test(name)) return false;
    const source = fs.readFileSync(path.join(scriptsDir, name), "utf8");
    return /resolveExistingDbPath\(|runAadBackfill\(/.test(source) && /\bmain\(/.test(source);
  });
  // S5 retired the AAD backfills; pin the remaining CLIs so discovery cannot pass vacuously.
  assert.deepEqual(scripts.sort(), [
    "backfill-media-slugs.ts",
    "backfill-reset-admin-password.ts",
    "backfill-slug-collision-defaults.ts",
    "backfill-trashed-items.ts",
    "cleanup-stale-owner-sessions.ts",
    "convert-legacy-doc-pages-to-html.ts",
    "migrate-page-embed-markers.ts",
  ]);
  const scratch = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "backfill-defaults-")));
  t.after(() => fs.rmSync(scratch, { recursive: true, force: true }));
  {
    fs.mkdirSync(path.join(scratch, "development", "scripts"), { recursive: true });
    for (const name of fs.readdirSync(scriptsDir).filter((name) => name.endsWith(".ts"))) {
      fs.copyFileSync(path.join(scriptsDir, name), path.join(scratch, "development", "scripts", name));
    }
    fs.copyFileSync(path.join(REPO_ROOT, "package.json"), path.join(scratch, "package.json"));
    fs.copyFileSync(path.join(REPO_ROOT, "tsconfig.json"), path.join(scratch, "tsconfig.json"));
    fs.symlinkSync(path.join(REPO_ROOT, "node_modules"), path.join(scratch, "node_modules"), "dir");
    fs.symlinkSync(path.join(REPO_ROOT, "apps"), path.join(scratch, "apps"), "dir");
    for (const script of scripts) {
      await t.test(script, () => {
        const result = spawnSync(process.execPath, ["--import", "tsx", path.join(scratch, "development", "scripts", script)], {
          cwd: scratch, encoding: "utf8", timeout: 30_000,
      });
      assert.equal(result.error, undefined, script);
      assert.equal(result.signal, null, script);
      assert.equal(result.status, 1, `${script}: ${result.stdout}${result.stderr}`);
      const missing = path.join(scratch, "infra", "content.db");
      assert.ok(`${result.stdout}${result.stderr}`.includes(missingDbPathMessage(missing)), `${script}: ${result.stdout}${result.stderr}`);
      assert.equal(fs.existsSync(missing), false, script);
      assert.equal(fs.existsSync(path.join(scratch, "sites")), false, `${script} must not create an alternate default database`);
      });
    }
  }
});
