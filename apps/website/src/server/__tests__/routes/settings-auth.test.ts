import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminSettingsClearRoute } from "../../inbound/admin-http/routes/settings/clear.js";
import { registerAdminSettingsGetEffectiveRoute } from "../../inbound/admin-http/routes/settings/get-effective.js";
import { registerAdminSettingsGetRawRoute } from "../../inbound/admin-http/routes/settings/get-raw.js";
import { registerAdminSettingsListDefinitionsRoute } from "../../inbound/admin-http/routes/settings/list-definitions.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../inbound/admin-http/routes/settings/register-definitions.js";
import { registerAdminSettingsResetRoute } from "../../inbound/admin-http/routes/settings/reset.js";
import { registerAdminSettingsSetRoute } from "../../inbound/admin-http/routes/settings/set.js";
import type { RouteDeps } from "../../routes/types.js";

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
  registerAdminSettingsGetRawRoute(app, deps);
  registerAdminSettingsListDefinitionsRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsResetRoute(app, deps);
  return { app, deps };
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
    passwordHash: await deps.passwordHasher.hash({ password: "bare-pw" }),
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

  const beforeDenied = await deps.settingsRepo.maxRevisionSeq();
  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify(body),
  });
  assert.equal(denied.status, 403);
  const deniedBody = (await denied.json()) as { code: string; details: { permission: string } };
  assert.equal(deniedBody.code, "FORBIDDEN");
  assert.equal(deniedBody.details.permission, "settings.global.write");

  assert.equal(await deps.settingsRepo.maxRevisionSeq(), beforeDenied, "denied writes must append no revision");

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

  const seeded = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT", headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({ ...body, valueJson: "paper" }),
  });
  assert.equal(seeded.status, 200);
  const beforeDenied = await deps.settingsRepo.maxRevisionSeq();
  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie: bareCookie },
    body: JSON.stringify(body),
  });
  assert.equal(denied.status, 403);
  assert.equal(((await denied.json()) as { code: string }).code, "FORBIDDEN");

  assert.equal(await deps.settingsRepo.maxRevisionSeq(), beforeDenied, "denied writes must append no revision");

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

test("SETTINGS_GET_RAW: denied 403 FORBIDDEN without settings.read.raw; owner sees per-layer values + default", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const registerResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      definitions: [
        {
          ownerKind: "site",
          namespace: "site.demo",
          key: "greeting",
          schemaJson: { type: "string" },
          defaultJson: "hello",
          scopes: 6, // workspace|user — a site-owned def may not declare the global bit (INV-05)
        },
      ],
    }),
  });
  assert.equal(registerResponse.status, 200);

  const denied = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw?namespace=site.demo&key=greeting`,
    { headers: { cookie: bareCookie } }
  );
  assert.equal(denied.status, 403);
  const deniedBody = (await denied.json()) as { code: string; details: { permission: string } };
  assert.equal(deniedBody.code, "FORBIDDEN");
  assert.equal(deniedBody.details.permission, "settings.read.raw");

  const beforeWrite = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw?namespace=site.demo&key=greeting`,
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(beforeWrite.status, 200);
  const beforeBody = (await beforeWrite.json()) as {
    key: string;
    global: unknown;
    workspace: unknown;
    user: unknown;
    default: unknown;
  };
  assert.equal(beforeBody.key, "site.demo.greeting");
  assert.equal(beforeBody.global, null);
  assert.equal(beforeBody.workspace, null);
  assert.equal(beforeBody.user, null);
  assert.equal(beforeBody.default, "hello");

  const setResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      namespace: "site.demo",
      key: "greeting",
      scope: "workspace",
      workspaceId: deps.workspaceId,
      valueJson: "hi-workspace",
    }),
  });
  assert.equal(setResponse.status, 200);

  const afterWrite = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw?namespace=site.demo&key=greeting`,
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(afterWrite.status, 200);
  const afterBody = (await afterWrite.json()) as { global: unknown; workspace: unknown; default: unknown };
  assert.equal(afterBody.workspace, "hi-workspace");
  assert.equal(afterBody.global, null);
  assert.equal(afterBody.default, "hello");
});

test("SETTINGS_GET_RAW: 400 VALIDATION_ERROR when namespace/key are missing; 404 DEFINITION_NOT_FOUND for an unknown key", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);

  const missingParams = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(missingParams.status, 400);
  assert.equal(((await missingParams.json()) as { code: string }).code, "VALIDATION_ERROR");

  const unknownKey = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw?namespace=site.demo&key=does-not-exist`,
    { headers: { cookie: ownerCookie } }
  );
  assert.equal(unknownKey.status, 404);
  assert.equal(((await unknownKey.json()) as { code: string }).code, "DEFINITION_NOT_FOUND");
});

