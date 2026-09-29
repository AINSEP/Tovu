import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

import { createSiteRouteDeps } from "#src/server/runtime/composition/deps";

import { freshPostgresDatabase } from "#src/platform/db/__tests__/postgres-database";
import { psql } from "#src/platform/db/migration/pg-fixture";
import { bootSiteDir, closeSiteDirBoot } from "../../boot-site-dir.js";
import { initSite } from "../../init-site.js";
import { SITE_META_FILENAME } from "../../site-storage.js";

/**
 * @file R1f (R1d leftover): `bootSiteDir` — the `tovu serve <dir>` / `tovu export <dir>` boot —
 * follows the site's storage choice. A `postgres` site opens through `openSiteStore` (no
 * `content.db` needed or created), resolves its workspace on that store, and hands the store to
 * `createSiteRouteDeps` so one boot opens one pool. Real Postgres, one temp database per file.
 */

const DATABASE = "tovu_r1f_boot_site_dir";
const URL_ENV = "TOVU_R1F_BOOT_SITE_DIR_URL";

let parent: string;
let dir: string;

/** Open connections to the test database (pool closed = 0). */
function connections(): number {
  const result = psql("postgres", `SELECT count(*) FROM pg_stat_activity WHERE datname = '${DATABASE}';`);
  assert.ok(result.ok, result.stderr);
  return Number(result.stdout.trim());
}

before(async () => {
  process.env[URL_ENV] = freshPostgresDatabase(DATABASE);
  parent = fs.mkdtempSync(path.join(os.tmpdir(), "r1f-boot-site-dir-"));
  dir = path.join(parent, "site");
  await initSite({ dir, name: "Postgres Boot Site" });
  const metaPath = path.join(dir, SITE_META_FILENAME);
  const meta = JSON.parse(fs.readFileSync(metaPath, "utf8")) as Record<string, unknown>;
  fs.writeFileSync(metaPath, JSON.stringify({ ...meta, storage: { kind: "postgres", secretRef: { env: URL_ENV } } }, null, 2));
  // A postgres site has no SQLite store; bootSiteDir must not need (or recreate) one.
  for (const name of ["content.db", "content.db-wal", "content.db-shm", "chat.db"]) fs.rmSync(path.join(dir, name), { force: true });
});

after(() => {
  delete process.env[URL_ENV];
  psql("postgres", `DROP DATABASE IF EXISTS ${DATABASE} WITH (FORCE);`);
  fs.rmSync(parent, { recursive: true, force: true });
});

test("bootSiteDir on a postgres site opens the store (migrated, workspace resolved) without a content.db", async () => {
  const boot = await bootSiteDir({ dir });
  try {
    assert.equal(boot.storage.kind, "postgres");
    assert.equal(boot.db, undefined, "no SQLite handle for a postgres site");
    assert.ok(boot.store, "the opened store is handed back");
    assert.ok(boot.workspaceId.length > 0, "the workspace resolved on the postgres store");
    assert.equal(fs.existsSync(path.join(dir, "content.db")), false, "no content.db was created");
    const ledger = psql(DATABASE, "SELECT count(*) FROM public.tovu_migrations;");
    assert.ok(ledger.ok && Number(ledger.stdout.trim()) >= 2, "the content history ran to head");
  } finally {
    await closeSiteDirBoot(boot);
  }
  assert.equal(connections(), 0, "closeSiteDirBoot closed the pool");
});

test("createSiteRouteDeps reuses the store bootSiteDir opened (serve/export pass it as overrides.store)", async () => {
  const boot = await bootSiteDir({ dir });
  try {
    const deps = await createSiteRouteDeps(path.join(dir, "content.db"), {
      store: boot.store,
      db: boot.db,
      workspaceId: boot.workspaceId,
      uploadsDir: path.join(dir, "uploads"),
      themesDir: path.join(dir, "themes"),
      siteBinding: { dir, name: "Postgres Boot Site", dirOverridden: true, switcherCompatible: false },
    });
    assert.equal(deps.contentKernel, boot.store?.content, "the composition runs on the booted store, not a second pool");
    assert.equal(deps.workspaceId, boot.workspaceId);
    await Promise.all([deps.identityReady, deps.settingsReady, deps.siteTitleReady]);
  } finally {
    await closeSiteDirBoot(boot);
  }
  assert.equal(connections(), 0, "nothing else held a connection open");
});

test("bootSiteDir on a postgres site rejects an unknown --workspace and closes the store it opened", async () => {
  await assert.rejects(bootSiteDir({ dir }, { workspaceId: "no-such-workspace" }));
  assert.equal(connections(), 0, "the rejected boot left no connection open");
});

test("createSiteRouteDeps refuses overrides.store without workspaceId (the pair rule covers the store too)", async () => {
  const boot = await bootSiteDir({ dir });
  try {
    await assert.rejects(
      createSiteRouteDeps(path.join(dir, "content.db"), { store: boot.store }),
      /overrides\.db \(or overrides\.store\) and overrides\.workspaceId must be supplied together/
    );
  } finally {
    await closeSiteDirBoot(boot);
  }
});
