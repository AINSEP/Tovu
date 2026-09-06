import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import Database from "better-sqlite3";

import { openContentDb } from "../../../db/sqlite/content-db.js";
import { ValidationError } from "../../errors.js";
import { readSiteDir } from "../../read-site-dir.js";
import { planRepairSite, repairSite, SiteRepairRefusedError } from "../../repair-site.js";
import { runtimeSchemaVersion } from "../../schema-guard.js";
import { listSites } from "../../site-registry.js";

/**
 * @file `repairSite`/`planRepairSite` — TDD certification, integration tier.
 *
 * Every fixture here is a throwaway directory built under `os.tmpdir()` via `fs.mkdtempSync` —
 * never `apps/website/sites/tovu-com/`, the real site this feature exists to repair (mirrors
 * `init-site.integration.test.ts`'s and `duplicate-site.integration.test.ts`'s own fixture
 * discipline). Each assertion is written to fail under the specific regression it targets: "no
 * error thrown" alone would pass a refusal that silently wrote a wrong stamp, so every refusal case
 * also asserts the target directory was left byte-for-byte untouched, not just that SOME error was
 * thrown.
 */

function mkTempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), "tovu-repair-site-"));
}

/** A real, fully-migrated content.db — the happy-path fixture. `openContentDb` on a fresh tmp path
 *  creates + migrates + closes cleanly, exactly like a real site's db that was never given markers. */
function writeMigratedDb(dir: string): void {
  const db = openContentDb(path.join(dir, "content.db"));
  db.$client.close();
}

/** A bare sqlite file with an unrelated table but no `__drizzle_migrations` at all — a db that has
 *  literally never been opened through `openContentDb`/Drizzle's migrator. */
function writeUnmigratedDb(dir: string): void {
  const sqlite = new Database(path.join(dir, "content.db"));
  sqlite.exec("CREATE TABLE unrelated (id INTEGER PRIMARY KEY)");
  sqlite.close();
}

/** A migrated db with one extra `__drizzle_migrations` row whose `created_at` matches no journal
 *  entry this runtime bundles — the exact divergent-lineage shape
 *  `content-db-schema-guard.unit.test.ts` already certifies for the sibling boot guard. */
function writeDivergedDb(dir: string): void {
  const dbPath = path.join(dir, "content.db");
  const db = openContentDb(dbPath);
  db.$client.exec(`INSERT INTO __drizzle_migrations (hash, created_at) VALUES ('fabricated-hash', 9999999999999)`);
  db.$client.close();
}

test("repairSite(): happy path — derives the schema stamp from the db's own migration history and writes markers identical in shape to initSite's", () => {
  const dir = mkTempDir();
  writeMigratedDb(dir);
  const runtime = runtimeSchemaVersion();

  const result = repairSite({ dir });

  assert.equal(result.dir, dir);
  assert.match(result.siteId, /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
  assert.equal(result.schemaVersion, runtime.index, "the stamped version must be the db's OWN applied migration index, which for a freshly-migrated db equals the runtime's");
  assert.equal(result.schemaTag, runtime.tag);

  // The written files must be independently readable by the SAME validator `serve` trusts — not
  // just "some JSON exists at these paths".
  const { config, meta } = readSiteDir({ dir });
  assert.equal(config.name, path.basename(dir), "config.json.name defaults to the target's basename, same as initSite's own default");
  assert.equal(config.domain, null);
  assert.equal(config.port, null);
  assert.equal(meta.siteId, result.siteId);
  assert.equal(meta.schemaVersion, runtime.index);
  assert.equal(meta.schemaTag, runtime.tag);
  assert.notEqual(meta.templateId, "starter", "a repaired site never went through readTemplate — its templateId must be honestly unknown, not guessed");
});

test("repairSite(): a repaired site is indistinguishable from a freshly-initSite'd one to listSites()", () => {
  const parent = mkTempDir();
  const sitesRoot = path.join(parent, "sites");
  fs.mkdirSync(sitesRoot);
  const siteDir = path.join(sitesRoot, "my-repaired-site");
  fs.mkdirSync(siteDir);
  writeMigratedDb(siteDir);

  repairSite({ dir: siteDir, name: "My Repaired Site" });

  const sites = listSites({ cwd: parent, env: {} });
  assert.equal(sites.length, 1, "listSites must recognize the repaired directory as a real site");
  assert.equal(sites[0].name, "my-repaired-site");
  assert.equal(sites[0].dir, siteDir);
  assert.equal(sites[0].displayName, "My Repaired Site");
});

test("repairSite(): refuses when a marker file already exists, and never overwrites it", () => {
  const dir = mkTempDir();
  writeMigratedDb(dir);
  const sentinelConfig = JSON.stringify({ name: "do-not-touch", domain: null, port: null });
  fs.writeFileSync(path.join(dir, "config.json"), sentinelConfig);

  assert.throws(
    () => repairSite({ dir }),
    (err: unknown) => {
      assert.ok(err instanceof SiteRepairRefusedError);
      assert.equal(err.reason, "MARKER_ALREADY_EXISTS");
      assert.match(err.message, /already has config\.json/);
      return true;
    }
  );

  assert.equal(fs.readFileSync(path.join(dir, "config.json"), "utf8"), sentinelConfig, "the pre-existing config.json must be byte-for-byte untouched");
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false, "no .site-meta.json must be written when the repair is refused");
});

