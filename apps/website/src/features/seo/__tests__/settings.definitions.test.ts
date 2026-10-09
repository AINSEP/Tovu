import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/user-management/server";
import { createSeoFeaturedImagePort } from "../index.js";
import { InMemoryMediaRepo } from "../../media/index.js";
import { InMemorySettingsRepo } from "../../settings/index.js";
import { ensureSeoSettingDefinitions, getSeoSettings, setSeoSettings } from "../settings.js";

/**
 * @file T020 — failing-first certification: `ensureSeoSettingDefinitions` is
 * idempotent — call twice, assert exactly the same fixed number of
 * `setting_definitions` rows exist, not double.
 *
 * Disclosed deviation: ADR-PIPE-008/tasks.md prose repeatedly says "7" (the
 * conceptual `SeoSettings` field count), but Decision §3's own concrete
 * mapping table lists 8 registered ledger keys (`defaultRobots` decomposes
 * into `default_robots_noindex` + `default_robots_nofollow`). Registering
 * only 7 keys would silently drop one of `defaultRobots`'s two booleans and
 * break its round trip — this test asserts the number the concrete table
 * actually requires (8), not the imprecise prose count. Flagged in the
 * implementation report, not silently reconciled.
 */

const clock = { nowIso: () => "2026-07-13T00:00:00.000Z", nowMs: () => Date.parse("2026-07-13T00:00:00.000Z") };
let idCounter = 0;
const ids = { newId: () => `seo-def-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

test("ensureSeoSettingDefinitions: idempotent — calling twice registers exactly 8 definitions, not 16", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  const deps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: new InMemoryPrincipalRepo({}, { initialRows: [] }),
    media: { featuredImage: createSeoFeaturedImagePort({ deps: { mediaRepo: new InMemoryMediaRepo({}, { initialRows: [] }) } }, {}) },
  };
  const input = { workspaceId: "workspace-1", systemPrincipalId: "system-seo" };

  await ensureSeoSettingDefinitions(deps, input);
  const firstPass = await settingsRepo.listActiveDefinitions({ workspaceId: "workspace-1" });
  const seoDefsFirst = firstPass.filter((d) => d.namespace === "site.seo");
  assert.equal(seoDefsFirst.length, 8);
  assert.deepEqual(seoDefsFirst.map(d => d.key).sort(), [
    "default_description", "default_og_image", "default_robots_nofollow", "default_robots_noindex",
    "robots_rules", "sitemap_enabled", "title_template", "twitter_site",
  ]);
  const snapshot = structuredClone(seoDefsFirst);
  await setSeoSettings(deps, { workspaceId: "workspace-1", callerPrincipalId: "system-seo",
    patch: { titleTemplate: "%s | configured site", sitemapEnabled: false } });
  const configured = await getSeoSettings(deps, { workspaceId: "workspace-1" });

  await ensureSeoSettingDefinitions(deps, input);
  const secondPass = await settingsRepo.listActiveDefinitions({ workspaceId: "workspace-1" });
  const seoDefsSecond = secondPass.filter((d) => d.namespace === "site.seo");
  assert.equal(seoDefsSecond.length, 8, "rerun must not double-register");
  assert.deepEqual(seoDefsSecond, snapshot, "rerun must preserve identities and definition metadata");
  assert.deepEqual(await getSeoSettings(deps, { workspaceId: "workspace-1" }), configured);
  assert.equal(configured.titleTemplate, "%s | configured site");
  assert.equal(configured.sitemapEnabled, false);
});
