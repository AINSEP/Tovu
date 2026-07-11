import type { ClockPort, IdGeneratorPort, UUID } from "../core/ports";
import type { IdentityRepos, PasswordHasherPort } from "./ports";
import { normalizeUsername } from "./username";

/**
 * @file First-boot identity seed (REQ-09, state.spec `SEED_FIRST_BOOT`).
 *
 * Purpose:
 * Seeds, in one idempotent pass: a `system` principal; a disabled legacy
 * `user-local` principal (REQ-09/EC-09 — so any pre-existing `change_sets`
 * stamped `actorId='user-local'` satisfy the composite FK without rewriting
 * history, ADR-021 §5); four built-in roles (`owner`/`admin`/`editor`/
 * `viewer`) each 1:1 with a built-in policy; and the initial `owner` user.
 *
 * How it relates to the project:
 * - Called once by each composition root (`server/app.ts` in-memory,
 *   `server/deps.ts` SQLite-content-with-in-memory-identity) before the
 *   server accepts requests. `RouteDeps.identityReady` is this call's
 *   promise — auth-adjacent middleware awaits it (see `middleware/dev-auth.ts`).
 *
 * Architectural role:
 * Seed data lives in one place so both composition roots stay identical
 * (mirrors `server/seed.ts`'s reasoning for workspace/post/presentation seed
 * data). Idempotent: re-seeding an already-seeded workspace is a no-op
 * (checked via the owner username).
 */

/** REQ-09: the literal id the legacy Article VI actor stamp resolves to. */
const LEGACY_USER_LOCAL_PRINCIPAL_ID = "user-local";

const BUILTIN_ADMIN_PERMISSIONS: readonly string[] = [
  "content.read",
  "content.write",
  "content.publish",
  "content.delete",
  "media.write",
  "theme.set",
  "plugin.read",
  "plugin.enable",
  "plugin.disable",
  "changeset.read",
  "changeset.revert",
  "member.manage",
  "settings.write",
  "apikey.manage",
  "navigation.manage",
  "integration.manage",
  // SPEC-007 (ADR-028 §7 migration clause): every settings.write holder also
  // gets settings.definitions.manage, so the admin role isn't left
  // fail-closed-locked-out of definition-lifecycle operations it previously
  // reached through the coarse settings.write grant. No separate migration
  // script is needed pre-launch — this seed function is the sole source of
  // built-in role grants (no existing installation's data to migrate yet).
  "settings.definitions.manage",
  "settings.global.write",
  "settings.workspace.write",
  "settings.user.self.write",
  "settings.user.write",
  "settings.reset.global",
  "settings.reset.workspace",
  "settings.reset.user",
  "settings.read",
  "settings.read.raw",
  "settings.read.revisions",
  "settings.read.definitions",
  // Owner-only per REQ-09: "user.manage", "role.manage" are deliberately absent.
];

const BUILTIN_EDITOR_PERMISSIONS: readonly string[] = [
  "content.read",
  "content.write",
  "content.publish",
  "content.delete",
  "media.write",
  "theme.set",
];

const BUILTIN_VIEWER_PERMISSIONS: readonly string[] = ["content.read", "changeset.read", "plugin.read"];

export interface SeedIdentityDeps {
  repos: IdentityRepos;
  hasher: PasswordHasherPort;
  clock: ClockPort;
  idGen: IdGeneratorPort;
}

export interface SeedIdentityInput {
  workspaceId: UUID;
  /** Defaults mirror the pre-SPEC-006 dev-auth env vars (`TOVU_ADMIN_USER`/`TOVU_ADMIN_PASSWORD`). */
  ownerUsername?: string;
  ownerPassword?: string;
  ownerEmail?: string;
}

export interface SeedIdentityResult {
  ownerPrincipalId: UUID;
  systemPrincipalId: UUID;
}

/** Builds one built-in role + its 1:1 policy + policy_permissions rows, and saves all three. */
async function seedBuiltinRoleWithPolicy(required: {
  deps: SeedIdentityDeps;
  workspaceId: UUID;
  name: string;
  permissions: readonly string[];
  nowIso: string;
}): Promise<{ roleId: UUID; policyId: UUID }> {
  const { deps, workspaceId, name, permissions, nowIso } = required;
  const roleId = deps.idGen.newId();
  const policyId = deps.idGen.newId();

  await deps.repos.roles.save({ id: roleId, workspaceId, name, isBuiltin: true });
  await deps.repos.policies.save({
    id: policyId,
    workspaceId,
    name: `${name}-builtin-policy`,
    description: `Built-in policy for the seeded '${name}' role.`,
    isBuiltin: true,
    isFrozen: false,
  });
  await deps.repos.rolePolicies.save({ id: deps.idGen.newId(), workspaceId, roleId, policyId });

  for (const permission of permissions) {
    await deps.repos.policyPermissions.save({
      id: deps.idGen.newId(),
      workspaceId,
      policyId,
      permission,
      resourceType: null,
      constraintJson: null,
    });
  }

  void nowIso; // reserved for a future createdAt column on roles/policies
  return { roleId, policyId };
}

