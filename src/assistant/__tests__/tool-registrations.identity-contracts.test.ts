import assert from "node:assert/strict";
import test from "node:test";

/** `seedIdentity` requires an explicit owner password: `@jini-ai/cms` supplies no default,
 * so the host (or a test) always states the credential it is seeding. */
const SEED_OWNER_PASSWORD = "seed-owner-pw";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";

import {
  identityAgentToolCatalog,
  type IdentityAgentToolDefinition as AgentToolDefinition,
  type IdentityRepos,
  InMemoryPolicyPermissionRepo,
  InMemoryPolicyRepo,
  InMemoryPrincipalPolicyRepo,
  InMemoryPrincipalRepo,
  InMemoryPrincipalRoleRepo,
  InMemoryRolePolicyRepo,
  InMemoryRoleRepo,
  InMemorySessionRepo,
  InMemoryUserRepo,
  seedIdentity,
} from "@jini-ai/cms/identity";
import { Argon2PasswordHasher } from "@jini-ai/cms/identity/hasher";
import type { RouteDeps } from "../../server/routes/types.js";
import {
  assertRiskMetadataIsWirable,
  buildAssistantToolRegistrations,
} from "../tool-registrations.js";
import { resetToolContributorsForTests } from "../tool-contribution-registry.js";
import { contributeIdentityTools } from "../../features/identity/tool-registrations.js";
import { registerToolContributor } from "../tool-contribution-registry.js";

// Identity moved off `assistant/tool-registrations.ts`'s static `DOMAIN_SLICES` array onto the
// tool-contribution registry (2026-08-17, Stage 2 — see `tool-contribution-registry.ts`'s header),
// so `buildAssistantToolRegistrations` below no longer wires it unless something explicitly installs
// it first, mirroring what the real composition roots now do via `installFirstPartyToolContributors()`.
resetToolContributorsForTests();
registerToolContributor(contributeIdentityTools());

/**
 * @file The model-facing contract half of the identity tool wiring — companion to
 * `tool-registrations.identity-authorization.test.ts`, which covers the ADR-021 half.
 *
 * Pinned here:
 * 1. every wired tool publishes its catalog's `inputSchema`, and a rejected call returns that
 *    schema so the model can self-correct in one turn;
 * 2. `UserRecord.passwordHash` can never reach a tool result — INV-05, asserted against every
 *    tool that returns a user rather than against one representative;
 * 3. risk metadata is cross-checked, not trusted as declared;
 * 4. the multi-step workflow these tools exist to support actually composes end to end.
 *
 * Like its sibling, this runs on the REAL in-memory identity repos and a REAL `seedIdentity()`,
 * so the "does it compose" test is evidence about the domain, not about a set of fakes agreeing
 * with each other.
 */

const WORKSPACE_ID = "workspace-tools";
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
    input: { workspaceId: WORKSPACE_ID, ownerPassword: SEED_OWNER_PASSWORD },
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

function catalogEntry(toolId: string): AgentToolDefinition {
  const entry = identityAgentToolCatalog.find((tool) => tool.name === toolId);
  assert.ok(entry, `catalog has no entry for '${toolId}'`);
  return entry;
}

/** Every call in this file acts as the seeded owner unless a test is specifically about a weaker caller. */
function asOwner(ownerPrincipalId: string, input: Record<string, unknown>): ToolExecutionContext {
  return { executionId: "exec-1", principal: { id: ownerPrincipalId }, run: { id: "run-1" }, input, signal: new AbortController().signal };
}

// ---------------------------------------------------------------------------
// 1. Published contracts
// ---------------------------------------------------------------------------

test("every wired registration publishes the inputSchema and description from its catalog entry, not a second copy", async () => {
  const { deps } = await buildHarness();

  for (const [id, registration] of identityRegistrations(deps)) {
    assert.ok(registration.descriptor.inputSchema, `${id} must publish an inputSchema`);
    assert.deepEqual(registration.descriptor.inputSchema, catalogEntry(id).inputSchema);
    assert.equal(registration.descriptor.description, catalogEntry(id).description);
  }
});

