# Terra job size-55: split 8 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/website/src/features/theme/theme-files.ts
- **Over:** file 597 lines (no function over 100)
- **Phase:** after-move (MIXED — DEDUPE: `isWithin`, `assertNoSymlinkEscape` path-containment helpers later deduped) · **Batch:** size-55
- **Tests:** `apps/website/src/features/theme/__tests__/theme-files.test.ts`, `.../theme-files.edge-cases.test.ts`, `.../theme-file-write-scope.test.ts`, `.../theme-file-reset-to-original.test.ts`, `.../theme-file-differs-from-original.test.ts`, `.../theme-reset-package-source-probe.test.ts`, `.../theme-original-reset-refusal.test.ts`, `.../write-file-atomically-eloop.unit.test.ts`, `.../theme-restore-generated-tree.test.ts`, `.../theme-write-preflight.unit.test.ts`, `.../theme-build-manifest.test.ts`, `.../sync-originals.test.ts`, `.../duplicate-theme.test.ts`, `apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-built-theme-gate.test.ts`, `apps/website/src/server/inbound/public-http/middleware/__tests__/theme-preview-static.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `ThemePathError`, `MAX_THEME_FILE_BYTES`, `MAX_LISTED_FILES`, `MAX_WALK_DEPTH`, `isRecognizedThemeRoot`, `isWithin`, `assertNoSymlinkEscape`, `resolveThemeFilePath`, `visitThemeDirEntry`, `walkThemeDir`, `listThemeFiles`, `statOrThemePathError`, `readThemeFile` | path containment, listing, reading (stay) |
| B | `GENERATED_THEME_DIRS`, `GENERATED_THEME_ROOT_FILES`, `isGeneratedThemePath`, `isSourceDirGeneratedConflict`, `normalizeThemeRelativePath`, `ThemeFileWriteScope`, `resolveThemeFileWriteScope` | classify generated build output / write scope (pure, leaf) |
| C | `COMPARE_CHUNK_BYTES`, `readFullChunk`, `filesHaveSameBytes`, `compareOpenThemeFiles` | byte-for-byte file comparison (leaf) |
| D | `ThemeOriginalSource`, `resolveThemeOriginalSource`, `isPackageShippedTheme` | where a theme's catalog original lives (leaf) |
| E | `originalRegularFile`, `themeFileDiffersFromOriginal`, `writeFileAtomically`, revision functions (`THEME_REVISION_ROOT` … `removeEmptyRevisionParents`), reviewed-write (`withReviewedThemeFileWrite` …), write/copy/rename/reset functions, `ThemeOriginalResetRefusal`, `ORIGINAL_LAYOUT_MISMATCH_REFUSAL`, `manifestApiVersionOnDisk`, `themeOriginalResetRefusal`, `restoreBuiltThemeGeneratedTree` | writes + revisions + reset (stay; need A) |

- **Splits:**
  1. NEW `apps/website/src/features/theme/theme-files-generated.ts` — job: decide which theme paths are generated build output and whether a path is writable. Moves unit B (`normalizeThemeRelativePath` moves up to sit first; the large docs on `GENERATED_THEME_DIRS`/`GENERATED_THEME_ROOT_FILES`/`isSourceDirGeneratedConflict` move word for word). Exports the six already-exported names plus `normalizeThemeRelativePath` only if the original still calls it (check with rg). Imports only what those bodies use (`node:path`).
  2. NEW `apps/website/src/features/theme/theme-files-compare.ts` — job: compare two files byte for byte without loading them whole. Moves unit C. Exports `filesHaveSameBytes`. `node:fs` imports only.
  3. NEW `apps/website/src/features/theme/theme-files-originals.ts` — job: resolve which catalog original a theme resets/compares against. Moves unit D with the "Design C (ADS-memory w4-theme-lifecycle-designs.md §5…)" doc block. Exports all three.
  4. `theme-files.ts` imports from the three new modules what it still uses (`isGeneratedThemePath`/`resolveThemeFileWriteScope`/`normalizeThemeRelativePath`, `filesHaveSameBytes`). Not a package entry → no re-exports. Copy the `@file` header paragraph about generated output (if any) into `theme-files-generated.ts`'s header.
- **Importers to update:** `apps/website/src/features/theme/index.ts` — barrel: move `isPackageShippedTheme` (L27), `resolveThemeOriginalSource`, `type ThemeOriginalSource` to `./theme-files-originals.js`, and `resolveThemeFileWriteScope`, `type ThemeFileWriteScope`, `isGeneratedThemePath` (and any other unit-B name it lists) to `./theme-files-generated.js`. Every other importer: run `rg -ln "\b(GENERATED_THEME_DIRS|GENERATED_THEME_ROOT_FILES|isGeneratedThemePath|isSourceDirGeneratedConflict|resolveThemeFileWriteScope|ThemeFileWriteScope|resolveThemeOriginalSource|ThemeOriginalSource|isPackageShippedTheme)\b" apps --glob '!node_modules'` and repoint only imports that name `theme-files(.js)` (today incl. `routes/themes/explore.ts`, `features/theme/{theme.ts,theme-layout.ts,validation/structure.ts,validation/manifest-v2.ts,file-identity-lock.ts,asset-operations.ts,save-theme-original.ts}`, `server/routes/types.ts`, `server/inbound/admin-http/routes/content/deps.ts`, `server/runtime/composition/deps.ts`, `server/inbound/public-http/middleware/theme-preview-static.ts`, `server/inbound/admin-http/routes/presentation/get.ts`, `features/site-backup/archive-extensions.ts`, `features/theme/tool-registrations.ts`, and the theme/explore tests). Imports via `features/theme/index` need no change.
- **After:** `theme-files.ts` ~478; `-generated.ts` ~52; `-compare.ts` ~38; `-originals.ts` ~36.
- **Risks / notes:** A test that imports both moved and staying names from `theme-files.js` gets two import lines. The later DEDUPE of `isWithin`/`assertNoSymlinkEscape` touches unit A only, so it does not conflict. Type-only imports (`ThemeFileWriteScope`, `ThemeOriginalSource`) keep `import type`.

### tovu:apps/website/src/features/theme/tool-registrations.ts
- **Over:** file 627 lines · `buildThemesRegistrations` 297
- **Phase:** after-move (MIXED — STAY-PRODUCT: the 13 theme tools; MOVE-AFTER shared contracts) · **Batch:** size-55
- **Tests:** `apps/website/src/assistant/__tests__/tool-registrations.themes.test.ts`, `.../tool-registrations.themes-edit-rename.test.ts`, `.../tool-registrations.themes-reset-copy.test.ts`, `.../tool-registrations.themes-trash-restore.test.ts`, `.../batch-tool-inputs.test.ts`, `.../theme-list-files-malformed-input-status.integration.test.ts`, `apps/website/src/features/theme/__tests__/theme-read-file-window.test.ts`, `.../theme-rescan-tool.test.ts`, `.../theme-list-build-view.test.ts`, `.../tool-registrations.edge-refusals.test.ts`, `.../theme-write-preflight.unit.test.ts`, `.../theme-file-safety.test.ts`, `.../theme-list-active.test.ts`, `.../tool-registrations.page-publication-read.test.ts`, `.../theme-write-file-overwrite-confirmation.test.ts`, `.../hardcoded-link-lists.test.ts`, `apps/website/src/server/inbound/admin-http/routes/themes/__tests__/integration/explore-file-trash.integration.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | re-exports L1-9, `MUTATES_DURABLE_STATE`, `CATALOG_BY_ID`, `toThemeToolView`, `assertCompiledWriteBoundaryUnchanged`, `THEME_TRASH_TOOL_ID`, `themesDerivedRisk`, `contributeThemesTools` | wiring + views (stay) |
| B | `originalSourceForTool`, `resetFromOriginalForTool`, `countOccurrences`, `applyThemeFileEdit`, `replaceThemeFileText`, `invalidRenameTargetNameReason`, `performThemeFileRename`, `pruneRestoredThemeTrash` | file edit / reset / rename / restore steps behind the write tools |
| C | `ThemeReadSelection`, `normalizeThemeReadInput`, `optionalThemeReadInteger`, `themeReadSelection`, `ThemeReadWindow`, `findThemeReadWindows`, `collectThemeReadMatches`, `mergeThemeReadWindow`, `renderThemeReadWindows`, `selectThemeReadContent`, `pageThemeReadContent` | choose and page the slice of a file `theme_read_file` returns |
| D | `buildThemesRegistrations` handler entries (13) | tool handlers |

