import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPostRepo } from "../../features/post/index.js";
import { InMemorySettingsRepo } from "../../features/settings/index.js";
import { InMemoryAssetRenditionRepo, InMemoryMediaRepo, InMemoryTransformDefinitionRepo } from "../../media/index.js";
import { ensureSeoSettingDefinitions, setSeoSettings } from "../settings.js";
import { buildRobots, invalidateSitemapCache } from "../sitemap.js";

/**
 * @file T034 — failing-first unit certification of `buildRobots` (REQ-09,
 * AC-19/20/21, EC-09): `sitemapEnabled:true` -> `Sitemap:` (sitemapUrls
 * non-empty); `false` -> `sitemapUrls: []`.
 */

const WORKSPACE = "workspace-robots-1";
const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `robots-test-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

async function makeDeps() {
  invalidateSitemapCache({ workspaceId: WORKSPACE });
  const postRepo = new InMemoryPostRepo([]);
  const settingsRepo = new InMemorySettingsRepo();
  const settingsDeps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: { findById: async () => null } as never };
  await ensureSeoSettingDefinitions(settingsDeps, { workspaceId: WORKSPACE, systemPrincipalId: "system-seo" });

  return {
    postRepo,
    settingsRepo,
    settingsDeps,
    media: {
      mediaRepo: new InMemoryMediaRepo([]),
      assetRenditionRepo: new InMemoryAssetRenditionRepo([]),
      transformDefinitionRepo: new InMemoryTransformDefinitionRepo([]),
    },
  };
}

test("buildRobots: sitemapEnabled:true advertises a non-empty sitemapUrls", async () => {
  const deps = await makeDeps();
  const policy = await buildRobots(deps, { workspaceId: WORKSPACE });
  assert.ok(policy.sitemapUrls.length > 0);
});

test("buildRobots: sitemapEnabled:false yields an empty sitemapUrls", async () => {
  const deps = await makeDeps();
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { sitemapEnabled: false },
  });

  const policy = await buildRobots(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(policy.sitemapUrls, []);
});

test("buildRobots: carries the configured robotsRules through as-is", async () => {
  const deps = await makeDeps();
  await setSeoSettings(deps.settingsDeps, {
    workspaceId: WORKSPACE,
    callerPrincipalId: "caller-1",
    patch: { robotsRules: [{ userAgent: "*", disallow: ["/admin"] }] },
  });

  const policy = await buildRobots(deps, { workspaceId: WORKSPACE });
  assert.deepEqual(policy.rules, [{ userAgent: "*", disallow: ["/admin"] }]);
});
