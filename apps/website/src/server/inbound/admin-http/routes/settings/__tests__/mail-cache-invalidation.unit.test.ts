/** Every generic mail settings mutation invalidates the existing status/provider cache. */
import assert from "node:assert/strict";
import test from "node:test";
import express from "express";
import { ensureSettingDefinitions, InMemorySettingsRepo, SCOPE_BIT } from "@jini-ai/core/settings";
import { createFakeClock } from "#src/__tests__/support/fake-clock";
import { createTtlCache } from "@jini-ai/platform/mail";
import { readMailProviderSetting, ensureMailProviderSettings } from "#src/features/settings/mail-provider";
import { registerAdminSettingsSetRoute } from "../set.js";
import { registerAdminSettingsClearRoute } from "../clear.js";
import { registerAdminSettingsResetRoute } from "../reset.js";
import type { SettingsRouteDeps } from "../deps.js";
import { createCapturingResponse, extractRouteHandler } from "#src/server/__tests__/helpers/http-test-server";

const WS = "mail-cache-workspace";
const BASE = "/api/admin/v1/workspaces/:workspaceId/settings";
async function fixture() {
  const settingsRepo = new InMemorySettingsRepo(); let next = 0, invalidations = 0, loads = 0, allowed = true;
  const clock = createFakeClock({ startIso: "2026-10-24T00:00:00.000Z" });
  const idGen = { newId: () => `setting-${++next}` };
  const principals = { findById: async ({ id }: { id: string }) => ({ id, workspaceId: WS, status: "active" }) };
  await ensureMailProviderSettings({ deps: { settingsRepo, clock, ids: idGen, principals } as never, systemPrincipalId: "system" });
  await ensureSettingDefinitions({ settingsRepo, clock, ids: idGen, principals } as never, { namespace: "core.other", systemPrincipalId: "system", definitions: [{ key: "enabled", schema: { type: "boolean" }, defaultValue: false, scopes: SCOPE_BIT.workspace, secret: false }] });
  const cache = createTtlCache({ load: () => { loads++; return readMailProviderSetting({ settingsRepo, workspaceId: WS }); }, ttlMs: 30_000, nowMs: () => 0 });
  const deps = { workspaceId: WS, settingsRepo, clock, idGen, principalRepo: principals, settingsReady: Promise.resolve(),
    authorize: async () => ({ allowed, reason: "test" }), mailProviderControl: { invalidate: () => { invalidations++; cache.invalidate(); } } } as unknown as SettingsRouteDeps;
  const app = express(); registerAdminSettingsSetRoute(app, deps); registerAdminSettingsClearRoute(app, deps); registerAdminSettingsResetRoute(app, deps);
  return { cache, get loads() { return loads; }, get invalidations() { return invalidations; }, deny: () => { allowed = false; },
    request: async (method: "put" | "delete" | "post", body: unknown) => {
      const { res, capture } = createCapturingResponse(); res.locals.principal = { id: "owner" };
      await extractRouteHandler(app, method, `${BASE}/${method === "post" ? "reset" : "value"}`)({ params: { workspaceId: WS }, query: {}, body }, res);
      return capture;
    },
  };
}

test("PUT clears cached delivery readiness immediately", async () => {
  const f = await fixture();
  const write = (valueJson: unknown) => f.request("put", { namespace: "core.mail", key: "provider", scope: "workspace", valueJson });
  assert.equal((await write({ transactional: "hosted", bulk: null })).statusCode, 200);
  assert.equal((await f.cache.get())!.transactional, "hosted");
  assert.equal((await write({ transactional: null, bulk: null })).statusCode, 200);
  assert.equal((await f.cache.get())!.transactional, null); assert.equal(f.invalidations, 2);
});

for (const method of ["delete", "post"] as const) test(`${method}: clear/reset also invalidate mail readiness`, async () => {
  const f = await fixture();
  await f.request("put", { namespace: "core.mail", key: "provider", scope: "workspace", valueJson: { transactional: "hosted", bulk: null } });
  assert.equal((await f.cache.get())!.transactional, "hosted");
  assert.equal((await f.request(method, { namespace: "core.mail", key: "provider", scope: "workspace" })).statusCode, 200);
  const refreshed = await f.cache.get();
  if (method === "delete") assert.equal(refreshed, null);
  assert.equal(f.loads, 2); assert.equal(f.invalidations, 2);
});

test("unrelated and rejected writes do not invalidate mail caches", async () => {
  const f = await fixture();
  assert.equal((await f.request("put", { namespace: "core.other", key: "enabled", scope: "workspace", valueJson: true })).statusCode, 200);
  f.deny();
  assert.equal((await f.request("put", { namespace: "core.mail", key: "provider", scope: "workspace", valueJson: { transactional: null, bulk: null } })).statusCode, 403);
  assert.equal(f.invalidations, 0);
});
