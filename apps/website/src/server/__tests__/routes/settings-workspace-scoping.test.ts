import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

import { ForbiddenError } from "#src/features/settings/index";
import { createRouteDeps } from "../../runtime/composition/app.js";
import { registerAuthRoutes, requireAdminSession } from "../../inbound/admin-http/dev-auth.js";
import { registerAdminSettingsClearRoute } from "../../inbound/admin-http/routes/settings/clear.js";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../inbound/admin-http/routes/settings/register-definitions.js";
import { registerAdminSettingsResetRoute } from "../../inbound/admin-http/routes/settings/reset.js";
import { registerAdminSettingsSetRoute } from "../../inbound/admin-http/routes/settings/set.js";
import type { RouteDeps } from "../../routes/types.js";

/**
 * @file A body-supplied `workspaceId` must never redirect a settings write to another tenant.
 *
 * The gap these cover: `set`/`clear`/`reset` took the write-target `workspaceId` from the request
 * BODY while authorizing against the route's ambient `deps.workspaceId`. Both authorize() calls —
 * the route pre-check and `write-service`'s chokepoint — passed against the caller's own workspace,
 * then `saveWorkspaceValue`/`saveUserValue` wrote the row named in the body. `reset` was worse: one
 * request cleared an entire namespace in the other tenant.
 *
 * Nothing caught it. `settings-auth.test.ts`'s SET/CLEAR coverage is `scope: "global"` only, and no
 * test anywhere sent a body `workspaceId` that differed from the route's. That absence is the whole
 * reason this file exists — the owner principal used here holds a wildcard grant, so authorization
 * is never the thing under test; the target-selection logic is.
 *
 * `resolveTargetWorkspaceId` (`routes/admin/settings/shared.ts`) now rejects a mismatch with 400
 * rather than ignoring it, so a mis-integrated caller fails loudly instead of writing somewhere it
 * did not intend. `write-service`'s `assertTargetWorkspaceMatchesAuth` is the backstop for callers
 * that skip the routes.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createRouteDeps();
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  registerAdminSettingsClearRoute(app, deps);
  registerAdminSettingsResetRoute(app, deps);
  return { app, deps };
}

const OTHER_WORKSPACE = "00000000-0000-4000-8000-000000000ffe";

async function seedDefinition(baseUrl: string, deps: RouteDeps, cookie: string, key: string) {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      definitions: [
        {
          ownerKind: "site",
          namespace: "site.scoping",
          key,
          schemaJson: { type: "string" },
          defaultJson: "default",
          scopes: 6, // workspace|user
        },
      ],
    }),
  });
  assert.equal(res.status, 200);
}

test("SETTINGS_SET: a body workspaceId naming another workspace is rejected, and writes nothing", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "theme");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "theme",
      scope: "workspace",
      valueJson: "dark",
      workspaceId: OTHER_WORKSPACE,
    }),
  });

  assert.equal(res.status, 400, "a cross-workspace target must be refused, not honored");
  assert.equal(((await res.json()) as { code: string }).code, "VALIDATION_ERROR");

  // The decisive assertion: nothing landed in the other tenant.
  const leaked = await deps.settingsRepo.listRevisionsSince({ sinceSeq: 0, limit: 500, workspaceId: OTHER_WORKSPACE });
  assert.equal(
    leaked.filter((r) => r.workspaceId === OTHER_WORKSPACE).length,
    0,
    "no revision may exist for a workspace the caller was not authorized against"
  );
});

test("SETTINGS_CLEAR: a body workspaceId naming another workspace is rejected", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "locale");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "DELETE",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "locale",
      scope: "workspace",
      workspaceId: OTHER_WORKSPACE,
    }),
  });

  assert.equal(res.status, 400);
  const leaked = await deps.settingsRepo.listRevisionsSince({ sinceSeq: 0, limit: 500, workspaceId: OTHER_WORKSPACE });
  assert.equal(leaked.filter((r) => r.workspaceId === OTHER_WORKSPACE).length, 0);
});

test("SETTINGS_RESET: a body workspaceId naming another workspace is rejected before any key is cleared", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "accent");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/reset`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      scope: "workspace",
      workspaceId: OTHER_WORKSPACE,
    }),
  });

  assert.equal(res.status, 400, "reset is the worst case — one request would wipe another tenant's namespace");
  const leaked = await deps.settingsRepo.listRevisionsSince({ sinceSeq: 0, limit: 500, workspaceId: OTHER_WORKSPACE });
  assert.equal(leaked.filter((r) => r.workspaceId === OTHER_WORKSPACE).length, 0);
});

test("SETTINGS_SET: a body workspaceId equal to the route's workspace is still accepted", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "density");

  // Existing callers do send it. Rejecting a redundant-but-consistent id would be a regression.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "density",
      scope: "workspace",
      valueJson: "compact",
      workspaceId: deps.workspaceId,
    }),
  });

  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { value: string }).value, "compact");
});

test("SETTINGS_SET: a workspace-scoped write with NO body workspaceId defaults to the route's workspace", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "sidebar");

  // Every settings-dialog tab adapter omits `workspaceId`; before the 2026-07-31 fix this was a
  // masked 500, and the fix must survive the cross-tenant hardening that replaced it.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "sidebar",
      scope: "workspace",
      valueJson: "collapsed",
    }),
  });

  assert.equal(res.status, 200);
  const revisions = await deps.settingsRepo.listRevisionsSince({ sinceSeq: 0, limit: 500, workspaceId: deps.workspaceId });
  const written = revisions.filter((r) => r.scope === "workspace" && r.op === "set");
  assert.ok(written.length > 0, "the write must have produced a revision");
  assert.ok(
    written.every((r) => r.workspaceId === deps.workspaceId),
    "an omitted workspaceId must resolve to the route's workspace, not null"
  );
});

test("SETTINGS_SET: mismatched workspaceId in URL returns 404", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/other-ws/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "theme",
      scope: "workspace",
      valueJson: "dark",
    }),
  });
  assert.equal(res.status, 404);
});

test("SETTINGS_SET: invalid body missing fields returns 400 VALIDATION_ERROR", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "theme",
      // missing scope and valueJson
    }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALIDATION_ERROR");
});

test("SETTINGS_SET: definition not found returns 404 DEFINITION_NOT_FOUND", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "non-existent-key",
      scope: "workspace",
      valueJson: "val",
    }),
  });
  assert.equal(res.status, 404);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "DEFINITION_NOT_FOUND");
});

test("SETTINGS_SET: scope not allowed returns 400 SCOPE_NOT_ALLOWED", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  // Seed definition with scopes: 2 (workspace only)
  const resDef = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      definitions: [
        {
          ownerKind: "site",
          namespace: "site.scoping",
          key: "workspaceOnlyKey",
          schemaJson: { type: "string" },
          defaultJson: "default",
          scopes: 2, // workspace only
        },
      ],
    }),
  });
  assert.equal(resDef.status, 200);

  // Attempting scope "user" on a workspace-only definition must fail with 400 SCOPE_NOT_ALLOWED.
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "workspaceOnlyKey",
      scope: "user",
      valueJson: "val",
    }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "SCOPE_NOT_ALLOWED");
});

test("SETTINGS_SET: schema validation failure returns 400 VALUE_VALIDATION_FAILED", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "stringKey");

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "stringKey",
      scope: "workspace",
      valueJson: 12345,
    }),
  });
  assert.equal(res.status, 400);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "VALUE_VALIDATION_FAILED");
});

test("SETTINGS_SET: tombstoned definition returns 409 DEFINITION_TOMBSTONED", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "tombstonedKey");

  // Seed via the real route so the row matches the port shape (`schema`/`defaultValue`, not the
  // wire's `schemaJson`/`defaultJson`), then read it back and flip it to tombstone directly against
  // the repo — there is no HTTP route to tombstone a definition.
  const active = await deps.settingsRepo.findActiveDefinition({
    namespace: "site.scoping",
    key: "tombstonedKey",
    workspaceId: deps.workspaceId,
  });
  assert.ok(active, "seedDefinition must have produced a readable definition");
  await deps.settingsRepo.saveDefinition({
    ...active,
    status: "tombstone",
    updatedAt: deps.clock.nowIso(),
  });

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "tombstonedKey",
      scope: "workspace",
      valueJson: "new-val",
    }),
  });
  assert.equal(res.status, 409);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "DEFINITION_TOMBSTONED");
});

test("SETTINGS_SET: unauthorized caller returns 403 FORBIDDEN", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  deps.authorize = async () => ({ allowed: false, reason: "custom deny" });
  const { baseUrl, cookie } = await bootAuthenticated(app, t);

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "anyKey",
      scope: "workspace",
      valueJson: "val",
    }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});

test("SETTINGS_SET: returns 403 FORBIDDEN when inner write throws ForbiddenError", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  await seedDefinition(baseUrl, deps, cookie, "forbiddenKey");
  deps.settingsRepo.saveWorkspaceValue = async () => {
    throw new ForbiddenError("unauthorized by chokepoint");
  };

  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/value`, {
    method: "PUT",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      namespace: "site.scoping",
      key: "forbiddenKey",
      scope: "workspace",
      valueJson: "val",
    }),
  });
  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string };
  assert.equal(body.code, "FORBIDDEN");
});
