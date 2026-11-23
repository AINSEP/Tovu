import type { UsersPort } from "@jini-ai/core/contracts/site/user-management-react";
import { rolesApi } from "@/features/roles/api/roles-api";
import { usersApi } from "@/features/users/api/users-api";
import { authApi } from "@/features/auth/api/auth-api";

/**
 * @file The only place the users screen reaches `lib/api`. The port it binds and the in-memory fake
 * tests use both live in `@jini-ai/user-management` (`/react` and `/react/testing`); Tovu keeps only
 * this binding to its HTTP client.
 *
 * `me()` (password-banner plan 2026-09-24, Slice 3; delete-user plan v2, Slice 4): the signed-in
 * caller's own id, so the screen can open the reset-password dialog on their row, plus whether THIS
 * caller may trash/restore/purge users (owner or the built-in `admin` role, computed server-side by
 * `/auth/me` via `callerMayManageUserTrash`, the same function the DELETE route is gated on). That
 * flag only hides the row-menu Delete item; it is never the real boundary.
 */

/** The live implementation, as a module-level singleton. */
export const defaultUsersPort: UsersPort = {
  listUsers: () => usersApi.listUsers(),
  // `canManageUserTrash` defaults to `false` against an older server build that predates the field
  // (delete-user plan v2) — same "absent means not yet supported" convention `effectivePermissions`
  // already uses elsewhere on this same response.
  me: async () => {
    const res = await authApi.me();
    return { user: { id: res.user.id }, canManageUserTrash: res.canManageUserTrash ?? false, effectivePermissions: res.effectivePermissions ?? [] };
  },
  listRoles: () => rolesApi.listRoles(),
  listPolicies: () => rolesApi.listPolicies(),
  createUser: (input, options = {}) => usersApi.createUser(input, options),
  updateUser: (target, options = {}) => usersApi.updateUser(target, options),
  disableUser: ({ principalId }, _options = {}) => usersApi.disableUser({ principalId }),
  enableUser: ({ principalId }, _options = {}) => usersApi.enableUser({ principalId }),
  resetUserPassword: (input, _options = {}) => usersApi.resetUserPassword(input),
  assignRole: (input, _options = {}) => usersApi.assignRole(input),
  attachPolicy: (input, _options = {}) => usersApi.attachPolicy(input),
  deleteUser: ({ principalId }, _options = {}) => usersApi.deleteUser({ principalId }),
};
