import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import { identityAgentToolCatalog } from "../../identity/agent-tools";
import { Argon2PasswordHasher } from "../../identity/hasher";
import type { IdentityRepos } from "../../identity/ports";
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
} from "../../identity/repo.memory";
import { seedIdentity } from "../../identity/seed";
import { GrantExceedsIssuerError, IdentityForbiddenError } from "../../identity/types";
import type { RouteDeps } from "../../server/routes/types";
import { buildAssistantToolRegistrations } from "../tool-registrations";

/**
 * @file The ADR-021 half of the identity tool wiring — the sibling of
 * `tool-registrations.identity-contracts.test.ts`, and the identity counterpart of
 * `tool-registrations.authorization.test.ts`.
 *
 * Identity is the escalation-dense domain, so this file is built on the REAL in-memory identity
 * repos and a REAL `seedIdentity()` rather than a hand-written fake `authorize`. That matters: the
 * gate under test is the actual `authorize()` walking real principal -> role -> policy ->
 * permission rows, and the INV-07 grant clamp is the actual clamp resolving the caller's real
 * effective permissions. A stubbed `authorize` returning `{allowed:false}` would prove only that
 * the handler forwards a boolean.
 *
 * What is pinned:
 * 1. every wired tool refuses a caller holding NO permissions, and writes nothing when it refuses;
 * 2. every wired tool ACCEPTS a caller holding exactly the permission its catalog entry declares —
 *    derived from the catalog, so a tool whose declared permission is not the one its service
 *    function checks fails here rather than being documented wrongly;
 * 3. the OR gates are genuinely ORs (each half alone suffices), which is what `orPermission`
 *    claims;
 * 4. the INV-07 clamp survives the tool path: an agent acting for a non-owner cannot assign the
 *    built-in `owner` role, i.e. cannot use a tool to exceed its own caller;
 * 5. the deliberate omissions (`resetUserPassword`, every policy transition) are still omissions.
 */

const WORKSPACE_ID = "workspace-tools";
/** Real argon2id at test-only cost params — the hasher is exercised, not mocked (mirrors `identity/__tests__/grant-service.test.ts`). */
const HASHER = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });

function counterIdGen() {
  let n = 0;
  return { newId: () => `id-${++n}` };
}

interface Harness {
  deps: RouteDeps;
  repos: IdentityRepos;
  ownerPrincipalId: string;
}

/** A seeded workspace (owner + the four built-in roles/policies) exposed as a `RouteDeps` stand-in. */
async function buildHarness(): Promise<Harness> {
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
  const idGen = counterIdGen();
  const clock = { nowIso: () => "2026-07-29T00:00:00.000Z" };

  const { ownerPrincipalId } = await seedIdentity({
    deps: { repos, hasher: HASHER, clock, idGen },
    input: { workspaceId: WORKSPACE_ID },
  });

  const deps = {
    workspaceId: WORKSPACE_ID,
    clock,
    idGen,
    passwordHasher: HASHER,
    ownerPrincipalId: Promise.resolve(ownerPrincipalId),
    principalRepo: repos.principals,
    userRepo: repos.users,
    sessionRepo: repos.sessions,
    roleRepo: repos.roles,
    policyRepo: repos.policies,
    policyPermissionRepo: repos.policyPermissions,
    rolePolicyRepo: repos.rolePolicies,
    principalRoleRepo: repos.principalRoles,
    principalPolicyRepo: repos.principalPolicies,
  } as unknown as RouteDeps;

  return { deps, repos, ownerPrincipalId };
}

/** Mint a bare human principal with no grants at all. */
async function addPrincipal(repos: IdentityRepos, id: string): Promise<string> {
  await repos.principals.save({
    id,
    workspaceId: WORKSPACE_ID,
    kind: "user",
    displayName: id,
    status: "active",
    createdAt: "2026-01-01T00:00:00.000Z",
  });
  await repos.users.save({ principalId: id, workspaceId: WORKSPACE_ID, username: id, passwordHash: "hash" });
  return id;
}

/**
 * Give `principalId` exactly `permissions`, unconstrained, via a fresh non-built-in policy attached
 * directly. Written through the repos rather than through `createPolicy`/`attachPolicy` because
 * those transitions are themselves gated — this is test setup, not a transition under test.
 */
