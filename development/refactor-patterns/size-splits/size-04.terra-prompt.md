# Terra job size-04: split 3 Tovu file(s) by responsibility (size limits)

Generated 2026-11-13 by `development/refactor-patterns/size-splits/assemble.mjs` from the per-file design fragments. Self-contained: the rules, the per-file plans and the checks are all below.

Repo: the Tovu clone you are given (Tovu only). `TOVU` below = that clone's root.

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
### tovu:apps/admin/src/features/themes/hooks/use-themes.hooks.ts
- **Over:** `useThemes` 122 (file 193, under)
- **Phase:** now (?) · **Batch:** size-04
- **Tests:** `apps/admin/src/features/themes/__tests__/use-themes.hooks.unit.test.ts`, `Themes.unit.test.tsx`, `themes-delete.unit.test.tsx`, `themes-duplicate.unit.test.tsx`, `themes-localization.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `rescanning`, `rescanNotice`, `rescanHasDuplicates` states + `async function rescan()` | re-read the themes directory |
| B | `duplicatingTheme`, `duplicateNotice` + `async function duplicate(themeId)` | duplicate a theme |
| C | `trashingTheme`, `trashNotice` + `async function trash(themeId)` | move a theme to Trash |
| D | query/loader/presentation, `actionError`, `write`, `activation`, refresh subscriptions, `busyTheme`, `activateSettlement`, `activateWrites`, `applyPresentation`, `activate`, return | presentation + activation (stays) |

- **Splits** (same file, module level, above `useThemes`):
  1. SUB-HOOK `useThemesRescan({ write, port, loader, applyPresentation, setError, t }: UseThemesRescanInput): { rescanning: boolean; rescanNotice: string | null; rescanHasDuplicates: boolean; rescan: () => Promise<void>; dismissRescanNotice: () => void }` ← the three `useState` lines + `async function rescan()` (with its comment). `dismissRescanNotice: () => setRescanNotice(null)` moves from the return into this hook.
  2. SUB-HOOK `useThemeDuplicate({ write, port, loader, applyPresentation, themeNames, setError, t }: UseThemeDuplicateInput): { duplicatingTheme; duplicateNotice; duplicate; dismissDuplicateNotice }` ← `duplicatingTheme`/`duplicateNotice` states + `async function duplicate(`.
  3. SUB-HOOK `useThemeTrash({ write, port, loader, applyPresentation, themeNames, setError, t }: UseThemeTrashInput): { trashingTheme; trashNotice; trash; dismissTrashNotice }` ← `trashingTheme`/`trashNotice` states + `async function trash(`.
  4. `useThemes` calls them after `applyPresentation` is declared (it is a function declaration — hoisted, but call the sub-hooks after its line for readability) and returns `{ settings, themes, themeTiers, themeNames, themePreviewImages, error, busyTheme, activate, ...rescanApi, ...duplicateApi, themeBuiltIn, ...trashApi, t }` — same keys as today. Types: `setError` = `Dispatch<SetStateAction<string | null>>`; `loader`/`write` = `ReturnType<typeof useCachedLoader<…>>`-free: annotate input fields with the controller-independent types the existing calls infer (export a local `type ThemesWrite = ReturnType<typeof useFetchMutation<…>>` only if inference cannot flow; prefer passing `write.mutate`-using code unchanged).
- **Importers to update:** none (no export moves).
- **After:** file ~210; `useThemes` ~75; sub-hooks ~22 each.
- **Risks / notes:** hook order changes only by grouping. `themeNames` is derived from `query` each render — pass the current value.

### tovu:apps/admin/src/panels.tsx
- **Over:** file 726 lines (`PANELS` literal 650; no function over 100)
- **Phase:** now (STAY-PRODUCT; survey also wants the `export type { PanelRouteContext, PanelRenderContext }` re-export at the top DELETED — separate job, do not do it here) · **Batch:** size-04
- **Tests:** `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`, `apps/admin/src/__tests__/unit/nav-wiring.unit.test.ts`, `apps/admin/src/__tests__/unit/commerce-off.unit.test.ts`, `apps/admin/src/__tests__/unit/admin-nav-recovery-acs.unit.test.ts`, `apps/admin/src/lib/__tests__/panel-access.unit.test.ts`, `apps/admin/src/lib/__tests__/admin-screens-manifest.unit.test.ts`, `apps/admin/src/lib/__tests__/agent-pages.unit.test.ts`, `apps/admin/src/features/admin-ui/__tests__/redirects.unit.test.tsx`
- **Responsibility map** (the `// --- <group> ---` comments inside `PANELS` are the sidebar groups):

| unit | entries | job |
|---|---|---|
| A | `PanelRenderer`, `TovuAdminPanel` | panel types |
| B | `// --- Content ---` … up to `// --- People ---` | Content group panels |
| C | `// --- People ---` | People group |
| D | `// --- Studio ---` | Studio group |
| E | `// --- Add-Ons ---` | Add-Ons group |
| F | `// --- Commerce ---` | Commerce group |
| G | `// --- Operations ---` | Operations group |
| H | `// --- Administration ---` | Administration group |
| I | `// --- Marketing ---` | Marketing group |
| J | `// --- Ungrouped top row ---`, `// --- Routable, no sidebar row … ---`, `PANELS`, `PanelRouteLoading`, `ADMIN_PANELS` | assembly + Suspense wrapper (stays) |

- **Splits** (in order):
  1. NEW `panels-types.ts` — moves `PanelRenderer`, `TovuAdminPanel` (with their JSDoc). Exports both. `panels.tsx` imports them; it does NOT re-export (no outside importer uses them today — re-run `rg -n "TovuAdminPanel|PanelRenderer" apps/admin/src --glob '!panels*.ts*'`; only a comment in `panels-render.unit.test.tsx` mentions `PanelRenderer`).
  2. NEW one module per group, each `export const <GROUP>_PANELS: readonly TovuAdminPanel[] = [ …entries verbatim, incl. every comment… ];`: `panels-content.tsx` (`CONTENT_PANELS`), `panels-people.tsx` (`PEOPLE_PANELS`), `panels-studio.tsx` (`STUDIO_PANELS`), `panels-add-ons.tsx` (`ADD_ON_PANELS`), `panels-commerce.tsx` (`COMMERCE_PANELS`), `panels-operations.tsx` (`OPERATIONS_PANELS`), `panels-administration.tsx` (`ADMINISTRATION_PANELS`), `panels-marketing.tsx` (`MARKETING_PANELS`). Each takes from `panels.tsx`'s import block exactly the components/helpers its entries use (e.g. `renderMediaPanel`, `postEditorRouteKey` go where `media`/`posts` live). The group comment line becomes that file's header line.
  3. `PANELS` becomes `[ <top-row entries inline>, ...CONTENT_PANELS, ...PEOPLE_PANELS, ...STUDIO_PANELS, ...ADD_ON_PANELS, ...COMMERCE_PANELS, ...OPERATIONS_PANELS, ...ADMINISTRATION_PANELS, ...MARKETING_PANELS, <routable-no-row entries inline> ]` — the exact original order (sidebar order and route matching depend on it).
- **Importers to update:** none outside (`ADMIN_PANELS` and the `panel-contracts` type re-export stay in `panels.tsx`).
- **After:** `panels.tsx` ~140; group files ~35–150 each (Content ~150, Operations ~115, Add-Ons ~110).
- **Risks / notes:** lazy imports — check whether the feature components are imported from a lazy barrel (the `import { Skills, Themes, … }` block); each group file must import from the SAME module specifier so lazy chunks do not change (`admin-route-lazy-loading.unit.test.tsx` guards this). No import from a group file back into `panels.tsx`.
- **Owner exception candidate:** alternatively keep `PANELS` as one declarative table (it is a flat list of data entries; the split is by sidebar group, which is a real but thin responsibility). Owner decides; the split above is ready if not excepted.

### tovu:apps/desktop/src/desktop-agent-service.ts
- **Over:** `createDesktopAgentService` 170 (file 236, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-04
- **Tests:** `apps/desktop/src/desktop-agent-service.test.ts` (desktop main runner)
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A | `const entry = path.join(repoRoot, …` + `const args = cliMode === "source" ? [` | daemon launch argv |
| B | `const redact = (text: string) => {` | redact site secrets/paths from daemon output |
| C | `supervisor`'s constant options (`policy`, `now`, `scheduler`, `classifyExit`, `failureReporter`, `logger`) | supervisor policy |
| D | `type ScopedSite`, `type Site`, `hasServerExited`, `assertSiteBinding`, `withdrawStaleBinding` | site-binding guards (no mutable closure state) |
| E | `function bindServer({ child, siteDir }` | bind one site server's IPC control channel |
| F | `let channel/daemonPid/stopWork/stopping`, maps/sets, `processPorts`, `supervisor`, `assertDemandAllowed`, `refreshSiteHost`, `demand`, `withdraw`, return | daemon + site lifecycle (stays; closes over the mutable `let`s) |

- **Splits** (same file, module level, between `siteScopeKey` and `createDesktopAgentService`, in this order):
  1. Lift `type ScopedSite = DaemonSiteRegistration & { scopeKey: SiteScopeKey }` and `type Site = { …; host?: ReturnType<typeof createNodeIpcChannel> | undefined; … }` to module level (replace `typeof channel` with that exact type — identical).
  2. `daemonLaunchArgs({ repoRoot, cliMode }: DaemonLaunchArgsInput): string[]` ← `entry` + `args` statements (returns `args`).
  3. `redactDaemonOutput({ text, sites }: RedactDaemonOutputInput): string` ← body of `redact`; in the function `const redact = (text: string) => redactDaemonOutput({ text, sites });` (keep the "Frame first" comment above it).
  4. `daemonSupervisorPolicy(): Pick<Parameters<typeof createDaemonSupervisor>[0], "policy" | "now" | "scheduler" | "classifyExit" | "failureReporter" | "logger">` ← those six properties of the `createDaemonSupervisor({ … })` literal; the call becomes `createDaemonSupervisor({ ...processPorts, terminateProcess…, ...daemonSupervisorPolicy(), readiness: … }, { parkedExitCodes: … })`. Keep property order as original (spread at the same position where `policy` was).
  5. `hasServerExited({ server }: { server: ChildProcess }): boolean` ← moved as is (drop nothing; keep its `_options = {}` second param). `assertSiteBinding({ site, config, env }: AssertSiteBindingInput): void` ← moved, `env` becomes an input. `withdrawStaleBinding({ config, sites, env }: WithdrawStaleBindingInput): Promise<…>` ← moved (it reads `sites` and calls the two guards). Update the inner call sites (`demand`, `bindServer`) to pass `env`/`sites`.
  6. `bindSiteServer({ child, siteDir, supervisor, env, withdraw, demand, notices, bindings }: BindSiteServerInput): <current return type of bindServer>` ← body of `bindServer` (incl. nested `handleControl`, its locals `workspaceId`/`closed`, comments). In the function: `function bindServer(input: { child: ChildProcess; siteDir: string }, _optional = {}) { return bindSiteServer({ ...input, supervisor, env, withdraw, demand, notices, bindings }); }`. `supervisor` type = `ReturnType<typeof createDaemonSupervisor>`.
- **Importers to update:** none (no export moves).
- **After:** file ~250; `createDesktopAgentService` ~95; `bindSiteServer` ~45.
- **Risks / notes:** `channel`, `daemonPid`, `stopWork`, `stopping` are reassigned `let`s read by `processPorts.spawn`, `readiness`, `refreshSiteHost`, `assertDemandAllowed`, `demand`, `withdraw` — those stay inside the closure; do NOT move them. `bindServer` must not read any of those `let`s (verify with rg in its body before moving; if it does, STOP).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/themes/hooks/use-themes.hooks.ts apps/admin/src/panels.tsx apps/desktop/src/desktop-agent-service.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
