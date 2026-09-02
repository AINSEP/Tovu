import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { computeBlobStorageKey } from "@jini-ai/cms/media";

import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";

/**
 * @file Regression coverage for the production incident this fix closes: `content.seed.db` ships
 * real `media`/`asset_blobs` ROWS on first boot, but until this fix nothing shipped the BYTES those
 * rows' `storage_key`s point at — confirmed live on `tovu.fly.dev/admin/media` (real rows, zero
 * files, every preview 500ing).
 *
 * This exercises the REAL composition-root entry point (`createSqliteRouteDeps`) end to end — the
 * isolated unit is covered by `features/media/__tests__/hydrate-blob-store-from-seed.test.ts`.
 * Mirrors `hydrate-content-db-boot.integration.test.ts`'s exact shape for the DB half of this same
 * fix (isolated site dir + isolated stock root via `TOVU_SITE_DIR`/`TOVU_STOCK_CONTENT_SEED_DIR`,
 * the same env var pair `builtInSeedUploadsDir()` shares with `builtInContentSeedDbPath()` by
 * design — see that function's own doc for why it is not a second env var).
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
    deps.blobHydrationReady,
  ]).catch(() => undefined);
}

function makeIsolatedSite(): { siteDir: string; siteName: string; stockRoot: string } {
  const siteDir = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-hydrate-blob-integration-site-"));
  const stockRoot = fs.mkdtempSync(path.join(os.tmpdir(), "tovu-hydrate-blob-integration-stock-"));
  return { siteDir, siteName: path.basename(siteDir), stockRoot };
}

/** Writes one stock blob file under `stockRoot/siteName/uploads/ws/{workspaceId}/blobs/{shard}/{sha256}`. */
function writeStockBlob(
  stockRoot: string,
  siteName: string,
  input: { workspaceId: string; bytes: Uint8Array }
): { storageKey: string; sha256: string } {
  const sha256 = createHash("sha256").update(input.bytes).digest("hex");
  const storageKey = computeBlobStorageKey({ workspaceId: input.workspaceId, sha256 });
  const filePath = path.join(stockRoot, siteName, "uploads", ...storageKey.split("/"));
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, input.bytes);
  return { storageKey, sha256 };
}

/** Runs `fn` with `TOVU_SITE_DIR`/`TOVU_STOCK_CONTENT_SEED_DIR`/`TOVU_CONTENT_DB` set, then restores them. */
function withHydrationEnv<T>(vars: { siteDir: string; stockRoot: string }, fn: () => T): T {
  const originalSiteDir = process.env.TOVU_SITE_DIR;
  const originalStockRoot = process.env.TOVU_STOCK_CONTENT_SEED_DIR;
  const originalContentDb = process.env.TOVU_CONTENT_DB;
  process.env.TOVU_SITE_DIR = vars.siteDir;
  process.env.TOVU_STOCK_CONTENT_SEED_DIR = vars.stockRoot;
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

test("first boot hydrates the live blob store from the stock seed payload — the exact bytes are readable through the real blobStore", async () => {
  const { siteDir, siteName, stockRoot } = makeIsolatedSite();
  const workspaceId = `ws-${randomUUID()}`;
  const bytes = new TextEncoder().encode("stock seed image bytes, wired through real boot");
  const { storageKey } = writeStockBlob(stockRoot, siteName, { workspaceId, bytes });

  try {
    const deps = withHydrationEnv({ siteDir, stockRoot }, () => createSqliteRouteDeps());

    const result = await deps.blobHydrationReady;
    assert.equal(result?.status, "seeded");
    assert.equal(result?.copied, 1);

    assert.equal(await deps.blobStore.exists({ storageKey }), true);
    assert.deepEqual(Buffer.from(await deps.blobStore.get({ storageKey })), Buffer.from(bytes));

    await drainBootReadiness(deps);
  } finally {
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.rmSync(stockRoot, { recursive: true, force: true });
  }
});

test("REGRESSION: a second boot never overwrites a blob the live store already has — production bytes survive", async () => {
  const { siteDir, siteName, stockRoot } = makeIsolatedSite();
  const workspaceId = `ws-${randomUUID()}`;
  const seedBytes = new TextEncoder().encode("stock seed bytes — must never land here on a second boot");
  const { storageKey, sha256 } = writeStockBlob(stockRoot, siteName, { workspaceId, bytes: seedBytes });

  try {
    // First boot: hydrates the seed blob into the live store.
    const firstBootDeps = withHydrationEnv({ siteDir, stockRoot }, () => createSqliteRouteDeps());
    await drainBootReadiness(firstBootDeps);
    assert.equal(await firstBootDeps.blobStore.exists({ storageKey }), true);

    // Simulates real production activity after the first boot: an operator's own upload that
    // happens to land at the SAME content-addressed key (e.g. a re-upload of the exact same file).
    const realBytes = new TextEncoder().encode("real production bytes written after first boot");
    await firstBootDeps.blobStore.put({ workspaceId, sha256, bytes: realBytes });

    // Second boot against the SAME site dir (a redeploy against the same mounted volume).
    const secondBootDeps = withHydrationEnv({ siteDir, stockRoot }, () => createSqliteRouteDeps());
    const result = await secondBootDeps.blobHydrationReady;
    assert.equal(result?.status, "already-present");
    assert.equal(result?.copied, 0);

    assert.deepEqual(
      Buffer.from(await secondBootDeps.blobStore.get({ storageKey })),
      Buffer.from(realBytes),
      "a blob written after the first boot must survive a second boot untouched — hydration must never overwrite it"
    );

    await drainBootReadiness(secondBootDeps);
  } finally {
    fs.rmSync(siteDir, { recursive: true, force: true });
    fs.rmSync(stockRoot, { recursive: true, force: true });
  }
});