async function grant(repos: IdentityRepos, principalId: string, permissions: readonly string[]): Promise<void> {
  const policyId = `policy-for-${principalId}-${permissions.join("-")}`;
  await repos.policies.save({ id: policyId, workspaceId: WORKSPACE_ID, name: policyId, isBuiltin: false, isFrozen: false });
  for (const permission of permissions) {
    await repos.policyPermissions.save({
      id: `pp-${policyId}-${permission}`,
      workspaceId: WORKSPACE_ID,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }
  await repos.principalPolicies.save({ id: `pa-${policyId}`, workspaceId: WORKSPACE_ID, principalId, policyId });
}

function executionContext(principalId: string, input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: principalId }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

const IDENTITY_TOOL_IDS: ReadonlySet<string> = new Set(identityAgentToolCatalog.map((tool) => tool.name));

function identityRegistrations(deps: RouteDeps): Map<string, ToolRegistration> {
  return new Map(
    buildAssistantToolRegistrations(deps)
      .filter((registration) => IDENTITY_TOOL_IDS.has(registration.descriptor.id))
      .map((registration) => [registration.descriptor.id, registration]),
  );
}

function wired(deps: RouteDeps, toolId: string): ToolRegistration {
  const found = identityRegistrations(deps).get(toolId);
  assert.ok(found, `expected '${toolId}' to be wired`);
  return found;
}

/** The permission set a tool's catalog entry declares — both halves when the gate is an OR. */
function declaredPermissions(toolId: string): string[] {
  const entry = identityAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for wired tool '${toolId}'`);
  return entry.authorization.orPermission ? [entry.authorization.permission, entry.authorization.orPermission] : [entry.authorization.permission];
}

/**
 * Minimal input that gets each tool past its own argument parsing and into the gate.
 *
 * Targets are seeded by `seedTargets` below so the call reaches the permission check with real
 * rows behind it — a not-found target would short-circuit before the gate on some transitions and
 * make a "refused" assertion prove nothing.
 */
const TOOL_INPUTS: Record<string, Record<string, unknown>> = {
  identity_user_list: {},
  identity_role_list: {},
  identity_policy_list: {},
  identity_user_create: { username: "newcomer", password: "pw-valid-1234" },
  identity_user_update_email: { principalId: "target-principal", email: "a@b.test" },
  identity_user_disable: { principalId: "target-principal" },
  identity_user_enable: { principalId: "target-principal" },
  identity_role_create: { name: "Custom Role" },
  identity_role_assign: { principalId: "target-principal", roleId: "target-role" },
  identity_role_rename: { roleId: "target-role", name: "Renamed" },
  identity_role_delete: { roleId: "target-role" },
  identity_policy_create: { name: "Custom Policy" },
  identity_policy_update: { policyId: "target-policy", name: "Renamed Policy" },
  identity_policy_delete: { policyId: "target-policy" },
  identity_policy_attach: { principalId: "target-principal", policyId: "target-policy" },
};

/** Seed the target principal, a custom role, and a custom policy the fixtures reference. */
async function seedTargets(repos: IdentityRepos): Promise<void> {
  await addPrincipal(repos, "target-principal");
  await repos.roles.save({ id: "target-role", workspaceId: WORKSPACE_ID, name: "Target Role", isBuiltin: false });
  await repos.policies.save({ id: "target-policy", workspaceId: WORKSPACE_ID, name: "Target Policy", isBuiltin: false, isFrozen: false });
}

/** A cheap durable-state fingerprint: every table these tools can write. */
async function stateFingerprint(repos: IdentityRepos): Promise<string> {
  const principals = await repos.principals.list({ workspaceId: WORKSPACE_ID });
  const roles = await repos.roles.list({ workspaceId: WORKSPACE_ID });
  const policies = await repos.policies.list({ workspaceId: WORKSPACE_ID });
  const assignments = await Promise.all(principals.map((p) => repos.principalRoles.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: p.id })));
  const attachments = await Promise.all(principals.map((p) => repos.principalPolicies.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: p.id })));
  const users = await Promise.all(principals.map((p) => repos.users.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: p.id })));
  return JSON.stringify({ principals, roles, policies, assignments, attachments, users });
}

// ---------------------------------------------------------------------------
// 1. Coverage — a newly wired tool cannot silently skip this file
// ---------------------------------------------------------------------------

test("every wired identity tool has an input fixture here — wiring one without adding it fails rather than going untested", async () => {
  const { deps } = await buildHarness();
  const wiredIds = [...identityRegistrations(deps).keys()].sort();

  assert.deepEqual(wiredIds, Object.keys(TOOL_INPUTS).sort());
  assert.deepEqual(wiredIds, identityAgentToolCatalog.map((tool) => tool.name).sort(), "every catalog entry must be wired, and nothing else");
  assert.equal(wiredIds.length, 15);
});

// ---------------------------------------------------------------------------
// 2. A caller with no permissions is refused, and nothing is written
// ---------------------------------------------------------------------------

for (const toolId of Object.keys(TOOL_INPUTS)) {
  test(`${toolId}: a principal holding NO permissions is refused`, async () => {
    const { deps, repos } = await buildHarness();
    await seedTargets(repos);
    const caller = await addPrincipal(repos, "ungranted-caller");

    await assert.rejects(
      () => wired(deps, toolId).handler(executionContext(caller, TOOL_INPUTS[toolId])),
      (error: unknown) => {
        assert.ok(error instanceof IdentityForbiddenError, `expected IdentityForbiddenError, got ${String(error)}`);
        assert.match((error as Error).message, new RegExp(caller));
        return true;
      },
    );
  });

  test(`${toolId}: the refusal happens before any durable write`, async () => {
    const { deps, repos } = await buildHarness();
    await seedTargets(repos);
    const caller = await addPrincipal(repos, "ungranted-caller");

    const before = await stateFingerprint(repos);
    await wired(deps, toolId)
      .handler(executionContext(caller, TOOL_INPUTS[toolId]))
      .catch(() => undefined);

    assert.equal(await stateFingerprint(repos), before, "the permission gate must run ahead of every durable effect, not alongside it");
  });

  test(`${toolId}: a principal holding exactly the permission its catalog entry declares gets past the gate`, async () => {
    const { deps, repos } = await buildHarness();
    await seedTargets(repos);
    const caller = await addPrincipal(repos, "granted-caller");
    await grant(repos, caller, declaredPermissions(toolId));

    const error = await wired(deps, toolId)
      .handler(executionContext(caller, TOOL_INPUTS[toolId]))
      .then(() => null, (e: unknown) => e);

    // Not "succeeds": some tools legitimately fail past the gate for domain reasons (the INV-07
    // clamp, a still-referenced role). What is asserted is that the gate itself is satisfied by
    // exactly what the catalog advertises — if it were not, this would be a FORBIDDEN.
    assert.equal(
      error instanceof IdentityForbiddenError,
      false,
      `'${toolId}' refused a caller holding its own declared permission(s) [${declaredPermissions(toolId).join(", ")}] — the catalog disagrees with the code: ${String(error)}`,
    );
  });
}

// ---------------------------------------------------------------------------
// 3. The OR gates are genuinely ORs
// ---------------------------------------------------------------------------

const OR_GATED_TOOL_IDS = identityAgentToolCatalog.filter((tool) => tool.authorization.orPermission).map((tool) => tool.name);

test("the catalog declares an OR gate for exactly the three admin-onboarding tools", () => {
  assert.deepEqual(OR_GATED_TOOL_IDS.sort(), ["identity_user_create", "identity_user_list", "identity_user_update_email"]);
});

for (const toolId of OR_GATED_TOOL_IDS) {
  for (const permission of declaredPermissions(toolId)) {
    test(`${toolId}: '${permission}' ALONE satisfies the gate — the declared OR is real, not decoration`, async () => {
      const { deps, repos } = await buildHarness();
      await seedTargets(repos);
      const caller = await addPrincipal(repos, `caller-${permission}`);
      await grant(repos, caller, [permission]);

      const error = await wired(deps, toolId)
        .handler(executionContext(caller, TOOL_INPUTS[toolId]))
        .then(() => null, (e: unknown) => e);

      assert.equal(error instanceof IdentityForbiddenError, false, `'${permission}' alone should satisfy ${toolId}: ${String(error)}`);
    });
  }
}

test("a tool with no declared OR really is single-permission — role.manage holders cannot reach the user tools", async () => {
  const { deps, repos } = await buildHarness();
  await seedTargets(repos);
  const caller = await addPrincipal(repos, "role-manager-only");
  await grant(repos, caller, ["role.manage"]);

  await assert.rejects(
    () => wired(deps, "identity_user_disable").handler(executionContext(caller, TOOL_INPUTS.identity_user_disable)),
    IdentityForbiddenError,
    "role.manage must not open the user-lifecycle tools",
  );
});

// ---------------------------------------------------------------------------
// 4. INV-07 — an agent cannot use a tool to exceed its own caller
// ---------------------------------------------------------------------------

test("identity_role_assign: a non-owner caller cannot assign the built-in owner role — the INV-07 clamp survives the tool path", async () => {
  const { deps, repos } = await buildHarness();
  const caller = await addPrincipal(repos, "role-manager");
  await grant(repos, caller, ["role.manage"]);
  const target = await addPrincipal(repos, "escalation-target");

  const roles = await repos.roles.list({ workspaceId: WORKSPACE_ID });
  const ownerRole = roles.find((role) => role.name === "owner");
  assert.ok(ownerRole, "the seed must provide a built-in owner role for this test to mean anything");

  await assert.rejects(
    () => wired(deps, "identity_role_assign").handler(executionContext(caller, { principalId: target, roleId: ownerRole.id })),
    GrantExceedsIssuerError,
    "a role.manage holder that does not itself hold '*' must not be able to confer it through an agent tool",
  );

  const assignments = await repos.principalRoles.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: target });
  assert.deepEqual(assignments, [], "a refused grant must write no row");
});

test("identity_role_assign: the OWNER can assign the owner role — the clamp is a bound on the caller, not a blanket ban", async () => {
  const { deps, repos, ownerPrincipalId } = await buildHarness();
  const target = await addPrincipal(repos, "promotion-target");

  const roles = await repos.roles.list({ workspaceId: WORKSPACE_ID });
  const ownerRole = roles.find((role) => role.name === "owner");
  assert.ok(ownerRole);

  await wired(deps, "identity_role_assign").handler(executionContext(ownerPrincipalId, { principalId: target, roleId: ownerRole.id }));

  const assignments = await repos.principalRoles.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: target });
  assert.deepEqual(assignments.map((a) => a.roleId), [ownerRole.id]);
});

test("identity_policy_attach: a non-owner caller cannot attach the built-in owner policy — the INV-07 clamp survives this tool path too, identically to identity_role_assign", async () => {
  const { deps, repos } = await buildHarness();
  const caller = await addPrincipal(repos, "policy-manager");
  await grant(repos, caller, ["role.manage"]);
  const target = await addPrincipal(repos, "escalation-target-2");

  const policies = await repos.policies.list({ workspaceId: WORKSPACE_ID });
  const ownerPolicy = policies.find((policy) => policy.name === "owner" || policy.isBuiltin);
  assert.ok(ownerPolicy, "the seed must provide at least one built-in policy for this test to mean anything");

  await assert.rejects(
    () => wired(deps, "identity_policy_attach").handler(executionContext(caller, { principalId: target, policyId: ownerPolicy.id })),
    GrantExceedsIssuerError,
    "a role.manage holder that does not itself hold the policy's permissions unconstrained must not be able to confer them through an agent tool",
  );

  const attachments = await repos.principalPolicies.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: target });
  assert.deepEqual(attachments, [], "a refused grant must write no row");
});

test("identity_policy_delete / identity_policy_update: built-in policies are refused, so a tool cannot escalate by relabelling or removing one", async () => {
  const { deps, repos, ownerPrincipalId } = await buildHarness();
  const policies = await repos.policies.list({ workspaceId: WORKSPACE_ID });
  const builtin = policies.find((policy) => policy.isBuiltin);
  assert.ok(builtin, "the seed must provide at least one built-in policy for this test to mean anything");

  await assert.rejects(
    () => wired(deps, "identity_policy_update").handler(executionContext(ownerPrincipalId, { policyId: builtin.id, name: "Trusted Admin" })),
    /built-in/,
  );
  await assert.rejects(
    () => wired(deps, "identity_policy_delete").handler(executionContext(ownerPrincipalId, { policyId: builtin.id })),
    /built-in/,
  );

  const after = await repos.policies.list({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(after.find((policy) => policy.id === builtin.id)?.name, builtin.name);
});

test("identity_user_disable: the seeded owner cannot be disabled through a tool, even by the owner itself", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  await assert.rejects(
    () => wired(deps, "identity_user_disable").handler(executionContext(ownerPrincipalId, { principalId: ownerPrincipalId })),
    /seeded owner principal can never be disabled/,
    "locking the workspace out of its own management plane must not be an agent-reachable outcome",
  );
});

test("identity_role_rename / identity_role_delete: built-in roles are refused, so a tool cannot escalate 'viewer' by relabelling or removing it", async () => {
  const { deps, repos, ownerPrincipalId } = await buildHarness();
  const roles = await repos.roles.list({ workspaceId: WORKSPACE_ID });
  const viewer = roles.find((role) => role.name === "viewer");
  assert.ok(viewer?.isBuiltin, "viewer must be seeded built-in for this test to mean anything");

  await assert.rejects(
    () => wired(deps, "identity_role_rename").handler(executionContext(ownerPrincipalId, { roleId: viewer.id, name: "Trusted Admin" })),
    /built-in role cannot be renamed/,
  );
  await assert.rejects(
    () => wired(deps, "identity_role_delete").handler(executionContext(ownerPrincipalId, { roleId: viewer.id })),
    /built-in role cannot be deleted/,
  );

  const after = await repos.roles.list({ workspaceId: WORKSPACE_ID });
  assert.deepEqual(after.find((role) => role.id === viewer.id)?.name, "viewer");
});

// ---------------------------------------------------------------------------
// 5. The ToolPolicy layer, and the deliberate omissions
// ---------------------------------------------------------------------------

test("the ToolPolicy layer is a pass-through 'allow' for every identity registration — enforcement is the domain layer's, by design", async () => {
  const { deps } = await buildHarness();

  for (const [toolId, registration] of identityRegistrations(deps)) {
    const decision = registration.policy.authorize({
      principal: { id: "anyone" },
      run: { id: "run-1" },
      tool: registration.descriptor,
      input: TOOL_INPUTS[toolId],
    });
    assert.equal(decision, "allow", `${toolId}'s ToolPolicy is documented as a pass-through`);
  }
});

