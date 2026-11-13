### tovu:apps/admin/src/features/roles/hooks/use-roles.hooks.ts
- **Over:** `useRoles` 278 (file 370)
- **Phase:** after-move (DELETE-AFTER-PARITY) · **Batch:** size-54
- **Tests:** `apps/admin/src/features/roles/__tests__/use-roles.unit.test.tsx`, `apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx`, `apps/admin/src/__measurements__/request-volume.measurement.test.tsx`
- **Responsibility map** (statements of `useRoles`): shared (stays): `port`, `locale`, `boundT`, `list`, `roles`, `policies`, `error`, `rowError`, `rowSavingId` · A create forms · B role/policy rename + delete · C policy-permission panel · D permission removal.
- **Splits** (SUB-HOOKS, same file, above `useRoles`, in this order):
  1. `useRoleCreateForms({ port, list, locale, error }: UseRoleCreateFormsInput): RoleCreateForms` ← `roleName`/`policyName`/`policyDescription` states, `createRoleMutation`, `createPolicyMutation`, `onCreateRole`, `onCreatePolicy`, `roleSaving`, `roleError`, `policySaving`, `policyError`.
  2. `useRoleRowEditing({ port, list, locale, setRowError, setRowSavingId }): RoleRowEditing` ← `editingRole*`/`editingPolicy*` states, `pendingRoleDelete`, `pendingPolicyDelete`, `saveRoleMutation`, `deleteRoleMutation`, `savePolicyMutation`, `deletePolicyMutation`, `startEditRole`, `onSaveRole`, `onDeleteRole`, `startEditPolicy`, `onSavePolicy`, `onDeletePolicy` (all settle-time-guard comments move with them).
  3. `usePolicyPermissions({ port, locale, setRowError, setRowSavingId }): PolicyPermissions` ← `permissionPolicyId`, `permissionInput`, `resourceTypeInput`, `permissionRows`, `permissionsLoading` states, `permissionsGenerationRef`, `permissionPolicyIdRef` (+ C2/N1 comments), `writePermissionMutation`, `loadPermissions`, `togglePermissionForm`, `onWritePermission`. Returns those plus `permissionPolicyIdRef`, `loadPermissions` for step 4.
  4. `usePermissionRemoval({ port, locale, setRowError, permissionPolicyIdRef, loadPermissions }): PermissionRemoval` ← `removingPermissionId`, `pendingPermissionRemove`, `removePermissionMutation`, `onRemovePermission`, `onConfirmRemovePermission`.
  `useRoles` keeps the shared statements, calls 1–4, and the unchanged `return {` (reading fields from the sub-hook results by destructuring).
- **Importers to update:** none.
- **After:** `useRoles` ~85; sub-hooks ~45 / ~85 / ~70 / ~35; file ~400.
- **Risks / notes:** `useState`/mutation call order changes between groups — fine across renders (stable), but `useFetchMutation` instances are keyed per call; no cache keys change. `error` in `roleError`/`policyError` is the list error local — pass it in. DELETE-AFTER-PARITY.