/**
 * Seed first-boot identity data (idempotent — a no-op if the owner username
 * already exists in the workspace).
 *
 * @complexity O(1) — fixed small number of inserts (4 roles/policies, ~2
 * dozen policy_permissions, 3 principals, 1 user, 1 role assignment).
 * @overallScore 100
 */
export async function seedIdentity(required: {
  deps: SeedIdentityDeps;
  input: SeedIdentityInput;
}): Promise<SeedIdentityResult> {
  const { deps, input } = required;
  const workspaceId = input.workspaceId;
  const ownerUsername = normalizeUsername(input.ownerUsername ?? process.env.TOVU_ADMIN_USER ?? "admin");
  const ownerPassword = input.ownerPassword ?? process.env.TOVU_ADMIN_PASSWORD ?? "tovu-dev";
  const nowIso = deps.clock.nowIso();

  const existingOwnerUser = await deps.repos.users.findByUsername({
    workspaceId,
    username: ownerUsername,
  });
  if (existingOwnerUser) {
    const existingSystem = (await deps.repos.principals.list({ workspaceId })).find(
      (row) => row.kind === "system" && row.id !== LEGACY_USER_LOCAL_PRINCIPAL_ID
    );
    return {
      ownerPrincipalId: existingOwnerUser.principalId,
      systemPrincipalId: existingSystem?.id ?? LEGACY_USER_LOCAL_PRINCIPAL_ID,
    };
  }

  const systemPrincipalId = deps.idGen.newId();
  await deps.repos.principals.save({
    id: systemPrincipalId,
    workspaceId,
    kind: "system",
    displayName: "System",
    status: "active",
    createdAt: nowIso,
  });

  // REQ-09/EC-09: disabled legacy actor so historical `actorId='user-local'`
  // change-sets resolve without rewriting history (ADR-021 §5).
  await deps.repos.principals.save({
    id: LEGACY_USER_LOCAL_PRINCIPAL_ID,
    workspaceId,
    kind: "system",
    displayName: "Legacy actor (pre-identity)",
    status: "disabled",
    disabledAt: nowIso,
    createdAt: nowIso,
  });

  const { roleId: ownerRoleId } = await seedBuiltinRoleWithPolicy({
    deps,
    workspaceId,
    name: "owner",
    permissions: [],
    nowIso,
  });
  // REQ-04/REQ-09: the owner policy holds the wildcard `*`, not an enumerated
  // list, so it automatically covers permissions features register later.
  const ownerPolicy = (await deps.repos.policies.list({ workspaceId })).find(
    (row) => row.name === "owner-builtin-policy"
  );
  if (!ownerPolicy) throw new Error("seedIdentity: owner policy was not created");
  await deps.repos.policyPermissions.save({
    id: deps.idGen.newId(),
    workspaceId,
    policyId: ownerPolicy.id,
    permission: "*",
    resourceType: null,
    constraintJson: null,
  });

  await seedBuiltinRoleWithPolicy({
    deps,
    workspaceId,
    name: "admin",
    permissions: BUILTIN_ADMIN_PERMISSIONS,
    nowIso,
  });
  await seedBuiltinRoleWithPolicy({
    deps,
    workspaceId,
    name: "editor",
    permissions: BUILTIN_EDITOR_PERMISSIONS,
    nowIso,
  });
  await seedBuiltinRoleWithPolicy({
    deps,
    workspaceId,
    name: "viewer",
    permissions: BUILTIN_VIEWER_PERMISSIONS,
    nowIso,
  });

  const ownerPrincipalId = deps.idGen.newId();
  await deps.repos.principals.save({
    id: ownerPrincipalId,
    workspaceId,
    kind: "user",
    displayName: "Owner",
    status: "active",
    createdAt: nowIso,
  });
  await deps.repos.users.save({
    principalId: ownerPrincipalId,
    workspaceId,
    username: ownerUsername,
    email: input.ownerEmail,
    passwordHash: await deps.hasher.hash(ownerPassword),
  });
  await deps.repos.principalRoles.save({
    id: deps.idGen.newId(),
    workspaceId,
    principalId: ownerPrincipalId,
    roleId: ownerRoleId,
  });

  return { ownerPrincipalId, systemPrincipalId };
}
