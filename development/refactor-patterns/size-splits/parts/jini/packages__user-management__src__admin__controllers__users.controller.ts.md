### jini:packages/user-management/src/admin/controllers/users.controller.ts
- **Over:** `createUsersController` 165 (file 180)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/admin/__tests__/users.controller.pins.test.ts`, `packages/user-management/src/admin/__tests__/people.controllers.test.ts`, `packages/user-management/src/admin/react/__tests__/people-hooks.test.tsx`, `packages/user-management/src/admin/react/__tests__/UsersPage.pins.test.tsx` (mocks `../hooks/UsersPage.hooks.js`, not this file — unaffected)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `panelWrites`, `PanelWrite`, `panelSavable`, `savePanel` | expanded-row panel writes (email/role/policy) |
| B | `Pending`, `confirmable`, `destroy`, `confirmDestructive` | destructive confirm flow |
| C | `createUser`, `enableUser` | account writes |
| D | store helpers, `allowed`, `gate`, `requestDestructive`, `maybeDeepLink`, `close`, `load`, `loadCaller`, `toggleExpanded`, return | core (stays) |

- **Splits:**
  1. GENERATIONS BOX: `let listGeneration = 0, panelGeneration = 0, draftGeneration = 0, …` → keep `deepLinkAttempted`, `openedViaDeepLink`, `callerPromise` as `let`s; move the three counters into `const generations: UsersGenerations = { list: 0, panel: 0, draft: 0 };` (all sites, incl. `setDraft`/`dispose` in the return object).
  2. FACTORIES (same file, above, each `(ctx: UsersCore & {...})` with `UsersCore = { api, call, store, read, set, report, gate, generations, load }`):
     - `createPanelWrites(core): { savePanel }` ← unit A with both comments ("Per-kind panel writes…", "Busy, expanded-row and authority checks…"). `PanelWrite` type moves with it.
     - `createDestructiveConfirm({ ...core, close }): { confirmDestructive }` ← unit B ("The pending target when it may be confirmed now…" comment moves).
     - `createAccountWrites({ ...core, permissions, grants }): { createUser, enableUser }` ← unit C.
- **Importers to update:** none.
- **After:** `createUsersController` ~95; file ~205.
- **Risks / notes:** `load` is a hoisted function declaration — pass it after declaration. Same mutable-counter risk as roles/members; recommend Opus execution with the three controllers as one job.
