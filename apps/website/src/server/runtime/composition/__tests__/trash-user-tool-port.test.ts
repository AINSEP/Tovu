import assert from "node:assert/strict";
import test from "node:test";

import type { ToolExecutionContext, ToolRegistration } from "@jini-ai/core";
import { createTrashService, type TrashPort } from "@jini-ai/cms/trash";
import { assignRole, createUser } from "@jini-ai/user-management/server";

import { createSurfaceExchangeStore } from "#src/contracts/core/tool-surface-exchanges";
import { createSqliteIdentityRouteDeps } from "#src/features/identity/wiring";
import { SqliteUserPurge } from "#src/features/identity/user-purge.sqlite";
import { createSettingsPrincipalLookup } from "#src/features/settings/index";
import {
  bindRemoveEntity,
  createContentDbTransactionRunner,
  createUserTrashAdapter,
  deriveTrashItemRegistrations,
  SqliteTrashRepo,
  USER_ENTITY_TYPE,
  type TrashAdapter,
  type TrashItemToolDeps,
} from "#src/features/trash/index";
import { openContentDb } from "#src/platform/db/sqlite/content-db";
import { createAppPermissionGrants } from "#src/server/runtime/composition/app-permission-grants";
import { identityServiceDepsFrom, type UsersRouteDeps } from "#src/server/inbound/admin-http/routes/users/deps";
import { bindTrashUserForTool } from "../trash-user-tool-port.js";

/**
 * @file `trash_item {entityType: "user"}` end to end over a real SQLite identity store and a real
 * Trash (the same pairing `routes/users/__tests__/delete.test.ts` uses for the admin route):
 * trash_item -> `bindTrashUserForTool` -> `trashUser` -> the user Trash adapter, then restore through
 * the Trash. Capability gap U-06 (2026-10-05): `identity_user_delete` requires a trashed user, and
 * the chat had no way to trash one.
 */

const WORKSPACE_ID = "ws-trash-user-tool";
const NOW = "2026-10-05T00:00:00.000Z";
const clock = { nowIso: () => NOW, nowMs: () => Date.parse(NOW) };

function counter(prefix: string) {
  let n = 0;
  return () => `${prefix}-${++n}`;
}

async function harness(overrides: Partial<UsersRouteDeps> = {}) {
  const db = openContentDb(":memory:");
  db.$client
    .prepare(`INSERT OR IGNORE INTO workspaces (id, name, slug, created_at) VALUES (?, ?, ?, ?)`)
    .run(WORKSPACE_ID, WORKSPACE_ID, WORKSPACE_ID, "2026-01-01T00:00:00.000Z");
  const nextId = counter("id");
  const wiring = createSqliteIdentityRouteDeps({ permissionGrants: createAppPermissionGrants({}), db, workspaceId: WORKSPACE_ID, clock, idGen: { newId: nextId } });
  await wiring.identityReady;
  const ownerId = await wiring.ownerPrincipalId;

  const trashRepo = new SqliteTrashRepo(db.$client);
  const nextTrashId = counter("trash-id");
  const adapter: TrashAdapter = createUserTrashAdapter({ db, purge: new SqliteUserPurge(db), idGen: { next: nextTrashId }, clock });
  const trash: TrashPort = createTrashService({
    repo: trashRepo,
    adapters: new Map<string, TrashAdapter>([[USER_ENTITY_TYPE, adapter]]),
    idGen: { newId: nextTrashId },
    transaction: ({ work }) => createContentDbTransactionRunner(db.$client)(work),
    entityPolicy: ({ entityType }) => entityType === USER_ENTITY_TYPE,
  });

  const deps: UsersRouteDeps = {
    workspaceId: WORKSPACE_ID,
    authorize: wiring.authorize,
    clock,
    idGen: { newId: nextId },
    principalRepo: Object.assign(wiring.principalRepo, createSettingsPrincipalLookup({ repo: wiring.principalRepo })),
    userRepo: wiring.userRepo,
    sessionRepo: wiring.sessionRepo,
    roleRepo: wiring.roleRepo,
    policyRepo: wiring.policyRepo,
    policyPermissionRepo: wiring.policyPermissionRepo,
    rolePolicyRepo: wiring.rolePolicyRepo,
    principalRoleRepo: wiring.principalRoleRepo,
    principalPolicyRepo: wiring.principalPolicyRepo,
    passwordHasher: wiring.passwordHasher,
    transactions: wiring.transactions,
    tokens: wiring.tokens,
    ownerPrincipalId: wiring.ownerPrincipalId,
    removeUser: bindRemoveEntity({ trash, entityType: USER_ENTITY_TYPE }),
    isInTrash: async (principalId: string) =>
      (await trashRepo.findByEntity({ workspaceId: WORKSPACE_ID, entityType: USER_ENTITY_TYPE, entityId: principalId })) !== null,
    ...overrides,
  };

  const [trashItem] = deriveTrashItemRegistrations(
    {
      registrations: [],
      routeDeps: { workspaceId: WORKSPACE_ID, isTrashableEntityType: (entityType: string) => entityType === USER_ENTITY_TYPE } as unknown as TrashItemToolDeps,
      surfaces: { surfaceExchanges: createSurfaceExchangeStore() },
    },
    { trashUser: bindTrashUserForTool(deps) }
  );

  const makeUser = async (username: string) =>
    (await createUser({ deps: identityServiceDepsFrom(deps), input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, username, password: "correct-horse-battery" } })).principal;
  const status = async (principalId: string) => (await deps.principalRepo.findById({ workspaceId: WORKSPACE_ID, id: principalId }))?.status;

  return { deps, trash, trashRepo, trashItem, ownerId, makeUser, status };
}

