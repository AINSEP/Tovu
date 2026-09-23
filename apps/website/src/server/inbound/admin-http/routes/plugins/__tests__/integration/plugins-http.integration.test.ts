import assert from "node:assert/strict";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "#src/server/runtime/composition/app";
import { registerAuthRoutes, requireAdminSession } from "#src/server/inbound/admin-http/dev-auth";
import { bootAuthenticated } from "#src/server/__tests__/helpers/http-test-server";
import { InMemoryPluginActivationRepo } from "#src/features/plugin-runtime/repo.memory";
import { registerPluginsListRoute } from "../../list.js";
import { registerPluginSetEnabledRoute } from "../../set-enabled.js";
import type { PluginsRouteDeps } from "../../deps.js";
import type { PluginDiscoveryRecord } from "#src/features/plugin-runtime/discovery";

/**
 * @file C-016 `PLUGINS_LIST`/`PLUGIN_SET_ENABLED` HTTP surface — SPEC-005 REQ-10, AC-11,
 * errors.spec.md §2/§6. Mirrors `admin-widgets-routes.test.ts`'s real-auth pattern:
 * `createRouteDeps()` for a real `authorize()`/session stack, real login before hitting any
 * route.
 *
 * RT-009 fixture note: the discovery list this test injects reuses the same
 * built-in/valid-site/invalid-site shape as `discovery.integration.test.ts`'s AC-11 fixture — the
 * "valid" site plugin explicitly carries `tier: "tier-3"` so it does not spuriously read as
 * invalid post-1.1.1.
 *
 * TDD-certified against the stubs in `../../list.ts` / `../../set-enabled.ts`; currently RED —
 * both handlers respond `501 not implemented`. These assertions describe the contract the
 * Programmer stage must satisfy.
 */

const WORKSPACE_ID = "workspace-local";
const BASE = `/api/admin/v1/workspaces/${WORKSPACE_ID}`;

const AC11_DISCOVERY: readonly PluginDiscoveryRecord[] = [
  { id: "word-count", name: "Word Count", version: "1.0.0", source: "built-in", tier: "tier-3", status: "valid", errors: [] },
  {
    id: "invalid-site-plugin",
    name: "Invalid Site Plugin",
    version: "1.0.0",
    source: "site",
    // Deliberately NOT tier-3 (1.1.2 addendum, REQ-10/AC-26): proves the wire response projects
    // each record's OWN tier rather than a value that happens to always be "tier-3" in the rest of
    // this fixture — see the dedicated tier test below.
    tier: "tier-1",
    status: "invalid",
    errors: [{ code: "HOOK_UNKNOWN", file: "tovu.plugin.json", message: "attaches to an undeclared hook point" }],
  },
  {
    id: "valid-site-plugin",
    name: "Valid Site Plugin",
    version: "1.0.0",
    source: "site",
    tier: "tier-2",
    status: "valid",
    errors: [],
  },
];

function buildTestApp(): { app: express.Express; pluginDeps: PluginsRouteDeps } {
  const baseDeps = createRouteDeps();
  const pluginDeps: PluginsRouteDeps = {
    workspaceId: baseDeps.workspaceId,
    authorize: baseDeps.authorize,
    clock: baseDeps.clock,
    idGen: baseDeps.idGen,
    changeSets: baseDeps.changeSets,
    outbox: baseDeps.outbox,
    pluginActivationRepo: new InMemoryPluginActivationRepo(),
    discoverPlugins: async () => AC11_DISCOVERY,
    onPluginEnabled: async () => {},
    onPluginDisabled: () => {},
    removePlugin: baseDeps.removePlugin,
  };

  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, baseDeps);
  app.use("/api/admin", requireAdminSession(baseDeps));
  registerPluginsListRoute(app, pluginDeps);
  registerPluginSetEnabledRoute(app, pluginDeps);
  return { app, pluginDeps };
}

test("AC-11/REQ-10: GET .../plugins returns all 3 discovered plugins with correct source/status/enabled/errors (RT-009 fixture)", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await fetch(`${baseUrl}${BASE}/plugins`, { headers: { cookie } });
  assert.equal(response.status, 200);

  const body = (await response.json()) as { plugins: Array<{ id: string; source: string; status: string; enabled: boolean; errors: unknown[] }> };
  assert.equal(body.plugins.length, 3);

  const byId = new Map(body.plugins.map((p) => [p.id, p]));
  assert.equal(byId.get("word-count")?.source, "built-in");
  assert.equal(byId.get("word-count")?.status, "valid");
  assert.equal(byId.get("word-count")?.enabled, false, "never-enabled plugins project enabled:false");

  assert.equal(byId.get("valid-site-plugin")?.status, "valid", "the tier-fixed (RT-009) valid site plugin must read as valid");
  assert.equal(byId.get("invalid-site-plugin")?.status, "invalid");
  const invalidErrors = (byId.get("invalid-site-plugin")?.errors ?? []) as Array<{ code: string }>;
  assert.ok(invalidErrors.some((e) => e.code === "HOOK_UNKNOWN"));
});

