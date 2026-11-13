### tovu:apps/admin/src/features/roles/Roles.tsx
- **Over:** file 679 lines (no function over 100)
- **Phase:** after-move (DELETE-AFTER-PARITY) · **Batch:** size-54
- **Tests:** `apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx`, `apps/admin/src/features/users/__tests__/Users.unit.test.tsx`, `apps/admin/src/hooks/__tests__/use-list-table-cell-labels.unit.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `RolesProps`, `RolesController`, `RoleCreateFormController`, `RoleRowController`, `RolesSectionProps`, `RolesSection`, `RolesTab`, `PoliciesTab`, `rolesTabPanel`, `Roles` | screen + Roles tab (stays) |
| B | `PolicyRowController`, `PolicyPermissionController`, `PolicyRowProps`, `PolicyRowActionsProps`, `PolicyRowActions`, `PolicyPermissionFormProps`, `PolicyPermissionListProps`, `PolicyPermissionList`, `PolicyPermissionForm`, `PolicyRow`, `PolicyCreateFormController`, `PoliciesSectionProps`, `PoliciesSection` | Policies section (rows, inline permission editor) |
| C | `RoleDeleteDialog(Props)`, `PolicyDeleteDialog(Props)`, `PermissionRemoveDialog(Props)` | confirm dialogs |

- **Splits:**
  1. NEW `Roles-policies.tsx` — Moves unit B with docs. Exports `PolicyRowController`, `PolicyPermissionController`, `PolicyRowProps`, `PolicyRow`, `PolicyCreateFormController`, `PoliciesSectionProps`, `PoliciesSection`. Imports nothing from `Roles.tsx`.
  2. NEW `Roles-dialogs.tsx` — Moves unit C. Exports the three dialogs.
- **Importers to update:** `apps/admin/src/features/roles/__tests__/Roles.unit.test.tsx` (`PolicyRow`, `PolicyRowController`, `PolicyPermissionController` → `../Roles-policies`).
- **After:** `Roles.tsx` ~290; new files ~285 / ~110.
- **Risks / notes:** no `vi.mock` of these paths. DELETE-AFTER-PARITY: execute only if the delete slips.
