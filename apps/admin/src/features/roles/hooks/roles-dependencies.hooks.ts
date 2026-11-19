import type { AdminPolicy, AdminPolicyPermission, AdminRole } from "@/features/roles/api/roles-api.types";
import { rolesApi } from "@/features/roles/api/roles-api";
import type { RolesPort } from "./roles-port.hooks";

/**
 * @file The only place `use-roles.hooks.ts` reaches `lib/api` — see `roles-port.hooks.ts` for why
 * the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultRolesPort: RolesPort = {
  listRoles: () => rolesApi.listRoles(),
  listPolicies: () => rolesApi.listPolicies(),
  createRole: ({ name }, _optional = {}) => rolesApi.createRole({ name }),
  updateRole: (input, _optional = {}) => rolesApi.updateRole(input),
  deleteRole: ({ roleId }, _optional = {}) => rolesApi.deleteRole({ roleId }),
  createPolicy: (input, options = {}) => rolesApi.createPolicy(input, options),
  updatePolicy: (target, options = {}) => rolesApi.updatePolicy(target, options),
  deletePolicy: ({ policyId }, _optional = {}) => rolesApi.deletePolicy({ policyId }),
  writePolicyPermission: (input, options = {}) => rolesApi.writePolicyPermission(input, options),
  listPolicyPermissions: ({ policyId }, _optional = {}) => rolesApi.listPolicyPermissions({ policyId }),
  removePolicyPermission: (input, _optional = {}) => rolesApi.removePolicyPermission(input),
};

const FAKE_WORKSPACE_ID = "fake-ws";

/** Every caller names the row's `id` (it is derived from the store size), so `id` is required
 *  here and comes from the trailing `...overrides` spread. Same for {@link fakePolicy}. */
function fakeRole(overrides: Pick<AdminRole, "id"> & Partial<AdminRole>): AdminRole {
  return {
    workspaceId: FAKE_WORKSPACE_ID,
    name: "Fake role",
    isBuiltin: false,
    ...overrides,
  };
}

function fakePolicy(overrides: Pick<AdminPolicy, "id"> & Partial<AdminPolicy>): AdminPolicy {
  return {
    workspaceId: FAKE_WORKSPACE_ID,
    name: "Fake policy",
    isBuiltin: false,
    isFrozen: false,
    ...overrides,
  };
}

/** Seed state for {@link createFakeRolesPort}. */
export interface FakeRolesPortOptions {
  roles?: AdminRole[];
  policies?: AdminPolicy[];
  /** When set, `createRole()` rejects with this instead of resolving. */
  createRoleError?: Error;
  /** When set, `updateRole()` rejects with this instead of resolving. */
  updateRoleError?: Error;
  /** When set, `deleteRole()` rejects with this instead of resolving. */
  deleteRoleError?: Error;
  /** When set, `createPolicy()` rejects with this instead of resolving. */
  createPolicyError?: Error;
  /** When set, `updatePolicy()` rejects with this instead of resolving. */
  updatePolicyError?: Error;
  /** When set, `deletePolicy()` rejects with this instead of resolving. */
  deletePolicyError?: Error;
  /** When set, `writePolicyPermission()` rejects with this instead of resolving. */
  writePermissionError?: Error;
  /** When set, `listPolicyPermissions()` rejects with this instead of resolving. */
  listPermissionsError?: Error;
  /** When set, `removePolicyPermission()` rejects with this instead of resolving. */
  removePermissionError?: Error;
  /** Permission rows the fake starts with, so a test can open a policy that already HAS
   *  permissions without writing them one call at a time. */
  initialPolicyPermissions?: AdminPolicyPermission[];
}

/**
 * An in-memory {@link RolesPort} for tests — "every port gets a fake" (see `assistant-chats-
 * dependencies.hooks.ts`). Mirrors `posts-list-dependencies.hooks.ts`'s `createFakePostsListPort`:
 * mutations write through to the same backing arrays the list methods read, so a test can assert a
 * write's outcome by reading the exposed `roles`/`policies` arrays back, with no `fetch` stub.
 */
export function createFakeRolesPort(options: FakeRolesPortOptions = {}): RolesPort & {
  /** Every role currently in the fake's store, in list order. */
  readonly roles: AdminRole[];
  /** Every policy currently in the fake's store, in list order. */
  readonly policies: AdminPolicy[];
  /** Every policy-permission row currently in the fake's store (OQ-10), so a removal test can read
   *  the outcome back the same way `roles`/`policies` already allow. */
  readonly policyPermissions: AdminPolicyPermission[];
} {
  return createFakeRolesStore({ options });
}

function createFakeRolesStore(
  { options }:
    { options: NonNullable<Parameters<typeof createFakeRolesPort>[0]> }
): ReturnType<typeof createFakeRolesPort> {
  const roles = [...(options.roles ?? [])];
  const policies = [...(options.policies ?? [])];
  const policyPermissions = [...(options.initialPolicyPermissions ?? [])];

  function requireRole({ roleId }: { roleId: string }, _optional: Record<string, never> = {}): AdminRole {
    const found = roles.find((r) => r.id === roleId);
    if (!found) throw new Error(`fake role not found: ${roleId}`);
    return found;
  }

  function requirePolicy({ policyId }: { policyId: string }, _optional: Record<string, never> = {}): AdminPolicy {
    const found = policies.find((p) => p.id === policyId);
    if (!found) throw new Error(`fake policy not found: ${policyId}`);
    return found;
  }

  return {
    roles,
    policies,
    policyPermissions,
    ...createFakeRoleLists({ roles, policies }),
    ...createFakeRoleMethods({ options, roles, requireRole }),
    ...createFakePolicyMethods({ options, policies, requirePolicy }),
    ...createFakePermissionMethods({ options, requirePolicy, policyPermissions }),
  };
}