- **Splits:**
  1. NEW `apps/website/src/features/theme/tool-registrations-read-selection.ts` — job: validate `theme_read_file` selection options and cut/page the returned text. Moves unit C in source order with docs. Exports `normalizeThemeReadInput`, `themeReadSelection`, `optionalThemeReadInteger`, `selectThemeReadContent`, `pageThemeReadContent` (whatever D/A still call — check with rg). Imports nothing from the original.
  2. NEW `apps/website/src/features/theme/tool-registrations-file-ops.ts` — job: perform a theme file edit, reset, rename or trash-restore cleanup once the tool's checks passed. Moves unit B with docs. Exports `resetFromOriginalForTool`, `applyThemeFileEdit`, `invalidRenameTargetNameReason`, `performThemeFileRename`, `pruneRestoredThemeTrash` (+ any other name D uses). Imports nothing from the original.
  3. HELPERS in `buildThemesRegistrations` (same file, above it, in this order). Plan-named input `interface ThemeHandlerInput { routeDeps: ThemeToolDeps }`:
     - `buildThemeReadHandlers({ routeDeps }: ThemeHandlerInput): Record<string, ToolHandler>` ← entries `preview_reload` … `theme_read_file` (~L567-665).
     - `createThemeWriteFileHandler`, `createThemeEditFileHandler`, `createThemeResetFileHandler`, `createThemeRenameFileHandler`, `createThemeCopyFileHandler` — each `({ routeDeps }: ThemeHandlerInput): ToolHandler` ← the arrow of `theme_write_file` (~L666), `theme_edit_file` (~L713), `theme_reset_file` (~L771), `theme_rename_file` (~L806), `theme_copy_file` (~L866).
     - `buildThemeTrashHandlers({ routeDeps }: ThemeHandlerInput): Record<string, ToolHandler>` ← entries `theme_trash_file`, `theme_restore_trashed_file` (~L904-988).
     - `buildThemesRegistrations` keeps its signature (`surfaces` default), `const handlers: Record<string, ToolHandler> = { ...buildThemeReadHandlers({ routeDeps }), theme_write_file: createThemeWriteFileHandler({ routeDeps }), theme_edit_file: …, theme_reset_file: …, theme_rename_file: …, theme_copy_file: …, ...buildThemeTrashHandlers({ routeDeps }) };` (same key order), then `const syncedHandlers = …` (with its "Every handler here reads the roster" comment) and `return protectThemeFileTools({` unchanged.
