import type { UsersPort } from "@jini-ai/user-management/react";
import { api } from "@/lib/api";

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
  listUsers: () => api.listUsers(),
  // `canManageUserTrash` defaults to `false` against an older server build that predates the field
  // (delete-user plan v2) — same "absent means not yet supported" convention `effectivePermissions`
  // already uses elsewhere on this same response.
  me: async () => {
    const res = await api.me();
    return { user: { id: res.user.id }, canManageUserTrash: res.canManageUserTrash ?? false, effectivePermissions: res.effectivePermissions ?? [] };
  },
  listRoles: () => api.listRoles(),
  listPolicies: () => api.listPolicies(),
  createUser: (input, options = {}) => api.createUser(input, options),
  updateUser: (target, options = {}) => api.updateUser(target, options),
  disableUser: ({ principalId }, _options = {}) => api.disableUser({ principalId }),
  enableUser: ({ principalId }, _options = {}) => api.enableUser({ principalId }),
  resetUserPassword: (input, _options = {}) => api.resetUserPassword(input),
  assignRole: (input, _options = {}) => api.assignRole(input),
  attachPolicy: (input, _options = {}) => api.attachPolicy(input),
  deleteUser: ({ principalId }, _options = {}) => api.deleteUser({ principalId }),
};
