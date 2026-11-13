# Terra job size-57: split 6 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/website/src/features/publish-content/tool-registrations.ts
- **Over:** `buildPublishContentRegistrations` 166 (file 357, under)
- **Phase:** after-move (MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-57
- **Tests:** `apps/website/src/features/publish-content/__tests__/publish-agent-tools.test.ts`, `.../__tests__/backstop-gaps-tool.test.ts`, `.../__tests__/publish-tool.test.ts`, `.../__tests__/plan-pull-tool.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `publishContentDerivedRisk`, `CATALOG_BY_ID`, `defaultProvisioning`, `MACHINE_TOKEN`, `plainSentence`, `chooseDestination`, `readReadiness` | readiness + wording helpers (stay) |
| B | `connectSiteUrl`, `suppliedPullPeer`, `selectPullPeer`, `pullHooks`, `acceptedPullReport`, `pullCounts`, `pullTitle`, `requiredPullBundleId`, `pullOverwriteKeys`, `pullToolBoundary`, `modelFacingPullError` | pull/connect helpers (stay) |
| C | handler entries `[PUBLISH_CONTENT_PUBLISH_TOOL_ID]`, `[PUBLISH_BACKSTOP_GAPS_TOOL_ID]` | publish + backstop-gap handlers |
| D | entries `[PUBLISH_CONTENT_PLAN_PULL_TOOL_ID]`, `[PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID]` | pull (plan + confirmed execute) handlers |
| E | entries `[PUBLISH_CONTENT_STATUS_TOOL_ID]`, `[PUBLISH_CONTENT_CONNECT_TOOL_ID]` | readiness status + connect handlers |

- **Splits:**
  1. HELPERS in `buildPublishContentRegistrations` (same file, directly above it, in this order):
     - `buildPublishHandlers({ routeDeps }: BuildPublishHandlersInput): Record<string, ToolHandler>` ← entries `[PUBLISH_CONTENT_PUBLISH_TOOL_ID]: ctx => pullToolBoundary(` and `[PUBLISH_BACKSTOP_GAPS_TOOL_ID]: async (ctx) => {` (~L189-203).
     - `buildPullHandlers({ routeDeps, surfaces }: BuildPullHandlersInput): Record<string, ToolHandler>` ← entries `[PUBLISH_CONTENT_PLAN_PULL_TOOL_ID]` and `[PUBLISH_CONTENT_EXECUTE_PULL_TOOL_ID]: humanConfirmedToolHandler(surfaces, {` (~L204-271).
     - `buildConnectionHandlers({ routeDeps, findCandidate, provisioning }: BuildConnectionHandlersInput): Record<string, ToolHandler>` ← entries `[PUBLISH_CONTENT_STATUS_TOOL_ID]` and `[PUBLISH_CONTENT_CONNECT_TOOL_ID]` (~L272-354). Type `findCandidate`/`provisioning` with the types of `routeDeps.findPublishCandidate` (non-optional) and `ReturnType<typeof defaultProvisioning>` (or the existing port type it returns).
     - `buildPublishContentRegistrations` keeps `const findCandidate = …`, `const provisioning = …`, `const handlers: Record<string, ToolHandler> = { ...buildPublishHandlers({ routeDeps }), ...buildPullHandlers({ routeDeps, surfaces }), ...buildConnectionHandlers({ routeDeps, findCandidate, provisioning }) };` and its `return buildDomainRegistrations({` statement.
- **Importers to update:** none.
- **After:** file ~370; `buildPublishContentRegistrations` ~16; helpers ~16 / ~66 / ~78.
- **Risks / notes:** Computed keys (`[X_TOOL_ID]`) stay computed. If a handler in C reads `surfaces`/`findCandidate`, add it to that helper's input (outline only shows `surfaces` at the execute-pull entry and `findCandidate`/`provisioning` in E). Write-service move later leaves these handlers in place.

### tovu:apps/website/src/features/recovery/tool-registrations.ts
- **Over:** `buildRecoveryRegistrations` 178 (file 269, under)
- **Phase:** after-move (MOVE-AFTER agent-tools.ts / contracts) · **Batch:** size-57
- **Tests:** `apps/website/src/features/recovery/__tests__/unit/permissions.unit.test.ts`, `apps/website/src/features/recovery/__tests__/unit/tool-registrations.deep-link-validation-status.unit.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.database-recovery.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `BACKUP_READ_PERMISSION`, `RESTORE_POINT_ENTITY`, `CATALOG_BY_ID`, `RecoveryToolDeps`, `recoveryDerivedRisk`, `RESTORE_TOOL_ID`, `RECOVERY_DISCLOSURE_COVERED_CATEGORIES`, `UNWIRED_RECOVERY_TOOL_IDS`, `requireEnvelope*`, `requireDeepLinkEnvelope` | constants + deep-link validation (stay) |
| B | build-locals `const restoreHooks = (actorId: string, restorePointId: string) =>`, `const planRestoreWithDisclosure = async (actorId: string, restorePointId: string) => {` | restore hooks + disclosure-aware planning |
| C | entries `backup_list_restore_points`, `backup_get_capabilities`, `backup_plan_restore`, `recovery_get_status`, `recovery_resolve_deep_link` | read/plan handlers |
| D | entry `[RESTORE_TOOL_ID]: humanConfirmedToolHandler(surfaces, {` | the human-confirmed restore handler |

- **Splits:**
  1. HELPERS (module level, above `buildRecoveryRegistrations`, in this order):
     - `restoreHooksFor({ routeDeps, actorId, restorePointId }: RestoreHooksForInput)` (return type inferred, as today) ← the `restoreHooks` arrow body (~L187-199).
     - `planRestoreWithDisclosure({ routeDeps, actorId, restorePointId }: PlanRestoreWithDisclosureInput)` ← the arrow body (~L203-234) with its "Plans a restore as the agent and folds in the discarded-write…" doc; its inner `restoreHooks(actorId, input.restorePointId)` becomes `restoreHooksFor({ routeDeps, actorId, restorePointId: input.restorePointId })`.
     - `buildRecoveryReadHandlers({ routeDeps }: RecoveryHandlersInput): Record<string, ToolHandler>` ← entries `backup_list_restore_points` … `recovery_resolve_deep_link` (~L237-319); `planRestoreWithDisclosure(ctx.principal.id, restorePointId)` → `planRestoreWithDisclosure({ routeDeps, actorId: ctx.principal.id, restorePointId })`.
     - `createRestoreHandler({ routeDeps, surfaces }: CreateRestoreHandlerInput): ToolHandler` ← the `[RESTORE_TOOL_ID]` entry value (~L320-395) with the same two call-site rewrites (`planRestoreWithDisclosure(...)`, `restoreHooks(ctx.principal.id, restorePointId)` → `restoreHooksFor({ routeDeps, actorId: ctx.principal.id, restorePointId })`).
     - Shared plan-named input `interface RecoveryHandlersInput { routeDeps: RecoveryToolDeps }`; `CreateRestoreHandlerInput` adds `surfaces: AssistantSurfaceDeps`.
  2. `buildRecoveryRegistrations` keeps its signature (incl. the `surfaces` default), `const handlers: Record<string, ToolHandler> = { ...buildRecoveryReadHandlers({ routeDeps }), [RESTORE_TOOL_ID]: createRestoreHandler({ routeDeps, surfaces }) };` and its `return buildDomainRegistrations(` statement.
- **Importers to update:** none.
- **After:** file ~280; `buildRecoveryRegistrations` ~10; helpers ~14 / ~32 / ~80 / ~76.
- **Risks / notes:** Positional `(actorId, restorePointId)` arrows become object-arg module functions — every call site (3) must be rewritten; grep the file for `restoreHooks(` and `planRestoreWithDisclosure(` afterwards. The default `surfaces` (fresh store per call) stays on the builder only.

### tovu:apps/website/src/features/site-backup/backup-service.ts
- **Over:** file 535 lines (no function over 100)
- **Phase:** after-move (MIXED) · **Batch:** size-57
- **Tests:** `apps/website/src/features/site-backup/__tests__/tool-registrations.unit.test.ts`, `apps/website/src/features/site-backup/__tests__/tool-registrations-host-connection.unit.test.ts`, `apps/website/src/features/source-control/__tests__/github-backup-secrets.integration.test.ts`, `apps/website/src/server/inbound/admin-http/routes/system/__tests__/site-backups.integration.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `SITE_BACKUP_DOMAIN`, `DOMAIN`, `PLAN_TOOL_ID`, `SITE_BACKUP_PUSH_TOOL_ID`, `PUSH_PERMISSION`, `CREDENTIAL_WRITE_PERMISSION`, `SNAPSHOT_SCOPE_ID`, `SiteBackupCall`, `SiteBackupToolDeps`, `Refusal`, `failureLog`, `logFailureDetail` | ids, deps, refusal shape (stay) |
| B | `ResolvedBackupCredential` … `resolveBackupCredential`, `INSPECT_CODES`, `providerRefusal`, `inspect` | credential + provider resolution (stays: needs A's types) |
| C | `ParsedPlanInput`, `optionalString`, `parseInclude`, `requireIncludeRecord`, `readIncludeSwitches`, `parseFolder`, `requireUnreservedFolder`, `parsePlanInput` | parse/validate `site_backup_plan` input (self-contained leaf) |
| D | `requireBackupPermissions`, `UNAVAILABLE`, `readSiteName`, `planResult`, `planSiteBackup`, `savePlan`, `PreparedContent`, `captureBackupDatabase`, `prepareContent` | plan tool (stay) |
| E | `PushResult`, `pushRefusal`, `pushPlannedBackup`, `PLAN_TAKE_MESSAGES`, `PUSH_WAIT_MS`, `DEFAULT_PUSH_JOBS`, `inProgressResult`, `pushWaitBudget`, `pushSiteBackup` | push tool (stay) |

- **Splits:**
  1. NEW `apps/website/src/features/site-backup/backup-service-plan-input.ts` — job: parse and validate the `site_backup_plan` tool input (fields, include switches, backup folder). Moves unit C in source order with every doc comment (`parsePlanInput`'s `@throws` doc, `requireUnreservedFolder`'s reserved-folder doc). The `// site_backup_plan` banner (~L398-400) stays in the original, now directly above `requireBackupPermissions`. Exports: `ParsedPlanInput` (type), `parsePlanInput`, `requireUnreservedFolder`. Takes only the imports those bodies use (validation error class, include-scope constants, host-facts type); imports nothing from `backup-service.ts`.
  2. `backup-service.ts` imports `{ parsePlanInput, requireUnreservedFolder, type ParsedPlanInput }` from `./backup-service-plan-input.js`; drop imports only the moved code used.
- **Importers to update:** none (all moved names were module-private).
- **After:** `backup-service.ts` ~477; `backup-service-plan-input.ts` ~65.
- **Risks / notes:** Copy the file-header paragraph about plan-input validation order ("malformed field — before any permission check") into the new file's header if the `@file` block has one. Pure move — no ordering effects. Survey label MIXED: whichever part later moves to Jini, unit C is plain input parsing and stays usable from either side.

### tovu:apps/website/src/features/taxonomy/tool-registrations.ts
- **Over:** `buildTaxonomyRegistrations` 223 (file 331, under)
- **Phase:** after-move (MOVE-AFTER contracts/core/human-confirmed…; STAY-WIRING) · **Batch:** size-57
- **Tests:** `apps/website/src/features/taxonomy/__tests__/tool-registrations.term-card.test.ts`, `.../taxonomy/__tests__/get-assigned-terms-tool.test.ts`, `.../taxonomy/__tests__/tool-registrations.assign-terms-validation-status.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.taxonomy.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `MUTATES_DURABLE_STATE`, `CATALOG_BY_ID`, `TaxonomyToolDeps`, `taxonomyDerivedRisk`, `MERGE_TOOL_ID`, `requireTaggableContentType`, `taxonomyDeps` | deps + risk (stay) |
| B | entries `taxonomy_list`, `taxonomy_create_taxonomy`, `taxonomy_create_term`, `taxonomy_rename_term` | taxonomy/term read + write handlers |
| C | entries `taxonomy_assign_terms`, `taxonomy_unassign_terms` | term assignment handlers |
| D | entry `taxonomy_plan_merge_term` | merge planning handler |
| E | build-locals `const mergeHooks = (`, `const termName = async (`, entry `[MERGE_TOOL_ID]: humanConfirmedToolHandler(surfaces, {` | the human-confirmed merge handler |

- **Splits:**
  1. HELPERS in `buildTaxonomyRegistrations` (same file, above it, in this order). Plan-named input `interface TaxonomyHandlersInput { routeDeps: TaxonomyToolDeps }`:
     - `buildTaxonomyTermHandlers({ routeDeps }: TaxonomyHandlersInput): Record<string, ToolHandler>` ← entries `taxonomy_list` … `taxonomy_rename_term` (~L215-274).
     - `buildTaxonomyAssignmentHandlers({ routeDeps }: TaxonomyHandlersInput): Record<string, ToolHandler>` ← entries `taxonomy_assign_terms`, `taxonomy_unassign_terms` (~L275-325).
     - `createPlanMergeTermHandler({ routeDeps }: TaxonomyHandlersInput): ToolHandler` ← the `taxonomy_plan_merge_term` arrow (~L326-362).
     - `createMergeTermHandler({ routeDeps, surfaces }: CreateMergeTermHandlerInput): ToolHandler` ← first the `const mergeHooks = (` (~L190-203) and `const termName = async (` (~L204) statements (moved, unchanged, as the helper's first statements), then `return humanConfirmedToolHandler(surfaces, {` … (the `[MERGE_TOOL_ID]` value, ~L363-428).
  2. `buildTaxonomyRegistrations` keeps its signature (incl. `surfaces` default) and becomes `const handlers: Record<string, ToolHandler> = { ...buildTaxonomyTermHandlers({ routeDeps }), ...buildTaxonomyAssignmentHandlers({ routeDeps }), taxonomy_plan_merge_term: createPlanMergeTermHandler({ routeDeps }), [MERGE_TOOL_ID]: createMergeTermHandler({ routeDeps, surfaces }) };` plus its `return buildDomainRegistrations({` statement.
- **Importers to update:** none.
- **After:** file ~340; `buildTaxonomyRegistrations` ~14; helpers ~58 / ~50 / ~38 / ~82.
- **Risks / notes:** `mergeHooks`/`termName` are used only by the `[MERGE_TOOL_ID]` entry (rg confirmed) — they move into `createMergeTermHandler`; they are created once per handler build either way. If any entry in B–D reads `surfaces`, add it to that helper's input (none found by rg).

### tovu:apps/website/src/features/theme/publish-content.ts
- **Over:** file 515 lines · `buildHandler` 154
- **Phase:** after-move (MIXED: MOVE-AFTER publish-content contracts; STAY wiring) · **Batch:** size-57
- **Tests:** `apps/website/src/features/theme/__tests__/publish-content.pack.test.ts`, `apps/website/src/features/theme/__tests__/publish-content.apply.test.ts`, `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`, `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `THEME_FILES_KIND`, `THEME_FILE_TREE_TIERS`, `ThemeTreeLocation`, `isMissing`, `readDirIfPresent`, `lstatIfPresent`, `realpathIfPresent`, `compareAscending`, `isThemeTreeEntry`, `compareTreeLocations`, `discoverThemeTreeDirs`, `WalkedThemeFile`, `childRelPath`, `walkStep`, `readWalkedFile`, `walkThemeTree`, `SkippedThemeTree`, `treeTitle`, `themeDisplayName`, `sortByPath`, `buildTreeState`, `packOneThemeTree`, `packThemeFilesEntities`, `sha256Of` | source side: discover, walk, hash and pack theme trees |
| B | `LINK_REASON`, `KEEP_PREVIOUS_COPIES`, `ThemeTreeAddress`, `parseTreeAddress`, `hashTreeAt`, `checkDestinationLinks`, `componentLinkReason`, `IncomingThemeFile`, `readIncomingFiles`, `isIncomingFileShape`, `isBlockedLibraryBlob`, `readBlob`, `prunePreviousCopies`, `incomingPolicyInputs`, `incomingTextSample`, `requireApplyWiring`, `swapPaths` | destination-side checks (stay) |
| C | `buildHandler` (`pack`, `listSkipped`, `inspect`, `seedHash`, `precheck`, `precheckIncoming`, `apply`), `contributeThemeFilesPublish`, `THEME_FILES_DEPENDS_ON` | the publish-content handler (stays) |

- **Splits:**
  1. NEW `apps/website/src/features/theme/publish-content-pack.ts` — job: find, walk, hash and pack every theme tree on this machine. Moves unit A in source order with all doc comments (`THEME_FILE_TREE_TIERS`'s "§1's inventory table" doc; `sha256Of` moves from ~L516 to sit after `readWalkedFile`'s helpers). Copy the original `@file` header's paragraphs about `pack()` and "## `packThemeFilesEntities` is exported in its own right" into the new header (keep the rest of the header in the original). Exports: `THEME_FILES_KIND`, `THEME_FILE_TREE_TIERS`, `SkippedThemeTree`, `packThemeFilesEntities`, plus what the original still uses: `lstatIfPresent`, `realpathIfPresent`, `compareAscending`, `walkThemeTree`, `sortByPath`, `buildTreeState`, `treeTitle`, `sha256Of`. Imports nothing from `publish-content.ts`.
  2. HELPERS out of `buildHandler` (module level in `publish-content.ts`, above `buildHandler`, in this order):
     - `blockPublish({ reason }: BlockPublishInput): never` ← the local `const blocked = (reason: string): never => {` arrow; rewrite its call sites `blocked(x)` → `blockPublish({ reason: x })` inside the moved apply code only.
     - `stageThemeFiles({ deps, files, entity, title, stagingRoot, stagingDir }: StageThemeFilesInput): Promise<void>` ← inner `async function stageFiles(files: readonly IncomingThemeFile[]): Promise<void> {` body (keeps the "a crashed earlier attempt" and "umask" line comments).
     - `swapThemeTreeIntoPlace({ target, previousPath, stagingDir }: SwapThemeTreeIntoPlaceInput): Promise<{ previous: string | null }>` ← inner `async function swapIntoPlace()` body.
     - `createThemeFilesApply({ deps, themePort, precheckIncoming }: CreateThemeFilesApplyInput): (input: ThemeFilesApplyInput) => Promise<{ changeSetId: string }>` ← the `async function apply(input: {` declaration (~L702-808) with its "Plan §3 steps 3-6" doc; first statement `const entityType = THEME_FILES_KIND;`; `stageFiles(incoming.files)` → `stageThemeFiles({ deps, files: incoming.files, entity, title, stagingRoot, stagingDir })`, `swapIntoPlace()` → `swapThemeTreeIntoPlace({ target, previousPath, stagingDir })`. `ThemeFilesApplyInput` = the existing inline `{ entity; expectedVersion; principalId; idempotencyKey }` type, named. `themePort` type: `PublishContentDeps["ports"][typeof THEME_FILES_KIND]`.
  3. `buildHandler` keeps `pack` … `precheckIncoming` and adds `const apply = createThemeFilesApply({ deps, themePort, precheckIncoming });` before its `return {`.
- **Importers to update:** `packThemeFilesEntities` → `../publish-content-pack.js` in `apps/website/src/features/theme/__tests__/publish-content.pack.test.ts`, `.../theme/__tests__/publish-content.apply.test.ts`; → `#src/features/theme/publish-content-pack` in `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`. `contributeThemeFilesPublish` stays (no change for `publish-content-manifest.ts`, `library-publish-transport.test.ts`).
- **After:** `publish-content.ts` ~345; `buildHandler` ~50; `createThemeFilesApply` ~62; `stageThemeFiles` ~22; `publish-content-pack.ts` ~185.
- **Risks / notes:** `swapped` (`let`) is shared between `execute` and `rollback` — it stays a local inside `createThemeFilesApply`. `precheckIncoming` closes over `themePort`/`deps`; pass the function, do not lift it. Pack test asserts `EIO`/`ENOTDIR` from fs — module location does not affect that. After the contracts move, only the type imports change.

### tovu:apps/website/src/features/theme/static-render.ts
- **Over:** file 514 lines (no function over 100)
- **Phase:** after-move (MIXED: menu renderers ~L184–390 are the movable part) · **Batch:** size-57
- **Tests:** `apps/website/src/features/theme/__tests__/menu-tree-render.test.ts`, `.../theme/__tests__/menu-html-mode.test.ts`, `.../theme/__tests__/menu-authored-html.test.ts`, `.../theme/__tests__/theme-pages-render.canary.test.ts`, `.../theme/__tests__/theme-slot-honors-current-page.test.ts`, `.../theme/__tests__/static-render-listings.test.ts`, `apps/website/src/server/inbound/public-http/routes/site/__tests__/unit/h4-pages.unit.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `tokensToRootCss`, `rewritePageLinks`, `hasAuthoredSlug`, `injectCurrentEntityContentId`, `injectPageTitle`, `injectColorMode`, `injectTokenStylesheet`, `warnUnrewrittenAssetPaths`, `renderStaticPage`, `wrapPartialInHostDocument`, `renderStaticPartial`, `renderStaticFragment` | page render pipeline (stay) |
| B | `StaticMenuItem`, `StaticHtmlMenu`, `StaticMenuContent`, `renderMenuLinks`, `menuItemClasses`, `menuItemInnerHtml`, `menuItemLinkAttrs`, `menuItemBody`, `MenuDropdown`, `renderMenuItem`, `renderMenuItems`, `renderMenuTree`, `injectMenuEmbeds`, `injectAuthoredMenuHtml`, `scanMenuEmbedIds`, `renderVisitorMenuToggle` | menu marker rendering |
| C | post-previews, collection, featured-image, author markers (`LEGACY_POST_PREVIEWS_LIMIT` … `postAuthorForContentHeader`) | content-marker injection (stay) |
| D | `PostTemplateResolution` … `resolveTemplateBranchChoice` | template choice (stay) |

- **Splits:**
  1. NEW `apps/website/src/features/theme/static-render-menus.ts` — job: render `{"type":"menu"}` markers (item trees, flat links, authored HTML menus) and list the menu ids a theme references. Moves unit B in source order with all doc comments (the long "Renders a resolved menu as a nested `<ul>`/`<li>` tree" doc above `menuItemClasses` moves with it; `renderVisitorMenuToggle` moves from the file end to after `renderMenuTree`). Exports: `StaticMenuItem`, `StaticHtmlMenu`, `StaticMenuContent`, `MenuDropdown` (type, needed by `renderStaticPage`'s option shape if it names it — check), `injectMenuEmbeds`, `scanMenuEmbedIds`. Imports it needs: `safeHref` from `./render-contract.js`, `escapeHtml`, `agentHandleSegment` (if menu code uses it), `MENU_MARKER_TYPE`/`markersOfType`/`substituteMarkers`/… from `@jini-ai/cms/widgets/markers`, `injectMenuDropdownScript`/`renderMenuToggle`, `menuLinkRelAttr`/`renderHtmlMenu`, `DiscoveredTheme` type. Imports nothing from `static-render.ts`.
  2. `static-render.ts` imports `{ injectMenuEmbeds, type StaticMenuContent }` (and any other name it still uses) from `./static-render-menus.js`; keeps `export { safeHref } from "./render-contract.js";`; removes imports only the moved code used.
- **Importers to update:** `apps/website/src/features/theme/index.ts` (barrel = package-entry style: export `scanMenuEmbedIds`, `type StaticMenuItem`, `type StaticHtmlMenu`, `type StaticMenuContent` from `./static-render-menus.js` instead, same public names); `apps/website/src/server/inbound/public-http/routes/site/pages.ts` (`scanMenuEmbedIds`, `StaticMenuItem`, `StaticMenuContent` → `#src/features/theme/static-render-menus`); `apps/website/src/features/theme/__tests__/menu-tree-render.test.ts` (`scanMenuEmbedIds`, `StaticMenuItem` → `../static-render-menus.js`); `.../theme-pages-render.canary.test.ts` (`scanMenuEmbedIds`); `.../menu-html-mode.test.ts` (`StaticMenuItem`). Importers via `features/theme/index` (render.ts, h4-pages test, template-render canary) need no change.
- **After:** `static-render.ts` ~395; `static-render-menus.ts` ~125.
- **Risks / notes:** Check `rg -n "MenuDropdown|renderMenuTree|injectMenuEmbeds" static-render.ts` after the move — `renderStaticPage` calls `injectMenuEmbeds`; nothing else in units A/C/D should reference B. If the survey's later move takes the menu renderers to Jini, `static-render-menus.ts` is exactly that unit and moves whole.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/features/publish-content/tool-registrations.ts apps/website/src/features/recovery/tool-registrations.ts apps/website/src/features/site-backup/backup-service.ts apps/website/src/features/taxonomy/tool-registrations.ts apps/website/src/features/theme/publish-content.ts apps/website/src/features/theme/static-render.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
