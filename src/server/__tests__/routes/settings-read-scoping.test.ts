import assert from "node:assert/strict";
import test from "node:test";

import { bootAuthenticated } from "../helpers/http-test-server";

import express from "express";

import { createSqliteRouteDeps } from "../../deps";
import { registerAuthRoutes, requireAdminSession } from "../../middleware/dev-auth";
import { registerAdminSettingsGetEffectiveRoute } from "../../routes/admin/settings/get-effective";
import { registerAdminSettingsGetRawRoute } from "../../routes/admin/settings/get-raw";
import { registerAdminSettingsRegisterDefinitionsRoute } from "../../routes/admin/settings/register-definitions";
import { registerAdminSettingsSetRoute } from "../../routes/admin/settings/set";
import type { RouteDeps } from "../../routes/types";

/**
 * @file Regression suite for internal-audit finding F2 (report
 * `ADS-memory/.local-artifacts/external-audit/internal-verification/20260729T190000Z-TM-TOVU-FULLDIFF-20260729-01-internal-verification.md`)
 * and its `out_of_scope_fatal_warnings` sibling: both settings READ routes took
 * `workspaceId`/`principalId` straight off `req.query` *after* `authorize()` had already
 * been checked against `deps.workspaceId` + the session principal, so an authenticated
 * admin could append `?workspaceId=<other>` and read another tenant's raw/effective
 * setting values (ADR-007 workspace-scoping break, ADR-021 authorize-is-the-only-evaluator
 * break).
 *
 * Run against the REAL SQLite adapter (`createSqliteRouteDeps(":memory:")`, `server/deps.ts`),
 * matching `settings-principal-check.test.ts` rather than `settings-auth.test.ts`'s in-memory
 * repo: the other workspace's row is seeded through the same FK-enforced
 * `setting_values_workspace`/`setting_values_user` tables production uses, so "the value really
 * is sitting in the same database the bypass reached" is proven, not stipulated.
 */
function buildTestApp(): { app: express.Express; deps: RouteDeps } {
  const deps = createSqliteRouteDeps(":memory:");
  const app = express();
  app.use(express.json());
  registerAuthRoutes(app, deps);
  app.use("/api/admin", requireAdminSession(deps));

  registerAdminSettingsRegisterDefinitionsRoute(app, deps);
  registerAdminSettingsGetEffectiveRoute(app, deps);
  registerAdminSettingsGetRawRoute(app, deps);
  registerAdminSettingsSetRoute(app, deps);
  return { app, deps };
}

const OTHER_WORKSPACE_ID = "other-tenant-workspace";
const OTHER_WORKSPACE_SECRET = "SECRET-belonging-to-the-other-tenant";
const OWN_WORKSPACE_VALUE = "value-owned-by-the-caller-workspace";

/**
 * The cross-workspace tests deliberately probe a PLATFORM-owned key rather than a `site.*` one.
 * Namespace fencing (REQ-02) partitions `site.*` definitions by `workspace_id`, so a `site.*` probe
 * would 404 `DEFINITION_NOT_FOUND` under the vulnerable code — proving only that the override
 * reached `resolveDefinition`, not that any value escaped. A `core.*` definition lives in the
 * `workspace_id IS NULL` partition and therefore resolves identically for EVERY workspace, which is
 * precisely the shape where the override leaked a real cross-tenant value.
 *
 * It is seeded through `saveDefinition` rather than the register-definitions route because the one
 * pre-existing platform key (`core.presentation.activeThemeId`) declares `scopes: global` only, so
 * no workspace-layer row can legally exist for it — and a workspace-layer row is the thing under
 * test. Both tenants' value rows are likewise planted at the repo layer; the fixture's job is to
 * put real rows in the real tables, and the READ path is what the assertions exercise.
 */
const PLATFORM_NAMESPACE = "core.audit";
const PLATFORM_KEY = "leakProbe";
const PLATFORM_SETTING_ID = "setting-core-audit-leak-probe";

/** Registers `site.audit.leakProbe` (workspace|user scope) as the owner, via the real HTTP route. */
async function registerProbeDefinition(baseUrl: string, cookie: string, deps: RouteDeps): Promise<void> {
  const res = await fetch(`${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/definitions`, {
    method: "POST",
    headers: { "content-type": "application/json", cookie },
    body: JSON.stringify({
      definitions: [
        {
          ownerKind: "site",
          namespace: "site.audit",
          key: "leakProbe",
          schemaJson: { type: "string" },
          defaultJson: "unset-default",
          scopes: 6, // workspace(2) | user(4)
        },
      ],
    }),
  });
  assert.equal(res.status, 200, "fixture definition registration must succeed");
}

