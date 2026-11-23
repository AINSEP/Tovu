import { WORKSPACE_ID } from "../../../lib/admin-http/config";
import { authenticatedAdminRequest } from "../../../lib/admin-http/request";
import type { AdminPolicy, AdminPolicyPermission, AdminRole } from "@jini-ai/admin/roles/api/roles-api.types";

/** The admin API calls of the roles feature. */
export const rolesApi = {
  listRoles: () => authenticatedAdminRequest<{ roles: AdminRole[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/roles` }),
  createRole: ({ name }: { name: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ role: AdminRole }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/roles`, body: { name } }),
  // SPEC-006 0.6.0.
  updateRole: (
    { roleId, name }: { roleId: string; name: string },
    _options: Record<string, never> = {}
  ) =>
    authenticatedAdminRequest<{ role: AdminRole }>({ method: "PATCH", path: `/workspaces/${WORKSPACE_ID}/roles/${encodeURIComponent(roleId)}`, body: { name } }),
  deleteRole: ({ roleId }: { roleId: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<void>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/roles/${encodeURIComponent(roleId)}` }),
  listPolicies: () => authenticatedAdminRequest<{ policies: AdminPolicy[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/policies` }),
  createPolicy: ({ name }: { name: string }, options: { description?: string } = {}) =>
    authenticatedAdminRequest<{ policy: AdminPolicy }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/policies`, body: { name, description: options.description } }),
  // SPEC-006 0.6.0.
  updatePolicy: (
    { policyId }: { policyId: string },
    options: { name?: string; description?: string } = {}
  ) =>
    authenticatedAdminRequest<{ policy: AdminPolicy }>({ method: "PATCH", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}`, body: options }),
  deletePolicy: ({ policyId }: { policyId: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<void>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}` }),
  writePolicyPermission: (
    { policyId, permission }: { policyId: string; permission: string },
    options: { resourceType?: string } = {}
  ) =>
    authenticatedAdminRequest<{ policyPermission: unknown }>({ method: "POST", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions`, body: { permission, resourceType: options.resourceType || undefined } }),
  listPolicyPermissions: ({ policyId }: { policyId: string }, _optional: Record<string, never> = {}) =>
    authenticatedAdminRequest<{ policyPermissions: AdminPolicyPermission[] }>({ method: "GET", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions` }),
  removePolicyPermission: ({ policyId, policyPermissionId }: { policyId: string; policyPermissionId: string }) =>
    authenticatedAdminRequest<void>({ method: "DELETE", path: `/workspaces/${WORKSPACE_ID}/policies/${encodeURIComponent(policyId)}/permissions/${encodeURIComponent(policyPermissionId)}` }),
};