function createFakePermissionMethods(
  { options, requirePolicy, policyPermissions }:
    Pick<Parameters<typeof createFakeRolesStore>[0], "options"> &
    { requirePolicy: (required: { policyId: string }, optional?: Record<string, never>) => AdminPolicy; policyPermissions: AdminPolicyPermission[] }
): Pick<RolesPort, "writePolicyPermission" | "listPolicyPermissions" | "removePolicyPermission"> {
  return {
    async writePolicyPermission(input, _optional = {}) {
      if (options.writePermissionError) throw options.writePermissionError;
      requirePolicy({ policyId: input.policyId });
      const created = {
        id: `fake-perm-${policyPermissions.length + 1}`,
        workspaceId: FAKE_WORKSPACE_ID,
        policyId: input.policyId,
        permission: input.permission,
        resourceType: null,
        constraintJson: null,
      };
      policyPermissions.push(created);
      return { policyPermission: created };
    },
    async listPolicyPermissions({ policyId }, _optional = {}) {
      if (options.listPermissionsError) throw options.listPermissionsError;
      requirePolicy({ policyId });
      return { policyPermissions: policyPermissions.filter((row) => row.policyId === policyId) };
    },
    async removePolicyPermission(input, _optional = {}) {
      if (options.removePermissionError) throw options.removePermissionError;
      requirePolicy({ policyId: input.policyId });
      // Mirrors the server's membership proof: a row is only removable through the policy it
      // actually belongs to, so a test cannot get a cross-policy delete past the fake either.
      const index = policyPermissions.findIndex(
        (row) => row.id === input.policyPermissionId && row.policyId === input.policyId,
      );
      if (index < 0) {
        throw new Error(
          `policy permission '${input.policyPermissionId}' was not found on policy '${input.policyId}'`,
        );
      }
      policyPermissions.splice(index, 1);
    },
  };
}

function createFakePolicyMethods(
  { options, policies, requirePolicy }:
    Pick<Parameters<typeof createFakeRolesStore>[0], "options"> &
    { policies: AdminPolicy[]; requirePolicy: (required: { policyId: string }, optional?: Record<string, never>) => AdminPolicy }
): Pick<RolesPort, "createPolicy" | "updatePolicy" | "deletePolicy"> {
  return {
    async createPolicy(input, opts = {}) {
      if (options.createPolicyError) throw options.createPolicyError;
      const created = fakePolicy({
        id: `fake-policy-${policies.length + 1}`,
        name: input.name,
        description: opts?.description,
      });
      policies.push(created);
      return { policy: created };
    },
    async updatePolicy(target, opts = {}) {
      if (options.updatePolicyError) throw options.updatePolicyError;
      const index = policies.findIndex((p) => p.id === target.policyId);
      if (index < 0) throw new Error(`fake policy not found: ${target.policyId}`);
      const updated = { ...policies[index], ...opts };
      policies[index] = updated;
      return { policy: updated };
    },
    async deletePolicy({ policyId }, _optional = {}) {
      if (options.deletePolicyError) throw options.deletePolicyError;
      requirePolicy({ policyId });
      const index = policies.findIndex((p) => p.id === policyId);
      policies.splice(index, 1);
    },
  };
}

function createFakeRoleMethods(
  { options, roles, requireRole }:
    Pick<Parameters<typeof createFakeRolesStore>[0], "options"> &
    { roles: AdminRole[]; requireRole: (required: { roleId: string }, optional?: Record<string, never>) => AdminRole }
): Pick<RolesPort, "createRole" | "updateRole" | "deleteRole"> {
  return {
    async createRole({ name }, _optional = {}) {
      if (options.createRoleError) throw options.createRoleError;
      const created = fakeRole({ id: `fake-role-${roles.length + 1}`, name });
      roles.push(created);
      return { role: created };
    },
    async updateRole(input, _optional = {}) {
      if (options.updateRoleError) throw options.updateRoleError;
      const index = roles.findIndex((r) => r.id === input.roleId);
      if (index < 0) throw new Error(`fake role not found: ${input.roleId}`);
      const updated = { ...roles[index], name: input.name };
      roles[index] = updated;
      return { role: updated };
    },
    async deleteRole({ roleId }, _optional = {}) {
      if (options.deleteRoleError) throw options.deleteRoleError;
      requireRole({ roleId });
      const index = roles.findIndex((r) => r.id === roleId);
      roles.splice(index, 1);
    },
  };
}

function createFakeRoleLists(
  { roles, policies }:
    { roles: AdminRole[]; policies: AdminPolicy[] }
): Pick<RolesPort, "listRoles" | "listPolicies"> {
  return {
    async listRoles() {
      return { roles: [...roles] };
    },
    async listPolicies() {
      return { policies: [...policies] };
    },
  };
}
