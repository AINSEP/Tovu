# Terra job size-18: split 6 Jini file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Jini clone you are given (Jini only; never edit Tovu). `TOVU` below = the Tovu clone path the coordinator gives you (only for the read-only `outline.mjs` tool). Run `pnpm install --frozen-lockfile` once if `node_modules` is missing.

READY: these files are not reshaped by the Tovu→Jini move.

## Rules
Owner-approved 2026-11-13. These rules are binding for every `size-NN` job and every hard-file plan.
They are inlined into each Terra prompt, so a job needs nothing else.

## Limits and how lines are counted
- A file is over when it has more than **500** counted lines; a function (incl. a React component, hook,
  method, arrow) when it has more than **100**. Counted = non-blank after comments are removed (ESLint
  `max-lines` / `max-lines-per-function` with `skipBlankLines` + `skipComments`). Nested functions count
  on their own, and they also count inside their parent.
- Measure and check with the outline tool (read-only, TypeScript from `<root>/node_modules`):
  `node <TOVU>/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` prints
  every top-level declaration (range, counted lines, same-file names it uses) and, for each function over
  100, its body statements with `decl:` (locals it creates) and `uses:` (earlier locals/params it reads).
  `--check <files...>` prints only what is still over and exits 1 if anything is.
- Exempt (never split): `development/scripts/size-exceptions.json` (locale `*-i18n.ts(x)`, `i18n-common.ts`,
  `*.generated.*`, `migration(s)/`, plus listed entries). `composition/deps.ts` and `composition/app.ts`
  are NOT exempt.

## What a split is
1. **Split by responsibility, never by line number.** Each new module does one job you can name in a few
   words (its file name says it). Each helper does one step you can name. If a piece has no nameable job,
   it stays where it is.
2. **A long function becomes helper functions in the SAME file.** Helpers go at module level directly
   above the function they came from, in the order they run. A step that needs many of the function's
   locals becomes a helper that takes them as one object; for a React hook, a group of state + effects
   becomes a sub-hook `useXxx` in the same file. Only when the file itself is then over 500 do helpers
   move to a sibling file (as the plan says).
3. **A long file splits into sibling modules** in the same folder, named `<original-stem>-<job>.ts(x)`
   (or the name the plan gives). The original file keeps its own name and its main job, and imports
   what moved. No new folder unless the plan says so.
4. **Imports follow the move.** Every importer of a moved export imports it from its new module
   (find them with `rg -n "from ['\"].*<old-stem>(\.js)?['\"]"` across the repo, tests included). The old
   file does NOT re-export moved names — except when the old file is a package entry (a target in a
   `package.json` `exports` map, or an `index.ts` that is one): then it keeps `export { x } from "./new.js"`
   so the public API is unchanged.
5. **No import cycles.** A new module never imports the file it was cut out of. Types both sides need move
   into the new module (or a `<stem>-types.ts` sibling when the plan says so).
6. **Behaviour does not change.** Same statements, same order, same awaits, same error text, same exports
   from the package. Only what crosses a new boundary changes: locals become parameters / return values.
   Do not "improve" code you move.
7. **"Why" comments move with their code** — word for word, including the comment above a moved
   statement and the file header paragraph that explains a moved part (copy that paragraph into the new
   file's header; keep the original header's other paragraphs).
8. **Arguments: `(required, optional = {})`.** A new helper takes ONE destructured object of required
   inputs and, only if it has optional inputs, a second object defaulting to `{}`:
   `function applyRow({ row, store }: ApplyRowInput, { signal }: ApplyRowOptions = {}): Promise<void>`.
   No new positional primitive parameters. Name the input type `<Helper>Input` (and `<Helper>Options`)
   unless the plan names it. Sub-hooks follow the same rule.
9. **React components take props only.** State, effects, refs, callbacks and data loading live in
   `<Component>.hooks.ts` (or the existing hooks file the plan names). A component split into
   sub-components passes plain props; a sub-component never receives the whole hook result object unless
   the plan says so.
