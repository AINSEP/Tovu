# Terra job size-06: split 6 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/admin/src/features/settings/SettingsUi.tsx
- **Over:** `SettingsUi` 300 (file 402, under)
- **Phase:** now (STAY-WIRING; survey flags one part to MOVE — label truncated, starts "`T…`", most likely `TabIcon`, which also exists in `providers/Providers.tsx`) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/settings/__tests__/SettingsUi.unit.test.tsx`, `apps/admin/src/hooks/__tests__/tovu-execution-entry-points.integration.test.tsx`, `apps/admin/src/__tests__/unit/admin-route-lazy-loading.unit.test.tsx`, `apps/admin/src/__tests__/unit/panels-render.unit.test.tsx`, `apps/admin/src/features/settings/hooks/__tests__/use-settings-ui.unit.test.ts` (smoke), `apps/admin/src/features/workspace/__tests__/Workspace.unit.test.tsx` (smoke)
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `tabs` entry `id: "execution"` (~L332-383) | assistant execution tab |
| B | entries `instructions`, `notifications`, `privacy` (~L384-455) | assistant behaviour preference tabs |
| C | entries `language`, `interface` (~L456-496) | operator locale/interface tabs |
| D | entry `memory` (~L497-569) + `EMPTY_MEMORY_*`, `MEMORY_HOOK_FLAGS`, `READ_ONLY_MEMORY_ACTION` | read-only memory tab |
| E | entries `workspace`, `about` (~L570-632) | install identity + version tabs |
| F | rest of `SettingsUi` (hooks, loading gate, `requestedTabId`, `handleTabChange`, `saveStatus`, markup) | the settings shell (stays) |

- **Splits** (module level, above `SettingsUi`, below `resolveTabId`; each returns the object literal(s) moved verbatim, every inline comment word for word — the long SPEC-044 OQ-04 block moves with `workspace`):
  1. `executionSettingsTab({ t, tExecution, executionPolicy, adminCredential, agentPresentation }: ExecutionSettingsTabInput): SettingsDialogTab` ← unit A.
  2. `assistantPreferenceTabs({ s, t, tCap, settingsLocale }: AssistantPreferenceTabsInput): SettingsDialogTab[]` ← unit B (3 entries, in order).
  3. `localeAndInterfaceTabs({ s, t, settingsLocale }: LocaleAndInterfaceTabsInput): SettingsDialogTab[]` ← unit C.
  4. `memorySettingsTab({ s, t, tCap, settingsLocale }: MemorySettingsTabInput): SettingsDialogTab` ← unit D.
  5. `installSettingsTabs({ t, tCap, settingsLocale }: InstallSettingsTabsInput): SettingsDialogTab[]` ← unit E.
  6. In `SettingsUi`: `const tabs: SettingsDialogTab[] = [executionSettingsTab({…}), ...assistantPreferenceTabs({…}), ...localeAndInterfaceTabs({…}), memorySettingsTab({…}), ...installSettingsTabs({…})];` — tab order unchanged.
  Input types: `s: SettingsUiController`; `t`/`tCap`/`tExecution`: `ReturnType<typeof createSettingsUiTranslators>["t" | "tCap" | "tExecution"]` (indexed one by one); `executionPolicy: ReturnType<typeof useTovuSettingsExecution>`; `agentPresentation: ReturnType<typeof useAiAgentPresentation>`; `adminCredential: ReturnType<ReturnType<typeof resolveSettingsExecutionCredentialHook>>`; `settingsLocale: string`. Executor: confirm the exact identifier list per entry with the outline tool before cutting (from a grep: A uses `t, tExecution, executionPolicy, adminCredential, agentPresentation`; B `s.instructions/notifications/privacy, t, tCap, settingsLocale`; C `s.language/interface, t, settingsLocale`; D `s.memoryTopTab, s.setMemoryTopTab, t, tCap, settingsLocale`; E `t, tCap, tWorkspace, settingsLocale`).
- **Importers to update:** none.
- **After:** file ~430; `SettingsUi` ~80; largest helper `memorySettingsTab` ~72.
- **Risks / notes:** All five helpers are called after the `if (s.loading)` gate, same as the literal today — no hooks inside them. JSX inside builders is fine (a builder returning descriptors is not a component).

### tovu:apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts
- **Over:** `useSiteImport` 118 (file 404, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/sites/__tests__/use-site-transfer.hooks.unit.test.tsx`, `site-transfer-tabs.unit.test.tsx`, `site-transfer-credential-warnings.unit.test.tsx`, `site-transfer-saved-keys.journey.test.tsx`, `SiteExportTab.static.unit.test.tsx`, `SiteExportTab.history.unit.test.tsx`, `SiteExportTab.secret.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements in `useSiteImport` | job |
|---|---|---|
| A | `link`/`setLinkState`, `file`/`setFile` states, `setLink` (+ "A link and a file are two ways…" comment), `chooseFiles` | pick ONE import source (link or zip) |
| B | `password`, `confirm`, `settingOwner`, `ownerError` states, `passwordProblem`, `async function completeOwner()` | set the new site's owner password |
| C | rest (`scope`, `list`, `invalidate`, `refresh`, `importing`, `importError`, `current`, `savedKeysPassword`, `liveAddress`, `arrivedForImport`, `unavailable`, `startImport`, return) | run the import (stays) |

- **Splits** (same file, module level, directly above `useSiteImport`, in run order):
  1. SUB-HOOK `useImportSource({ t, setImportError }: UseImportSourceInput): { link; setLinkState; file; setFile; setLink; chooseFiles }` ← `const [link, setLinkState] = useState("");`, `const [file, setFile] = useState<File | null>(null);`, `const setLink = …`, `const chooseFiles = …` (bodies unchanged). Declare `importError` state before calling it.
  2. SUB-HOOK `useImportOwnerSetup({ port, t, current, setCurrent, savedKeysPassword, setSavedKeysPassword, refresh }: UseImportOwnerSetupInput): { password; setPassword; confirm; setConfirm; settingOwner; ownerError; passwordProblem; completeOwner }` ← the four owner states, `const passwordProblem = passwordProblemFor(…)`, `async function completeOwner()` (body unchanged). Called after `current`/`savedKeysPassword`/`refresh` exist.
  3. `useSiteImport` destructures both results under the same names, so `startImport` and the return object stay byte-identical.
- **Importers to update:** none.
- **After:** file ~420; `useSiteImport` ~78; `useImportOwnerSetup` ~30; `useImportSource` ~22.
- **Risks / notes:** `useState` call order shifts (link/file and owner states move); hooks stay unconditional so behaviour is unchanged. `t` type is `Translate` (already imported); setter types `Dispatch<SetStateAction<…>>`.

### tovu:apps/admin/src/features/sites/hooks/use-sites.hooks.ts
- **Over:** `useSites` 118 (file 184, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/sites/__tests__/use-sites.hooks.unit.test.tsx`, `Sites.unit.test.tsx`, `create-site-admin-password.unit.test.tsx`, `create-site-plugin-tokens.unit.test.tsx`, `sites-idle-requests.unit.test.tsx` (same folder), `apps/admin/src/components/__tests__/SitesSidebarNav.unit.test.tsx`
- **Responsibility map:**

