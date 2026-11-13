# Terra job size-45: split 8 Jini file(s) by responsibility (size limits)

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
### jini:packages/ui/src/features/skills/react/components/SkillRow.tsx
- **Over:** `SkillRow` 112 (file 356)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/skills/__tests__/react/components/SkillRow.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | JSX `<div className="jini-skills-row-head">` (~L111-158) | row header: toggle, summary button, actions/confirm |
| B | rest of `SkillRow` | row shell + expanded body |

- **Splits:**
  1. SUB-COMPONENT `SkillRowHead` (same file, below `SkillRow`, before `SkillRowSummaryButton`) ← the head `<div>` JSX. Plain props = names that block reads (from the outline: `enabled`, `skill`, `locale`, `expanded`, `onToggleExpanded`, `labels`, `l`, `agentHandle`, `confirmDelete`, `onCommitDelete`, `onCancelDelete`, `editActionLabel`, `onStartEdit`, `onArmDelete`, enable-toggle handler, `builtIn`, …) — take the exact list from the JSX; type it as `Pick<SkillRowProps, ...> & { l: …; builtIn: boolean; editActionLabel: string }`.
- **Importers to update:** none.
- **After:** `SkillRow` ~68; file ~365.
- **Risks / notes:** pure JSX move; keep the `editActionLabel` comment in `SkillRow`.