10. **Banned:** `eslint-disable` (any form), `as any`, `as unknown as`, non-null `!`, `@ts-ignore`,
    `@ts-expect-error`. If a type does not line up after a move, export the existing type from where it
    lives — never loosen it. A pre-existing `eslint-disable-next-line` / `biome-ignore` on a moved line moves
    with that line unchanged (the diff shows it moved, not added); never add a new one.
11. **Tests are not edited**, except an import path of a moved symbol. Before moving an export, run
    `rg -n "vi\.mock\(|mock\.module\(|jest\.mock\(" <test dirs of the file>`: if a test mocks the OLD module
    path and the code under test now gets the moved symbol from the NEW module, the mock stops applying —
    move the mock path in that test to the new module (the only other allowed test edit) and say so in the
    report.

## Running checks (no suites, nothing left running)
- Run ONLY the test files the plan lists for each file, one at a time, after that file is done:
  - Tovu `apps/website`, `packages/*`, `content/*`, `apps/site-chat`:
    `TSX_TSCONFIG_PATH=apps/site-chat/tsconfig.json node --import tsx --import ./development/test-support/composed-bundle-env.ts --test --test-concurrency=1 --experimental-test-module-mocks <test file>`
  - Tovu `apps/admin`: `cd apps/admin && npx vitest run <path relative to apps/admin> --maxWorkers=2`
  - Tovu `apps/desktop` main (`src/` outside `renderer/`, `contracts/`):
    `cd apps/desktop && node --experimental-test-module-mocks --import ./scripts/resolve-ts-ext.ts --test --test-concurrency=1 <file>`
  - Tovu `apps/desktop` renderer/contracts: `cd apps/desktop && node --import ./scripts/one-react.ts --import tsx --test --test-concurrency=1 <file>`
  - Jini: `pnpm --filter <package name> exec vitest run <path relative to the package> --maxWorkers=2`, then
    `pnpm --filter <package name> run typecheck` once per touched package (Jini packages are small enough).
- Tovu: no full `tsc` (admin tsc needs 2+ GB). Run `npx eslint <changed files>` (no new errors, no
  `max-lines`/`max-lines-per-function` warnings left on the planned items).
- Done check per file: `outline.mjs --check <original file> <new files>` → every planned item `OK`
  (an item the plan says stays over, e.g. an owner exception candidate, is listed in the report).
- No watch modes, no dev servers, no suites; kill nothing you did not start; leave nothing running.

## Commit and report
- One commit per file (or per tightly coupled pair the plan names), by explicit paths only:
  `git add -- <paths> && git commit -F msg -- <paths>`; message `refactor(<area>): split <file> by responsibility (size)`.
  Never push, never `git add -A`, never stash or checkout other files.
- If a plan step cannot be done as written (an anchor is missing, a cycle appears, a test fails and
  the cause is the split), stop that file, revert only that file's uncommitted changes
  (`git restore -- <its paths>`, delete its new files), and report it — never improvise a different split.
- Report: per file `OK` / `STOPPED (reason)`, new files, before → after counted lines, tests run with
  pass/fail counts, and any test-mock path you moved.

## For each file, in the order listed
1. `node $TOVU/development/refactor-patterns/size-splits/outline.mjs --root <repo with node_modules> <file>` — confirm every declaration / statement anchor the plan names exists. A missing anchor = STOP this file.
2. Complete the test list: `rg -l "<file stem>" <app or package dir> --glob '*.test.*'` (colocated tests are easy to miss); add any hit that exercises the file.
3. Run those tests once BEFORE editing (baseline). A test already failing is noted and compared after; it is not yours to fix.
4. Do the plan's steps in order. After the file: tests again (same pass count), `npx eslint <changed files>`, `outline.mjs --check <original> <new files>`, Jini: the package typecheck. Then commit that file.
5. Worked example of the expected style: `development/refactor-patterns/size-splits/EXAMPLE.md` in the Tovu clone (optional reading).

