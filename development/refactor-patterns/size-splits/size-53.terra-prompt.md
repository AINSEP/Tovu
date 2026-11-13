# Terra job size-53: split 2 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

AFTER-MOVE: run this job only after the Tovu→Jini move work for these files has landed. If a file is gone, or `outline.mjs` no longer shows the declarations a fragment names, STOP that file and report it — the plan is stale for it.

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
### tovu:apps/admin/src/App.hooks.ts
- **Over:** file 556 lines (no function over 100)
- **Phase:** after-move (MIXED) · **Batch:** size-53
- **Tests:** `apps/admin/src/__tests__/unit/app-hooks-admin-capability-executors.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-hooks-admin-webmcp.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-hooks-frontend-session-error.unit.test.ts`, `apps/admin/src/__tests__/unit/app-stream-wiring.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-session-seam.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-hooks-logout-confirm.unit.test.tsx`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `UseAdminSession`, `useAdminSession`, `usePublishCriteriaDeepLink`, `useAdminAssistantAvailability` | session + boot gates (stays) |
| B | `SITES_PANEL_ID` … `useDefaultSectionRedirect` | Sites-section availability + route gate (stays) |
| C | `UseLogoutConfirm`, `useLogoutConfirm`, `UseSidebarDrawer`, `useSidebarDrawer`, `useInternalLinkInterceptor`, `translateAssistantDockLabel`, `resolveChatFabClearance`, `UseChatDockLayout`, `useChatDockLayout`, `useScreenshotAnnouncement`, `useCollapsibleNavGroupLabels`, `createAdminShellTranslators` | shell chrome state (stays) |
| D | `UseAgentPageBridge`, `PUBLISH_CONTENT_FIRST_PLAN_TIMEOUT_MS`, `stillWorkingPublishResult`, `withFirstPlanTimeout`, `buildAdminCapabilityExecutors`, `logFrontendSessionError`, `AdminWebMcpModelContext`, `resolveWebMcpModelContext`, `registerAdminWebMcpTool`, `useAgentPageBridge` | agent control of this tab (frontend-session bridge + WebMCP) |

- **Splits:**
  1. NEW `apps/admin/src/App-agent-page-bridge.hooks.ts` (plan-given name; stem `App.hooks` has a dot) — job: agent-driven control of this admin tab. Moves unit D verbatim incl. the long doc comment above `PUBLISH_CONTENT_FIRST_PLAN_TIMEOUT_MS` (it documents `useAgentPageBridge`; keep it above the same declarations) and the WebMCP plan comments. Exports: `UseAgentPageBridge`, `buildAdminCapabilityExecutors`, `logFrontendSessionError`, `registerAdminWebMcpTool`, `useAgentPageBridge`. Imports nothing from `App.hooks.ts`. Copy the `@file` paragraph that mentions the agent bridge into the new header.
