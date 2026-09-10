import assert from "node:assert/strict";
import test from "node:test";

import {
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
  InMemorySessionRepo,
  InMemoryUserRepo,
  authorize,
  migrateDeprecatedPermissionGrants,
  seedIdentity,
  type IdentityRepos,
} from "@jini-ai/cms/identity";

import { applyBuiltinRoleGrants } from "../builtin-role-grants.js";
// Importing for its module-evaluation side effect (the `registerPermissionMigration`/
// `registerBuiltinRoleGrant` calls) — same reasoning `edit-html-permission.test.ts` documents for
// its own equivalent import: a test file that never imports the module under test would pass
// vacuously if that module were ever deleted, since nothing would register anything.
import "../site-token-permission.js";

/**
 * @file `admin.security.tokens.manage` is a REAL permission, and `editor`/`viewer` do not hold it.
 *
 * Same shape as `features/pages/__tests__/edit-html-permission.test.ts` (see that file's own
 * header for the full "why the whole chain is real" reasoning this mirrors) — the interesting
 * failure mode is not "does `authorize()` work", it is "does the permission row actually reach the
 * admin role, in a workspace seeded the way every real install is seeded", which spans
 * `seedIdentity`'s built-in grants, `migrateDeprecatedPermissionGrants`' fan-out, and
 * `applyBuiltinRoleGrants`' direct backfill — all three real here, over real in-memory adapters.
 *
 * Two vintages, same reasoning as `edit-html-permission.test.ts`'s `Vintage`: `"fresh"` is a
 * workspace whose admin policy holds `admin.integrations.manage` (current
 * `BUILTIN_ADMIN_PERMISSIONS`); `"pre-integrations-manage"` simulates a workspace seeded before
 * that permission existed, where the `admin.integrations.manage -> admin.security.tokens.manage`
 * migration's `from` row is absent and only the direct `registerBuiltinRoleGrant` reaches admin.
 */

const SITE_TOKEN_MANAGE = "admin.security.tokens.manage";
const INTEGRATIONS_MANAGE = "admin.integrations.manage";
const WORKSPACE = "ws-site-token-privilege";
const clock = { nowIso: () => "2026-09-09T00:00:00.000Z" };

function counterIdGen(prefix: string) {
  let n = 0;
  return { newId: () => `${prefix}-${++n}` };
}

const fakeHasher = {
  hash: async (password: string) => `hashed:${password}`,
  verify: async (hash: string, password: string) => hash === `hashed:${password}`,
};

interface Chain {
  readonly repos: IdentityRepos;
  readonly principals: Record<"owner" | "admin" | "editor" | "viewer", string>;
  can(principalId: string, permission: string): Promise<{ allowed: boolean; reason: string }>;
}

type Vintage = "fresh" | "pre-integrations-manage";

async function buildChain(vintage: Vintage = "fresh"): Promise<Chain> {
  const repos: IdentityRepos = {
    principals: new InMemoryPrincipalRepo(),
    users: new InMemoryUserRepo(),
    sessions: new InMemorySessionRepo(),
    roles: new InMemoryRoleRepo(),
    policies: new InMemoryPolicyRepo(),
    policyPermissions: new InMemoryPolicyPermissionRepo(),
    rolePolicies: new InMemoryRolePolicyRepo(),
    principalRoles: new InMemoryPrincipalRoleRepo(),
    principalPolicies: new InMemoryPrincipalPolicyRepo(),
  };
  const idGen = counterIdGen("seed");

  await seedIdentity({
    deps: { repos, hasher: fakeHasher, clock, idGen },
    input: { workspaceId: WORKSPACE, ownerUsername: "owner-under-test", ownerPassword: "irrelevant" },
  });

  if (vintage === "pre-integrations-manage") await dropAdminIntegrationsManage(repos);

  await migrateDeprecatedPermissionGrants({
    policyPermissions: repos.policyPermissions,
    policies: repos.policies,
    idGen: counterIdGen("mig"),
    workspaceId: WORKSPACE,
  });

  await applyBuiltinRoleGrants({
    roles: repos.roles,
    rolePolicies: repos.rolePolicies,
    policies: repos.policies,
    policyPermissions: repos.policyPermissions,
    idGen: counterIdGen("backfill"),
    workspaceId: WORKSPACE,
  });

  const roles = await repos.roles.list({ workspaceId: WORKSPACE });
  const principals = {} as Chain["principals"];
  for (const name of ["owner", "admin", "editor", "viewer"] as const) {
    const role = roles.find((row) => row.name === name);
    assert.ok(role, `the built-in '${name}' role must exist after seeding`);

    const principalId = `principal-${name}`;
    await repos.principals.save({ id: principalId, workspaceId: WORKSPACE, kind: "user", displayName: name, status: "active", createdAt: clock.nowIso() });
    await repos.principalRoles.save({ id: `pr-${name}`, workspaceId: WORKSPACE, principalId, roleId: role.id });
    principals[name] = principalId;
  }

  const can = (principalId: string, permission: string) =>
    authorize({
      deps: {
        principals: repos.principals,
        principalRoles: repos.principalRoles,
        rolePolicies: repos.rolePolicies,
        principalPolicies: repos.principalPolicies,
        policyPermissions: repos.policyPermissions,
      },
      principalId,
      permission,
      context: { workspaceId: WORKSPACE, entityType: "site-token" },
    });

  return { repos, principals, can };
}

