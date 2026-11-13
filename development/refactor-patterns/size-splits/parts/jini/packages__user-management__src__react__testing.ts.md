### jini:packages/user-management/src/react/testing.ts
- **Over:** `createFakeRolesPort` 107 (file 295)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/react/__tests__/testing.fakes.test.ts`; smoke `packages/user-management/src/react/__tests__/screens.test.tsx`, `packages/user-management/src/admin/react/__tests__/RolesPage.pins.test.tsx` (package entry `./react/testing` — exports unchanged)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | returned `listRoles`, `createRole`, `updateRole`, `deleteRole` + `requireRole` | fake role store |
| B | returned `listPolicies`, `createPolicy`, `updatePolicy`, `deletePolicy` + `requirePolicy` | fake policy store |
| C | returned `writePolicyPermission`, `listPolicyPermissions`, `removePolicyPermission` | fake policy-permission rows |

- **Splits** (same file, module level above `createFakeRolesPort`, not exported):
  1. `fakeRoleMethods({ roles, options }: FakeRoleMethodsInput): Pick<RolesPort, 'listRoles' | 'createRole' | 'updateRole' | 'deleteRole'>` ← `requireRole` (inner) + those four methods verbatim. (Use the port type `createFakeRolesPort` already returns; if it is inferred, name it via `ReturnType<typeof createFakeRolesPort>` is NOT allowed (cycle in inference) — use the imported port interface the file already uses for the return type.)
  2. `fakePolicyMethods({ policies, options }: FakePolicyMethodsInput): Pick<…, 'listPolicies' | 'createPolicy' | 'updatePolicy' | 'deletePolicy'>` ← `requirePolicy` (inner) + four methods.
  3. `fakePolicyPermissionMethods({ policies, policyPermissions, options }: FakePolicyPermissionMethodsInput): Pick<…, 'writePolicyPermission' | 'listPolicyPermissions' | 'removePolicyPermission'>` ← three methods (they need their own `requirePolicy` → pass `requirePolicy` in instead of duplicating: input `{ policyPermissions, requirePolicy, options }`, and make step 2 return `requirePolicy` alongside, or hoist `requirePolicy` to a module helper `requireFakePolicy({ policies, policyId })` — prefer the module helper; same for roles).
  `createFakeRolesPort` keeps the three array copies and returns `{ ...fakeRoleMethods(...), ...fakePolicyMethods(...), ...fakePolicyPermissionMethods(...) }` — check the original key order and any method placed between groups (keep order by spreading in original order).
- **Importers to update:** none.
- **After:** `createFakeRolesPort` ~15; file ~310.
- **Risks / notes:** arrays are shared by reference across the three helpers (same mutation semantics as today). `deletePolicy` may also prune `policyPermissions` — if so it needs `policyPermissions` in its input; read the method before assigning it.
