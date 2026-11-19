import { rolesApi } from "@/features/roles/api/roles-api";
import type { RolesPort } from "@jini-ai/user-management/react";

/**
 * @file The live Jini RolesPort binding — the only place `use-roles.hooks.ts` reaches `lib/api`.
 * Follows the `useX(dependencies)` / `useWiredX()` pair `apps/admin/
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