| unit | statements in `useSites` | job |
|---|---|---|
| A | `createName`, `adminPassword`, `createdAdminLogin`, `createdName`, `pluginTokens`, `createdTokens`, `creatingRef` (+ comment), `nameErrorKey`, `setCreateName` (+ comment), `setAdminPassword`, `createSite` | the Create-site form |
| B | `activation`, `activatingName`, `activateSettlement` (+ comment), `writes` (+ "Activations reach the server one at a time…" comment), `activate` | serialized activation |
| C | `list`, `siteConfirm`, `localSites`, `createMutation`, `activateMutation`, `view`, return | composition (stays) |

- **Splits** (same file, module level, above `useSites`):
  1. SUB-HOOK `useCreateSiteForm({ port, list, t, createMutation, activateMutation }: UseCreateSiteFormInput): { createName; adminPassword; setAdminPassword; createdAdminLogin; setCreateName; nameErrorKey; createSite; createdName; pluginTokens; createdTokens }` ← unit A (deps arrays unchanged).
  2. SUB-HOOK `useSiteActivation({ port, createMutation, activateMutation }: UseSiteActivationInput): { activate; activatingName; activation }` ← unit B.
  3. `useSites` order: `list`, `siteConfirm`, `localSites`, `createMutation`, `activateMutation` (move them above the sub-hook calls), `useCreateSiteForm`, `useSiteActivation`, `view`, return — return fields unchanged, read from the destructured names.
  Types: `list: ReturnType<typeof useSitesSnapshot>`. For the mutations, add two module-level hooks wrapping the existing calls verbatim — `useCreateSiteMutation({ port }: { port: SitesPort })` and `useActivateSiteMutation({ port }: { port: SitesPort })` (each returns its `useFetchMutation({...})`) — and type the inputs as `ReturnType<typeof useCreateSiteMutation>` / `ReturnType<typeof useActivateSiteMutation>`. `useSites` calls them where the two `useFetchMutation` calls are now.
