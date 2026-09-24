import assert from "node:assert/strict";
import test from "node:test";

import type { SurfaceEmitter, ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import {
  type IdentityRepos,
  type IdentityToolDeps,
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

import type { UIResource } from "#src/assistant/index";
import {
  createSurfaceExchangeStore,
  SURFACE_DISMISSED_PARAM,
  SURFACE_EXCHANGE_ID_PARAM,
  type SurfaceExchangeStore,
} from "#src/contracts/core/tool-surface-exchanges";

import { buildGatedIdentityRegistrations } from "../tool-registrations.js";

/**
 * @file The identity tools that grant access, delete roles/policies, or create a login ask the
 * human first (2026-09-24 tool-design audit, F3). Role and policy grants can't be taken back, so
 * the dialog names who gets what. A new user's password is typed by the human into the dialog and
 * never passes through the model.
 */

const WORKSPACE_ID = "ws-identity-confirm";
const HASHER = new Argon2PasswordHasher({ memoryCost: 8, timeCost: 1, parallelism: 1 });

interface Harness {
  deps: IdentityToolDeps;
  repos: IdentityRepos;
  ownerPrincipalId: string;
  store: SurfaceExchangeStore;
  tools: Map<string, ToolRegistration>;
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
  let n = 0;
  const idGen = { newId: () => `id-${++n}` };
  const clock = { nowIso: () => "2026-09-24T00:00:00.000Z" };
  const { ownerPrincipalId } = await seedIdentity({
    deps: { repos, hasher: HASHER, clock, idGen },
    input: { workspaceId: WORKSPACE_ID, ownerPassword: "seed-owner-pw" },
  });
  const deps: IdentityToolDeps = {
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
  };
  const store = createSurfaceExchangeStore();
  const tools = new Map(buildGatedIdentityRegistrations(deps, { surfaceExchanges: store }).map((r) => [r.descriptor.id, r]));
  return { deps, repos, ownerPrincipalId, store, tools };
}

function ctx(h: Harness, input: unknown, emitSurface?: SurfaceEmitter): ToolExecutionContext {
  return {
    executionId: "exec-1",
    principal: { id: h.ownerPrincipalId },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
    ...(emitSurface ? { emitSurface } : {}),
  };
}

/** Starts the call, returns the dialog's HTML and a function that answers it with `params`. */
async function raise(h: Harness, toolId: string, input: unknown) {
  const tool = h.tools.get(toolId);
  assert.ok(tool, `expected '${toolId}' to be wired`);
  const emitted: unknown[] = [];
  const pending = tool.handler(ctx(h, input, async (s) => void emitted.push(s)));
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(emitted.length, 1, `${toolId}: the dialog must be emitted before the call parks`);
  const html = (emitted[0] as { payload: { resource: UIResource } }).payload.resource.resource.text;
  const exchangeId = html.match(new RegExp(`${SURFACE_EXCHANGE_ID_PARAM}"\\s*:\\s*"([^"]+)"`))![1]!;
  const answer = (params: Record<string, unknown>) => h.store.deliver({ exchangeId, toolId, principalId: h.ownerPrincipalId, params });
  return { pending, html, answer };
}

/** A user plus a custom role and policy to grant — created straight through the repos. */
async function seedTargets(h: Harness) {
  await h.repos.principals.save({ id: "p-ada", workspaceId: WORKSPACE_ID, kind: "user", displayName: "ada", status: "active", createdAt: "2026-09-24T00:00:00.000Z" });
  await h.repos.users.save({ principalId: "p-ada", workspaceId: WORKSPACE_ID, username: "ada", passwordHash: "hash" });
  await h.repos.roles.save({ id: "r-editor", workspaceId: WORKSPACE_ID, name: "Editors", isBuiltin: false });
  await h.repos.policies.save({ id: "pol-review", workspaceId: WORKSPACE_ID, name: "Reviewers", isBuiltin: false, isFrozen: false });
}

const NO_CHANNEL = (toolId: string) =>
  `IDENTITY_NO_CONFIRMATION_CHANNEL: ${toolId}: this execution context has no interactive ` +
  "confirmation channel (no emitSurface), so a human cannot approve this action here. Nothing was changed.";

// ---------------------------------------------------------------------------
// Grants: role assign, policy attach
// ---------------------------------------------------------------------------

test("identity_role_assign: the dialog names the user and the role and says it can't be undone; nothing is granted until confirm", async () => {
  const h = await buildHarness();
  await seedTargets(h);

  const { pending, html, answer } = await raise(h, "identity_role_assign", { principalId: "p-ada", roleId: "r-editor" });
  assert.match(html, /Give ada the role Editors\?/);
  assert.match(html, /ada gets every permission the Editors role has\. Roles can&#39;t be unassigned, so this can&#39;t be undone\.|ada gets every permission the Editors role has\. Roles can't be unassigned, so this can't be undone\./);
  assert.deepEqual(await h.repos.principalRoles.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: "p-ada" }), []);

  answer({ decision: "confirm" });
  assert.deepEqual(await pending, { assigned: { principalId: "p-ada", roleId: "r-editor" } });
});

test("identity_role_assign: cancel grants nothing", async () => {
  const h = await buildHarness();
  await seedTargets(h);
  const { pending, answer } = await raise(h, "identity_role_assign", { principalId: "p-ada", roleId: "r-editor" });
  answer({ decision: "cancel" });
  assert.deepEqual(await pending, { assigned: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.deepEqual(await h.repos.principalRoles.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: "p-ada" }), []);
});

test("identity_policy_attach: the dialog names the user and the policy; cancel attaches nothing", async () => {
  const h = await buildHarness();
  await seedTargets(h);
  const { pending, html, answer } = await raise(h, "identity_policy_attach", { principalId: "p-ada", policyId: "pol-review" });
  assert.match(html, /Give ada the permissions in the policy Reviewers\?/);
  answer({ decision: "cancel" });
  assert.deepEqual(await pending, { attached: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.deepEqual(await h.repos.principalPolicies.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: "p-ada" }), []);
});

// ---------------------------------------------------------------------------
// Deletes: role, policy
// ---------------------------------------------------------------------------

test("identity_role_delete: the dialog names the role; cancel keeps it, confirm deletes it", async () => {
  const h = await buildHarness();
  await seedTargets(h);

  const first = await raise(h, "identity_role_delete", { roleId: "r-editor" });
  assert.match(first.html, /Delete the role Editors\?/);
  first.answer({ decision: "cancel" });
  assert.deepEqual(await first.pending, { deleted: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.ok(await h.repos.roles.findById({ workspaceId: WORKSPACE_ID, id: "r-editor" }));

  const second = await raise(h, "identity_role_delete", { roleId: "r-editor" });
  second.answer({ decision: "confirm" });
  assert.deepEqual(await second.pending, { deleted: { roleId: "r-editor" } });
  assert.equal(await h.repos.roles.findById({ workspaceId: WORKSPACE_ID, id: "r-editor" }), null);
});

test("identity_policy_delete: the dialog names the policy; cancel keeps it", async () => {
  const h = await buildHarness();
  await seedTargets(h);
  const { pending, html, answer } = await raise(h, "identity_policy_delete", { policyId: "pol-review" });
  assert.match(html, /Delete the policy Reviewers\?/);
  answer({ decision: "cancel" });
  assert.deepEqual(await pending, { deleted: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.ok(await h.repos.policies.findById({ workspaceId: WORKSPACE_ID, id: "pol-review" }));
});

test("every gated grant/delete is refused outright with no emitSurface", async () => {
  const h = await buildHarness();
  await seedTargets(h);
  for (const [toolId, input] of [
    ["identity_role_assign", { principalId: "p-ada", roleId: "r-editor" }],
    ["identity_policy_attach", { principalId: "p-ada", policyId: "pol-review" }],
    ["identity_role_delete", { roleId: "r-editor" }],
    ["identity_policy_delete", { policyId: "pol-review" }],
    ["identity_user_create", { username: "newcomer" }],
  ] as const) {
    await assert.rejects(() => h.tools.get(toolId)!.handler(ctx(h, input)), { name: "ToolInputError", message: NO_CHANNEL(toolId) }, toolId);
  }
  assert.deepEqual(await h.repos.principalRoles.listByPrincipalId({ workspaceId: WORKSPACE_ID, principalId: "p-ada" }), []);
  assert.ok(await h.repos.roles.findById({ workspaceId: WORKSPACE_ID, id: "r-editor" }));
});

// ---------------------------------------------------------------------------
// User create: the human types the password
// ---------------------------------------------------------------------------

test("identity_user_create: the model's schema has no password field", async () => {
  const h = await buildHarness();
  const schema = h.tools.get("identity_user_create")!.descriptor.inputSchema as { properties: Record<string, unknown>; required: string[] };
  assert.deepEqual(Object.keys(schema.properties).sort(), ["email", "username"]);
  assert.deepEqual(schema.required, ["username"]);
});

test("identity_user_create: a model-supplied password is refused and nothing is created", async () => {
  const h = await buildHarness();
  await assert.rejects(
    () => h.tools.get("identity_user_create")!.handler(ctx(h, { username: "newcomer", password: "from-the-model" }, async () => {})),
    {
      name: "ToolInputError",
      message:
        "IDENTITY_PASSWORD_NOT_ACCEPTED: identity_user_create: do not pass a password. The user types the new " +
        "user's first password into the form this tool shows. Nothing was created.",
    },
  );
  assert.equal(await h.repos.users.findByUsername({ workspaceId: WORKSPACE_ID, username: "newcomer" }), null);
});

test("identity_user_create: the form asks for the password; the human's password is the one stored, and the result never carries it", async () => {
  const h = await buildHarness();
  const { pending, html, answer } = await raise(h, "identity_user_create", { username: "newcomer", email: "n@example.test" });
  assert.match(html, /Create the user newcomer\?/);
  assert.match(html, /never shown to the assistant/);
  assert.equal(await h.repos.users.findByUsername({ workspaceId: WORKSPACE_ID, username: "newcomer" }), null);

  answer({ password: "typed-by-human-123" });
  const result = (await pending) as { created: boolean; user: { username: string } };
  assert.equal(result.created, true);
  assert.equal(result.user.username, "newcomer");
  assert.equal(JSON.stringify(result).includes("typed-by-human-123"), false);

  const stored = await h.repos.users.findByUsername({ workspaceId: WORKSPACE_ID, username: "newcomer" });
  assert.ok(stored);
  assert.equal(await HASHER.verify(stored.passwordHash, "typed-by-human-123"), true);
});

test("identity_user_create: Cancel creates nothing", async () => {
  const h = await buildHarness();
  const { pending, answer } = await raise(h, "identity_user_create", { username: "newcomer" });
  answer({ [SURFACE_DISMISSED_PARAM]: true });
  assert.deepEqual(await pending, { created: false, cancelled: true, note: "The user cancelled. Nothing was changed." });
  assert.equal(await h.repos.users.findByUsername({ workspaceId: WORKSPACE_ID, username: "newcomer" }), null);
});
