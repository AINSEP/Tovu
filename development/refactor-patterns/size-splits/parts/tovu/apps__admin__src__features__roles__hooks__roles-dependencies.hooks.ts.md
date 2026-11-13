### tovu:apps/admin/src/features/roles/hooks/roles-dependencies.hooks.ts
- **Over:** `createFakeRolesPort` 106 (file 153)
- **Phase:** after-move (MIXED — `defaultRolesPort` DELETE-AFTER-PARITY; the fake is a test seam) · **Batch:** size-54
- **Tests:** `apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx`, `apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx`
- **Responsibility map:** `createFakeRolesPort` = seed arrays + `requireRole`/`requirePolicy` (stay) · role/policy CRUD methods · policy-permission methods (`listPolicyPermissions`-style read, `writePolicyPermission`, `removePolicyPermission`).
- **Splits:**
  1. HELPER `fakePolicyPermissionMethods({ policyPermissions, requirePolicy, options }: FakePolicyPermissionMethodsInput): Pick<RolesPort, …the permission method keys…>` (same file, above `createFakeRolesPort`) ← the permission-related properties of the `return {` object (from the policy-permission list method through `prop removePolicyPermission`), verbatim with their comments. `createFakeRolesPort` returns `{ …the role/policy props…, ...fakePolicyPermissionMethods({ policyPermissions, requirePolicy, options }) }` keeping the original property order (permission props were last).
- **Importers to update:** none.
- **After:** `createFakeRolesPort` ~70; helper ~38; file ~160.
- **Risks / notes:** confirm the permission props are the trailing block of the object before spreading (if not, list them explicitly instead of spreading — order of keys is not behaviour, but keep it readable). Test-only fake; if the owner prefers, exception candidate (flat method table).