- **Importers to update:** none.
- **After:** file ~215; `useSites` ~45; `useCreateSiteForm` ~60; `useSiteActivation` ~33.
- **Risks / notes:** `createSite` calls `activateMutation` and `activate` calls `createMutation.reset()` — that is why both mutations stay in `useSites` and are passed down. `useState` order shifts only by grouping.

### tovu:apps/admin/src/features/skills/use-skills.hooks.ts
- **Over:** `useSkills` 102 (file 147, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/skills/__tests__/use-skills.unit.test.ts`, `skill-dialogs-and-row.unit.test.tsx`, `skills-page-i18n.unit.test.tsx` (same folder), `apps/admin/src/__tests__/fqfix-actions.unit.test.tsx`
- **Responsibility map:**

| unit | statements in `useSkills` | job |
|---|---|---|
| A | `const rows: SkillRowView[] = (skills ?? []).map(skill => ({` | build one row view per installed skill |
| B | everything else | load, write, install, confirm (stays) |

- **Splits:**
  1. HELPER (module level, above `useSkills`, below `skillsFailureState`): `skillRowViews({ skills, busy, expandedIds, toggleExpanded, change, port, setRemoving, setInspecting }: SkillRowViewsInput): SkillRowView[]` ← the `.map(...)` expression verbatim (`skills: InstalledSkill[] | null`, `expandedIds: Set<string>`, `toggleExpanded: (id: string) => void`, `change: (work: () => Promise<unknown>) => Promise<void>`, `port: typeof defaultSkillsPort`, setters `(skill: InstalledSkill | null) => void`). In `useSkills`: `const rows = skillRowViews({ skills, busy, expandedIds, toggleExpanded, change, port, setRemoving, setInspecting });`.
- **Importers to update:** none.
- **After:** file ~152; `useSkills` ~91; `skillRowViews` ~16.
- **Risks / notes:** `change`/`toggleExpanded` are plain per-render functions; passing them keeps identical closures. `githubUrl` in the row is `skill.source.githubUrl` (not the hook's state).

### tovu:apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts
- **Over:** `useTaxonomy` 102 (file 173, under)
- **Phase:** now (survey label `?`) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/use-taxonomy.unit.test.tsx`, `Taxonomy.unit.test.tsx`, `taxonomy-agent-drive.unit.test.tsx`, `html-embed.unit.test.tsx`, `embed-header-alignment.unit.test.tsx` (same folder), `apps/admin/src/hooks/__tests__/content-refresh-coverage.unit.test.ts`, `apps/admin/src/hooks/__tests__/use-content-refresh-subscription.hooks.test.ts`
- **Responsibility map:**

| unit | statements in `useTaxonomy` | job |
|---|---|---|
| A | `pendingDeleteTerm`, `deleteTermBlocked`, `deleteTermMutation`, `requestDeleteTerm`, `confirmDeleteTerm` | delete one term (confirm + blocked state) |
| B | `pendingDeleteTaxonomy`, `deleteTaxonomyBlocked`, `deleteTaxonomyMutation`, `requestDeleteTaxonomy`, `confirmDeleteTaxonomy` | delete one taxonomy |
| C | `list`, `taxonomies`, `useTaxonomyHtmlEmbed`, `invalidate` + refresh `useEffect`, `selectedTermId`, `formOpen`, `selected`, `error`, return | screen state (stays) |

- **Splits** (same file, module level, above `useTaxonomy`, below `runGuardedDelete`):
  1. SUB-HOOK `useTermDeletion({ port, list, selectedTermId, setSelectedTermId }: UseTermDeletionInput): { pendingDeleteTerm; deleteTermBlocked; deleteTermMutation; requestDeleteTerm; confirmDeleteTerm }` ← unit A verbatim.
  2. SUB-HOOK `useTaxonomyDeletion({ port, list, selected, setSelectedTermId }: UseTaxonomyDeletionInput): { pendingDeleteTaxonomy; deleteTaxonomyBlocked; deleteTaxonomyMutation; requestDeleteTaxonomy; confirmDeleteTaxonomy }` ← unit B verbatim.
  3. `useTaxonomy` order: `list`…refresh effect → `selectedTermId`, `formOpen` → `useTermDeletion` → `selected` (useMemo) → `useTaxonomyDeletion` → `error` → return (unchanged fields). Type `list` by wrapping the existing `useFetchQuery({ key: KEYS.list, fetch: () => port.listTaxonomies() })` call verbatim in a module-level `useTaxonomyListQuery({ port }: { port: TaxonomyPort })` and using `ReturnType<typeof useTaxonomyListQuery>`; `useTaxonomy` calls it where `list` is declared now.
- **Importers to update:** none.
- **After:** file ~190; `useTaxonomy` ~55; each sub-hook ~30.
- **Risks / notes:** the refresh `useEffect` (L178) is the content-refresh subscription `content-refresh-coverage.unit.test.ts` looks for in THIS file — it stays in `useTaxonomy`. `useState`/mutation order shifts only by grouping.

### tovu:apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts
- **Over:** `useTermPicker` 164 (file 237, under)
- **Phase:** now (survey label `?`) · **Batch:** size-06
- **Tests:** `apps/admin/src/features/taxonomy/__tests__/use-term-picker.unit.test.tsx`, `TermPicker.unit.test.tsx` (same folder)
- **Responsibility map:**

| unit | statements in `useTermPicker` | job |
|---|---|---|
| A | `names`, `openAdds`, `createTarget` (+ comment) states, `clearNewTermName`, `setNewTermName`, `setAddOpen` | per-taxonomy "new term" field state |
| B | `createMutation`, `groupOf`, `addTerm`, `pickSuggestion`, `onNewTermKeyDown` (+ IME/Escape/Enter comments), `showAddInput`, and the return's `showAddTrigger`, `newTermName`, `creating`, `createError`, `suggestions` closures | create-and-tick a new term |
| C | queries, `draft`/`message`, reset effect, `selected`, `canCreate`, `saveMutation`, `tick`, `toggle`, `add`/`remove`/`dirty`, `save`, `error`, `hidden/loading`, return | assigned-term selection + save (stays) |

- **Splits** (same file, module level, above `useTermPicker`, in run order):
  1. SUB-HOOK `useNewTermFields(): { names; openAdds; createTarget; setCreateTarget; clearNewTermName; setNewTermName; setAddOpen }` ← unit A verbatim.
  2. SUB-HOOK `useNewTermEntry({ port, locale, taxonomies, canCreate, selected, tick, fields }: UseNewTermEntryInput): Pick<TermPickerController, "showAddInput" | "showAddTrigger" | "setAddOpen" | "newTermName" | "setNewTermName" | "onNewTermKeyDown" | "addTerm" | "pickSuggestion" | "creating" | "createError" | "suggestions">` ← unit B; `fields` = step 1's result; the five return closures move verbatim into this hook's return object.
  3. `useTermPicker`: call `useNewTermFields()` where the `names` state is now, `useNewTermEntry({...})` after `tick` is declared (keep `createMutation`'s hook position relative to `saveMutation`: after it), and replace the eleven moved return fields with `...newTermEntry` at the same place in the return (after `canCreate`).
- **Importers to update:** none.
- **After:** file ~250; `useTermPicker` ~72; `useNewTermEntry` ~70; `useNewTermFields` ~25.
- **Risks / notes:** `taxonomies: AdminTaxonomyGroup[]`-like type — reuse the type of `taxonomiesQuery.data.items` (the existing `NO_TAXONOMIES` constant's type). `tick` must be passed after its declaration (it is a plain function; hoisting would allow earlier, but keep order). The `t({ locale, key })` in `createError` is the module import, not the hook's `t` closure.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/admin/src/features/settings/SettingsUi.tsx apps/admin/src/features/sites/hooks/use-site-transfer.hooks.ts apps/admin/src/features/sites/hooks/use-sites.hooks.ts apps/admin/src/features/skills/use-skills.hooks.ts apps/admin/src/features/taxonomy/hooks/use-taxonomy.hooks.ts apps/admin/src/features/taxonomy/hooks/use-term-picker.hooks.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
