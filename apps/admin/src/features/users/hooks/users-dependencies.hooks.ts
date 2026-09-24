import { api, type AdminIdentityUser, type AdminPolicy, type AdminRole } from "@/lib/api";
import type { UsersPort } from "./users-port.hooks";

/**
 * @file The only place `use-users.hooks.ts` reaches `lib/api` — see `users-port.hooks.ts` for why
 * the split exists.
 */

/** The live implementation, as a module-level singleton. */
export const defaultUsersPort: UsersPort = {
  listUsers: () => api.listUsers(),
  // `canManageUserTrash` defaults to `false` against an older server build that predates the field
  // (delete-user plan v2) — same "absent means not yet supported" convention `effectivePermissions`
  // already uses elsewhere on this same response.
  me: async () => {
    const res = await api.me();
    return { user: { id: res.user.id }, canManageUserTrash: res.canManageUserTrash ?? false };
  },
  listRoles: () => api.listRoles(),
  listPolicies: () => api.listPolicies(),
  createUser: (input, options) => api.createUser(input, options),
  updateUser: (target, options) => api.updateUser(target, options),
  disableUser: (principalId) => api.disableUser(principalId),
  enableUser: (principalId) => api.enableUser(principalId),
  resetUserPassword: (input) => api.resetUserPassword(input),
  assignRole: (input) => api.assignRole(input),
  attachPolicy: (input) => api.attachPolicy(input),
  deleteUser: (principalId) => api.deleteUser(principalId),
};

const FAKE_WORKSPACE_ID = "fake-ws";

function fakeUser(overrides: Partial<AdminIdentityUser> = {}): AdminIdentityUser {
  return {
    principalId: overrides.principalId ?? "fake-user-1",
    workspaceId: FAKE_WORKSPACE_ID,
    username: "fake",
    status: "active",
    createdAt: new Date(0).toISOString(),
    roleIds: [],
    policyIds: [],
    ...overrides,
  };
}

/** Seed state for {@link createFakeUsersPort}. */
export interface FakeUsersPortOptions {
  users?: AdminIdentityUser[];
  roles?: AdminRole[];
  policies?: AdminPolicy[];
  /** What `me()` resolves to — the id of the signed-in caller's own row for the deep-link tests
   *  (password-banner plan, Slice 3). Defaults to the first seeded user's id, or a fixed fake id
   *  when no users were seeded, so a test that doesn't care about `me()` never has to pass this. */
  meId?: string;
  /** What `me()`'s `canManageUserTrash` resolves to (delete-user plan v2, Slice 4). Defaults to
   *  `true` — most existing tests render the Delete item as available and were written before this
   *  flag existed; a test that specifically covers the "caller may not delete" case sets this to
   *  `false`. */
  canManageUserTrash?: boolean;
  /** When set, `createUser()` rejects with this instead of resolving. */
  createUserError?: Error;
  /** When set, `updateUser()` rejects with this instead of resolving. */
  updateUserError?: Error;
  /** When set, `disableUser()`/`enableUser()` reject with this instead of resolving. */
  toggleStatusError?: Error;
  /** When set, `resetUserPassword()` rejects with this instead of resolving. */
  resetPasswordError?: Error;
  /** When set, `assignRole()` rejects with this instead of resolving. */
  assignRoleError?: Error;
  /** When set, `attachPolicy()` rejects with this instead of resolving. */
  attachPolicyError?: Error;
  /** When set, `deleteUser()` rejects with this instead of resolving. */
  deleteUserError?: Error;
}

/**
 * An in-memory {@link UsersPort} for tests — "every port gets a fake" (see `assistant-chats-
 * dependencies.hooks.ts`). Mutations write through to the same backing arrays `listUsers`/
 * `listRoles`/`listPolicies` read, mirroring `posts-list-dependencies.hooks.ts`'s
 * `createFakePostsListPort` — a test can assert the outcome of a write by reading the exposed
 * `users` array back, with no `fetch` stub anywhere in the chain.
 */
export function createFakeUsersPort(options: FakeUsersPortOptions = {}): UsersPort & {
  /** Every user currently in the fake's store, in list order. */
  readonly users: AdminIdentityUser[];
} {
  const users = [...(options.users ?? [])];
  const roles = [...(options.roles ?? [])];
  const policies = [...(options.policies ?? [])];

  function requireUser(principalId: string): AdminIdentityUser {
    const found = users.find((u) => u.principalId === principalId);
    if (!found) throw new Error(`fake user not found: ${principalId}`);
    return found;
  }

  function replaceUser(updated: AdminIdentityUser): AdminIdentityUser {
    const index = users.findIndex((u) => u.principalId === updated.principalId);
    users[index] = updated;
    return updated;
  }

  const meId = options.meId ?? users[0]?.principalId ?? "fake-user-1";
  const canManageUserTrash = options.canManageUserTrash ?? true;

  return {
    users,
    async me() {
      return { user: { id: meId }, canManageUserTrash };
    },
    async listUsers() {
      return { users: [...users] };
    },
    async listRoles() {
      return { roles: [...roles] };
    },
    async listPolicies() {
      return { policies: [...policies] };
    },
    async createUser(input, opts) {
      if (options.createUserError) throw options.createUserError;
      const created = fakeUser({
        principalId: `fake-user-${users.length + 1}`,
        username: input.username,
        email: opts?.email,
      });
      users.push(created);
      return { user: created };
    },
    async updateUser(target, opts) {
      if (options.updateUserError) throw options.updateUserError;
      const current = requireUser(target.principalId);
      return { user: replaceUser({ ...current, ...opts }) };
    },
    async disableUser(principalId) {
      if (options.toggleStatusError) throw options.toggleStatusError;
      const current = requireUser(principalId);
      return { user: replaceUser({ ...current, status: "disabled" }) };
    },
    async enableUser(principalId) {
      if (options.toggleStatusError) throw options.toggleStatusError;
      const current = requireUser(principalId);
      return { user: replaceUser({ ...current, status: "active" }) };
    },
    async resetUserPassword() {
      if (options.resetPasswordError) throw options.resetPasswordError;
    },
    async assignRole(input) {
      if (options.assignRoleError) throw options.assignRoleError;
      const current = requireUser(input.principalId);
      replaceUser({ ...current, roleIds: [...current.roleIds, input.roleId] });
      return { assignment: {} };
    },
    async attachPolicy(input) {
      if (options.attachPolicyError) throw options.attachPolicyError;
      const current = requireUser(input.principalId);
      replaceUser({ ...current, policyIds: [...current.policyIds, input.policyId] });
      return { attachment: {} };
    },
    async deleteUser(principalId) {
      if (options.deleteUserError) throw options.deleteUserError;
      requireUser(principalId);
      // Mirrors the real DELETE route's effect on `listUsers()`: a trashed user no longer lists
      // (`W/server/inbound/admin-http/routes/users/list.ts`'s `isInTrash` filter) — removing it from
      // this fake's backing array reproduces that without modeling the Trash itself.
      const index = users.findIndex((u) => u.principalId === principalId);
      users.splice(index, 1);
    },
  };
}
