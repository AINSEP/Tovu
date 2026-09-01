import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { workspaces } from "#src/platform/db/schema";

/**
 * @file Regression coverage for the container-boot gap: `npm run seed:site`
 * (development/scripts/seed-site.mjs) produces `sites/<site>/content.seed.db`, but nothing wired it
 * to the `content.db` a deployed container actually boots `createSqliteRouteDeps()` against. A fresh
 * volume had neither file connected, so a deploy came up with no site.
 *
 * This exercises the REAL composition-root entry point (`createSqliteRouteDeps`, `src/index.ts`'s
 * own call site) end to end, not just `hydrateContentDbFromSeed()` in isolation — the isolated unit
 * is covered by `db/sqlite/__tests__/hydrate-content-db-from-seed.test.ts`. Before the fix wires
 * `hydrateContentDbFromSeed()` into `createSqliteRouteDeps()`, the first test below fails: no stock
 * seed is ever consulted, and the resulting db only ever has the built-in DEMO workspace, never the
 * seed's own marker row.
 */

/**
 * Awaits the same boot-readiness set `src/index.ts`'s own `main()` awaits before doing anything else
 * past `createSqliteRouteDeps()` — required here for the identical reason that file documents
 * (`seoReady` chained after `settingsReady`, etc.): letting a boot's own background seeding still be
 * in flight when a SECOND `createSqliteRouteDeps()` opens the SAME `content.db` file races
 * independent writers against one SQLite file (observed directly: a `UNIQUE constraint failed:
 * roles.workspace_id, roles.name` from two concurrent identity-seed attempts). Errors are caught, not
 * asserted on, mirroring `index.ts`'s own `.catch()` — a readiness promise rejecting is a logged boot
 * -module failure, never a reason to fail a test about `content.db` hydration itself.
 */
async function drainBootReadiness(deps: ReturnType<typeof createSqliteRouteDeps>): Promise<void> {
  await Promise.all([
    deps.identityReady,
    deps.settingsReady,
    deps.seoReady,
    deps.commentsReady,
    deps.commentsSettingsReady,
    deps.executionSettingsReady,
    deps.settingsUiTabsReady,
    deps.analyticsSettingsReady,
  ]).catch(() => undefined);
}

function makeIsolatedSite(): { siteDir: string; siteName: string; stockRoot: string } {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-hydrate-integration-site-"));
  const stockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-hydrate-integration-stock-"));
  return { siteDir, siteName: path.basename(siteDir), stockRoot };
}

/** Builds a real, migrated content.db at `seedDbPath` carrying one distinctive marker workspace. */
function buildStockSeedDb(seedDbPath: string): void {
  fs.mkdirSync(path.dirname(seedDbPath), { recursive: true });
  const seedDb = openContentDb(seedDbPath);
  seedDb
    .insert(workspaces)
    .values({ id: "seed-marker-workspace", name: "Seed Marker", slug: "seed-marker", createdAt: "2026-01-01T00:00:00.000Z" })
    .run();
  seedDb.$client.close();
}

/** Runs `fn` with TOVU_SITE_DIR / TOVU_STOCK_CONTENT_SEED_DIR / TOVU_CONTENT_DB set, then restores them. */
function withHydrationEnv<T>(vars: { siteDir: string; stockRoot: string }, fn: () => T): T {
  const originalSiteDir = process.env.TOVU_SITE_DIR;
  const originalStockRoot = process.env.TOVU_STOCK_CONTENT_SEED_DIR;
  const originalContentDb = process.env.TOVU_CONTENT_DB;
  process.env.TOVU_SITE_DIR = vars.siteDir;
  process.env.TOVU_STOCK_CONTENT_SEED_DIR = vars.stockRoot;
  // Must be unset: defaultContentDbPath() should fall through to join(siteDir(), "content.db"),
  // which is what a real deployed container relies on (TOVU_SITE_DIR alone, from fly.toml's mount).
  delete process.env.TOVU_CONTENT_DB;
  try {
    return fn();
  } finally {
    if (originalSiteDir === undefined) delete process.env.TOVU_SITE_DIR;
    else process.env.TOVU_SITE_DIR = originalSiteDir;
    if (originalStockRoot === undefined) delete process.env.TOVU_STOCK_CONTENT_SEED_DIR;
    else process.env.TOVU_STOCK_CONTENT_SEED_DIR = originalStockRoot;
    if (originalContentDb === undefined) delete process.env.TOVU_CONTENT_DB;
    else process.env.TOVU_CONTENT_DB = originalContentDb;
  }
}

test("first boot with no content.db hydrates it from the stock seed before opening it — the seed's marker workspace is present", async () => {
  const { siteDir, siteName, stockRoot } = makeIsolatedSite();
  const seedDbPath = path.join(stockRoot, siteName, "content.seed.db");
  buildStockSeedDb(seedDbPath);
  const dbPath = path.join(siteDir, "content.db");

  try {
    const deps = withHydrationEnv({ siteDir, stockRoot }, () => createSqliteRouteDeps());

    assert.ok(fs.existsSync(dbPath), "hydration must have created content.db at the site's default path");
    const found = await deps.workspaceRepo.findById("seed-marker-workspace");
    assert.ok(found, "the stock seed's marker workspace must be present — proof the seed file, not just the built-in demo data, was used");
    assert.equal(found?.name, "Seed Marker");

    await drainBootReadiness(deps);
  } finally {
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.rmSync(stockRoot, { recursive: true, force: true });
  }
});

test("REGRESSION: a second boot against an already-hydrated site never re-copies the seed — production edits survive", async () => {
  const { siteDir, siteName, stockRoot } = makeIsolatedSite();
  const seedDbPath = path.join(stockRoot, siteName, "content.seed.db");
  buildStockSeedDb(seedDbPath);
  const dbPath = path.join(siteDir, "content.db");

  try {
    // First boot: hydrates from the seed. Fully drained before touching the file again — see
    // drainBootReadiness's own doc for the concurrent-writer hazard this closes.
    const firstBootDeps = withHydrationEnv({ siteDir, stockRoot }, () => createSqliteRouteDeps());
    await drainBootReadiness(firstBootDeps);
    assert.ok(fs.existsSync(dbPath));

    // Simulates real production activity after the first boot: a workspace the seed never had.
    const liveDb = openContentDb(dbPath);
    liveDb
      .insert(workspaces)
      .values({ id: "post-boot-production-workspace", name: "Written After Boot", slug: "post-boot", createdAt: "2026-02-02T00:00:00.000Z" })
      .run();
    liveDb.$client.close();

    // Overwrite the STOCK seed itself between boots, the way a redeploy's image can ship an updated
    // (now stale-relative-to-production) seed — if the second boot re-hydrated, this marker would
    // silently disappear.
    fs.rmSync(seedDbPath);
    buildStockSeedDb(seedDbPath);

    // Second boot against the SAME site dir.
    const secondBootDeps = withHydrationEnv({ siteDir, stockRoot }, () => createSqliteRouteDeps());

    const survived = await secondBootDeps.workspaceRepo.findById("post-boot-production-workspace");
    assert.ok(survived, "a workspace written after the first boot must still exist after a second boot — a redeploy must never clobber live production data");
    assert.equal(survived?.name, "Written After Boot");

    await drainBootReadiness(secondBootDeps);
  } finally {
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.rmSync(stockRoot, { recursive: true, force: true });
  }
});
