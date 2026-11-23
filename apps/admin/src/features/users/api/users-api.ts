import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { request } from "../../../lib/admin-http/request";
import type { AdminIdentityUser } from "@jini-ai/core/contracts/site/user-management-react";

/** The admin API calls of the users feature. */
export const usersApi = {
  listUsers: () => request<{ users: AdminIdentityUser[] }>({ path: `/workspaces/${WORKSPACE_ID}/users` }),
  createUser: (
    input: { username: string; password: string },
    options: { email?: string } = {}
  ) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users` }, { init: {
      method: "POST",
      body: JSON.stringify({ ...input, ...options }),
    } }),
  // SPEC-006 0.6.0 (users/roles/policies CRUD-completion amendment).
  updateUser: ({ principalId }: { principalId: string }, options: { email?: string; username?: string } = {}) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}` }, { init: {
      method: "PATCH",
      body: JSON.stringify(options),
    } }),
  disableUser: ({ principalId }: { principalId: string }, _optional: Record<string, never> = {}) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/disable` }, { init: {
      method: "POST",
    } }),
  enableUser: ({ principalId }: { principalId: string }, _optional: Record<string, never> = {}) =>
    request<{ user: AdminIdentityUser }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/enable` }, { init: {
      method: "POST",
    } }),
  // Delete-user plan v2 (2026-09-24): DELETE now moves the target to the Trash (disabled, sessions
  // revoked, restorable there for 60 days) rather than hard-deleting it — same endpoint the v1
  // plan's `deleteUser` used, just a different server-side outcome behind the same 204.
  deleteUser: ({ principalId }: { principalId: string }, _optional: Record<string, never> = {}) =>
    request<void>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}` }, { init: {
      method: "DELETE",
    } }),
  resetUserPassword: (
    { principalId, password }: { principalId: string; password: string },
    _options: Record<string, never> = {}
  ) =>
    request<void>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/reset-password` }, { init: {
      method: "POST",
      body: JSON.stringify({ password }),
    } }),
  assignRole: (
    { principalId, roleId }: { principalId: string; roleId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ assignment: unknown }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/roles` }, { init: {
      method: "POST",
      body: JSON.stringify({ roleId }),
    } }),
  attachPolicy: (
    { principalId, policyId }: { principalId: string; policyId: string },
    _options: Record<string, never> = {}
  ) =>
    request<{ attachment: unknown }>({ path: `/workspaces/${WORKSPACE_ID}/users/${encodeURIComponent(principalId)}/policies` }, { init: {
      method: "POST",
      body: JSON.stringify({ policyId }),
    } }),
};
