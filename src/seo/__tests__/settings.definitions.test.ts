import assert from "node:assert/strict";
import test from "node:test";

import { InMemoryPrincipalRepo } from "@jini-ai/cms/identity";
import { InMemorySettingsRepo } from "../../features/settings";
import { ensureSeoSettingDefinitions } from "../settings";

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

const clock = { nowIso: () => "2026-07-13T00:00:00.000Z" };
let idCounter = 0;
const ids = { newId: () => `seo-def-id-${++idCounter}` };
const alwaysAllow = async () => ({ allowed: true, reason: "matched" });

test("ensureSeoSettingDefinitions: idempotent — calling twice registers exactly 8 definitions, not 16", async () => {
  const settingsRepo = new InMemorySettingsRepo();
  const deps = { settingsRepo, clock, ids, authorize: alwaysAllow, principals: new InMemoryPrincipalRepo([]) };
  const input = { workspaceId: "workspace-1", systemPrincipalId: "system-seo" };

  await ensureSeoSettingDefinitions(deps, input);
  const firstPass = await settingsRepo.listActiveDefinitions({ workspaceId: "workspace-1" });
  const seoDefsFirst = firstPass.filter((d) => d.namespace === "site.seo");
  assert.equal(seoDefsFirst.length, 8);

  await ensureSeoSettingDefinitions(deps, input);
  const secondPass = await settingsRepo.listActiveDefinitions({ workspaceId: "workspace-1" });
  const seoDefsSecond = secondPass.filter((d) => d.namespace === "site.seo");
  assert.equal(seoDefsSecond.length, 8, "rerun must not double-register");
});