## Files
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

### jini:packages/user-management/src/react/members/hooks/use-members.hooks.ts
- **Over:** `useMembers` 109 (file 143)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/react/members/__tests__/use-members.hooks.pins.test.ts`, `packages/user-management/src/react/members/__tests__/use-members.ported.test.ts`, `packages/user-management/src/react/members/__tests__/fqfix-disable.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `expandedId`, `detailById` state, `expandedIdRef`, `detailGenerations`, `detailGeneration`, `detailRequest`, `detail`, `detailLoader`, scope-reset `useEffect` (~L132), `detailError`, `detailLoadingId`, detail-cache `useEffect` (~L147), `onToggleDetail` | expanded-row detail panel |
| B | list query, mutations, `rowState`, `confirmingDisable`, refresh subscription, row actions, return | roster + row actions (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above `useMembers`, below `detailLoadingIdFor`) `useMemberDetail({ port, queryScope, scopeRef, detailRoot, translate, describeIfError, error, setRowState, setConfirmingDisable }: UseMemberDetailInput): { expandedId, detailById, setDetailById, detailError, detailLoadingId, onToggleDetail }` ← unit A in order, all comments (C7/N2 ref comment, "Entity keys own settlement…", "Only paint the failure…", "A superseded load…") move verbatim. Call it right after `const [confirmingDisable, …]` so the scope-reset effect still registers before the cache effect and the refresh subscription.
- **Importers to update:** none.
- **After:** `useMembers` ~70; file ~160.
- **Risks / notes:** `useState` order changes: `expandedId`/`detailById` are now created after `confirmingDisable` (harmless on mount). `onDisable` uses `setDetailById` → take it from the sub-hook result.

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

### jini:packages/user-management/src/react/users/Users.tsx
- **Over:** file 748 · `Users` 127
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/react/users/__tests__/Users.coverage.test.tsx`, `packages/user-management/src/react/users/__tests__/Users.complexity-pins.test.tsx`, `packages/user-management/src/react/users/__tests__/UserRowParts.unit.test.tsx`, `packages/user-management/src/react/users/__tests__/change-username.hooks.test.tsx`, `packages/user-management/src/react/__tests__/screens.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `GrantOption`, `GrantSelectController`, `UserManageController`, `GrantSelectProps`, `GrantSelect`, `UserManagePanelProps`, `UserManagePanel`, `UserRowActionsController`, `UserRowProps`, `UserRow`, `UsersTableProps`, `UsersTable`, `userManageController` | users table + expanded Manage panel |
| B | `UserDisableDialogProps`, `UserDisableDialog`, `UserDeleteDialogProps`, `UserDeleteDialog`, `RevealablePasswordFieldProps`, `RevealablePasswordField`, `UserResetPasswordDialogProps`, `resolveResetPasswordFieldsHook`, `UserResetPasswordDialog` | confirm/reset dialogs |
| C | `UsersHookDependencies`, `UsersHook`, `UsersBaseProps`, `UsersProps`, `NewUserForm`, `UsersPageHeader`, `UsersNotices`, `Users` | page shell (stays) |

- **Splits:**
  1. NEW `Users-table.tsx` — job: users table and Manage panel. Moves unit A with every doc comment. Exports `GrantOption`, `GrantSelectController`, `UserManageController`, `UserManagePanelProps`, `UserManagePanel`, `UserRowActionsController`, `UserRowProps`, `UsersTableProps`, `UsersTable`, `userManageController` (the last two newly exported for `Users`). `UserRowProps`/`UsersTableProps` reference `UsersProps` → import type `UsersProps` from `./Users.js` is a CYCLE: instead type the needed field as `Pick<UsersBaseProps, …>`-free — move the referenced member type (check what `UsersProps[...]` they index) as a local alias, or move `UsersHookDependencies`/`UsersHook`/`UsersBaseProps`/`UsersProps` into NEW `Users-types.ts` imported by both (rule 5).
  2. NEW `Users-dialogs.tsx` — job: confirm/reset dialogs. Moves unit B with comments (incl. the "Resolves `useFields`… because ESLint" comment). Exports `UserDisableDialog`, `UserDeleteDialog`, `UserResetPasswordDialog`.
  3. SUB-COMPONENT in `Users.tsx`: `UsersDialogs` ← the three dialog JSX elements at the end of `Users`' return (from the Disable dialog through `<UserResetPasswordDialog … />`), plain props = the names they read; drop those names from the 49-line controller destructure.