test("requiresConfirmation is unset on every identity tool — setting it with no ExecutionDelegate would park the execution forever", async () => {
  const { deps } = await buildHarness();

  for (const [id, registration] of identityRegistrations(deps)) {
    assert.equal(registration.descriptor.requiresConfirmation, undefined, `${id} must not request confirmation until a transport exists`);
  }
});

test("a rejected input returns the tool's own schema plus an explicit non-retryable instruction, so the model can correct in one turn", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const error = await wired(deps, "identity_role_assign")
    .handler(asOwner(ownerPrincipalId, { principalId: "p-1" }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "a missing required key must reject");
  assert.match(error.message, /'roleId' is required/);
  assert.match(error.message, /will not resolve on retry without an input change/);
  assert.match(error.message, /"additionalProperties":false/, "the published schema must travel with the failure");
  assert.match(error.message, /"roleId"/, "the schema in the message must actually describe the key that failed");
});

test("the schema-bearing rejection names each tool's OWN schema, not a shared one", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const error = await wired(deps, "identity_user_create")
    .handler(asOwner(ownerPrincipalId, { username: "ed" }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error);
  assert.match(error.message, /'password' is required/);
  assert.match(error.message, /"username"/);
  assert.equal(/roleId/.test(error.message), false, "identity_user_create's schema must not mention another tool's keys");
});

test("no rejection message echoes the offending value — a username or email is operator content", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();
  const secret = "s3cret-operator-content";

  const error = await wired(deps, "identity_user_create")
    .handler(asOwner(ownerPrincipalId, { username: secret, password: 7 }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error);
  assert.equal(error.message.includes(secret), false, `message leaked the value: ${error.message}`);
});

test("an unrecognized key is reported rather than ignored — the published schemas are closed and the parser honors that", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const error = await wired(deps, "identity_role_create")
    .handler(asOwner(ownerPrincipalId, { name: "Editors", isBuiltin: true }))
    .then(() => null, (e: unknown) => e as Error);

  assert.ok(error, "silently dropping 'isBuiltin' would let a model believe it had set it");
  assert.match(error.message, /'isBuiltin' is not a recognized input key/);
});

// ---------------------------------------------------------------------------
// 2. Output projection — INV-05 above all
// ---------------------------------------------------------------------------

/** Every tool that returns a user view, with input that reaches a real result. */
async function userReturningResults(harness: Harness): Promise<Array<{ toolId: string; payload: unknown }>> {
  const { deps, ownerPrincipalId } = harness;

  const created = (await wired(deps, "identity_user_create").handler(
    asOwner(ownerPrincipalId, { username: "projection-subject", password: "pw-valid-1234", email: "a@b.test" }),
  )) as { user: { principalId: string } };
  const principalId = created.user.principalId;

  return [
    { toolId: "identity_user_create", payload: created },
    { toolId: "identity_user_update_email", payload: await wired(deps, "identity_user_update_email").handler(asOwner(ownerPrincipalId, { principalId, email: "c@d.test" })) },
    { toolId: "identity_user_disable", payload: await wired(deps, "identity_user_disable").handler(asOwner(ownerPrincipalId, { principalId })) },
    { toolId: "identity_user_enable", payload: await wired(deps, "identity_user_enable").handler(asOwner(ownerPrincipalId, { principalId })) },
    { toolId: "identity_user_list", payload: await wired(deps, "identity_user_list").handler(asOwner(ownerPrincipalId, {})) },
  ];
}

test("INV-05: no identity tool result contains a password hash, on any path that returns a user", async () => {
  const harness = await buildHarness();

  for (const { toolId, payload } of await userReturningResults(harness)) {
    const serialized = JSON.stringify(payload);
    assert.equal(/passwordHash/i.test(serialized), false, `${toolId} leaked a passwordHash key`);
    // The seeded owner's real hash, in case a future view forwards the value under another name.
    const owner = await harness.repos.users.findByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: harness.ownerPrincipalId });
    assert.ok(owner);
    assert.equal(serialized.includes(owner.passwordHash), false, `${toolId} leaked a hash value`);
  }
});