test("repairSite(): refuses when content.db is missing, and writes nothing", () => {
  const dir = mkTempDir();

  assert.throws(
    () => repairSite({ dir }),
    (err: unknown) => {
      assert.ok(err instanceof SiteRepairRefusedError);
      assert.equal(err.reason, "CONTENT_DB_MISSING");
      return true;
    }
  );

  assert.deepEqual(fs.readdirSync(dir), [], "an empty target directory must stay empty after a refused repair");
});

test("repairSite(): refuses when content.db has never been migrated, and writes nothing", () => {
  const dir = mkTempDir();
  writeUnmigratedDb(dir);

  assert.throws(
    () => repairSite({ dir }),
    (err: unknown) => {
      assert.ok(err instanceof SiteRepairRefusedError);
      assert.equal(err.reason, "CONTENT_DB_UNMIGRATED");
      return true;
    }
  );

  assert.equal(fs.existsSync(path.join(dir, "config.json")), false);
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false);
});

test("repairSite(): refuses a divergent schema lineage rather than guessing, and writes nothing — the load-bearing case this whole feature exists to get right", () => {
  const dir = mkTempDir();
  writeDivergedDb(dir);

  assert.throws(
    () => repairSite({ dir }),
    (err: unknown) => {
      assert.ok(err instanceof SiteRepairRefusedError);
      assert.equal(err.reason, "CONTENT_DB_DIVERGED");
      assert.match(err.message, /divergent schema lineage/);
      return true;
    }
  );

  assert.equal(fs.existsSync(path.join(dir, "config.json")), false, "a divergent lineage must never produce a stamped config.json");
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false, "a divergent lineage must NEVER produce a .site-meta.json stamp — this is the exact failure mode this feature must not have");
});

test("repairSite(): refuses a target that is not an existing directory", () => {
  const parent = mkTempDir();
  const missing = path.join(parent, "does-not-exist");

  assert.throws(
    () => repairSite({ dir: missing }),
    (err: unknown) => {
      assert.ok(err instanceof SiteRepairRefusedError);
      assert.equal(err.reason, "NOT_A_DIRECTORY");
      return true;
    }
  );
});

test("repairSite(): an invalid --name is a ValidationError, checked before anything is written", () => {
  const dir = mkTempDir();
  writeMigratedDb(dir);

  assert.throws(() => repairSite({ dir, name: "   " }), ValidationError);
  assert.equal(fs.existsSync(path.join(dir, "config.json")), false, "an invalid name must not leave a partial write behind");
});

test("planRepairSite(): previews the exact plan repairSite() would write, without writing anything", () => {
  const dir = mkTempDir();
  writeMigratedDb(dir);
  const runtime = runtimeSchemaVersion();

  const plan = planRepairSite({ dir, name: "Preview Me" });

  assert.equal(plan.dir, dir);
  assert.equal(plan.config.name, "Preview Me");
  assert.equal(plan.meta.schemaVersion, runtime.index);
  assert.equal(plan.meta.schemaTag, runtime.tag);
  assert.equal(fs.existsSync(path.join(dir, "config.json")), false, "planRepairSite must never write — it is a preview only");
  assert.equal(fs.existsSync(path.join(dir, ".site-meta.json")), false);
});