async function probeSettingId(deps: RouteDeps): Promise<string> {
  const def = await deps.settingsRepo.findActiveDefinition({
    namespace: "site.audit",
    key: "leakProbe",
    workspaceId: deps.workspaceId,
  });
  assert.ok(def, "the probe definition must resolve in the caller's own workspace partition");
  return def.settingId;
}

/** Seeds a platform-partition (`workspace_id IS NULL`) definition that both tenants resolve. */
async function seedPlatformDefinition(deps: RouteDeps): Promise<string> {
  await deps.settingsRepo.saveDefinition({
    settingId: PLATFORM_SETTING_ID,
    version: 1,
    workspaceId: null,
    namespace: PLATFORM_NAMESPACE,
    key: PLATFORM_KEY,
    ownerKind: "core",
    ownerId: null,
    schema: { type: "string" },
    defaultValue: "unset-default",
    scopes: 6, // workspace(2) | user(4)
    secret: false,
    status: "active",
    aliasOfNamespace: null,
    aliasOfKey: null,
    coercionTag: null,
    createdAt: deps.clock.nowIso(),
    updatedAt: deps.clock.nowIso(),
  });
  return PLATFORM_SETTING_ID;
}

/**
 * Seeds a second tenant holding a workspace-layer value for the SAME settingId. This is the data
 * the bypass exposed: `setting_values_workspace` is keyed `(workspace_id, setting_id)`, so one
 * definition legitimately has a distinct row per tenant.
 */
async function seedOtherTenantWorkspaceValue(deps: RouteDeps, settingId: string): Promise<void> {
  await deps.workspaceRepo.insert({
    id: OTHER_WORKSPACE_ID,
    name: OTHER_WORKSPACE_ID,
    slug: OTHER_WORKSPACE_ID,
    createdAt: deps.clock.nowIso(),
  });
  await deps.settingsRepo.saveWorkspaceValue({
    settingId,
    scope: "workspace",
    workspaceId: OTHER_WORKSPACE_ID,
    principalId: null,
    valueJson: OTHER_WORKSPACE_SECRET,
    state: "set",
    defVersion: 1,
    seq: 1,
    updatedBy: "seed-other-tenant",
    updatedAt: deps.clock.nowIso(),
    originPluginId: null,
  });

  // Sanity-check the fixture itself: the other tenant's row really is in the same database this
  // request reaches, so a passing test means the guard blocked the read — not that there was
  // nothing there to leak.
  const seeded = await deps.settingsRepo.getWorkspaceValue({ workspaceId: OTHER_WORKSPACE_ID, settingId });
  assert.equal(seeded?.valueJson, OTHER_WORKSPACE_SECRET, "fixture precondition: other tenant's value is stored");
}

/** Plants the caller's OWN workspace-layer value for the platform key. */
async function seedOwnWorkspaceValue(deps: RouteDeps, settingId: string): Promise<void> {
  await deps.settingsRepo.saveWorkspaceValue({
    settingId,
    scope: "workspace",
    workspaceId: deps.workspaceId,
    principalId: null,
    valueJson: OWN_WORKSPACE_VALUE,
    state: "set",
    defVersion: 1,
    seq: 5,
    updatedBy: "seed-own-tenant",
    updatedAt: deps.clock.nowIso(),
    originPluginId: null,
  });
}

let grantCounter = 0;

/** Registers a principal holding ONLY the given permission strings. Mirrors
 * `comments-settings-routes.test.ts`'s/`forms-auth.test.ts`'s `loginWithPermissions` pattern. */