test("a user view drops workspaceId — the agent is already scoped to one workspace it cannot change", async () => {
  const harness = await buildHarness();

  for (const { toolId, payload } of await userReturningResults(harness)) {
    assert.equal(/workspaceId/.test(JSON.stringify(payload)), false, `${toolId} echoed the workspaceId back to the model`);
  }
});

test("a user view carries exactly the keys the model needs, and email only when set", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const withoutEmail = (await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "no-email", password: "pw-valid-1234" }))) as {
    user: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(withoutEmail.user).sort(), ["principalId", "roleIds", "status", "username"]);
  assert.equal("email" in withoutEmail.user, false, "a user without an email must carry no always-undefined key");

  const withEmail = (await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "with-email", password: "pw-valid-1234", email: "a@b.test" }))) as {
    user: Record<string, unknown>;
  };
  assert.equal(withEmail.user.email, "a@b.test");
  assert.equal(withEmail.user.status, "active");
  assert.deepEqual(withEmail.user.roleIds, [], "a newly created user holds no roles, which is what makes create-then-assign the required order");
});

test("a role view exposes isBuiltin — the flag that predicts whether rename/delete will be refused", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const { roles } = (await wired(deps, "identity_role_list").handler(asOwner(ownerPrincipalId, {}))) as {
    roles: Array<Record<string, unknown>>;
  };

  assert.ok(roles.length >= 4, "the seed provides four built-in roles");
  for (const role of roles) {
    assert.deepEqual(Object.keys(role).sort(), ["id", "isBuiltin", "name"]);
  }
  assert.equal(roles.every((role) => role.isBuiltin === true), true, "a freshly seeded workspace has only built-in roles");
});

test("a policy view carries exactly the keys the model needs, with description only when set — mirrors a role view's isBuiltin plus the second immutability flag policies alone carry", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const withoutDescription = (await wired(deps, "identity_policy_create").handler(asOwner(ownerPrincipalId, { name: "Bare Policy" }))) as {
    policy: Record<string, unknown>;
  };
  assert.deepEqual(Object.keys(withoutDescription.policy).sort(), ["id", "isBuiltin", "isFrozen", "name"]);
  assert.equal("description" in withoutDescription.policy, false, "a policy without a description must carry no always-undefined key");
  assert.equal(withoutDescription.policy.isBuiltin, false);
  assert.equal(withoutDescription.policy.isFrozen, false);

  const withDescription = (await wired(deps, "identity_policy_create").handler(asOwner(ownerPrincipalId, { name: "Described Policy", description: "for reviewers" }))) as {
    policy: Record<string, unknown>;
  };
  assert.equal(withDescription.policy.description, "for reviewers");
});

test("identity_policy_list surfaces the built-in seeded policies plus a freshly created custom one", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const before = (await wired(deps, "identity_policy_list").handler(asOwner(ownerPrincipalId, {}))) as {
    policies: Array<{ id: string; isBuiltin: boolean }>;
  };
  assert.ok(before.policies.length >= 4, "the seed provides at least four built-in policies");
  assert.equal(before.policies.every((policy) => policy.isBuiltin === true), true);

  const { policy: created } = (await wired(deps, "identity_policy_create").handler(asOwner(ownerPrincipalId, { name: "Custom" }))) as {
    policy: { id: string };
  };
  const after = (await wired(deps, "identity_policy_list").handler(asOwner(ownerPrincipalId, {}))) as {
    policies: Array<{ id: string; isBuiltin: boolean }>;
  };
  assert.ok(after.policies.some((policy) => policy.id === created.id && policy.isBuiltin === false));
});