test("no password-reset tool is wired — the one identity transition with no INV-07 clamp stays human-UI-only", async () => {
  const { deps } = await buildHarness();
  const wiredIds = [...identityRegistrations(deps).keys()];

  assert.equal(
    wiredIds.some((id) => /password|credential|reset/i.test(id)),
    false,
    "resetUserPassword lets a user.manage holder take over the owner account; it must not be agent-reachable",
  );
  assert.equal(
    identityAgentToolCatalog.some((tool) => /password|credential|reset/i.test(tool.name)),
    false,
    "the omission belongs in the catalog too — an unwired-but-catalogued entry is still advertised by the ADR-014 tool filter",
  );
});

test("identity_policy_list/create/update/delete/attach are wired, but identity_policy_write_permission is NOT — the one policy transition with a shared-object blast radius stays human-UI-only", async () => {
  const { deps } = await buildHarness();
  const wiredIds = [...identityRegistrations(deps).keys()];

  for (const toolId of ["identity_policy_list", "identity_policy_create", "identity_policy_update", "identity_policy_delete", "identity_policy_attach"]) {
    assert.ok(wiredIds.includes(toolId), `${toolId} should be wired — it mirrors an already-wired role transition's risk profile`);
  }
  assert.equal(
    wiredIds.some((id) => /write.?permission/i.test(id)),
    false,
    "writePolicyPermission can silently widen access for every principal already attached to a shared policy, unlike the single-target tools above — it must not be agent-reachable",
  );
  assert.equal(
    identityAgentToolCatalog.some((tool) => /write.?permission/i.test(tool.name)),
    false,
    "the omission belongs in the catalog too — an unwired-but-catalogued entry is still advertised by the ADR-014 tool filter",
  );
});

test("every wired identity tool declares user.manage or role.manage — never a read-only or unrelated permission", () => {
  for (const toolId of Object.keys(TOOL_INPUTS)) {
    for (const permission of declaredPermissions(toolId)) {
      assert.ok(
        ["user.manage", "role.manage", "member.manage"].includes(permission),
        `${toolId} declares '${permission}', which is not one of the identity-admin permissions`,
      );
    }
  }
});
