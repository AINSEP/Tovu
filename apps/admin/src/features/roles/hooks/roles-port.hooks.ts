import type { AdminPolicy, AdminRole } from "../../../lib/api";

/**
 * @file What `use-roles.hooks.ts` needs from the outside world, as an interface rather than a
 * direct `lib/api` import. Follows the `useX(dependencies)` / `useWiredX()` pair `apps/admin/
 * INFO.md`'s "Hooks" section documents (canonical example: `features/pages/hooks/theme-pages-
 * port.hooks.ts`).
 *
 * One shared port for the whole screen, matching `users-port.hooks.ts`'s identical reasoning
 * (`Roles` is one hook backing one screen; `features/seo/hooks/seo-port.hooks.ts`'s 8-method
 * `SeoPort` is the closest existing precedent for keeping a port this size as one flat interface
 * rather than splitting by concern, e.g. "roles" vs. "policies" — a split this codebase has no
 * existing precedent for anywhere, and which would not reduce what a full-hook or full-render test
 * has to fake, since every render loads both `listRoles` and `listPolicies` together regardless of
 * which mutation is under test).
 */
export interface RolesPort {
  listRoles(): Promise<{ roles: AdminRole[] }>;
  listPolicies(): Promise<{ policies: AdminPolicy[] }>;
  createRole(name: string): Promise<{ role: AdminRole }>;
  updateRole(input: { roleId: string; name: string }): Promise<{ role: AdminRole }>;
  deleteRole(roleId: string): Promise<void>;
  createPolicy(input: { name: string }, options?: { description?: string }): Promise<{ policy: AdminPolicy }>;
  updatePolicy(
    target: { policyId: string },
    options?: { name?: string; description?: string },
  ): Promise<{ policy: AdminPolicy }>;
  deletePolicy(policyId: string): Promise<void>;
  writePolicyPermission(
    input: { policyId: string; permission: string },
    options?: { resourceType?: string },
  ): Promise<{ policyPermission: unknown }>;
}