test("identity_user_list caps its fan-out and SAYS so, rather than silently returning a partial roster", async () => {
  const { deps, repos, ownerPrincipalId } = await buildHarness();

  for (let i = 0; i < 205; i++) {
    await repos.principals.save({ id: `bulk-${i}`, workspaceId: WORKSPACE_ID, kind: "user", displayName: `bulk-${i}`, status: "active", createdAt: "2026-01-01T00:00:00.000Z" });
    await repos.users.save({ principalId: `bulk-${i}`, workspaceId: WORKSPACE_ID, username: `bulk-${i}`, passwordHash: "hash" });
  }

  const result = (await wired(deps, "identity_user_list").handler(asOwner(ownerPrincipalId, {}))) as {
    users: unknown[];
    truncated?: boolean;
    totalCount?: number;
  };

  assert.equal(result.users.length, 200, "the cap must actually bound the fan-out");
  assert.equal(result.truncated, true, "a truncated list that does not say so would be read as the complete roster");
  assert.ok((result.totalCount ?? 0) > 200, "the real total must be reported so the caller knows the size of what it did not get");
});

test("an untruncated list carries no truncated/totalCount keys — the signal means something only when it is present", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const result = (await wired(deps, "identity_user_list").handler(asOwner(ownerPrincipalId, {}))) as Record<string, unknown>;

  assert.deepEqual(Object.keys(result), ["users"]);
});

// ---------------------------------------------------------------------------
// 3. Risk metadata is cross-checked, not trusted
// ---------------------------------------------------------------------------

test("the identity catalog and the wiring layer's independent classification agree for all fifteen wired tools", async () => {
  const { deps } = await buildHarness();

  for (const id of identityRegistrations(deps).keys()) {
    assert.doesNotThrow(() => assertRiskMetadataIsWirable(id, catalogEntry(id)));
  }
});

test("an identity catalog entry cannot downgrade its own risk — declaring 'none' for a mutating handler fails the build", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("identity_role_assign", { ...catalogEntry("identity_role_assign"), sideEffects: "none" }),
    /declares sideEffects 'none' but this layer derives 'mutates-durable-state'/,
  );
});

test("the two read tools are classified 'none', and claiming otherwise also fails — the cross-check is symmetric", () => {
  assert.doesNotThrow(() => assertRiskMetadataIsWirable("identity_user_list", catalogEntry("identity_user_list")));
  assert.throws(
    () => assertRiskMetadataIsWirable("identity_user_list", { ...catalogEntry("identity_user_list"), sideEffects: "mutates-durable-state" }),
    /declares sideEffects 'mutates-durable-state' but this layer derives 'none'/,
  );
});

test("an identity tool that carried a confirmation-requiring actor-class rule could not be wired while no transport exists", () => {
  assert.throws(
    () => assertRiskMetadataIsWirable("identity_user_disable", { ...catalogEntry("identity_user_disable"), actorClassRule: "confirmer-must-equal-own-delegatedBy" }),
    /requires a human-confirmation transport/,
  );
});

test("no identity catalog entry declares an actorClassRule at all — none of these ten needs one it cannot get", () => {
  for (const entry of identityAgentToolCatalog) {
    assert.equal(entry.actorClassRule, undefined, `${entry.name} declares an actor-class rule; check it can actually be honored before wiring`);
  }
});

// ---------------------------------------------------------------------------
// 4. The workflow these tools exist for
// ---------------------------------------------------------------------------