### jini:packages/ui/src/features/skills/react/hooks/useSkillsTab.ts
- **Over:** `useSkillsTab` 260 (file 327)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/skills/__tests__/react/hooks/useSkillsTab.test.ts`; smoke `rg -l useSkillsTab packages/ui/src/features/skills/__tests__`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `skills`, `loading`, `loadError`, `portRef`, `alive` + effect, `refresh`, initial-load `useEffect` (~L141) | skills list loading |
| B | `filters`, `filteredSkills`, `sourceOptions`, `modeOptions`, `categoryOptions`, `setSearch`…`setCategoryFilter` | filters |
| C | `bodyById`, `bodyLoadingId`, `filesById`, `filesLoadingId`, `bodyByIdRef`, `filesByIdRef`, `ensureBody`, `ensureFiles` | lazy SKILL.md body + file-tree cache |
| D | `submitDraft` | save a draft |
| E | `commitDelete` | delete a skill |
| F | expanded/editing/creating/draft/confirm state, `toggleExpanded`, `startCreate`, `startEdit`, `requestEdit`, `confirmBuiltInEdit`, `cancelBuiltInEdit`, `cancelDraft`, `setDraft`, `armDelete`, `cancelDelete`, return | interaction state (stays) |

- **Splits** (same file, above `useSkillsTab`):
  1. SUB-HOOK `useSkillsList({ port }: UseSkillsListInput): { skills, loading, loadError, refresh, portRef, alive }` ← unit A.
  2. SUB-HOOK `useSkillFilters({ skills, locale }: UseSkillFiltersInput): { filters, filteredSkills, sourceOptions, modeOptions, categoryOptions, setSearch, setSourceFilter, setModeFilter, setCategoryFilter }` ← unit B.
  3. SUB-HOOK `useSkillContentCache({ portRef, alive }: UseSkillContentCacheInput): { bodyById, setBodyById, bodyLoadingId, filesById, setFilesById, filesLoadingId, ensureBody, ensureFiles }` ← unit C.
  4. SUB-HOOK `useSubmitSkillDraft({ draft, draftSaving, editingId, portRef, alive, refresh, setDraftError, setDraftSaving, setBodyById, setFilesById, setExpandedId, setEditingId, setCreating, setDraftState }: UseSubmitSkillDraftInput): () => void` ← `submitDraft` useCallback verbatim (deps array verbatim).
  5. SUB-HOOK `useCommitSkillDelete({ portRef, alive, refresh, setConfirmDeleteId, setBodyById, setFilesById, setExpandedId, setEditingId, setDraftState, setDraftError }: UseCommitSkillDeleteInput): (id: string) => Promise<void>` ← `commitDelete` (keep its exact signature/return type).
- **Importers to update:** none.
- **After:** `useSkillsTab` ~95; file ~370.
- **Risks / notes:** call order: list → filters → cache → (interaction `useState`s) → callbacks; sub-hooks 4/5 are called where `submitDraft`/`commitDelete` were. The filter `useState` moves before the cache `useState`s — state order only. If `useSkillsTab` is still >100 after counting, also move `startEdit`+`requestEdit`+`confirmBuiltInEdit` into `useSkillEditEntry({...})` (same rule).

### jini:packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts
- **Over:** `useSourceConfigList` 119 (file 171)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.test.ts`; smoke `packages/ui/src/features/source-config-list/react/components/SourceConfigList.test.tsx`, `packages/ui/src/features/source-config-list/__tests__/SourceConfigListView.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `pendingKeys`, `testResults` state, `remove`, `refresh`, `setTrust`, `test`, `update`, `isPending` | per-source actions with pending tracking |
| B | `sources`/`loading`/`error`, `reload` + effect, `addSourceToList`, `capabilities`, return | list loading + controller (stays) |

- **Splits:**
  1. SUB-HOOK (same file, above) `useSourceItemActions<TSource>({ port, setSources }: UseSourceItemActionsInput<TSource>): { pendingKeys, testResults, isPending, remove, refresh, setTrust, test, update }` ← unit A statements in original order (the two `useState`s first). Main hook calls it right after its own three `useState`s; `capabilities` keeps using `setTrust` from the result.
- **Importers to update:** none.
- **After:** `useSourceConfigList` ~50; file ~185.
- **Risks / notes:** `useState` order changes (pendingKeys/testResults now after reload's state but before `reload`) — keep the call before `reload` so hook-slot order is identical. Generic `TSource` must flow into the input type.

### jini:packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.ts
- **Over:** `useTabLauncherMenu` 108 (file 155)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.test.ts`, `packages/ui/src/features/tab-launcher-menu/react/hooks/__tests__/useTabLauncherMenu.characterization.test.tsx`, `packages/ui/src/features/tab-launcher-menu/index.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `position` state + `useLayoutEffect(() => {` (~L80) | anchored, viewport-clamped position |
| B | `kinds`, `fileResults`, `tabResults`, `selectableCount`, selection-clamp `useEffect` (~L102) | filtered results + selection bound |
| C | rest (`query`, `kindFilter`, `selected`, select/run callbacks, `handleInputKeyDown`) | interaction (stays) |

- **Splits** (same file, above):
  1. SUB-HOOK `useLauncherPosition({ anchor }: UseLauncherPositionInput): TabLauncherPosition | null` ← `position` `useState` + the `useLayoutEffect`.
  2. SUB-HOOK `useLauncherResults({ files, tabs, query, kindFilter, setSelected }: UseLauncherResultsInput): { kinds, fileResults, tabResults, selectableCount }` ← unit B in order.
  Call order in the main hook: `containerRef`, `query`, `kindFilter`, `selected` state, `useLauncherPosition`, `useDismissOnOutsideOrEscape(...)`, `useLauncherResults`, then the `onTrack` effect and callbacks.
- **Importers to update:** none.
- **After:** `useTabLauncherMenu` ~88; file ~170.
- **Risks / notes:** `position` `useState` moves after `selected` — same relative order as before (it was last). Effect order preserved.

### jini:packages/ui/src/features/tab-strip/react/hooks/useTabStripDragReorder.ts
- **Over:** `useTabStripDragReorder` 125 (file 162)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/tab-strip/__tests__/react/hooks/useTabStripDragReorder.test.ts`, `packages/ui/src/features/tab-strip/__tests__/react/components/TabStripItem.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `const stripDragProps = {` (~L174) | strip-level dragover/drop/leave handlers |
| B | `findDropTarget` | hit-test pointer x against tab rects |
| C | refs/state, `pulseIfNewTarget`, `clearDragState`, `getItemDragProps` | per-item drag gesture (stays) |

- **Splits** (same file, above the hook):
  1. HELPER `buildStripDragProps({ draggingTabIdRef, findDropTarget, setDragOverTarget, pulseIfNewTarget, reorderTiming, onReorder, haptics, clearDragState }: BuildStripDragPropsInput): StripDragProps` ← the object literal verbatim (it is rebuilt every render today; calling the helper every render keeps that). Name the return type `StripDragProps` = the existing type of `UseTabStripDragReorderResult['stripDragProps']` (use that indexed type, do not invent a new shape).
  2. SUB-HOOK `useFindDropTarget({ stripRef, tabs }: UseFindDropTargetInput): <existing callback type>` ← the `findDropTarget` `useCallback` with its deps.
- **Importers to update:** none.
- **After:** `useTabStripDragReorder` ~66; file ~180.
- **Risks / notes:** none — no ordering change (findDropTarget's useCallback slot stays at the same position).

### jini:packages/ui/src/features/version-manager/react/components/VersionManagerModal.tsx
- **Over:** `VersionManagerModal` 137 (file 207)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/version-manager/__tests__/react/components/VersionManagerModal.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `useI18n`, `controller = useVersionManagerHook(…)`, `useCopyToClipboard`, controller destructure (~L57), `versionCountLabel`, `promptOpenRef`, `handleEscape`, Escape `useEffect` | modal state + layered Escape |
| B | `return createPortal(` | render list + preview (stays) |

- **Splits:**
  1. NEW `VersionManagerModal.hooks.ts` (same folder) — job: modal wiring. `useVersionManagerModal({ fileRef, currentContent, onClose, onRestored, dependencies, viewportPresets, useVersionManagerHook }: UseVersionManagerModalInput): VersionManagerModalView` ← unit A verbatim (with the "Layered Escape handling…" comment); returns every local the JSX reads (take the list from the return statement's `uses:`). Imports nothing from the original.
  2. `VersionManagerModal` keeps the props destructure (incl. its defaults, unchanged) and calls the hook.
- **Importers to update:** none.
- **After:** `VersionManagerModal` ~88; file ~165; hooks file ~70.
- **Risks / notes:** the default `dependencies = defaultVersionManagerDependencies as unknown as …` is pre-existing (banned pattern) — leave it exactly where it is, do not copy it into the hooks file. If the JSX still pushes the component over 100, also move the version list `<ul>`/list block into a sub-component `VersionList` (plain props).

### jini:packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts
- **Over:** `useVersionManager` 236 (file 313)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/version-manager/__tests__/react/hooks/useVersionManager.test.tsx`; smoke `packages/ui/src/features/version-manager/__tests__/react/components/VersionManagerModal.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `contentCacheRef`, `inFlightRef`, `primeVersionContent` | dedupe-primed version content cache |
| B | `describeVersion`, `visibleVersions` | searchable version labels |
| C | selection `useEffect(() => {` (~L224) | load content for the selected version |
| D | `previewDocument`, `loadedPreviewDocument` state, `frameReady`, safety-net `useEffect` (~L276) | preview iframe readiness |
| E | `restore` | restore a version |
| F | `openInNewTab` | open-in-new-tab action |
| G | state, `loadVersions` + effect, derived flags, return | state machine core (stays) |

- **Splits** (same file, above the hook, in this order):
  1. SUB-HOOK `useVersionContentCache<TVersion>({ port, fileRef }: UseVersionContentCacheInput<TVersion>): { contentCacheRef, primeVersionContent }` ← unit A (with "Primes the content cache…" comment).
  2. SUB-HOOK `useVisibleVersions<TVersion>({ versions, versionById, search, showSearch, tRef, locale }: UseVisibleVersionsInput<TVersion>): { describeVersion, visibleVersions }` ← unit B.
  3. SUB-HOOK `useSelectedVersionContent({ selectedId, contentCacheRef, primeVersionContent, preserveErrorOnNextSelectionRef, tRef, setSelectedContent, setSelectedContentVersionId, setLoadingContent, setError }: UseSelectedVersionContentInput): void` ← unit C (effect body + deps verbatim).
  4. SUB-HOOK `usePreviewFrame<TVersion>({ selectedContent, port, fileRef }: UsePreviewFrameInput<TVersion>): { previewDocument, frameReady, setLoadedPreviewDocument }` ← unit D (comment "Safety net…" moves). The `loadedPreviewDocument` `useState` moves into it.
  5. SUB-HOOK `useRestoreVersion<TVersion>({ … every name in `restore`'s uses … }: UseRestoreVersionInput<TVersion>): () => Promise<void>` ← `restore` verbatim with deps.
  6. SUB-HOOK `useOpenInNewTab<TVersion>({ port, loadingContent, selectedContentMatchesVersion, selectedContent, selectedVersion, fileRef }): <existing type>` ← unit F.
- **Importers to update:** none.
- **After:** `useVersionManager` ~85; file ~370.
- **Risks / notes:** EFFECT ORDER must stay: tRef effect → loadVersions effect → selection effect → preview safety-net effect. Call `useSelectedVersionContent` right after the loadVersions effect and `usePreviewFrame` before it only for its `useState`/`useMemo`; the safety-net effect is inside `usePreviewFrame`, so call `usePreviewFrame` AFTER `useSelectedVersionContent` and compute nothing that the earlier code reads from it — check `restoreDisabled` does not read `previewDocument` (it does not, per outline). `loadedPreviewDocument` state slot moves later (harmless).

### jini:packages/ui/src/features/viewer-shell/react/components/CommentSidePanel.tsx
- **Over:** `CommentSidePanel` 104 (file 490 — near the limit)
- **Phase:** now · **Batch:** size-45
- **Tests:** `packages/ui/src/features/viewer-shell/__tests__/react/components/CommentSidePanel.test.tsx`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `ToggleFocusTarget`, `useCollapseToggleFocus`, `useCommentTimestampFormatter`, and in the component `const t`…`useCollapseToggleFocus(...)` (~L92-104) | panel state/hooks |
| B | `CommentSidePanel` collapsed branch + JSX | render (stays) |
| C | `CommentSideRail`, `CommentSideHeader`, `CommentSideItem` (+ class helpers, attachments), `CommentSideSelectBar`, `CommentSideCreateForm` | sub-components (stay) |

- **Splits:**
  1. NEW `CommentSidePanel.hooks.ts` (same folder) — job: panel state. Moves `ToggleFocusTarget`, `useCollapseToggleFocus` (with its "Moves focus onto whichever…" comment), `useCommentTimestampFormatter`; adds `useCommentSidePanel({ comments, selectedIds, onReorder, formatTimestamp, collapsed, onCollapsedChange, useCommentReorderHook }: UseCommentSidePanelInput): { t, newCommentDraft, setNewCommentDraft, reorder, visibleSelectedIds, selectedCount, commentsLabel, panelId, formatTs, collapsedRailRef, expandedToggleRef, handleCollapsedChange }` ← statements `const t = useT();` through the `useCollapseToggleFocus` destructure (orderedIds stays internal). None of the moved hooks are exported today → no importers.
- **Importers to update:** none.
- **After:** `CommentSidePanel` ~88; file ~440; hooks file ~70.
- **Risks / notes:** `useCommentReorderHook` is a prop seam — pass the prop value in; keep hook call order identical (`useT`, `useState`, reorder, `useId`, formatter, collapse focus).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/ui/src/features/skills/react/components/SkillRow.tsx packages/ui/src/features/skills/react/hooks/useSkillsTab.ts packages/ui/src/features/source-config-list/react/hooks/useSourceConfigList.ts packages/ui/src/features/tab-launcher-menu/react/hooks/useTabLauncherMenu.ts packages/ui/src/features/tab-strip/react/hooks/useTabStripDragReorder.ts packages/ui/src/features/version-manager/react/components/VersionManagerModal.tsx packages/ui/src/features/version-manager/react/hooks/useVersionManager.ts packages/ui/src/features/viewer-shell/react/components/CommentSidePanel.tsx <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
