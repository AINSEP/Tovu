import { api, type AdminPolicy, type AdminRole } from "../../../lib/api";
import type { RolesPort } from "./roles-port.hooks";

/**
 * @file The only place `use-roles.hooks.ts` reaches `lib/api` — see `roles-port.hooks.ts` for why
 * the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultRolesPort: RolesPort = {
  listRoles: () => api.listRoles(),
  listPolicies: () => api.listPolicies(),
  createRole: (name) => api.createRole(name),
  updateRole: (input) => api.updateRole(input),
  deleteRole: (roleId) => api.deleteRole(roleId),
  createPolicy: (input, options) => api.createPolicy(input, options),
  updatePolicy: (target, options) => api.updatePolicy(target, options),
  deletePolicy: (policyId) => api.deletePolicy(policyId),
  writePolicyPermission: (input, options) => api.writePolicyPermission(input, options),
};

const FAKE_WORKSPACE_ID = "fake-ws";

function fakeRole(overrides: Partial<AdminRole> = {}): AdminRole {
  return {
    id: overrides.id ?? "fake-role-1",
    workspaceId: FAKE_WORKSPACE_ID,
    name: "Fake role",
    isBuiltin: false,
    ...overrides,
  };
}

function fakePolicy(overrides: Partial<AdminPolicy> = {}): AdminPolicy {
  return {
    id: overrides.id ?? "fake-policy-1",
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
} {
  const roles = [...(options.roles ?? [])];
  const policies = [...(options.policies ?? [])];

  function requireRole(roleId: string): AdminRole {
    const found = roles.find((r) => r.id === roleId);
    if (!found) throw new Error(`fake role not found: ${roleId}`);
    return found;
  }

  function requirePolicy(policyId: string): AdminPolicy {
    const found = policies.find((p) => p.id === policyId);
    if (!found) throw new Error(`fake policy not found: ${policyId}`);
    return found;
  }

  return {
    roles,
    policies,
    async listRoles() {
      return { roles: [...roles] };
    },
    async listPolicies() {
      return { policies: [...policies] };
    },
    async createRole(name) {
      if (options.createRoleError) throw options.createRoleError;
      const created = fakeRole({ id: `fake-role-${roles.length + 1}`, name });
      roles.push(created);
      return { role: created };
    },
    async updateRole(input) {
      if (options.updateRoleError) throw options.updateRoleError;
      const index = roles.findIndex((r) => r.id === input.roleId);
      if (index < 0) throw new Error(`fake role not found: ${input.roleId}`);
      const updated = { ...roles[index]!, name: input.name };
      roles[index] = updated;
      return { role: updated };
    },
    async deleteRole(roleId) {
      if (options.deleteRoleError) throw options.deleteRoleError;
      requireRole(roleId);
      const index = roles.findIndex((r) => r.id === roleId);
      roles.splice(index, 1);
    },
    async createPolicy(input, opts) {
      if (options.createPolicyError) throw options.createPolicyError;
      const created = fakePolicy({
        id: `fake-policy-${policies.length + 1}`,
        name: input.name,
        description: opts?.description,
      });
      policies.push(created);
      return { policy: created };
    },
    async updatePolicy(target, opts) {
      if (options.updatePolicyError) throw options.updatePolicyError;
      const index = policies.findIndex((p) => p.id === target.policyId);
      if (index < 0) throw new Error(`fake policy not found: ${target.policyId}`);
      const updated = { ...policies[index]!, ...opts };
      policies[index] = updated;
      return { policy: updated };
    },
    async deletePolicy(policyId) {
      if (options.deletePolicyError) throw options.deletePolicyError;
      requirePolicy(policyId);
      const index = policies.findIndex((p) => p.id === policyId);
      policies.splice(index, 1);
    },
    async writePolicyPermission(input) {
      if (options.writePermissionError) throw options.writePermissionError;
      requirePolicy(input.policyId);
      return { policyPermission: {} };
    },
  };
}
