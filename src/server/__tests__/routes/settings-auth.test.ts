import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import test from "node:test";

import express from "express";

import { createRouteDeps } from "../../app";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminSettingsClearRoute } from "../../routes/admin/settings/clear";
import { registerAdminSettingsGetEffectiveRoute } from "../../routes/admin/settings/get-effective";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../routes/admin/settings/register-definitions";
import { registerAdminSettingsResetRoute } from "../../routes/admin/settings/reset";
import { registerAdminSettingsSetRoute } from "../../routes/admin/settings/set";
import type { RouteDeps } from "../../routes/types";

/**
 * @file T036 (AC-16) — each of the 5 admin `settings.*` HTTP endpoints must
 * be gated by its matching permission: a caller without it gets 403
 * `FORBIDDEN`; a caller with it (the seeded owner, wildcard `*`) succeeds.
 *
 * Mirrors `admin-menus-routes.test.ts`'s already-established pattern: a real
 * `createRouteDeps()` composition (real `authorize()` + identity repos, but
 * in-memory `settingsRepo` — the real-SQLite requirement is T037's job, not
 * this file's), real auth middleware, a real login, and a "bare principal"
 * (no role/policy grants at all) to prove the denied side of each gate.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  registerAdminSettingsGetEffectiveRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsResetRoute(app, deps);
  return { app, deps };
}

async function bootAuthenticated(app: express.Express, t: import("node:test").TestContext) {
  const server = createServer(app);
  server.listen(0);
  await once(server, "listening");
  t.after(() => new Promise<void>((resolve) => server.close(() => resolve())));

  const address = server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "admin", password: "tovu-dev" }),
  });
  assert.equal(login.status, 200);
  const cookie = login.headers.get("set-cookie")?.split(";")[0] ?? "";

  return { baseUrl, cookie };
}

/** A principal with a login but zero role/policy grants — `authorize()` returns `no_grant` for anything. */
async function loginAsBarePrincipal(deps: RouteDeps, baseUrl: string) {
  await deps.identityReady;
  const bareId = "bare-principal-settings";
  await deps.principalRepo.save({
    id: bareId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: "No Grants",
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId: bareId,
    workspaceId: deps.workspaceId,
    username: "bare-settings",
    passwordHash: await deps.passwordHasher.hash("bare-pw"),
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username: "bare-settings", password: "bare-pw" }),
  });
  assert.equal(login.status, 200);
  return login.headers.get("set-cookie")?.split(";")[0] ?? "";
}

test("SETTINGS_REGISTER_DEFINITIONS: denied 403 FORBIDDEN without settings.definitions.manage; owner succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const body = {
    definitions: [
      {
        ownerKind: "site",
        namespace: "site.demo",
        key: "greeting",
        schemaJson: { type: "string" },
        defaultJson: "hello",
        scopes: 6, // workspace|user
      },
    ],
  };

  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify(body),
  });
  assert.equal(denied.status, 403);
  const deniedBody = (await denied.json()) as { code: string; details: { permission: string } };
  assert.equal(deniedBody.code, "FORBIDDEN");
  assert.equal(deniedBody.details.permission, "settings.definitions.manage");

  const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify(body),
  });
  assert.equal(allowed.status, 200);
  const allowedBody = (await allowed.json()) as { applied: Array<{ key: string; op: string; status: string }> };
  assert.equal(allowedBody.applied.length, 1);
  assert.equal(allowedBody.applied[0].key, "site.demo.greeting");
  assert.equal(allowedBody.applied[0].status, "applied");
});

test("SETTINGS_GET_EFFECTIVE: denied 403 FORBIDDEN without settings.read; owner succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const denied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/effective?namespace=core.presentation`,
    { headers: { cookie: bareCookie } }
  );
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { code: string }).code, "FORBIDDEN");

  const allowed = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/effective?namespace=core.presentation`,
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(allowed.status, 200);
  const allowedBody = (await allowed.json()) as { data: Array<{ key: string }> };
  assert.ok(Array.isArray(allowedBody.data));
});

test("SETTINGS_SET: denied 403 FORBIDDEN without the scope-derived write permission; owner succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const body = {
    namespace: "core.presentation",
    key: "activeThemeId",
    scope: "global",
    valueJson: "paper",
  };

  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify(body),
  });
  assert.equal(denied.status, 403);
  const deniedBody = (await denied.json()) as { code: string; details: { permission: string } };
  assert.equal(deniedBody.code, "FORBIDDEN");
  assert.equal(deniedBody.details.permission, "settings.global.write");

  const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify(body),
  });
  assert.equal(allowed.status, 200);
  const allowedBody = (await allowed.json()) as { value: string; revisionSeq: number };
  assert.equal(allowedBody.value, "paper");
});

test("SETTINGS_CLEAR: denied 403 FORBIDDEN without the scope-derived write permission; owner succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const body = { namespace: "core.presentation", key: "activeThemeId", scope: "global" };

  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify(body),
  });
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { code: string }).code, "FORBIDDEN");

  const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify(body),
  });
  assert.equal(allowed.status, 200);
  const allowedBody = (await allowed.json()) as { value: null };
  assert.equal(allowedBody.value, null);
});

test("SETTINGS_RESET: denied 403 FORBIDDEN without settings.reset.<scope>; owner succeeds", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const body = { namespace: "core.presentation", scope: "global" };

  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify(body),
  });
  assert.equal(denied.status, 403);
  const deniedBody = (await denied.json()) as { code: string; details: { permission: string } };
  assert.equal(deniedBody.code, "FORBIDDEN");
  assert.equal(deniedBody.details.permission, "settings.reset.global");

  const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify(body),
  });
  assert.equal(allowed.status, 200);
  const allowedBody = (await allowed.json()) as { clearedCount: number; revisionSeqs: number[] };
  assert.ok(allowedBody.clearedCount >= 0);
  assert.ok(Array.isArray(allowedBody.revisionSeqs));
});