- **Importers to update:** `packages/user-management/src/react/index.ts` (line `export { Users, UserManagePanel } from './users/Users.js'` → `UserManagePanel` from `./users/Users-table.js`; the `export type { … GrantOption, GrantSelectController, UserManageController, UserManagePanelProps, UserRow… }` line → split so table types come from `./users/Users-table.js`, page types from wherever they end up); `packages/user-management/src/react/users/UserRowParts.tsx` (`UserRowActionsController` → `./Users-table.js`); `UserRowParts.unit.test.tsx` if it imports the type from `../Users.js`.
- **After:** Users.tsx ~330; `Users` ~95; Users-table.tsx ~265; Users-dialogs.tsx ~185 (+ Users-types.ts ~20 if needed).
- **Risks / notes:** docs (`docs/spec/api.spec.md`, `ui.spec.md`) mention these names — no path change needed there unless they cite `Users.tsx` as the source location (leave docs alone). Public API via `./react` unchanged.

### jini:packages/user-management/src/react/users/hooks/use-users.hooks.ts
- **Over:** `useUsers` 296 (file 416)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/react/users/__tests__/use-users.hooks.pins.test.tsx`, `packages/user-management/src/react/users/__tests__/use-users.ported.test.tsx`, `packages/user-management/src/react/users/__tests__/Users.coverage.test.tsx`, `packages/user-management/src/react/users/__tests__/change-username.hooks.test.tsx`, `packages/user-management/src/react/users/__tests__/Users.complexity-pins.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `formOpen`, `username`, `email`, `password`, `createUser`, `createUserMutation`, `onCreate` | new-user form |
| B | `expandedId`, `toggleGenerationRef`, `pendingRoleId`, `pendingPolicyId`, `grantSaving`, `grantError`, `assignRoleMutation`, `attachPolicyMutation`, `editEmail`, `updateEmailMutation`, `toggleExpanded`, `onAssignRole`, `onAttachPolicy`, `onSaveEmail`, `emailSaving` (+ module `runGrantMutation`) | Manage panel grants + email |
| C | `ownPrincipalId`, `effectivePermissions`, `canManageUserTrash` + caller `useEffect` (~L400) | caller access |
| D | `resetPasswordFor`, `newPassword`, `resetPassword`, `resetPasswordMutation`, `openResetPassword`, `confirmResetPassword` | reset-password dialog |
| E | `deleteUserMutation`, `confirmingDelete`, `requestDelete`, `confirmDelete` | delete flow |
| F | list, toggle status/disable, rename, deep-link effects, return | screen core (stays) |

