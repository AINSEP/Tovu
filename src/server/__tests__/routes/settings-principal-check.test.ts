import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createSqliteRouteDeps } from "../../runtime/composition/deps.js";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth.js";
import { registerAdminSettingsClearRoute } from "../../routes/admin/settings/clear.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../routes/admin/settings/register-definitions.js";
import { registerAdminSettingsSetRoute } from "../../routes/admin/settings/set.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file T037 (AC-24) — `SETTINGS_SET`/`SETTINGS_CLEAR` at `scope=user`
 * targeting a `principalId` that does not resolve to an active principal in
 * the request's workspace must be rejected `404 PRINCIPAL_NOT_FOUND`, not
 * 500 (Red-Team RT-001's flagged gap). Run against the REAL SQLite adapter
 * (`createSqliteRouteDeps(":memory:")`, `server/deps.ts`) per tasks.md T037,
 * not the in-memory one `settings-auth.test.ts` uses — proves the whole
 * chokepoint (route -> write-service -> `SqliteSettingsRepo` -> real
 * transactional SQLite) rejects the same way an in-memory double would.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createSqliteRouteDeps(":memory:");
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsClearRoute(app, deps);
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
  const { app, deps } = buildTestApp();
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
  const { app, deps } = buildTestApp();
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
  const { app, deps } = buildTestApp();
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

test("SETTINGS_SET at scope=user targeting a real principal in the SAME workspace succeeds (control case), real SQLite adapter", async (t) => {
  const { app, deps } = buildTestApp();
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
});
