# Terra job size-14: split 6 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/website/src/features/publish-content/raw-row-contributor.ts
- **Over:** `buildRawRowHandler` 134 (file 219, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-14
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/bundle-create.routes.pins.test.ts`, `.../__tests__/import.routes.pins.test.ts`, `.../__tests__/backstop-import-ui.routes.test.ts`, `.../__tests__/backstop-undo.routes.pins.test.ts` (it `mock.module`s THIS path spreading the real exports — no export moves, so unaffected), `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`.
- **Responsibility map** (inside `buildRawRowHandler`):

| unit | nested functions | job |
|---|---|---|
| A checks | `blockedTable`, `checkShape`, `checkPrimaryKey`, `checkLiveValues`, `precheck` | decide whether one packed row may be written |
| B pack | `packSelected` | read + precheck the selected rows into packed entities |
| C (stays) | `port`, `skipped`, `const handler: PublishContentHandler = {`, `return handler` | the raw-row handler |

- **Splits:** HELPERS at module level directly above `buildRawRowHandler`, bodies word for word (fold each nested fn's params plus the locals it reads into one object):
  `rawRowBlockedTable({ deps, table }): string | null` · `checkRawRowShape({ deps, entity }): string | null` · `checkRawRowPrimaryKey({ entity, live })` · `checkRawRowLiveValues({ deps, entity, live })` · `precheckRawRow({ deps, port, entity }): Promise<string | null>` · `packSelectedRawRows({ deps, port, selected })` — return types copied from the nested ones; `port` type = `NonNullable<PublishContentDeps["backstop"]>["rows"]` (or its existing name). Drop the nested ones' unused `_optional` params (they were empty). `handler` calls them with `deps`/`port`.
- **Importers to update:** none.
- **After:** `buildRawRowHandler` ~72; file ~230.
- **Risks / notes:** `checkShape`/`checkPrimaryKey` read the parent's `_optional` per the outline — it is the empty `Record<string, never>`; confirm in source that nothing reads a field of it before dropping.

### tovu:apps/website/src/features/site-backup/import-backend.ts
- **Over:** `createSiteImportBackend` 141 (file 172, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-14
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/system/site-imports.integration.test.ts`, `apps/website/src/cli/__tests__/integration/import-local.integration.test.ts`, `apps/website/src/server/__tests__/routes/owner-action-product-events-wave2.test.ts`; plus `rg -l "import-backend" apps/website/src --glob '*.test.*'`. No test mocks this module.
- **Responsibility map:**

| unit | statement anchor | job |
|---|---|---|
| A | `const fetchArchive = async (input: { parsed: ParsedSiteImportInput; principalId: string; i…` | read/download the archive, recording the consumed upload first |
| B | `const verifyAndStage = async (input: { row: SiteImportRecord; parsed: ParsedSiteImportInpu…` | verify + stage, or roll the stage back |
| C | `const createImportedSite = async (input: { row: SiteImportRecord; adminPassword: string; s…` | create the site from the stage, or roll back to failed |
| D (stays) | `registry`, `workspace`, `view`, `put`, `let active`, `exclusive`, `const backend: SiteImportBackend = {` | the backend surface + one-at-a-time lock |

- **Splits:** HELPERS at module level directly above `createSiteImportBackend`, bodies word for word (their "why" comments move):
  1. `fetchSiteImportArchive({ input, required, optional }: FetchSiteImportArchiveInput)` ← A.
  2. `verifyAndStageSiteImport({ input, required, put, view }: VerifyAndStageSiteImportInput)` ← B (calls `fetchSiteImportArchive({ input: …, required, optional })` — add `optional` to its input if B's call needs it).
  3. `createImportedSiteFromStage({ input, required, optional, put }: CreateImportedSiteFromStageInput)` ← C.
  Return types: copy each arrow's inferred return (`Promise<…>`). `required`/`optional` = the factory's own param types (name them `SiteImportBackendRequired` / `SiteImportBackendOptional` by extracting the inline param type literals into module-level types). `registry`/`workspace` are read via `required.registry` / `required.workspace` inside the helpers (same objects). The factory keeps `const fetchArchive = …` etc. only if `backend` calls them directly; otherwise `backend` calls the helpers.
- **Importers to update:** none.
- **After:** `createSiteImportBackend` ~92; file ~190.
- **Risks / notes:** the `active` lock and `exclusive` stay in the factory — helpers must not touch `active`.

### tovu:apps/website/src/features/theme/theme.ts
- **Over:** file 624 lines (no function over)
- **Phase:** now (STAY-PRODUCT, theme package format) · **Batch:** size-14
- **Tests:** `apps/website/src/features/theme/__tests__/declared-scripts.unit.test.ts`, `apps/website/src/features/theme/__tests__/theme-files.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.themes.test.ts`, `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`, `apps/website/src/server/inbound/public-http/http/site/__tests__/render-font-links.test.ts`; plus `rg -l "theme/theme(\.js)?['\"]|\.\./theme\.js" apps/website/src/features/theme/__tests__` (run each). No test mocks this module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A manifest | `THEME_TIERS`, `isObject`, `readJson`, `parseTier`, `parseOptionalString`, `parseOptionalStringArray`, `pickTruthy`, `parseBuildFramework`, `parseBuildSourceDir`, `parseBuildArtifactHashes`, `parseThemeBuildInfo`, `parseSlotHonorsCurrentPage`, `parseSlotVariants`, `parseSlots`, `parseRawManifestFields`, `validateCompiledBuildManifest`, `validateManifestCrossFields`, `emptyThemeManifest`, `parseThemeManifest`, `resolveThemeScripts` | read + validate `theme.json` |
| B templates | `TEMPLATE_SLOT_MARKER_TYPE`, `validateTemplateDeclarations`, `classifyTemplateFile`, `loadJsonTemplateFile`, `loadLiquidTemplateFile`, `loadHandlebarsTemplateFile`, `loadTemplateSources`, `requiredTemplatesForTier`, `validateRequiredTemplates` | load + validate a theme's template sources |
| C (stays) | re-exports, `ThemeTokens`, `DiscoveredTheme`, static-tier assets (`StaticTierAssets` … `loadStaticTierAssets`), page-publish predicates, bundled-template inheritance, `loadThemeTokens`, `checkCompiledBuildConformance`, `loadThemeCss`, `loadTheme`, discovery (`discoverThemes` … `findStoredTheme`), dir constants | load one theme + discover all themes |

- **Splits:**
  1. NEW `theme-manifest.ts` (same folder) — job: parse/validate `theme.json` into a `ThemeManifest`. Moves unit A word for word (every parser's doc comment). Exports `isObject`, `readJson` (theme.ts still uses them for tokens/light tokens/JSON templates), `parseThemeManifest`, `resolveThemeScripts`. Imports types from `./render-contract.js`, nothing from `theme.ts`.
  2. NEW `theme-templates.ts` — job: template source loading + required/declared template checks. Moves unit B word for word. Exports `validateTemplateDeclarations`, `loadTemplateSources`, `validateRequiredTemplates`. Imports `readJson` from `./theme-manifest.js`; nothing from `theme.ts`. All three take only `ThemeManifest`/plain records (checked), so no theme.ts type is needed.
  3. `theme.ts` imports from both; `export type { … }` / `export { ENGINE_SUBFOLDERS, THEME_CATALOG_DIR }` re-exports stay as they are.
- **Importers to update:** `resolveThemeScripts` → `../theme-manifest.js` in `apps/website/src/features/theme/__tests__/declared-scripts.unit.test.ts` (keep `loadTheme` from `../theme.js`). `features/theme/index.ts` re-exports from `./theme.js` — check its list (`sed -n 1,24p index.ts`): if it names a moved symbol, point that name at `./theme-manifest.js`/`./theme-templates.js` (index.ts IS the feature entry, so it keeps exporting it). Re-run `rg -n "\b(resolveThemeScripts|parseThemeManifest|loadTemplateSources)\b" apps --glob '!node_modules'`.
- **After:** `theme.ts` ~370; `theme-manifest.ts` ~150; `theme-templates.ts` ~115.
- **Risks / notes:** `parseRawManifestFields` calls `resolveThemeScripts` — both move together. `TEMPLATE_SLOT_MARKER_TYPE` is only used by `validateTemplateDeclarations` (moves with it).

### tovu:apps/website/src/features/trash/adapters/user.ts
- **Over:** `createUserTrashAdapter` 103 (file 147, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-14
- **Tests:** `apps/website/src/features/trash/__tests__/user-adapter.test.ts`, `.../__tests__/user-adapter.dialects.test.ts`, `.../__tests__/account-protections.test.ts`. No test mocks this module.
- **Responsibility map:** returned adapter methods `hide` (33), `unhide` (29), `purge` (27) sharing `underPrincipalLock`, `kernel`, `deps`, `idGen`, `clock`, `purge` (dep).
- **Splits:** HELPER at module level directly above `createUserTrashAdapter` (after `appendEvent`): `hideUser({ input, deps, kernel, underPrincipalLock }: HideUserInput)` ← the `hide` method body word for word (`input` = the method's existing parameter(s) folded into one object; `idGen`/`clock` read as `deps.idGen`/`deps.clock` only if the body uses the destructured names — otherwise pass `idGen, clock` too, keeping the names). Return type = `hide`'s. The adapter's `hide` becomes `hide: (…same params…) => hideUser({ … })`. `kernel` type = `ReturnType<typeof lazyKernel>`; `underPrincipalLock` type = declare `type UnderPrincipalLock = <T>(input: { workspaceId: string; principalId: string; body: … }) => Promise<T>` copied from its definition.
- **Importers to update:** none.
- **After:** `createUserTrashAdapter` ~72; file ~160.
- **Risks / notes:** the method name `purge` shadows the destructured dep `purge` — keep names exactly as they are.

### tovu:apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts
- **Over:** `registerAdminDatabaseMigrateForwardRoutes` 115 (file 139, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-14
- **Tests:** `apps/website/src/server/__tests__/routes/database-migrate-forward-routes.test.ts`. No test mocks this module.
- **Responsibility map:** A = `app.post("/api/admin/v1/database/migrate-forward/plan", …` (25) · B = `…/confirm` (30) · C = `…/execute` (58) — the three ceremony steps.
- **Splits:** HELPER at module level above the register function (after `statusFor`): `handleMigrateForwardExecute({ req, res, deps }: { req: Request; res: Response; deps: RouteDeps }): Promise<void>` ← C's handler body word for word; registration `app.post(PATH, (req, res) => handleMigrateForwardExecute({ req, res, deps }))`. A and B stay inline.
- **Importers to update:** none.
- **After:** register fn ~58; file ~142.
- **Risks / notes:** none.

### tovu:apps/website/src/server/inbound/admin-http/routes/posts/update.ts
- **Over:** `registerAdminPostUpdateRoute` 109 · its `app.put` handler 103 (file 186, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-14
- **Tests:** `apps/website/src/server/inbound/admin-http/http/__tests__/ranked-user-facing-errors.test.ts`, `apps/website/src/server/inbound/admin-http/routes/posts/__tests__/revision-attribution.test.ts`; plus `rg -l "posts/update(\.js)?['\"]|registerAdminPostUpdateRoute" apps/website/src --glob '*.test.*'` hits. No test mocks this module.
- **Responsibility map** (the PUT handler):

| unit | statement anchor | job |
|---|---|---|
| A | `let postId: string;` + the following `try {` (slug → id resolution) | resolve the URL's slug-or-id to the stored post id, or answer 404/error |
| B (stays) | workspace check, `rawParam`, `idempotencyKey`, `let priorPost`, the main `try {` through the gateway call | the update itself |

- **Splits:**
  1. HELPER at module level above `registerAdminPostUpdateRoute` (after `sendPostUpdateError`): `resolvePostIdOrRespond({ rawParam, res, deps }: ResolvePostIdOrRespondInput): Promise<string | undefined>` ← the `try {` that assigns `postId` (returns the id; where the block responded and returned, return `undefined`). Keep the "Admin URLs use the slug…" comment on it. Caller: `const postId = await resolvePostIdOrRespond({ rawParam, res, deps }); if (postId === undefined) return;`. If the block is synchronous, make the helper synchronous (match the source; do not add awaits).
  2. HELPER `handlePostUpdate({ req, res, deps }: HandlePostUpdateInput): Promise<void>` ← the whole `app.put` handler body; registration becomes `app.put(PATH, …existing middleware args…, (req, res) => handlePostUpdate({ req, res, deps }))` with the same path and any middleware between them unchanged.
- **Importers to update:** none.
- **After:** `registerAdminPostUpdateRoute` ~8; `handlePostUpdate` ~92; file ~195.
- **Risks / notes:** `deps` is untyped in the `const-fn` signature (`(app, deps)`) — give the helpers the type the const's declared type gives `deps` (look at the `registerAdminPostUpdateRoute` type annotation, e.g. `RouteRegistrar` → `RouteDeps`). `priorPost` is assigned inside `captureInverse` closures in the main try — it stays inside `handlePostUpdate`.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/features/publish-content/raw-row-contributor.ts apps/website/src/features/site-backup/import-backend.ts apps/website/src/features/theme/theme.ts apps/website/src/features/trash/adapters/user.ts apps/website/src/server/inbound/admin-http/routes/database/migrate-forward.ts apps/website/src/server/inbound/admin-http/routes/posts/update.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
