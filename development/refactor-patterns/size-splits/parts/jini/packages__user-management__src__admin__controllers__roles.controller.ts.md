### jini:packages/user-management/src/admin/controllers/roles.controller.ts
- **Over:** `createRolesController` 327 (file 339)
- **Phase:** now · **Batch:** size-33
- **Tests:** `packages/user-management/src/admin/__tests__/roles.controller.pins.test.ts`, `packages/user-management/src/admin/__tests__/controllers.test.ts`, `packages/user-management/src/admin/react/__tests__/RolesPage.pins.test.tsx`, `packages/user-management/src/admin/react/__tests__/people-hooks.test.tsx`, `packages/user-management/src/admin/__tests__/public-barrel.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `loadPermissions`, `togglePermissions` | policy-permission panel |
| B | `formWrite`, `createRole`, `createPolicy` | create forms |
| C | `rowWrite`, `editRole`, `editPolicy`, `saveRole`, `savePolicy`, `writePermission` | row edits |
| D | `targetGate`, `capture`, `requestDestructive`, `cancelDestructive`, `destroy`, `confirmDestructive` | delete/remove confirm flow |
| E | `state`/`disposed`/listeners/abort, `set`, `report`, `gate`, `role`, `policy`, `roleGate`, `policyGate`, `rows`, `load`, return | controller core (stays) |

- **Splits:**
  1. CORE CONTEXT: replace the generation `let`s with `const generations: RolesGenerations = { list: 0, permission: 0, panel: 0 };` (all `++x`/reads → `generations.x`); `state` and `disposed` stay `let`s in the factory and are exposed to helpers only as `getState: () => state` and `isDisposed: () => disposed` (moved code reads `getState().x` / `isDisposed()` where it read `state.x` / `disposed`). Define `type RolesCore = { api, call, set, report, getState, isDisposed, generations, role, policy, gate, roleGate, policyGate, rows }`.
  2. FACTORIES (same file, module level above `createRolesController`, in this order; each takes `(core: RolesCore & {...extra})`):
     - `createPermissionPanel(core): { loadPermissions, togglePermissions }` ← unit A.
     - `createRoleForms(core): { createRole, createPolicy }` ← unit B (`formWrite` inner, with its "Shared settle path for the two create forms…" comment).
     - `createRowEdits({ ...core, load, loadPermissions }): { editRole, editPolicy, saveRole, savePolicy, writePermission }` ← unit C (`rowWrite` inner, comment kept).
     - `createDestructiveFlow({ ...core, load, loadPermissions }): { requestDestructive, cancelDestructive, confirmDestructive }` ← unit D.
     `load` stays in the core (function declaration, hoisted). The return object keeps `getSnapshot`/`subscribe`/`dispose`/`setDraft`/`cancelEdit` inline and lists the factory results' members by name in the same order.
- **Importers to update:** none (`RolesController = ReturnType<…>` — check `public-barrel.test.ts` key list stays identical).
- **After:** `createRolesController` ~95; largest factory `createRowEdits` ~85; file ~390.
- **Risks / notes:** HIGH: ~60 read sites of `state`/`disposed`/generations change spelling; the `dispose` method still does `++listGeneration; ++permissionGeneration` → `++generations.list; ++generations.permission`. Every `state.` inside moved code must become `getState().` (a stale captured `state` would be a real bug). Recommend Opus/Fable execution.