function call(registration: ToolRegistration, callerId: string, input: unknown) {
  return registration.handler({
    executionId: "exec-1",
    principal: { id: callerId },
    run: { id: "run-1" },
    input,
    signal: new AbortController().signal,
  } as ToolExecutionContext);
}

test("trash_item user: the owner trashes a user (disabled + in Trash), and the Trash restores it", async () => {
  const { trash, trashItem, ownerId, makeUser, status, deps } = await harness();
  const jane = await makeUser("jane");

  const result = await call(trashItem, ownerId, { entityType: "user", entityId: jane.id });

  assert.deepEqual(result, { entityType: "user", entityId: jane.id, via: "trashUser", outcome: { trashed: true, cancelled: false, alreadyInTrash: false } });
  assert.equal(await status(jane.id), "disabled");
  assert.equal(await deps.isInTrash(jane.id), true);

  assert.equal(await trash.restore({ workspaceId: WORKSPACE_ID, entityType: USER_ENTITY_TYPE, entityId: jane.id, at: NOW }, { actor: { principalId: ownerId } }), "restored");
  assert.equal(await status(jane.id), "active");
  assert.equal(await deps.isInTrash(jane.id), false);
});

test("trash_item user: a second trash of the same user is an idempotent no-op", async () => {
  const { trashItem, ownerId, makeUser } = await harness();
  const jane = await makeUser("jane-twice");
  await call(trashItem, ownerId, { entityType: "user", entityId: jane.id });

  const again = (await call(trashItem, ownerId, { entityType: "user", entityId: jane.id })) as { outcome: unknown };
  assert.deepEqual(again.outcome, { trashed: true, cancelled: false, alreadyInTrash: true });
});

test("trash_item user: the caller cannot trash their own account", async () => {
  const { trashItem, makeUser, status, deps, ownerId } = await harness();
  const admin = await makeUser("self-admin");
  const adminRole = await deps.roleRepo.findByName({ workspaceId: WORKSPACE_ID, name: "admin" });
  assert.ok(adminRole, "seedIdentity must have created the built-in admin role");
  await assignRole({ deps: identityServiceDepsFrom(deps), input: { workspaceId: WORKSPACE_ID, callerPrincipalId: ownerId, principalId: admin.id, roleId: adminRole.id } });

  await assert.rejects(call(trashItem, admin.id, { entityType: "user", entityId: admin.id }), {
    message: "trash_item: you cannot delete your own account. Nothing was changed.",
  });
  assert.equal(await status(admin.id), "active");
});

test("trash_item user: a caller who is neither the owner nor an admin is refused and nothing changes", async () => {
  const { trashItem, makeUser, status, deps } = await harness();
  const jane = await makeUser("jane-protected");
  const intruder = await makeUser("intruder");

  await assert.rejects(call(trashItem, intruder.id, { entityType: "user", entityId: jane.id }), {
    message: `trash_item: principal '${intruder.id}' is not authorized to trash, restore or permanently delete users. Nothing was changed.`,
  });
  assert.equal(await status(jane.id), "active");
  assert.equal(await deps.isInTrash(jane.id), false);
});

test("trash_item user: an unknown id is refused as not found", async () => {
  const { trashItem, ownerId } = await harness();
  await assert.rejects(call(trashItem, ownerId, { entityType: "user", entityId: "no-such-principal" }), {
    message: "trash_item: principal 'no-such-principal' was not found. Nothing was changed.",
  });
});

test("trash_item user: a Trash write that does not land is refused, never reported as trashed", async () => {
  const { trashItem, ownerId, makeUser } = await harness({ removeUser: async () => ({ ok: false, reason: "version-changed" }) });
  const jane = await makeUser("jane-raced");
  await assert.rejects(call(trashItem, ownerId, { entityType: "user", entityId: jane.id }), {
    message: `trash_item: user '${jane.id}' could not be moved to the Trash (version-changed). Reload and try again. Nothing was changed.`,
  });
});

test("trash_item user: a store with no Trash wiring is refused with the not-supported message", async () => {
  const { trashItem, ownerId, makeUser } = await harness({ removeUser: undefined });
  const jane = await makeUser("jane-unwired");
  await assert.rejects(call(trashItem, ownerId, { entityType: "user", entityId: jane.id }), {
    message: "trash_item: this identity store has no Trash wiring; users cannot be deleted (composition-only limitation). Nothing was changed.",
  });
});