- **Importers to update:** `performThemeFileRename` → `../../features/theme/tool-registrations-file-ops.js` in `apps/website/src/assistant/__tests__/tool-registrations.themes-edit-rename.test.ts` (keep `contributeThemesTools`, `ThemeToolDeps` from `tool-registrations.js`). `asset-operations.ts` only mentions it in a comment. Re-exports L1-9 stay (other modules' public seam).
- **After:** original ~420; `buildThemesRegistrations` ~22; read handlers ~85; each write factory ≤ 55; trash handlers ~75; `-read-selection.ts` ~118; `-file-ops.ts` ~115.
- **Risks / notes:** Handlers read only `routeDeps` (outline). `surfaces` is passed to `protectThemeFileTools`/builders only if used today — keep as-is. Theme-read window tests assert exact text; pure move.

### tovu:apps/website/src/features/trash/table-adapter.ts
- **Over:** `createTableTrashAdapter` 191 (file 211, under)
- **Phase:** after-move (MOVE-AFTER registry.ts / entry types) · **Batch:** size-55
- **Tests:** `apps/website/src/features/trash/__tests__/table-adapter.test.ts`, `.../trash/__tests__/table-adapter.dialects.test.ts`, `.../trash/__tests__/move-to-trash.test.ts`, `.../trash/__tests__/sweeper.test.ts`, `.../trash/__tests__/menu-trash-flow.test.ts`, `.../trash/__tests__/term-trash-flow.test.ts`, `apps/website/src/server/__tests__/admin-trash-routes.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `VERSION_CHANGED`, `MarkerRow`, `isMarkerValueLive`, `affected`, `hasVersionChanged` | marker/version predicates (stay) |
| B | inner `cleanUpTrashedItemsRows`, `selectIds`, `runCascade`, `readMarkerRow`, `readVersion`, `writeMarker`, `checkBlocker` | one entry's row reads/writes + purge cascades |
| C | returned `purge` method | physically remove a trashed row and its cascades |
| D | `const { entry } = required;`, `let resolved`, `kernel`, `run`, `lockRow`, returned `entityType`/`hide`/`unhide` | the adapter (stays) |

- **Splits:**
  1. TYPE (module level, above the helpers): `type TableTrashRun = <T>({ fn }: { fn: (db: Kysely<ContentDatabase>) => Promise<T> }, _optional?: object) => Promise<T>;` — the existing `run` arrow's type, named so it can cross the boundary.
  2. HELPER `createTableTrashRowAccess({ entry, run }: CreateTableTrashRowAccessInput)` (return type inferred; `type TableTrashRowAccess = ReturnType<typeof createTableTrashRowAccess>` declared right after it) (module level, above `createTableTrashAdapter`) ← the seven inner functions from `async function cleanUpTrashedItemsRows(` through the end of `async function checkBlocker(` (~L87-213), moved with every doc block, unchanged; ends `return { cleanUpTrashedItemsRows, selectIds, runCascade, readMarkerRow, readVersion, writeMarker, checkBlocker };`.
  3. HELPER `createTableTrashPurge({ entry, kernel, lockRow, run, rowAccess }: CreateTableTrashPurgeInput): TrashAdapter["purge"]` (above the adapter, below step 2) ← the `async purge(purgeRequired): Promise<TrashPurgeOutcome> {` method body (~L307-360) as `return async (purgeRequired) => { … }`; its doc block moves above the helper. Body reads `rowAccess.readMarkerRow` etc. via a first-line destructure `const { readMarkerRow, runCascade } = rowAccess;` (add whichever B names the body uses) so statements stay identical.
  4. `createTableTrashAdapter` keeps unit D, adds `const rowAccess = createTableTrashRowAccess({ entry, run }); const { readMarkerRow, readVersion, writeMarker, checkBlocker } = rowAccess;` after `lockRow`, and in the returned object replaces the `purge` method with `purge: createTableTrashPurge({ entry, kernel, lockRow, run, rowAccess }),` (its doc comment stays as the property doc — copy it, the helper also keeps one).
- **Importers to update:** none (export unchanged).
- **After:** file ~222; `createTableTrashAdapter` ~65; `createTableTrashRowAccess` ~95; `createTableTrashPurge` ~48.
- **Risks / notes:** `kernel` must stay lazy (`resolved ??=` — the "Resolved on first use" comment stays with it); pass the function, never call it at helper creation. `lockRow`'s type: `(input: { workspaceId: string; entityId: string }, _optional?: object) => ReturnType<TrashDb["lockKey"]>`. `purge` is a method on `TrashAdapter`; `TrashAdapter["purge"]` gives the same contextual typing for `purgeRequired`.

### tovu:apps/website/src/features/webhooks/tool-registrations.ts
- **Over:** `buildWebhooksRegistrations` 126 (file 228, under)
- **Phase:** after-move (MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-55
- **Tests:** `apps/website/src/features/webhooks/__tests__/tool-registrations.handlers.test.ts`, `.../webhooks/__tests__/tool-registrations.model-facing-errors.test.ts`, `.../webhooks/__tests__/agent-tools.delete-confirmation.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.webhooks.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MANAGE_INTEGRATIONS_PERMISSION`, `CATALOG_BY_ID`, `IntegrationsToolDeps`, limits, `clampDeliveriesLimit`, `mostRecentDelivery`, `toSubscriptionToolView`, `toDeliveryToolView`, `WEBHOOKS_DELETE_TOOL_ID`, `webhooksDerivedRisk`, `WEBHOOKS_MODEL_FACING_ERRORS` | deps, views, risk (stay) |
| B | entries `webhooks_list_subscriptions`, `webhooks_get_deliveries` | read handlers |
| C | entries `webhooks_create_subscription`, `webhooks_update_subscription`, `webhooks_pause_subscription` | subscription write handlers |
| D | entry `webhooks_delete_subscription: approvalToolHandler({ surfaces,` | approval-gated delete |

- **Splits:**
  1. HELPERS in `buildWebhooksRegistrations` (same file, above it, in this order). `isAllowedTarget` type: `(url: string) => boolean` (match the arrow's inferred return).
     - `buildWebhookReadHandlers({ routeDeps }: BuildWebhookReadHandlersInput): Record<string, ToolHandler>` ← entries L198-232.
     - `buildWebhookWriteHandlers({ routeDeps, isAllowedTarget }: BuildWebhookWriteHandlersInput): Record<string, ToolHandler>` ← entries `webhooks_create_subscription` … `webhooks_pause_subscription` (~L233-297).
     - `createWebhookDeleteHandler({ routeDeps, surfaces, isAllowedTarget }: CreateWebhookDeleteHandlerInput): ToolHandler` ← the value `approvalToolHandler({ surfaces, …})` (~L298-340).
  2. `buildWebhooksRegistrations` keeps its signature (`surfaces` default), `const isAllowedTarget = …`, then `const handlers: Record<string, ToolHandler> = { ...buildWebhookReadHandlers({ routeDeps }), ...buildWebhookWriteHandlers({ routeDeps, isAllowedTarget }), webhooks_delete_subscription: createWebhookDeleteHandler({ routeDeps, surfaces, isAllowedTarget }) };` and the `return buildDomainRegistrations(` statement.
- **Importers to update:** none.
- **After:** file ~236; builder ~14; helpers ~32 / ~58 / ~42.
- **Risks / notes:** Drop `isAllowedTarget` from a helper's input if rg shows that helper's moved lines never use it (the outline shows uses at ~L240/266/281/330 — create/update/pause/delete). `surfaces` type is `ChatDeleteSurfaceDeps`.

### tovu:apps/website/src/features/widgets/tool-registrations.ts
- **Over:** `buildWidgetsRegistrations` 213 (file 338, under)
- **Phase:** after-move (MOVE-AFTER features/widgets/agent-tools contracts) · **Batch:** size-55
- **Tests:** `apps/website/src/features/widgets/__tests__/integration/tool-registrations.region-gaps.test.ts`, `.../tool-registrations.delegated-error-status.test.ts`, `.../tool-registrations.shape-rejection.test.ts`, `.../tool-registrations.handler-gaps.test.ts`, `.../tool-registrations.input-validation-status.test.ts`, `.../tool-registrations.plugin-hook-failed.test.ts`, `apps/website/src/features/widgets/__tests__/agent-tools.trash-confirmation.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.widgets-authorization.test.ts`, `.../tool-registrations.widgets-contracts.test.ts`, `apps/website/src/server/__tests__/widgets-error-code-parity.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MUTATES_DURABLE_STATE`, `CATALOG_BY_ID`, `WidgetsToolDeps`, `widgetsDerivedRisk`, `isWidgetsShapeRejection`, `toModelFacingWidgetsError`, views, `WIDGETS_TRASH_TOOL_ID`, `ASSISTANT_ACTOR_PLUGIN_ID`, `resolveWidgetPlacementView`, `placementContent` | deps, errors, views (stay) |
| B | entries `widgets_list_instances`, `widgets_get_instance`, `widgets_list_regions`, `widgets_get_region` | read handlers |
| C | entries `widgets_create_instance`, `widgets_update_instance`, `widgets_trash_instance` | instance write handlers |
| D | entries `widgets_bind_region`, `widgets_set_region_placements` | region binding handlers |
| E | entries `widgets_insert_embed`, `widgets_remove_embed`, `widgets_reorder_embeds` | in-content embed handlers |

- **Splits:**
  1. HELPERS in `buildWidgetsRegistrations` (same file, above it, in this order). Plan-named input `interface WidgetsHandlersInput { routeDeps: WidgetsToolDeps }`; each returns `Record<string, ToolHandler>`:
     - `buildWidgetReadHandlers` ← entries ~L231-283; `buildWidgetInstanceWriteHandlers` ← ~L284-364; `buildWidgetRegionHandlers` ← ~L365-406; `buildWidgetEmbedHandlers` ← ~L407-464.
  2. `buildWidgetsRegistrations` keeps its signature, `const handlers: Record<string, ToolHandler> = { ...buildWidgetReadHandlers({ routeDeps }), ...buildWidgetInstanceWriteHandlers({ routeDeps }), ...buildWidgetRegionHandlers({ routeDeps }), ...buildWidgetEmbedHandlers({ routeDeps }) };` (same key order), then `const modelFacingHandlers …` (with its "Every handler above gets `toModelFacingWidgetsError`" comment) and the `return buildDomainRegistrations(` statement with its "No `unwiredToolIds`" comment.
- **Importers to update:** none.
- **After:** file ~350; builder ~28; helpers ~50 / ~75 / ~40 / ~55.
- **Risks / notes:** Outline: handlers read only `routeDeps`. If `widgets_trash_instance` reads `surfaces` (rg the moved lines), add `surfaces: AssistantSurfaceDeps` to `buildWidgetInstanceWriteHandlers`' input.

### tovu:apps/website/src/server/inbound/admin-http/dev-auth.ts
- **Over:** `registerAuthRoutes` 185 (file 494 — would pass 500 once helpers are added, so one leaf moves out)
- **Phase:** after-move (MIXED — STAY-WIRING: `requireAdminSession`/route registration stay in Tovu) · **Batch:** size-55
- **Tests:** `apps/website/src/server/inbound/admin-http/__tests__/dev-auth.unit.test.ts`, `.../__tests__/dev-auth-failures.unit.test.ts`, `.../__tests__/dev-auth-me-rejection.unit.test.ts`, `.../__tests__/owner-mfa-login.unit.test.ts`, `.../__tests__/owner-passkey-http.integration.test.ts`, `apps/website/src/server/__tests__/admin-logout-route.test.ts`, `.../admin-boot-session-route.test.ts`, `.../admin-local-boot-session-route.test.ts`, `.../admin-password-status-route.test.ts`, `apps/website/src/server/inbound/public-http/routes/__tests__/unit/h4-plugin-auth.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `SESSION_COOKIE`, `readSessionToken`, `localSessionCookieName`, `setSessionCookie`, `clearSessionCookie` | admin session cookie name/read/set/clear (leaf) |
| B | `sessionTokens`, `SESSION_TTL_MS`, `API_KEY_AUTHORIZATION_PATTERN`, credential types, `identityReposFrom`, `authServiceDepsFrom`, `apiKeyServiceDepsFrom`, `revokeRequestSessions`, `readApiKeyCredential`, `currentCredential`, `currentPrincipal`, `getAuthed*`, `rejectUnlessSessionCredential`, `requireAdminSession` | credential resolution + middleware (stay) |
| C | loopback, `mintSessionForPrincipal`, `resolveBootOwner`, `sendAuthFailure`, `redeemOwnerBootSession`, `AdminSignInPort`, `isOwnerOrBuiltinAdmin`, `signalAdminSignIn`, `sessionRequestOptions`, `mfaBodyText` | sign-in support (stay) |
| D | `registerAuthRoutes` route groups | HTTP auth routes |

- **Splits:**
  1. NEW `apps/website/src/server/inbound/admin-http/dev-auth-cookies.ts` — job: the admin session cookie — its per-port name, reading it, setting and clearing it. Moves unit A with docs (`setSessionCookie`'s "REQ-06: HttpOnly, SameSite=Strict…" and `localSessionCookieName`'s "Cookies ignore ports" comments). Exports all five. Imports only what they use (express `Request`/`Response` types, `LocalOwnerSignInPolicy` type if `readSessionToken` names it). Positional signatures stay as they are (moved, not new).
  2. HELPERS in `registerAuthRoutes` (same file, directly above it, in this order). `LoginRoutesInput = { app: Express; deps: RouteDeps; loginRateLimiter: ReturnType<typeof createRateLimiter>; onAdminSignIn?: AdminSignInPort }`:
     - `registerPasswordLoginRoutes({ app, deps, loginRateLimiter, onAdminSignIn }: RegisterPasswordLoginRoutesInput): void` ← `app.post("/api/admin/v1/auth/login", …` and `app.post("/api/admin/v1/auth/mfa/login", …` (~L617-691).
     - `registerSessionHandoffRoutes({ app, deps, localOwnerSignIn, onAdminSignIn }: RegisterSessionHandoffRoutesInput): void` ← `app.post("/api/admin/v1/auth/logout", …`, the big "Exchange a single-use boot token" doc + `app.post("/api/admin/v1/auth/boot-session", …`, and the "Desktop must present its private launch capability" comment + `app.post("/api/admin/v1/auth/local-boot-session", …` (~L693-773).
     - `registerCurrentPrincipalRoutes({ app, deps, localOwnerSignIn }: RegisterCurrentPrincipalRoutesInput): void` ← `app.get("/api/admin/v1/auth/me", …`, the "Password-banner plan (2026-09-24), Slice 2" comment, `const defaultPasswordByHash`, `const usesDefaultPasswordFor`, `app.get("/api/admin/v1/auth/me/password-status", …` (~L775-853).
     - `registerAuthRoutes` keeps its signature, the REQ-14 limiter comment + `const loginRateLimiter`, the three `registerOwner*Routes` calls, then calls the three helpers in that order (Express registration order unchanged).
- **Importers to update:** none outside — moved cookie helpers were private.
- **After:** `dev-auth.ts` ~488; `registerAuthRoutes` ~22; helpers ~68 / ~52 / ~52; `dev-auth-cookies.ts` ~28.
- **Risks / notes:** `h4-plugin-auth.unit.test.ts` `mock.module('#src/server/inbound/admin-http/dev-auth', …)` spreads the real exports; only private helpers move, so the mock covers the same names. `defaultPasswordByHash` cache must stay per `registerAuthRoutes` call — it lives inside `registerCurrentPrincipalRoutes`, called once per registration, so still per call. `localOwnerSignIn` is the defaulted value (pass it, not the raw option).

### tovu:apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts
- **Over:** `createDaemonSiteTools` 111 (file 134, under)
- **Phase:** after-move (MIXED) · **Batch:** size-55
- **Tests:** `apps/website/src/server/inbound/assistant/__tests__/agent-daemon-site-tools.unit.test.ts`, `.../__tests__/agent-daemon-server.tool-restriction-wiring.unit.test.ts`, `.../__tests__/agent-daemon-server.attachment-binding.unit.test.ts`, `.../__tests__/agent-daemon-remote-tools.integration.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `componentResponse`, `toolResponse`, `preflightResponse`, `SiteCatalog`, `LiveRun` | response schemas + types (stay) |
| B | inner `async function read({ path, query, maxResponseBytes }` | one timed, byte-bounded, no-redirect read of the site RPC |
| C | inner `async function preflight({ runId, signal }` fetch part | (stays — reads `live`/`runs`) |
| D | rest of `createDaemonSiteTools` (scope, run maps, registry, start/finish, catalogs) | per-run catalog state (stays) |

- **Splits:**
  1. HELPER `readSiteRpc({ baseUrl, token, path, query, maxResponseBytes }: ReadSiteRpcInput, { fetch }: ReadSiteRpcOptions = {}): Promise<unknown>` (module level, directly above `createDaemonSiteTools`; `ReadSiteRpcOptions = { fetch?: typeof fetch }`) ← body of inner `async function read({ path, query, maxResponseBytes }` (~L58-71) with its 3-line "One timed, byte-bounded read…" doc. Only change inside: `optional.fetch` → `fetch` (the destructured option), i.e. `{ ...(fetch ? { fetch } : {}), maxResponseBytes, strictUtf8: true }`.
  2. In `createDaemonSiteTools` delete inner `read` and rewrite its two call sites: in `start` (`await read({ path: "/internal/tool-catalog", …})`) and in `refreshComponents` (`await read({ path: "/internal/component-catalog", …})`) → `await readSiteRpc({ baseUrl, token, path: …, query: …, maxResponseBytes: … }, { fetch: optional.fetch })`.
- **Importers to update:** none.
- **After:** file ~136; `createDaemonSiteTools` ~97; `readSiteRpc` ~15.
- **Risks / notes:** Barely over (111): this one lift suffices; do not split further. Naming the option `fetch` shadows the global inside the helper only — the body never calls the global `fetch` directly (it goes through `fetchTextWithTimeout`), so behaviour is identical.

### tovu:apps/website/src/server/runtime/boot/bootstrap.ts
- **Over:** `buildBootModules` 105 (file 253, under)
- **Phase:** after-move (MOVE — the survey moves this boot composition as a whole; split below executes only if that move slips, and travels with the file if it doesn't) · **Batch:** size-55
- **Tests:** `apps/website/src/server/runtime/boot/__tests__/bootstrap-modules.unit.test.ts`, `.../boot/__tests__/bootstrap-reporting.unit.test.ts`, `.../boot/__tests__/plugin-activation-poll-boot.unit.test.ts`, `.../boot/__tests__/agent-plugin-update-recovery-boot.unit.test.ts`, `apps/website/src/cli/__tests__/unit/serve-command-wiring.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `consoleLogger`, `noop`, `bootLog`, `syncProviderFacesAtBoot`, `lockSoonAgentPluginsAtBoot`, token-import steps, retirements, bundled warnings, `BuildBootModulesOptions`, `logCriticalBootFailures` | boot step helpers (stay) |
| B | `let pluginActivationPoll` + the `{ name: "plugin-runtime-attach", …}` element (with its "P0a fix (2026-09-23)" comment block) | attach enabled plugins + activation polling |
| C | element `{ name: "agent-plugin-update-recovery", …}` (with its "Finishes or rolls back an Agent Plugin update" comment) | recover interrupted plugin updates |
| D | element `{ name: "bundled-agent-plugins", …}` (with its "Installs the Agent Plugins that ship with Tovu" comment) | seed bundled plugins, then faces/soon-lock/tokens |
| E | `database-migration-reconciliation`, `settings`, `seo`, `newsletter`, `comments` elements | simple readiness modules (stay inline) |

- **Splits:**
  1. HELPERS (module level, above `buildBootModules`, in array order). Input `{ deps: NewsletterRouteDeps; options: BuildBootModulesOptions }` (`BootModuleInput`, plan-named, shared):
     - `pluginRuntimeAttachModule({ deps, options }: BootModuleInput): BootModule` ← first statement `let pluginActivationPoll: { stop: () => void } | undefined;` (moved from the top of `buildBootModules`), then `return {` the `plugin-runtime-attach` element `}` with its leading comment block moved above the `return`.
     - `agentPluginUpdateRecoveryModule({ deps }: Pick<BootModuleInput, "deps">): BootModule` ← the `agent-plugin-update-recovery` element.
     - `bundledAgentPluginsModule({ deps, options }: BootModuleInput): BootModule` ← the `bundled-agent-plugins` element.
  2. `buildBootModules` returns `[ …E elements unchanged…, pluginRuntimeAttachModule({ deps, options }), agentPluginUpdateRecoveryModule({ deps }), bundledAgentPluginsModule({ deps, options }) ]` in exactly the current array order (check the element order in source — keep it).
- **Importers to update:** none.
- **After:** file ~262; `buildBootModules` ~32; helpers ~32 / ~22 / ~55.
- **Risks / notes:** Array ORDER is behaviour (the update-recovery comment says "in array order: before the bundled seed"). `pluginActivationPoll` must be one variable shared by that element's `start` and `stop` — it is, inside the helper's closure, and the helper is called once per `buildBootModules` call as before. `bootstrap-reporting.unit.test.ts` mocks agent-plugin modules, not this file — unaffected. Drop `options` from a helper whose element never reads it (rg).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/features/theme/theme-files.ts apps/website/src/features/theme/tool-registrations.ts apps/website/src/features/trash/table-adapter.ts apps/website/src/features/webhooks/tool-registrations.ts apps/website/src/features/widgets/tool-registrations.ts apps/website/src/server/inbound/admin-http/dev-auth.ts apps/website/src/server/inbound/assistant/agent-daemon-site-tools.ts apps/website/src/server/runtime/boot/bootstrap.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
