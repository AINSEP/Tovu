import type { AdminPolicy, AdminPolicyPermission, AdminRole } from "@/features/roles/api/roles-api.types";

/**
 * @file What `use-roles.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair `apps/admin/
 * INFO.md`'s "Hooks" section documents (canonical example: `features/pages/hooks/theme-pages-
 * port.hooks.ts`).
 *
 * One shared port for the whole screen, matching the users screen's identical reasoning (its port is now `UsersPort` in `@jini-ai/user-management/react`)
 * (`Roles` is one hook backing one screen; `@jini-ai/admin/seo`'s historical eight-method
 * SEO port, now core `AdminSeoPort`, is the closest existing precedent for keeping a port this size as one flat interface
 * rather than splitting by concern, e.g. "roles" vs. "policies" — a split this codebase has no
 * existing precedent for anywhere, and which would not reduce what a full-hook or full-render test
 * has to fake, since every render loads both `listRoles` and `listPolicies` together regardless of
 * which mutation is under test).
 */
export interface RolesPort {
  listRoles(): Promise<{ roles: AdminRole[] }>;
  listPolicies(): Promise<{ policies: AdminPolicy[] }>;
  createRole(input: { name: string }, optional?: Record<string, never>): Promise<{ role: AdminRole }>;
  updateRole(input: { roleId: string; name: string }, optional?: Record<string, never>): Promise<{ role: AdminRole }>;
  deleteRole(input: { roleId: string }, optional?: Record<string, never>): Promise<void>;
  createPolicy(input: { name: string }, options?: { description?: string }): Promise<{ policy: AdminPolicy }>;
  updatePolicy(
    target: { policyId: string },
    options?: { name?: string; description?: string },
  ): Promise<{ policy: AdminPolicy }>;
  deletePolicy(input: { policyId: string }, optional?: Record<string, never>): Promise<void>;
  writePolicyPermission(
    input: { policyId: string; permission: string },
    options?: { resourceType?: string },
  ): Promise<{ policyPermission: unknown }>;
  /** OQ-10 — the two calls that make a policy's permission set editable rather than append-only.
   *  `listPolicyPermissions` is what yields the `id` `removePolicyPermission` needs; no other admin
   *  call exposes one. */
  listPolicyPermissions(input: { policyId: string }, optional?: Record<string, never>): Promise<{ policyPermissions: AdminPolicyPermission[] }>;
  removePolicyPermission(input: { policyId: string; policyPermissionId: string }, optional?: Record<string, never>): Promise<void>;
}