async function loginWithPermissions(
  deps: RouteDeps,
  baseUrl: string,
  permissions: readonly string[]
): Promise<{ cookie: string; principalId: string }> {
  await deps.identityReady;
  const suffix = `${++grantCounter}`;
  const principalId = `grant-principal-settings-read-scoping-${suffix}`;
  const policyId = `grant-policy-settings-read-scoping-${suffix}`;
  const username = `grant-settings-read-scoping-${suffix}`;

  await deps.principalRepo.save({
    id: principalId,
    workspaceId: deps.workspaceId,
    kind: "user",
    displayName: `Grants: ${permissions.join(", ")}`,
    status: "active",
    createdAt: deps.clock.nowIso(),
  });
  await deps.userRepo.save({
    principalId,
    workspaceId: deps.workspaceId,
    username,
    passwordHash: await deps.passwordHasher.hash("grant-pw"),
  });
  await deps.policyRepo.save({
    id: policyId,
    workspaceId: deps.workspaceId,
    name: `grant-policy-${suffix}`,
    isBuiltin: false,
    isFrozen: false,
  });
  for (const permission of permissions) {
    await deps.policyPermissionRepo.save({
      id: `grant-pp-${suffix}-${permission}`,
      workspaceId: deps.workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await deps.principalPolicyRepo.save({
    id: `grant-link-${suffix}`,
    workspaceId: deps.workspaceId,
    principalId,
    policyId,
  });

  const login = await fetch(`${baseUrl}/api/admin/v1/auth/login`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ username, password: "grant-pw" }),
  });
  assert.equal(login.status, 200);
  return { cookie: login.headers.get("set-cookie")?.split(";")[0] ?? "", principalId };
}

// ---------------------------------------------------------------------------
// F2 — cross-workspace reads via ?workspaceId=
// ---------------------------------------------------------------------------

test("F2: SETTINGS_GET_RAW with ?workspaceId=<other tenant> must NOT return the other tenant's workspace-layer value", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const settingId = await seedPlatformDefinition(deps);
  await seedOtherTenantWorkspaceValue(deps, settingId);
  await seedOwnWorkspaceValue(deps, settingId);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw` +
      `?namespace=${PLATFORM_NAMESPACE}&key=${PLATFORM_KEY}&workspaceId=${OTHER_WORKSPACE_ID}`,
    { headers: { cookie } }
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as { key: string; workspace: unknown };
  assert.notEqual(
    body.workspace,
    OTHER_WORKSPACE_SECRET,
    "the ?workspaceId override must not expose another tenant's raw value"
  );
  assert.equal(body.workspace, OWN_WORKSPACE_VALUE, "the read stays pinned to the authorized workspace");
});

test("F2: SETTINGS_GET_EFFECTIVE with ?workspaceId=<other tenant> must NOT resolve against the other tenant's layer", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie } = await bootAuthenticated(app, t);
  const settingId = await seedPlatformDefinition(deps);
  await seedOtherTenantWorkspaceValue(deps, settingId);
  await seedOwnWorkspaceValue(deps, settingId);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/effective` +
      `?namespace=${PLATFORM_NAMESPACE}&workspaceId=${OTHER_WORKSPACE_ID}`,
    { headers: { cookie } }
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as { data: Array<{ key: string; value: unknown }> };
  const probe = body.data.find((row) => row.key === PLATFORM_KEY);
  assert.ok(probe, "the platform key resolves for the caller's own workspace");
  assert.notEqual(
    probe.value,
    OTHER_WORKSPACE_SECRET,
    "the ?workspaceId override must not expose another tenant's effective value"
  );
  assert.equal(probe.value, OWN_WORKSPACE_VALUE, "the read stays pinned to the authorized workspace");
});

// ---------------------------------------------------------------------------
// F2 — cross-principal reads via ?principalId=
// ---------------------------------------------------------------------------

test("F2: SETTINGS_GET_RAW with ?principalId=<another principal> is 403 FORBIDDEN for a caller holding only settings.read.raw", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  await registerProbeDefinition(baseUrl, ownerCookie, deps);
  const settingId = await probeSettingId(deps);

  const victim = await loginWithPermissions(deps, baseUrl, ["settings.read.raw"]);
  const snoop = await loginWithPermissions(deps, baseUrl, ["settings.read.raw"]);
  await deps.settingsRepo.saveUserValue({
    settingId,
    scope: "user",
    workspaceId: deps.workspaceId,
    principalId: victim.principalId,
    valueJson: "victims-private-user-layer-value",
    state: "set",
    defVersion: 1,
    seq: 2,
    updatedBy: "seed-victim",
    updatedAt: deps.clock.nowIso(),
    originPluginId: null,
  });

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw` +
      `?namespace=site.audit&key=leakProbe&principalId=${victim.principalId}`,
    { headers: { cookie: snoop.cookie } }
  );

  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "settings.user.read");
});

test("F2: SETTINGS_GET_EFFECTIVE with ?principalId=<another principal> is 403 FORBIDDEN for a caller holding only settings.read", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  await registerProbeDefinition(baseUrl, ownerCookie, deps);

  const victim = await loginWithPermissions(deps, baseUrl, ["settings.read"]);
  const snoop = await loginWithPermissions(deps, baseUrl, ["settings.read"]);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/effective` +
      `?namespace=site.audit&principalId=${victim.principalId}`,
    { headers: { cookie: snoop.cookie } }
  );

  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "settings.user.read");
});