// --- 1.1.2 addendum: REQ-10's additive `tier` field (REQ-18/AC-26 badge input, RT-010) ---
//
// Small addition alongside the rest of this certified suite. Confirmed NOT incidentally covered
// by the AC-11/REQ-10 test above: that test's response type annotation and assertions never
// mention `tier`, and before this addendum `AC11_DISCOVERY`'s records carried no `tier` field at
// all (RT-009's fixture requirement predates this amendment and concerns `PluginManifest.tier` at
// the manifest-validation layer, not this route-level `PluginDiscoveryRecord` fixture, which is
// injected directly and never passes through `validateManifest()`). This test is the dedicated
// wire-level coverage for the new field, using three DIFFERENT tier values across the fixture
// (word-count: tier-3, invalid-site-plugin: tier-1, valid-site-plugin: tier-2) so the assertion
// cannot pass against an implementation that hardcodes "tier-3" for every row.
test("REQ-10 (1.1.2)/AC-26: GET .../plugins projects each record's OWN tier value verbatim, not a hardcoded tier-3", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await fetch(`${baseUrl}${BASE}/plugins`, { headers: { cookie } });
  assert.equal(response.status, 200);

  const body = (await response.json()) as { plugins: Array<{ id: string; tier: string }> };
  const byId = new Map(body.plugins.map((p) => [p.id, p]));

  assert.equal(byId.get("word-count")?.tier, "tier-3");
  assert.equal(byId.get("invalid-site-plugin")?.tier, "tier-1");
  assert.equal(byId.get("valid-site-plugin")?.tier, "tier-2");
});

test("TB-01: the HTTP response preserves discovery's own ordering — no client-visible re-sort", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await fetch(`${baseUrl}${BASE}/plugins`, { headers: { cookie } });
  const body = (await response.json()) as { plugins: Array<{ id: string }> };
  assert.deepEqual(body.plugins.map((p) => p.id), AC11_DISCOVERY.map((r) => r.id));
});

test("PLUGIN_NOT_FOUND: PATCH .../plugins/:pluginId for an id absent from discovery is 404 with code PLUGIN_NOT_FOUND", async (t) => {
  const { app } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await fetch(`${baseUrl}${BASE}/plugins/does-not-exist`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  assert.equal(response.status, 404);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "PLUGIN_NOT_FOUND");
});

test("PLUGIN_INVALID: PATCH {enabled:true} for a plugin whose discovered status is 'invalid' is 422 with code PLUGIN_INVALID and no change set is recorded", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const changeSetCountBefore = (await pluginDeps.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID })).length;

  const response = await fetch(`${baseUrl}${BASE}/plugins/invalid-site-plugin`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  assert.equal(response.status, 422);
  const body = (await response.json()) as { code: string };
  assert.equal(body.code, "PLUGIN_INVALID");

  const changeSetCountAfter = (await pluginDeps.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID })).length;
  assert.equal(changeSetCountAfter, changeSetCountBefore, "a rejected enable must not record a change set (BR-05)");
});

test("AC-19/REQ-07: PATCH {enabled:true} for a valid plugin succeeds (200), returns changeSetId, and records exactly one applied change set", async (t) => {
  const { app, pluginDeps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const response = await fetch(`${baseUrl}${BASE}/plugins/valid-site-plugin`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });

  assert.equal(response.status, 200);
  const body = (await response.json()) as { plugin: { enabled: boolean }; changeSetId: string };
  assert.equal(body.plugin.enabled, true);
  assert.ok(body.changeSetId);

  const changeSets = await pluginDeps.changeSets.listByWorkspace({ workspaceId: WORKSPACE_ID });
  assert.equal(changeSets.filter((cs) => cs.id === body.changeSetId).length, 1);
});

test("AC-13/REQ-07/INV-05: the recorded change set carries an entityType/operation shape a revert registry entry can resolve a reverter against, and its inversePayload captures the PRIOR (pre-enable) activation state", async (t) => {
  // Note (scoping): this test proves the change-set SHAPE the gateway records is
  // revert-registry-resolvable (entityType/operation/inversePayload present and correct) — it
  // does not itself drive an HTTP `/change-sets/:id/revert` call, since that requires a
  // plugin-activation `EntityReverter` registered in `core/commands/appliers.ts`'s
  // `defaultRevertRegistry()`, which is Programmer implementation work this dispatch's tasks.md
  // Phase 1 Track D notes but which is not itself a CIC-designated unit (unlike the post-entity
  // revert path, CIC U-005). `activation.integration.test.ts` already certifies the underlying
  // enable/disable state-symmetry property (AC-13's other half) directly against
  // `setPluginEnabled()`.
  const { app, pluginDeps } = buildTestApp();
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const enableResponse = await fetch(`${baseUrl}${BASE}/plugins/valid-site-plugin`, {
    method: "PATCH",
    headers: { cookie, "content-type": "application/json" },
    body: JSON.stringify({ enabled: true }),
  });
  const { changeSetId } = (await enableResponse.json()) as { changeSetId: string };

  const stored = await pluginDeps.changeSets.findById({ workspaceId: WORKSPACE_ID, id: changeSetId });
  assert.ok(stored, "the change set must be findable by the id returned to the caller");
  assert.equal(stored!.items.length, 1);
  assert.equal(stored!.items[0].entityType, "plugin-activation");
  assert.equal(stored!.items[0].operation, "update");
  assert.deepEqual(
    stored!.items[0].inversePayload,
    { enabled: false },
    "the inverse payload must capture the PRIOR (pre-enable) enabled value so a future reverter can restore it exactly"
  );
});