test("END TO END: create a user, assign it a role, and see the assignment show up in the user list", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  // 1. The role the new user will get. A model would use identity_role_list to find a built-in;
  //    creating one here also proves the create-then-assign chain works for custom roles.
  const { role } = (await wired(deps, "identity_role_create").handler(asOwner(ownerPrincipalId, { name: "Content Editor" }))) as {
    role: { id: string; name: string };
  };
  assert.equal(role.name, "Content Editor");

  // 2. The user. It comes back with no roles, which is what forces step 3 to exist.
  const { user } = (await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "Ada", password: "pw-valid-1234", email: "ada@example.test" }))) as {
    user: { principalId: string; username: string; roleIds: string[] };
  };
  assert.equal(user.username, "ada", "the username is normalized by the domain, and the tool reports what was actually stored");
  assert.deepEqual(user.roleIds, []);

  // 3. The grant.
  const assigned = (await wired(deps, "identity_role_assign").handler(asOwner(ownerPrincipalId, { principalId: user.principalId, roleId: role.id }))) as {
    assigned: { principalId: string; roleId: string };
  };
  assert.deepEqual(assigned.assigned, { principalId: user.principalId, roleId: role.id });

  // 4. "Show up elsewhere" — the assignment is durable and visible through a DIFFERENT tool.
  const { users } = (await wired(deps, "identity_user_list").handler(asOwner(ownerPrincipalId, {}))) as {
    users: Array<{ principalId: string; username: string; roleIds: string[]; email?: string }>;
  };
  const listed = users.find((candidate) => candidate.principalId === user.principalId);
  assert.ok(listed, "the newly created user must appear in the roster");
  assert.deepEqual(listed.roleIds, [role.id], "the role assignment must be visible from the read tool, not just echoed by the write tool");
  assert.equal(listed.email, "ada@example.test");

  // 5. And the role itself is discoverable, which is how a model would have found it without step 1.
  const { roles } = (await wired(deps, "identity_role_list").handler(asOwner(ownerPrincipalId, {}))) as { roles: Array<{ id: string; name: string }> };
  assert.ok(roles.some((candidate) => candidate.id === role.id && candidate.name === "Content Editor"));
});

test("END TO END: create a policy, see it in the list, attach it to a user, and confirm the attachment is durable", async () => {
  const { deps, repos, ownerPrincipalId } = await buildHarness();

  // 1. The policy. Starts with no permissions — attaching it grants nothing yet, which is exactly
  //    what makes identity_policy_write_permission's absence from this catalog a real, not merely
  //    theoretical, limitation (see identity/agent-tools.ts's file header).
  const { policy } = (await wired(deps, "identity_policy_create").handler(asOwner(ownerPrincipalId, { name: "Reviewer Bundle", description: "read-only reviewers" }))) as {
    policy: { id: string; name: string };
  };
  assert.equal(policy.name, "Reviewer Bundle");

  // 2. It shows up through the read tool a model would use to discover it.
  const { policies } = (await wired(deps, "identity_policy_list").handler(asOwner(ownerPrincipalId, {}))) as {
    policies: Array<{ id: string; name: string }>;
  };
  assert.ok(policies.some((candidate) => candidate.id === policy.id && candidate.name === "Reviewer Bundle"));

  // 3. The user.
  const { user } = (await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "Reviewer", password: "pw-valid-1234" }))) as {
    user: { principalId: string };
  };

  // 4. The grant.
  const attached = (await wired(deps, "identity_policy_attach").handler(asOwner(ownerPrincipalId, { principalId: user.principalId, policyId: policy.id }))) as {
    attached: { principalId: string; policyId: string };
  };
  assert.deepEqual(attached.attached, { principalId: user.principalId, policyId: policy.id });

  // 5. "Durable" — the attachment is visible through the repo directly (there is no
  //    "policies attached to a user" read tool, mirroring the existing gap the identity domain
  //    already accepts for role assignments read back only via identity_user_list's roleIds).
  const rows = await repos.principalPolicies.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: user.principalId });
  assert.deepEqual(rows.map((row) => row.policyId), [policy.id]);

  // 6. A rename, then a delete-while-unattached-elsewhere is refused because it is STILL attached.
  const renamed = (await wired(deps, "identity_policy_update").handler(asOwner(ownerPrincipalId, { policyId: policy.id, name: "Reviewer Bundle (renamed)" }))) as {
    policy: { name: string };
  };
  assert.equal(renamed.policy.name, "Reviewer Bundle (renamed)");

  await assert.rejects(
    () => wired(deps, "identity_policy_delete").handler(asOwner(ownerPrincipalId, { policyId: policy.id })),
    /referenced/,
    "a policy still attached to a principal must not be deletable, mirroring identity_role_delete's INV-09 guard",
  );
});