/** Rewind the seeded `admin` policy to a pre-`admin.integrations.manage` vintage, same technique
 *  `edit-html-permission.test.ts`'s `dropAdminThemeEdit` uses for its own anchor permission. */
async function dropAdminIntegrationsManage(repos: IdentityRepos): Promise<void> {
  const policy = await repos.policies.findByName({ workspaceId: WORKSPACE, name: "admin-builtin-policy" });
  assert.ok(policy, "seedIdentity must have created the built-in admin policy");

  const grants = await repos.policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: policy.id });
  const anchor = grants.find((row) => row.permission === INTEGRATIONS_MANAGE);
  assert.ok(anchor, "the current admin seed list must still contain admin.integrations.manage for this rewind to mean anything");

  await repos.policyPermissions.delete({ workspaceId: WORKSPACE, id: anchor.id });
}

// ---------------------------------------------------------------------------
// The refusal — the primary certification.
// ---------------------------------------------------------------------------

test("an 'editor' principal does NOT hold admin.security.tokens.manage", async () => {
  const { principals, can } = await buildChain();
  const decision = await can(principals.editor, SITE_TOKEN_MANAGE);
  assert.equal(decision.allowed, false, "editor must not be able to view/generate the root key");
  assert.equal(decision.reason, "no_grant");
});

test("a 'viewer' principal does NOT hold admin.security.tokens.manage", async () => {
  const { principals, can } = await buildChain();
  const decision = await can(principals.viewer, SITE_TOKEN_MANAGE);
  assert.equal(decision.allowed, false);
  assert.equal(decision.reason, "no_grant");
});

// ---------------------------------------------------------------------------
// The grant — present to prove the gate is a gate and not a wall.
// ---------------------------------------------------------------------------

test("an 'admin' principal in a freshly-seeded workspace holds admin.security.tokens.manage", async () => {
  const { principals, can } = await buildChain();
  const decision = await can(principals.admin, SITE_TOKEN_MANAGE);
  assert.equal(decision.allowed, true, "gating on a permission no role holds would break the feature instead of securing it");
  assert.equal(decision.reason, "matched");
});

test("the 'owner' principal is unaffected — it clears the gate on its '*' wildcard, not on a granted row", async () => {
  const { principals, can } = await buildChain();
  const decision = await can(principals.owner, SITE_TOKEN_MANAGE);
  assert.equal(decision.allowed, true);
  assert.equal(decision.reason, "owner_wildcard");
});

// ---------------------------------------------------------------------------
// The vintage that actually ships: a workspace seeded before
// admin.integrations.manage existed. The migration's `from` row is absent
// there, so ONLY the direct registerBuiltinRoleGrant can reach admin.
// ---------------------------------------------------------------------------

test("an 'admin' principal in a pre-integrations-manage workspace ALSO holds admin.security.tokens.manage — the grant cannot depend on a seed row that workspace never got", async () => {
  const { principals, can } = await buildChain("pre-integrations-manage");
  const decision = await can(principals.admin, SITE_TOKEN_MANAGE);
  assert.equal(decision.allowed, true, "admin must hold this permission even in an already-seeded workspace missing the migration's anchor row");
  assert.equal(decision.reason, "matched");
});

test("that pre-integrations-manage backfill reaches ONLY admin — editor and viewer are still refused", async () => {
  const { principals, can } = await buildChain("pre-integrations-manage");

  const editorDecision = await can(principals.editor, SITE_TOKEN_MANAGE);
  assert.equal(editorDecision.allowed, false);
  assert.equal(editorDecision.reason, "no_grant");

  const viewerDecision = await can(principals.viewer, SITE_TOKEN_MANAGE);
  assert.equal(viewerDecision.allowed, false);
  assert.equal(viewerDecision.reason, "no_grant");
});

test("the pre-integrations-manage backfill is additive — it never invents an admin.integrations.manage row", async () => {
  const { repos } = await buildChain("pre-integrations-manage");

  const policy = await repos.policies.findByName({ workspaceId: WORKSPACE, name: "admin-builtin-policy" });
  assert.ok(policy);
  const held = (await repos.policyPermissions.listByPolicyId({ workspaceId: WORKSPACE, policyId: policy.id })).map((row) => row.permission);

  assert.ok(held.includes(SITE_TOKEN_MANAGE), "the one capability under discussion is granted");
  assert.ok(!held.includes(INTEGRATIONS_MANAGE), "restoring root-key management must not also silently restore integration-connection management");
});
