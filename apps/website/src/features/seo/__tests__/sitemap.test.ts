import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo, type PostRecord } from "../../post/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { OriginRegistry } from "@jini-ai/http-kit/verified-origin";
import { resolveConfiguredOrigin } from "../../origin/index.js";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { registerConfiguredOrigin, SqliteOriginSettingRepo } from "#src/platform/db/sqlite/origin-repo.sqlite";
import { ensureSeoSettingDefinitions } from "../settings.js";
import { createSitemapService } from "@jini-ai/cms/seo";
import { createSeoDeps } from "../index.js";
import { buildPostRecord } from "#src/features/post/__tests__/post-record.fixture";

/** Real SQLite configured-origin chain stays host-owned; portable cases moved to Jini/packages/cms/src/seo/__tests__/sitemap.test.ts. */

const WORKSPACE = "workspace-sitemap-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `sitemap-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

function post(overrides: Partial<PostRecord>): PostRecord {
  return buildPostRecord({
    id: "a",
    workspaceId: WORKSPACE,
    title: "Post",
    slug: "post",
    bodyJson: { type: "doc", content: [] },
    status: "published",
    kind: "post",
    updatedAt: "2026-07-13T00:00:00.000Z",
    version: 1,
    seoExtJson: null,
    ...overrides,
  });
}


async function makeDeps(posts: PostRecord[]) {
  const postRepo = new InMemoryPostRepo(posts);
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });

  return {
    postRepo,
    settingsRepo,
    media: {
      mediaRepo: new InMemoryMediaRepo({}, { initialRows: [] }),
      assetRenditionRepo: new InMemoryAssetRenditionRepo({}, { initialRows: [] }),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo({}, { initialRows: [] }),
    },
    clock,
  };
}

/**
 * Prod-shaped end-to-end pair (2026-09-18; design note:
 * `ADS-memory/reports/2026-09-18-public-origin-registration-design.md`). No fake origin registry —
 * the REAL chain, under `TOVU_RUNTIME_MODE=production`:
 *
 *   TOVU_PUBLIC_URL -> resolveConfiguredOrigin -> registerConfiguredOrigin -> real sqlite row
 *                   -> SqliteOriginSettingRepo -> OriginRegistry -> resolveWorkspaceOrigin
 *                   -> buildSitemap
 *
 * Every other origin assertion in this file stubs `canonicalOrigin`, which cannot catch a break in
 * the registration or persistence half — and the registration half is exactly what did not exist
 * before this change. `:memory:` DB only; nothing here touches a real site's content.db.
 */
async function sitemapFromRegisteredOrigin(configuredUrl: string | undefined) {
  const db = openContentDb(":memory:");
  const configured = resolveConfiguredOrigin(
    { now: "2026-09-18T00:00:00.000Z" },
    { env: configuredUrl === undefined ? {} : { TOVU_PUBLIC_URL: configuredUrl }, warn: () => {} }
  );
  if (configured) await registerConfiguredOrigin({ db, workspaceId: WORKSPACE, origin: configured });

  const deps = {
    ...(await makeDeps([post({ id: "a", slug: "published-visible", status: "published" })])),
    originRegistry: new OriginRegistry({ repo: new SqliteOriginSettingRepo(db) }),
  };
  const seoDeps = createSeoDeps({ deps: { ...deps.media, ...deps } }, {});
  return createSitemapService({ deps: seoDeps }, {}).buildSitemap({ workspaceId: WORKSPACE }, {});
}

async function inProductionMode<T>(run: () => Promise<T>): Promise<T> {
  const previous = process.env.TOVU_RUNTIME_MODE;
  process.env.TOVU_RUNTIME_MODE = "production";
  try {
    return await run();
  } finally {
    if (previous === undefined) delete process.env.TOVU_RUNTIME_MODE;
    else process.env.TOVU_RUNTIME_MODE = previous;
  }
}

test("buildSitemap end-to-end: with TOVU_PUBLIC_URL configured, loc is absolute in production (2026-09-18)", async () => {
  const entries = await inProductionMode(() => sitemapFromRegisteredOrigin("https://tovu.fly.dev"));
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.loc, "https://tovu.fly.dev/published-visible");
});

test("buildSitemap end-to-end: with nothing configured, loc stays a safe relative path in production -- never localhost", async () => {
  const entries = await inProductionMode(() => sitemapFromRegisteredOrigin(undefined));
  assert.equal(entries.length, 1);
  assert.equal(entries[0]!.loc, "/published-visible", "an unregistered origin must fail closed to a relative path");
  assert.ok(!entries[0]!.loc.includes("localhost"), "loc must never contain localhost");
  assert.ok(!entries[0]!.loc.includes("://"), "loc must not be absolute when no origin is registered");
});