test("the email round-trips: set, changed, then cleared by omitting it", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const { user } = (await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "mailer", password: "pw-valid-1234", email: "first@example.test" }))) as {
    user: { principalId: string; email?: string };
  };
  assert.equal(user.email, "first@example.test");

  const changed = (await wired(deps, "identity_user_update_email").handler(asOwner(ownerPrincipalId, { principalId: user.principalId, email: "second@example.test" }))) as {
    user: { email?: string };
  };
  assert.equal(changed.user.email, "second@example.test");

  const cleared = (await wired(deps, "identity_user_update_email").handler(asOwner(ownerPrincipalId, { principalId: user.principalId }))) as {
    user: Record<string, unknown>;
  };
  assert.equal("email" in cleared.user, false, "omitting email clears it, exactly as the tool description tells the model");
});

test("disable then enable round-trips, and the status change is visible through the list tool", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const { user } = (await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "temp", password: "pw-valid-1234" }))) as {
    user: { principalId: string };
  };

  const disabled = (await wired(deps, "identity_user_disable").handler(asOwner(ownerPrincipalId, { principalId: user.principalId }))) as { user: { status: string } };
  assert.equal(disabled.user.status, "disabled");

  const afterDisable = (await wired(deps, "identity_user_list").handler(asOwner(ownerPrincipalId, {}))) as { users: Array<{ principalId: string; status: string }> };
  assert.equal(afterDisable.users.find((candidate) => candidate.principalId === user.principalId)?.status, "disabled");

  const enabled = (await wired(deps, "identity_user_enable").handler(asOwner(ownerPrincipalId, { principalId: user.principalId }))) as { user: { status: string } };
  assert.equal(enabled.user.status, "active");
});

test("a custom role can be renamed and then deleted while unassigned, but not once it is in use", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  const { role } = (await wired(deps, "identity_role_create").handler(asOwner(ownerPrincipalId, { name: "Temp" }))) as { role: { id: string } };

  const renamed = (await wired(deps, "identity_role_rename").handler(asOwner(ownerPrincipalId, { roleId: role.id, name: "Temp Renamed" }))) as {
    role: { name: string; isBuiltin: boolean };
  };
  assert.equal(renamed.role.name, "Temp Renamed");
  assert.equal(renamed.role.isBuiltin, false);

  const { user } = (await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "holder", password: "pw-valid-1234" }))) as {
    user: { principalId: string };
  };
  await wired(deps, "identity_role_assign").handler(asOwner(ownerPrincipalId, { principalId: user.principalId, roleId: role.id }));

  await assert.rejects(
    () => wired(deps, "identity_role_delete").handler(asOwner(ownerPrincipalId, { roleId: role.id })),
    /still assigned to 1 principal/,
    "this system has no unassign operation, so a role in use is permanently undeletable — the tool must say so rather than orphan the grant",
  );

  const { role: spare } = (await wired(deps, "identity_role_create").handler(asOwner(ownerPrincipalId, { name: "Unused" }))) as { role: { id: string } };
  const deleted = (await wired(deps, "identity_role_delete").handler(asOwner(ownerPrincipalId, { roleId: spare.id }))) as { deleted: { roleId: string } };
  assert.deepEqual(deleted.deleted, { roleId: spare.id }, "a void-returning transition must still acknowledge what it did");

  const { roles } = (await wired(deps, "identity_role_list").handler(asOwner(ownerPrincipalId, {}))) as { roles: Array<{ id: string }> };
  assert.equal(roles.some((candidate) => candidate.id === spare.id), false);
});

test("a duplicate username is refused, so a model cannot quietly create a second account under an existing name", async () => {
  const { deps, ownerPrincipalId } = await buildHarness();

  await wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "Dup", password: "pw-valid-1234" }));

  await assert.rejects(
    () => wired(deps, "identity_user_create").handler(asOwner(ownerPrincipalId, { username: "dup", password: "pw-valid-1234" })),
    /already in use/,
    "the domain compares usernames case-insensitively, and the tool inherits that rather than re-implementing it",
  );
});