- **Importers to update:** `apps/admin/src/App.tsx` (`useAgentPageBridge`), `apps/admin/src/components/AssistantDock/AssistantDock.tsx` (`useAgentPageBridge` — check: may be type-only/comment), tests `app-hooks-admin-capability-executors`, `app-hooks-admin-webmcp`, `app-hooks-frontend-session-error`, `app-stream-wiring`, `app-logout-confirm`, `app-chat-dock-seam`, `app-session-seam` (all under `apps/admin/src/__tests__/unit/`), `apps/admin/src/components/__tests__/AssistantDock.unit.test.tsx`, `apps/admin/src/lib/__tests__/agent-screenshot.unit.test.ts`. `lib/agent-screenshot.ts`/`agent-screenshot-bus.ts` mention the name in comments only — verify with rg `from .*App.hooks`.
- **After:** `App.hooks.ts` ~414 (+~55 if the App.tsx fragment's `useAdminShellState` lands here → ~470); new file ~145.
- **Risks / notes:** no `vi.mock` of `App.hooks` found. Order with App.tsx fragment: do this file first.

### tovu:apps/admin/src/App.tsx
- **Over:** file 553 lines · `AdminShell` 199 · `AssistantChrome` 137
- **Phase:** after-move (MIXED, NEEDS-TIER-2) · **Batch:** size-53
- **Tests:** `apps/admin/src/__tests__/unit/app-shell-chrome.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-panel-permissions.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-agent-page-identity.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-plugins-route.unit.test.tsx`, `apps/admin/src/__tests__/unit/app-route-prototype-keys.unit.test.tsx`, `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`, `apps/admin/src/__tests__/app-boot-request-volume.test.tsx`, `apps/admin/src/lib/__tests__/import-export-routes.unit.test.ts`
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A | `Route`, `PANELS_BY_ID`, `parseRoute`, `currentPanelId`, `agentPageId`, `RouteAccess`, `renderRoute`, `NoAccess`, `UnavailableSectionRedirect` | routing (stays) |
| B | `SidebarLogoutButton`, `SidebarLabelTooltips`, `SidebarEmptyClickToggle`, `LogoutConfirmDialog`, `AdminTopbar` | shell chrome pieces (stay) |
| C | `AssistantChrome` | assistant dock/sheet + ChatFab chrome |
| D | `AppProps`, `resolve*Hook`, `App`, `AdminShell` | shell composition (stays) |

- **Splits:**
  1. NEW `apps/admin/src/App-assistant-chrome.tsx` — job: assistant dock/sheet chrome. Moves `AssistantChrome` (+ its doc comment) and new sub-components below. Exports `AssistantChrome`. Imports nothing from `App.tsx`.
  2. SUB-COMPONENTS in `App-assistant-chrome.tsx` above `AssistantChrome`: `ChatSheetBar({ dockT, sheetExpanded, setSheetExpanded, setChatOpen }): ReactNode` ← the `<div className="chat-sheet-bar">` block (handle, title, expand button, `DockHeaderTip` close button); `AssistantDockAside({ chatDockRef, themeBoundary, chatOpen, sheetExpanded, locale, onDockDropCapture, dockT, setSheetExpanded, setChatOpen, agentBridge, principalId, publishDropCapture }): ReactNode` ← the whole `<aside` JSX (renders `ChatSheetBar` + `<AssistantDock`). `AssistantChrome` keeps hook call, `enabled` guard, `resolveChatFabClearance`, the hidden/comment wrappers and `<ChatFab`. Type `themeBoundary` as `ReturnType<typeof useAdminThemeBoundary>`.
  3. SUB-HOOK `useAdminShellState({ props, session }: UseAdminShellStateInput): AdminShellState` in `apps/admin/src/App.hooks.ts` ← every statement of `AdminShell` from `const useDrawer = resolveDrawerHook(props.useDrawer);` through `const collapsibleGroups = useCollapsibleNavGroupLabels(navGroups);` (all hook calls in the same order, comments move with them). Returns the locals the JSX reads. The `resolve*Hook` helpers and `NO_PERMISSIONS`, `SIDEBAR_RAIL_STORAGE_KEY` move with it IF used only there (else export from App.tsx is a cycle — keep them in App.hooks.ts and import into App.tsx). `AdminShell` keeps the two early returns (`checking`, `!user`), `renderRoute`, and the JSX.
  4. SUB-COMPONENTS in `App.tsx` above `AdminShell`: `AdminSidebar({ sidebarOpen, setSidebarOpen, navGroups, navLocale, navSoonLabel, collapsibleGroups, onLogout }): ReactNode` ← the `<Sidebar` … `</Sidebar>` block; `AdminMainColumn({ sidebarOpen, setSidebarOpen, navLocale, route, setContentEl, contentEl, content }): ReactNode` ← the `<div className="admin-main-col">` block (topbar, `<main`, `ScrollJumpButtons`).
- **Importers to update:** none outside the file for `AssistantChrome` (not exported). `useAdminShellState` new export.
- **After:** `App.tsx` ~370; `AdminShell` ~85; `AssistantChrome` ~55; `App-assistant-chrome.tsx` ~150; App.hooks.ts +~60.
- **Risks / notes:** hook order inside `useAdminShellState` must be identical (rules of hooks; early returns stay AFTER the hook call in `AdminShell`). Do App.hooks.ts fragment first so App.hooks stays ≤500. `apps/admin/src/__tests__/app-boot-request-volume.test.tsx` `vi.mock`s an AI-assistant path — not this file; check `rg "vi.mock\(.*App" apps/admin/src` before moving. NEEDS-TIER-2 label: shell is a hot path; consider Opus execution.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/App.hooks.ts apps/admin/src/App.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
