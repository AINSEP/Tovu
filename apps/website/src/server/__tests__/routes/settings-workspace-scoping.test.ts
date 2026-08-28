import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server.js";

import express from "express";

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