test("SETTINGS_LIST_DEFINITIONS: denied 403 FORBIDDEN without settings.read.definitions; owner sees platform + site definitions", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  const bareCookie = await loginAsBarePrincipal(deps, baseUrl);

  const registerResponse = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie: ownerCookie },
    body: JSON.stringify({
      definitions: [
        {
          ownerKind: "site",
          namespace: "site.demo",
          key: "greeting",
          schemaJson: { type: "string" },
          defaultJson: "hello",
          scopes: 6,
        },
      ],
    }),
  });
  assert.equal(registerResponse.status, 200);

  const denied = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    headers: { cookie: bareCookie },
  });
  assert.equal(denied.status, 403);
  const deniedBody = (await denied.json()) as { code: string; details: { permission: string } };
  assert.equal(deniedBody.code, "FORBIDDEN");
  assert.equal(deniedBody.details.permission, "settings.read.definitions");

  const allowed = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    headers: { cookie: ownerCookie },
  });
  assert.equal(allowed.status, 200);
  const allowedBody = (await allowed.json()) as {
    data: Array<{ namespace: string; key: string; ownerKind: string; scopes: number; status: string; version: number }>;
  };
  assert.ok(Array.isArray(allowedBody.data));

  const siteDef = allowedBody.data.find((d) => d.namespace === "site.demo" && d.key === "greeting");
  assert.ok(siteDef, "the newly registered site.demo.greeting definition is listed");
  assert.equal(siteDef?.ownerKind, "site");
  assert.equal(siteDef?.scopes, 6);
  assert.equal(siteDef?.status, "active");
  assert.equal(siteDef?.version, 1);

  // The platform partition merges in too — the pre-existing core.presentation migration definition.
  const coreDef = allowedBody.data.find((d) => d.namespace === "core.presentation" && d.key === "activeThemeId");
  assert.ok(coreDef, "the platform core.presentation.activeThemeId definition is listed alongside site defs");
  assert.equal(coreDef?.ownerKind, "core");
});

test("SETTINGS_RESET: clears exactly its namespace overrides, restores defaults, and preserves another namespace", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const base = `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings`;
  const definitions = [
    { ownerKind: "site", namespace: "site.resetprobe", key: "first", schemaJson: { type: "string" }, defaultJson: "default-first", scopes: 2 },
    { ownerKind: "site", namespace: "site.resetprobe", key: "second", schemaJson: { type: "string" }, defaultJson: "default-second", scopes: 2 },
    { ownerKind: "site", namespace: "site.keepprobe", key: "other", schemaJson: { type: "string" }, defaultJson: "default-other", scopes: 2 },
  ];
  const registered = await fetch(`${base}/definitions`, {
    method: "POST", headers: { "content-type": "application/json", cookie }, body: JSON.stringify({ definitions }),
  });
  assert.equal(registered.status, 200);
  for (const { namespace, key } of definitions) {
    const seeded = await fetch(`${base}/value`, {
      method: "PUT", headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({ namespace, key, scope: "workspace", valueJson: `override-${key}` }),
    });
    assert.equal(seeded.status, 200);
  }
  const read = async (namespace: string) => {
    const res = await fetch(`${base}/effective?namespace=${namespace}`, { headers: { cookie } });
    assert.equal(res.status, 200);
    return ((await res.json()) as { data: Array<{ key: string; value: string; sourceLayer: string }> }).data
      .map(({ key, value, sourceLayer }) => ({ key, value, sourceLayer })).sort((a, b) => a.key.localeCompare(b.key));
  };
  assert.deepEqual(await read("site.resetprobe"), [
    { key: "first", value: "override-first", sourceLayer: "workspace" },
    { key: "second", value: "override-second", sourceLayer: "workspace" },
  ]);
  const before = await deps.settingsRepo.maxRevisionSeq();
  const reset = await fetch(`${base}/reset`, {
    method: "POST", headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({ namespace: "site.resetprobe", scope: "workspace" }),
  });
  assert.equal(reset.status, 200);
  const result = (await reset.json()) as { clearedCount: number; revisionSeqs: number[] };
  assert.equal(result.clearedCount, 2);
  assert.equal(result.revisionSeqs.length, 2);
  const revisions = await deps.settingsRepo.listRevisionsSince({ sinceSeq: before, workspaceId: deps.workspaceId, limit: 100 });
  assert.deepEqual(revisions.map((r) => r.seq).sort((a, b) => a - b), [...result.revisionSeqs].sort((a, b) => a - b));
  const clearedKeys = await Promise.all(revisions.map(async (r) => {
    assert.equal(r.op, "clear");
    const definition = await deps.settingsRepo.findDefinitionBySettingId({ settingId: r.settingId });
    return `${definition?.namespace}.${definition?.key}`;
  }));
  assert.deepEqual(clearedKeys.sort(), ["site.resetprobe.first", "site.resetprobe.second"]);
  assert.deepEqual(await read("site.resetprobe"), [
    { key: "first", value: "default-first", sourceLayer: "default" },
    { key: "second", value: "default-second", sourceLayer: "default" },
  ]);
  assert.deepEqual(await read("site.keepprobe"), [{ key: "other", value: "override-other", sourceLayer: "workspace" }]);
});