- **Splits:**
  1. NEW `use-users-grant-panel.hooks.ts` (same folder) — job: Manage-panel grants. Moves `runGrantMutation` (with its comment) and adds `useUserGrantPanel({ port, queryScope, list, email, describeError, translate }: UseUserGrantPanelInput): UserGrantPanel` ← unit B in order (keep the `toggleGenerationRef` and `onSaveEmail` comments). Returns the B names the controller exposes plus nothing else. Imports nothing from the original.
  2. SUB-HOOKS in `use-users.hooks.ts` (above `useUsers`): `useNewUserForm({ port, queryScope, list, describeError, translate }): {...A names}` ← A; `useCallerAccess({ portRef }): { ownPrincipalId, effectivePermissions, canManageUserTrash }` ← C (both comments); `useResetPasswordDialog({ port, password, username, ownPrincipalId, passwordResetNotice, rowCapabilities, toggleSavingId, setNotice, describeError, translate }): {...D names}` ← D; `useDeleteUser({ port, queryScope, list, rowCapabilities, setToggleError, describeError, translate }): {...E names}` ← E ("Delete-user plan v2…" comment).
  3. RETURN: each sub-hook returns exactly `Pick<UsersController, …>` keys (plus internals needed by the core, e.g. `email`, `password`, `username`, `resetPasswordFor` for the deep-link effect); the return builds `{ ...form, ...grants, ...reset, ...del, <remaining keys> }` — only spread objects that contain controller keys only; pass internals separately (`const { view: formView, email, … } = useNewUserForm(...)`).
- **Importers to update:** none (`runGrantMutation` is not exported).
- **After:** `useUsers` ~98; use-users.hooks.ts ~400; new file ~95.
- **Risks / notes:** HOOK ORDER: keep call order A → B → (toggle state) → D → C → caller effect → deep-link effects → E, matching original effect order. `rowCapabilities` is a hoisted inner function declared after C — define it before calling D/E. Deep-link effect (~L455) reads `resetPasswordFor`/setter — wire from D's result. Consider Opus execution (296-line hook with many cross-links).

### jini:packages/user-management/src/server/agent-tool-registrations.ts
- **Over:** `buildIdentityRegistrations` 186 (file 361)
- **Phase:** now · **Batch:** size-18
- **Tests:** `packages/user-management/src/server/__tests__/agent-tool-registrations.consistency.test.ts`, `packages/user-management/src/server/__tests__/agent-tool-registrations.guards.test.ts`, `packages/user-management/src/server/__tests__/change-username-tool.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | handlers `identity_user_list`, `identity_role_list`, `identity_policy_list` | read tools |
| B | `identity_user_create`, `identity_user_update_email`, `identity_user_change_username`, `identity_user_disable`, `identity_user_enable` | user write tools |
| C | `identity_role_create`, `identity_role_assign`, `identity_role_rename`, `identity_role_delete` | role write tools |
| D | `identity_policy_create`, `identity_policy_update`, `identity_policy_delete`, `identity_policy_attach` (+ any later policy keys) | policy write tools |
| E | `serviceDeps`, `handlers` object, `buildDomainRegistrations` return | assemble registrations (stays) |

- **Splits** (same file, module level above `buildIdentityRegistrations`; each `({ routeDeps, serviceDeps }: IdentityHandlerInput): Record<string, ToolHandler>`):
  1. `identityReadHandlers` ← A entries verbatim.
  2. `identityUserWriteHandlers` ← B.
  3. `identityRoleWriteHandlers` ← C.
  4. `identityPolicyWriteHandlers` ← D (all remaining `identity_policy_*` keys).
  `handlers` becomes `{ ...identityReadHandlers(i), ...identityUserWriteHandlers(i), ...identityRoleWriteHandlers(i), ...identityPolicyWriteHandlers(i) }` with `i = { routeDeps, serviceDeps }` — key insertion order identical to today (spread in source order). Comments inside entries move with them; the "Assembled per call…" comment stays on `serviceDeps`.
- **Importers to update:** none.
- **After:** `buildIdentityRegistrations` ~15; largest helper ~60; file ~380.
- **Risks / notes:** `consistency.test.ts` likely asserts the handler key set equals the catalog — order/coverage unchanged by spreading. Check no handler references another handler by `handlers.x` (if one does, keep those two in the same helper).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/user-management/src/admin/controllers/users.controller.ts packages/user-management/src/react/members/hooks/use-members.hooks.ts packages/user-management/src/react/testing.ts packages/user-management/src/react/users/Users.tsx packages/user-management/src/react/users/hooks/use-users.hooks.ts packages/user-management/src/server/agent-tool-registrations.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
