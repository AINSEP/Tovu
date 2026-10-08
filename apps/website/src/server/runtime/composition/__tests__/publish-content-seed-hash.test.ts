import assert from "node:assert/strict";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

import { SqliteMenuRepo } from "#src/features/navigation/repo.sqlite";
import { SqlitePostRepo } from "#src/features/post/index";
import { buildPublishContentCatalog, resetPublishContentContributorsForTests } from "#src/features/publish-content/type-registry";
import type { PublishContentDeps } from "#src/features/publish-content/type-registry";
import type { RedirectsWriteDeps } from "@jini-ai/cms/redirects";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { contentKernel } from "#src/platform/db/content-kernel";
import { prepareContentStore } from "#src/platform/db/prepare-content-store";
import { seededWorkspace, seededPosts, seededPresentation } from "#src/server/runtime/configuration/seed";
import { createFakeClock } from "#src/__tests__/support/fake-clock";

import { installFirstPartyPublishContentTypes } from "../publish-content-manifest.js";
import { createSqlitePublishContentSeedHash } from "../publish-content-seed-hash.js";

/**
 * @file D1 against a hermetic SQLite seed built with the real content seeder and menu repo.
 * The dev site's binary seed is not present in every checkout. A "live" `content.db` is hydrated from
 * the same file exactly the way `hydrateContentDbFromSeed()` does it (a plain copy, then the
 * ordinary migrating `openContentDb()`), and the seed lookup must answer the live row's own
 * `inspect()` hash for an untouched row — and stop matching the moment the live row is edited.
 */

const WORKSPACE = "workspace-local";
const clock = createFakeClock({ startIso: "2026-09-24T00:00:00.000Z" });
const idGen = { newId: () => "id-1" };

async function hydrateLive(t: { after(fn: () => void): void }) {
  const dir = mkdtempSync(join(tmpdir(), "seed-hash-live-"));
  let liveDb: ReturnType<typeof openContentDb> | undefined;
  t.after(() => {
    liveDb?.$client.close();
    rmSync(dir, { recursive: true, force: true });
  });
  const seedPath = join(dir, "content.seed.db");
  const seedDb = openContentDb(seedPath);
  try {
    const page = seededPosts.find((post) => post.id === "post-themes");
    assert.ok(page, "the source seed contains post-themes");
    await prepareContentStore(contentKernel(seedDb), { seed: {
      workspace: seededWorkspace, posts: [{ ...page, kind: "page" }], presentation: seededPresentation,
    } });
    await new SqliteMenuRepo(seedDb).save({
      id: "menu-header-nav", workspaceId: WORKSPACE, slug: "header-nav", title: "Header Nav",
      status: "published", doc: { type: "menu", version: 1, items: [] }, locations: [],
      updatedAt: clock.nowIso(), version: 1,
    });
  } finally {
    // Flush the WAL before copying, exactly as a closed shipped seed is copied at boot.
    seedDb.$client.close();
  }
  const livePath = join(dir, "content.db");
  copyFileSync(seedPath, livePath);
  const db = liveDb = openContentDb(livePath);
  const menuRepo = new SqliteMenuRepo(db);
  const liveDeps: PublishContentDeps = {
    workspaceId: WORKSPACE,
    clock,
    idGen,
    ports: { post: { repo: new SqlitePostRepo(db) }, menu: { repo: menuRepo, bindingRepo: undefined as never } },
  };
  return { db, liveDeps, menuRepo, seedPath, handlers: buildPublishContentCatalog(liveDeps).handlerByType };
}

function seedLookup(seedPath: string) {
  return createSqlitePublishContentSeedHash({
    seedDbPath: seedPath,
    workspaceId: WORKSPACE,
    clock,
    idGen,
    redirectsWriteDeps: {} as RedirectsWriteDeps,
  });
}

test("seed lookup: an untouched live header-nav and page hash exactly as the seed does", async (t) => {
  resetPublishContentContributorsForTests();
  installFirstPartyPublishContentTypes();
  const { handlers, seedPath } = await hydrateLive(t);
  const getSeedHash = seedLookup(seedPath);

  const liveMenu = await handlers.get("menu")!.inspect("menu-header-nav");
  assert.ok(liveMenu, "precondition: the seed ships menu-header-nav");
  assert.equal(await getSeedHash({ entityType: "menu", entityId: "menu-header-nav" }), liveMenu.hash);

  const livePage = await handlers.get("page")!.inspect("post-themes");
  assert.ok(livePage, "precondition: the seed ships page post-themes");
  assert.equal(await getSeedHash({ entityType: "page", entityId: "post-themes" }), livePage.hash);
});

test("seed lookup: a live row edited since seed no longer matches, and an id the seed lacks answers null", async (t) => {
  resetPublishContentContributorsForTests();
  installFirstPartyPublishContentTypes();
  const { menuRepo, handlers, seedPath } = await hydrateLive(t);
  const getSeedHash = seedLookup(seedPath);

  const menu = await menuRepo.findById({ workspaceId: WORKSPACE, id: "menu-header-nav" });
  assert.ok(menu);
  await menuRepo.save({ ...menu, title: `${menu.title} (edited on live)`, version: menu.version + 1 });
  const edited = await handlers.get("menu")!.inspect("menu-header-nav");

  assert.notEqual(await getSeedHash({ entityType: "menu", entityId: "menu-header-nav" }), edited!.hash);
  assert.equal(await getSeedHash({ entityType: "menu", entityId: "menu-not-in-seed" }), null);
  assert.equal(await getSeedHash({ entityType: "no-such-type", entityId: "menu-header-nav" }), null);
});

test("seed lookup: an install that ships no seed answers null for everything", async () => {
  resetPublishContentContributorsForTests();
  installFirstPartyPublishContentTypes();
  const getSeedHash = createSqlitePublishContentSeedHash({
    seedDbPath: join(tmpdir(), "no-such-dir-seed-hash", "content.seed.db"),
    workspaceId: WORKSPACE,
    clock,
    idGen,
    redirectsWriteDeps: {} as RedirectsWriteDeps,
  });
  assert.equal(await getSeedHash({ entityType: "menu", entityId: "menu-header-nav" }), null);
});