test("F2 control: reading your OWN user layer via ?principalId=<self> needs no cross-principal grant", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  await registerProbeDefinition(baseUrl, ownerCookie, deps);
  const settingId = await probeSettingId(deps);

  const self = await loginWithPermissions(deps, baseUrl, ["settings.read.raw"]);
  await deps.settingsRepo.saveUserValue({
    settingId,
    scope: "user",
    workspaceId: deps.workspaceId,
    principalId: self.principalId,
    valueJson: "my-own-user-layer-value",
    state: "set",
    defVersion: 1,
    seq: 3,
    updatedBy: "seed-self",
    updatedAt: deps.clock.nowIso(),
    originPluginId: null,
  });

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw` +
      `?namespace=site.audit&key=leakProbe&principalId=${self.principalId}`,
    { headers: { cookie: self.cookie } }
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as { user: unknown };
  assert.equal(body.user, "my-own-user-layer-value");
});

test("F2 control: a settings.user.read holder may read another principal's layer (Settings screen's target-principal selector keeps working)", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  await registerProbeDefinition(baseUrl, ownerCookie, deps);
  const settingId = await probeSettingId(deps);

  const victim = await loginWithPermissions(deps, baseUrl, ["settings.read.raw"]);
  await deps.settingsRepo.saveUserValue({
    settingId,
    scope: "user",
    workspaceId: deps.workspaceId,
    principalId: victim.principalId,
    valueJson: "target-principal-user-layer-value",
    state: "set",
    defVersion: 1,
    seq: 4,
    updatedBy: "seed-target",
    updatedAt: deps.clock.nowIso(),
    originPluginId: null,
  });

  const reader = await loginWithPermissions(deps, baseUrl, ["settings.read.raw", "settings.user.read"]);
  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw` +
      `?namespace=site.audit&key=leakProbe&principalId=${victim.principalId}`,
    { headers: { cookie: reader.cookie } }
  );

  assert.equal(res.status, 200);
  const body = (await res.json()) as { user: unknown };
  assert.equal(body.user, "target-principal-user-layer-value");
});

test("F2: settings.user.write alone does NOT authorize a cross-principal read — the read permission is not implied by the write one", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  await registerProbeDefinition(baseUrl, ownerCookie, deps);

  const victim = await loginWithPermissions(deps, baseUrl, ["settings.read.raw"]);
  // Holds the WRITE grant but not the new read grant. Real installations never sit in this state
  // (permissions.ts fans read out to every write-holder at boot); this pins the authorization rule
  // itself, so a future edit cannot quietly re-conflate read with write.
  const writerOnly = await loginWithPermissions(deps, baseUrl, ["settings.read.raw", "settings.user.write"]);

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw` +
      `?namespace=site.audit&key=leakProbe&principalId=${victim.principalId}`,
    { headers: { cookie: writerOnly.cookie } }
  );

  assert.equal(res.status, 403);
  const body = (await res.json()) as { code: string; details: { permission: string } };
  assert.equal(body.code, "FORBIDDEN");
  assert.equal(body.details.permission, "settings.user.read");
});

test("F2 control: the owner's `*` wildcard still covers the cross-principal read", async (t) => {
  const { app, deps } = buildTestApp();
  await deps.settingsReady;
  const { baseUrl, cookie: ownerCookie } = await bootAuthenticated(app, t);
  await registerProbeDefinition(baseUrl, ownerCookie, deps);
  const settingId = await probeSettingId(deps);

  const victim = await loginWithPermissions(deps, baseUrl, ["settings.read.raw"]);
  await deps.settingsRepo.saveUserValue({
    settingId,
    scope: "user",
    workspaceId: deps.workspaceId,
    principalId: victim.principalId,
    valueJson: "owner-readable-user-layer-value",
    state: "set",
    defVersion: 1,
    seq: 6,
    updatedBy: "seed-owner-case",
    updatedAt: deps.clock.nowIso(),
    originPluginId: null,
  });

  const res = await fetch(
    `${baseUrl}/api/admin/v1/workspaces/${deps.workspaceId}/settings/raw` +
      `?namespace=site.audit&key=leakProbe&principalId=${victim.principalId}`,
    { headers: { cookie: ownerCookie } }
  );

  assert.equal(res.status, 200);
  assert.equal(((await res.json()) as { user: unknown }).user, "owner-readable-user-layer-value");
});
