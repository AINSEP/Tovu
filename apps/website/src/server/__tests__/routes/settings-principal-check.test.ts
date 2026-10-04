import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createSiteRouteDeps } from "../../runtime/composition/deps.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminSettingsGetEffectiveRoute } from "../../inbound/admin-http/routes/settings/get-effective.js";
import { registerAdminSettingsClearRoute } from "../../inbound/admin-http/routes/settings/clear.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../inbound/admin-http/routes/settings/register-definitions.js";
import { registerAdminSettingsSetRoute } from "../../inbound/admin-http/routes/settings/set.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file T037 (AC-24) — `SETTINGS_SET`/`SETTINGS_CLEAR` at `scope=user`
 * targeting a `principalId` that does not resolve to an active principal in
 * the request's workspace must be rejected `404 PRINCIPAL_NOT_FOUND`, not
 * 500 (Red-Team RT-001's flagged gap). Run against the REAL SQLite adapter
 * (`createSiteRouteDeps(":memory:")`, `server/deps.ts`) per tasks.md T037,
 * not the in-memory one `settings-auth.test.ts` uses — proves the whole
 * chokepoint (route -> write-service -> `SqliteSettingsRepo` -> real
 * transactional SQLite) rejects the same way an in-memory double would.
 */
async function buildTestApp(): Promise<{ app: express.Express; deps: RouteDeps }> {
  const deps = await createSiteRouteDeps(":memory:");
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsGetEffectiveRoute(app, deps);
  return { app, deps };
}

/** Registers a `site.*` definition (user+workspace scope) as the owner, via the real HTTP route. */
async function registerUserScopedDefinition(baseUrl: string, cookie: string, deps: RouteDeps) {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      definitions: [
        {
          ownerKind: "site",
          namespace: "site.testing",
          key: "demoKey",
          schemaJson: { type: "string" },
          defaultJson: "default",
          scopes: 6, // workspace(2) | user(4)
        },
      ],
    }),
  });
  assert.equal(res.status, 200, "fixture definition registration must succeed");
}

test("SETTINGS_SET at scope=user targeting a principalId from a different workspace is rejected 404 PRINCIPAL_NOT_FOUND (AC-24/RT-001), real SQLite adapter", async (t) => {
  const { app, deps } = await buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerUserScopedDefinition(baseUrl, cookie, deps);

  // A real principal, but seeded in a DIFFERENT workspace than the request's.
  const crossWorkspacePrincipalId = "cross-workspace-principal-1";
  await deps.principalRepo.save({
    id: crossWorkspacePrincipalId,
    workspaceId: "some-other-workspace",
    kind: "user",
    displayName: "Cross-workspace principal",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.testing",
      key: "demoKey",
      scope: "user",
      workspaceId: deps.workspaceId,
      principalId: crossWorkspacePrincipalId,
      valueJson: "atlas",
    }),
  });

  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "PRINCIPAL_NOT_FOUND");
});

test("SETTINGS_SET at scope=user targeting a principalId that doesn't exist anywhere is rejected 404 PRINCIPAL_NOT_FOUND, real SQLite adapter", async (t) => {
  const { app, deps } = await buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerUserScopedDefinition(baseUrl, cookie, deps);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.testing",
      key: "demoKey",
      scope: "user",
      workspaceId: deps.workspaceId,
      principalId: "ghost-principal",
      valueJson: "atlas",
    }),
  });

  assert.equal(res.status, 404);
  assert.equal(((await res.json()) as { code: string }).code, "PRINCIPAL_NOT_FOUND");
});

test("SETTINGS_CLEAR at scope=user targeting a principalId from a different workspace is rejected 404 PRINCIPAL_NOT_FOUND (AC-24/RT-001), real SQLite adapter", async (t) => {
  const { app, deps } = await buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerUserScopedDefinition(baseUrl, cookie, deps);

  const crossWorkspacePrincipalId = "cross-workspace-principal-2";
  await deps.principalRepo.save({
    id: crossWorkspacePrincipalId,
    workspaceId: "some-other-workspace",
    kind: "user",
    displayName: "Cross-workspace principal",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.testing",
      key: "demoKey",
      scope: "user",
      workspaceId: deps.workspaceId,
      principalId: crossWorkspacePrincipalId,
    }),
  });

  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "PRINCIPAL_NOT_FOUND");
});

test("SETTINGS_SET and SETTINGS_CLEAR for a same-workspace user persist an override and restore its effective fallback, real SQLite adapter", async (t) => {
  const { app, deps } = await buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await registerUserScopedDefinition(baseUrl, cookie, deps);

  const samePrincipalId = "same-workspace-principal-1";
  await deps.principalRepo.save({
    id: samePrincipalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "Same-workspace principal",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.testing",
      key: "demoKey",
      scope: "user",
      workspaceId: deps.workspaceId,
      principalId: samePrincipalId,
      valueJson: "atlas",
    }),
  });

  assert.equal(res.status, 200);
  const body = (await res.json()) as { value: string };
  assert.equal(body.value, "atlas");
  const definition = await deps.settingsRepo.findActiveDefinition({ namespace: "site.testing", key: "demoKey", workspaceId: deps.workspaceId });
  assert.ok(definition);
  const userTarget = { workspaceId: deps.workspaceId, principalId: samePrincipalId, settingId: definition.settingId };
  assert.equal((await deps.settingsRepo.getUserValue(userTarget))?.valueJson, "atlas");
  const workspaceSet = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ namespace: "site.testing", key: "demoKey", scope: "workspace", valueJson: "workspace fallback" }),
  });
  assert.equal(workspaceSet.status, 200);
  const effectiveUrl = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/effective?namespace=site.testing&principalId=${samePrincipalId}`;
  const before = await fetch(effectiveUrl, { headers: { cookie } });
  assert.equal(before.status, 200);
  assert.equal((await before.json()).data.find((row: { key: string }) => row.key === "demoKey")?.value, "atlas");
  const cleared = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "DELETE", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ namespace: "site.testing", key: "demoKey", scope: "user", principalId: samePrincipalId }),
  });
  assert.equal(cleared.status, 200);
  const raw = await deps.settingsRepo.getUserValue(userTarget);
  assert.equal(raw?.state, "cleared");
  assert.equal(raw?.valueJson, null);
  const effective = await fetch(effectiveUrl, { headers: { cookie } });
  assert.equal(effective.status, 200);
  assert.equal((await effective.json()).data.find((row: { key: string }) => row.key === "demoKey")?.value, "workspace fallback");

});
