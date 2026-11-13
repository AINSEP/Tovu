# Terra job size-19: split 6 Jini file(s) by responsibility (size limits)

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
### jini:packages/cms/src/media/tool-registrations.ts
- **Over:** `buildMediaRegistrations` 143 (its `handlers` literal 114)
- **Phase:** now · **Batch:** size-19
- **Tests:** `src/media/__tests__/tool-registrations.test.ts`, `src/media/__tests__/list-provenance.unit.test.ts`, `src/media/__tests__/unit/document-text.unit.test.ts`. No `vi.mock` of the file (re-check with rg).
- **Responsibility map:**

| unit | statements | job |
|---|---|---|
| A (stays) | `routeDeps`, `mediaWriteDeps`, `return buildDomainRegistrations(…)` | wiring |
| B | `handlers` entries `library_list`, `library_read`, `media_list_assets` | read tools |
| C | `handlers` entries `media_upload_asset`, `media_update_metadata`, `media_trash_asset` | write tools |

- **Splits:**
  1. HELPER `buildMediaReadHandlers({ routeDeps }: BuildMediaReadHandlersInput): Record<string, ToolHandler>` — module level above `buildMediaRegistrations` ← the three read entries verbatim, same key order.
  2. HELPER `buildMediaWriteHandlers({ routeDeps, mediaWriteDeps }: BuildMediaWriteHandlersInput): Record<string, ToolHandler>` ← the three write entries verbatim (`mediaWriteDeps` is the existing `() => ({…})` closure, passed as is).
  3. `const handlers: Record<string, ToolHandler> = { ...buildMediaReadHandlers({ routeDeps }), ...buildMediaWriteHandlers({ routeDeps, mediaWriteDeps }) };` — key order unchanged.
- **Importers to update:** none.
- **After:** `buildMediaRegistrations` ~32; read ~45; write ~75; file ~235.
- **Risks / notes:** handler comments move with their entries.

### jini:packages/cms/src/redirects/redirects.ts
- **Over:** file 518 lines (no function over 100)
- **Phase:** now · **Batch:** size-19
- **Package entry:** not an exports target; `./redirects` → `src/redirects/index.ts`, which has `export * from "./redirects.js"` → ADD `export * from "./redirects-validation.js"` beside it (entry keeps every public name).
- **Tests:** `src/redirects/__tests__/redirects.test.ts`, `redirects.chain-loop.test.ts`, `redirects.reserved-target.test.ts`, `redirects.write-boundaries.test.ts`, `entries.test.ts`, `open-redirect.matrix.test.ts`, `phase-handler.read-path-target.test.ts`; helper `__tests__/remove-redirect-double.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A validation | `MIN_TARGET_LENGTH`, `MAX_TARGET_LENGTH`, `MIN_PRIORITY`, `MAX_PRIORITY`, `VALID_STATUS_CODES`, `VALID_STATUSES`, `isAbsoluteOrProtocolRelative`, `RemoveRedirectFn`, `RedirectsWriteDeps`, `validateStatusCode`, `validateStatus`, `validateToTargetLength`, `validatePriority`, `resolveCollapsedTarget`, `collapseOneHop`, `assertChainDoesNotReturn`, `siteRelativeRefusalReason`, `assertRedirectSourceAllowed`, `siteRelativeTargetReason`, `assertTargetAllowed`, `assertNoDuplicate`, `WriteValidatedFields`, `validateWriteFields`, `checkRedirectFieldsWouldWrite` | what a redirect rule may say (shape, target safety, chains) |
| B (stays) | `DEFAULT_PRIORITY`, `MAX_IMPORT_BATCH_SIZE`, `enqueueMutatedEvent`, create/update/restore/tombstone/list/import functions + their request types | redirect writes |

- **Splits:**
  1. NEW `redirects-validation.ts` — unit A verbatim, source order (every refusal-reason comment moves; the "Exported (unchanged values) so agent-tools.ts…" comment moves with the constants). Exports the names redirects.ts uses plus the already-exported ones. Imports nothing from redirects.ts.
  2. redirects.ts imports from it; does not re-export (index.ts does).
- **Importers to update:** `src/redirects/index.ts` (add `export *`); `src/redirects/capture.ts` and the tests above — re-point only names that moved (`rg -n "/redirects\.js[\"']" src`), e.g. `assertRedirectSourceAllowed`, `siteRelativeTargetReason`, `checkRedirectFieldsWouldWrite`, `RedirectsWriteDeps`, `RemoveRedirectFn`, the `MIN_/MAX_` constants (`agent-tools.ts` imports them — check its path).
- **After:** redirects.ts ~290; redirects-validation ~240.
- **Risks / notes:** `resolver.ts` L143 comment refers to "redirects.ts's `enqueueMutatedEvent`" — still true (it stays).

### jini:packages/cms/src/routing/routing.ts
- **Over:** `createRouting` 188
- **Phase:** now · **Batch:** size-19
- **Package entry:** `./routing` → `src/routing/index.ts` re-exports `createRouting`, `RouteResolutionError` + types; none move.
- **Tests:** `src/routing/__tests__/routing.test.ts`, `routing.phase-lifecycle.test.ts`, `routing.phase-runners.test.ts`, `routing.ports.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | statements in `createRouting` | job |
|---|---|---|
| A url | `ABSOLUTE_URL_PATTERN`, `isAbsoluteUrl`, `normalizePath`, `postPublicPath`, `composeCanonicalUrl`, `UNSAFE_URL_SCHEMES`, `resolveUrlTarget`, `resolveTermRefTarget` | pure path/URL shaping (read no factory locals — confirm with outline `uses:`) |
| B phases | `phaseRegistry`, `ALL_PHASES`, `registerResolvePhase`, `unregisterResolvePhaseOwner`, `runPhase`, `resolve`, `runPreContentPhase`, `runPostContentPhase` | forward-resolution phase registry + runners |
| C (stays) | named routes, `isPublished`, `entryPublicPath`, `resolveEntryRefTarget`, `resolveRouteRefTarget`, `urlFor`, `isActive`, slug-change capture, test reset, return | URL generation + registrations |

- **Splits:**
  1. Unit A → module level above `createRouting`, verbatim (their `// ----` section banners move). `postPublicPath` keeps its `(required, _optional)` signature.
  2. HELPER `createResolvePhases({ required }: CreateResolvePhasesInput): ResolvePhases` → `{ registerResolvePhase; unregisterResolvePhaseOwner; resolve; runPreContentPhase; runPostContentPhase; resetPhases(): void }` ← unit B verbatim. `resetRoutingRegistrationsForTests` needs to clear `phaseRegistry`: if its body touches `phaseRegistry`, move that statement into `resetPhases` and call it at the same point.
- **Importers to update:** none.
- **After:** `createRouting` ~80; `createResolvePhases` ~65; file ~260.
- **Risks / notes:** `resolve` / `runPhase` read `required` (ports) — passed in. `ALL_PHASES` comment block moves with it.

### jini:packages/cms/src/taxonomy/write-service.ts
- **Over:** file 712 lines (no function over 100)
- **Phase:** now (JINI 712) · **Batch:** size-19
- **Tests:** `src/taxonomy/__tests__/write-service.test.ts`, `write-service.import.test.ts`, `write-service.boundaries.test.ts`, `rename-atomicity.test.ts`, `content-deletion-cleanup.test.ts`, `content-deletion-failure.test.ts`, `list.test.ts`, `repo.memory.test.ts`, `agent-tools.test.ts`, `content-lookup.test.ts`, `src/__tests__/args-convention.test.ts` (package `@jini-ai/cms`). No test mocks the module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| T types | `AuthorizeFn`, `Taxonomy`, `Term`, `TaxonomyRepoPort`, `TermRepoPort`, `EntryTermRepoPort`, `ContentLookupPort`, `ApplicableTaxonomies`, `ContentTypeTaxonomyPolicyPort`, `TAXONOMY_ALLOWED_CONTENT_TYPES`, `isContentTypeOnAllowList`, `TaxonomyRevisionRow`, `TaxonomyRevisionRepoPort`, `WriteServiceDeps`, `TaxonomyRecordNotFoundError`, `TermRecordNotFoundError`, `ContentRecordNotFoundError`, `TaxonomyVersionConflictError` | records, ports, allow-list and not-found/conflict errors every write shares |
| G guards | `authorizeTaxonomyManage`, `requireTaxonomy`, `resolveCandidateParent` | pre-write checks shared by create/import/rename/assign/delete |
| C create/rename | `CreateTaxonomyRequired`, `createTaxonomy`, `CreateTermRequired`, `CreateTermOptional`, `createTerm`, `RenameTermRequired`, `renameTerm` | ordinary create + rename (stays) |
| I import | `ImportableTaxonomyRepoPort`, `ImportTaxonomyRequired`, `assertImportVersion`, `importTaxonomy`, `ImportableTermRepoPort`, `loadAncestorChain`, `ImportTermRequired`, `ImportTermOptional`, `importTerm`, `validateImportedTermParent`, `writeImportedTerm` | publish-content import chokepoint (slice J1) |
| A assign | `AssignTermsRequired`, `validateAssignmentTarget`, `resolveTaxonomyPolicy`, `resolveAssignmentContent`, `isTaxonomyAllowedForTarget`, `assignTerms`, `UnassignableEntryTermRepoPort`, `UnassignTermsRequired`, `unassignTerms`, `EntryTermsCleanupPort`, `OnContentDeletedRequired`, `onContentDeleted` | term assignment + content-deletion cleanup (stays) |
| D delete | `DeletableTaxonomyRepoPort`, `DeletableTermRepoPort`, `AssignmentCountEntryTermRepoPort`, `TermHasAssignedContentError`, `TermHasChildTermsError`, `TaxonomyHasAssignedContentError`, `DeleteTermRequired`, `deleteTerm`, `DeleteTaxonomyRequired`, `deleteTaxonomy` | refusing (never cascading) deletes |

- **Splits** (in order):
  1. NEW `write-service-types.ts` — job: taxonomy records, ports, allow-list and shared errors. Moves unit T (with every doc comment, incl. the `AuthorizeFn` comment and the allow-list "permanent" comment). Also moves `import type { TransactionalRepoPort } from "../core/ports.js"` if `WriteServiceDeps` uses it. Imports nothing from the original.
  2. NEW `write-service-guards.ts` — job: the shared pre-write guards. Moves unit G. Imports `ForbiddenError` from `../core/commands/command.js`, `validateHierarchyAssignment`-related types if needed, types + `TaxonomyRecordNotFoundError` from `./write-service-types.js`. Exports all three (they become exported; they were module-private).
  3. NEW `write-service-import.ts` — job: the publish-content import chokepoint. Moves unit I (with the "Slice J1" comments). Imports from `./write-service-types.js`, `./write-service-guards.js`, `./validation-chain.js`, `kernelNowIso` from `@jini-ai/core/primitives` (only what it uses). Header: copy the `importTaxonomy` "Slice J1" paragraph's first sentence as the file purpose.
  4. NEW `write-service-delete.ts` — job: refusing deletes of terms and taxonomies. Moves unit D (with the "Additive capabilities…" comment and each error's comment). Moves the `import type { TermListPort } from "./list.js"` line AND its 4-line "Type-only — `list.ts` imports…" why-comment word for word (only `DeleteTaxonomyRequired` uses it). Imports from `./write-service-types.js`, `./write-service-guards.js`.
  5. `write-service.ts` keeps units C + A, the full file header, and `export type { TransactionalRepoPort } from "../core/ports.js";` (index re-exports it from here). Imports types/errors from `./write-service-types.js`, guards from `./write-service-guards.js`.
- **Importers to update** (split each import by the unit map):
  - `src/taxonomy/index.ts` (package entry `./taxonomy`): its one `export { … } from "./write-service.js"` block becomes four blocks — names of unit T → `./write-service-types.js`, unit I → `./write-service-import.js`, unit D → `./write-service-delete.js`, units C/A + `TransactionalRepoPort` stay on `./write-service.js`. Public API unchanged.
  - `src/taxonomy/list.ts` (`Taxonomy`, `Term` → types), `repo.memory.ts` (all T except `UnassignableEntryTermRepoPort`, which stays), `content-lookup.ts` (`ContentLookupPort`, `isContentTypeOnAllowList` → types), `src/__tests__/args-convention.test.ts` (`isContentTypeOnAllowList` → `../taxonomy/write-service-types.js`), tests under `src/taxonomy/__tests__/`: `list.test.ts`, `repo.memory.test.ts`, `rename-atomicity.test.ts` (`Term`, `TaxonomyRevisionRow` → types), `write-service.test.ts`, `write-service.import.test.ts`, `write-service.boundaries.test.ts` (import-path edits only).
- **After:** write-service.ts ~285; types ~100; guards ~30; import ~165; delete ~150. No function over 100.
- **Risks / notes:** `list.ts` → types module is now value-free in both directions, so the cycle note still holds; keep `import type` for `TermListPort`. Docs links in `docs/spec/api.spec.md:682` name write-service.ts for the error classes — leave docs alone (not code).

### jini:packages/cms/src/trash/write-service.ts
- **Over:** `createTrashService` 132 (returned object: `trash` 39, `restore` 30, `purgeSelected` 47)
- **Phase:** now · **Batch:** size-19
- **Package entry:** `./trash` → `src/trash/index.ts`; `createTrashService` stays here, nothing moves out of the file.
- **Tests:** `src/trash/__tests__/service.test.ts`, `follow-ups.test.ts`, `exports.test.ts`, `retention-policy.test.ts`, `record-store-adapter.purge.test.ts`, `sweeper.test.ts`. No `vi.mock` of the file.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A (stays) | types, `notifyChanged`, `TrashAdapterMissingError`, `DEFAULT_TRASH_RETENTION_DAYS`, `computePurgeAfter`, `bind*` | contract + helpers |
| B (stays) | `retentionDays`, policy self-check call, `requireAdapter`, `trash`, `restore`, the small members of the returned object | move into / out of trash |
| C | `purgeSelected` member body | permanent purge of selected trash entries |

- **Splits:**
  1. HELPER `purgeSelectedTrash({ deps, optional, requireAdapter, request }: PurgeSelectedTrashInput): <current return type>` — module level above `createTrashService` ← `purgeSelected` body verbatim (its doc block moves onto the helper; the member keeps a one-line `purgeSelected: (request) => purgeSelectedTrash({ deps, optional, requireAdapter, request })` keeping the same parameter destructuring the member had).
- **Importers to update:** none.
- **After:** `createTrashService` ~88; `purgeSelectedTrash` ~48; file ~215.
- **Risks / notes:** if `purgeSelected` reads `retentionDays`, add it to the input. Keep `async` and every await order.

### jini:packages/cms/src/widgets/resolver-service.ts
- **Over:** file 701 lines (no function over 100)
- **Phase:** now (JINI 701) · **Batch:** size-19
- **Tests:** `src/widgets/__tests__/unit/resolver-service.unit.test.ts`, `src/widgets/__tests__/integration/resolver-service.integration.test.ts`, `src/widgets/__tests__/marker-target-parity.unit.test.ts`, `src/widgets/__tests__/marker.unit.test.ts`, `src/widgets/__tests__/stored-format.golden.test.ts` (package `@jini-ai/cms`); also every test under `src/widgets/html/__tests__/` that imports `resolve-html-page-embeds` (`rg -l "resolve-html-page-embeds|resolveHtmlPageEmbeds" packages/cms/src --glob '*.test.*'`). No test mocks the module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| I instances | `ResolvePageWidgetsDeps`, `WidgetInstanceResolutionDeps`, `ResolvePageWidgetsInput`, `ResolvePageWidgetsRequired`, `ResolvePageWidgetsResult`, `PLACEHOLDER_IR`, `toRenderIr`, `InlineEmbedRef`, `forEachDocNode`, `inlineEmbedRef`, `collectWidgetEmbeds`, `parseWidgetInstanceRow`, `groupWidgetInstancesByType`, `resolveWidgetInstances`, `inlineContentOverrides`, `assembleInlineResolved`, `ResolveHtmlPageEmbedsDeps`, `HtmlEmbedResolver` | shared deps types + batch widget-instance loading → render IR |
| P page | `resolveRegionPlacements`, `collectReferencedWidgetIds`, `resolvePageWidgets` | page-render orchestrator (stays) |
| W widget/form embeds | `resolveWidgetSlugsToIds`, `collectWidgetIdsToLoad`, `buildResolvedWidgetMap`, `resolveWidgetTypeEmbeds`, `resolveFormTypeEmbeds` | `widget`/`form` HTML markers (stays) |
| M media | `ResolvedMediaRecord`, `mediaIrSlug`, `parseMediaEmbedRef`, `buildMediaImageIr`, `findMediaEmbedRecord`, `lookupMediaContentType`, `isPlayerContentType`, `playerMediaIr`, `resolveOneMediaEmbed`, `resolveMediaTypeEmbeds`, `resolveGalleryWidgetMedia`, `isRefBasedMediaNode`, `collectMediaRefAssetIds`, `resolvePostContentMediaContext` | `media` HTML markers + media refs inside a post body |
| C content | `resolvePostContentWidgetContext`, `resolvePostContentRenderContext`, `findPublishedPostByRef`, `resolvePostTypeEmbeds`, `matchesPendingOverride`, `postContentIr`, `resolveOneContentEmbed`, `resolveContentTypeEmbeds` | `post`/`content` HTML markers and their embedded-body context |
| R registry | `HTML_EMBED_RESOLVERS`, `THEME_OWNED_MARKER_TYPES`, `export { isPageEmbedType }` | embed-type registry (stays) |

- **Splits** (in order):
  1. NEW `resolver-service-instances.ts` — job: resolver deps types and batch widget-instance loading into render IR. Moves unit I. `ResolvePageWidgetsInput/Required/Result` move here too (both sides need them). The `// ----- HTML Page embeds (SPEC-047 Slice 2 …)` section comment block (~L324-357) moves with `ResolveHtmlPageEmbedsDeps`, word for word. Exports every moved name (previously-private ones become exported). Imports only from the shared libs/types it uses (`./types.js`, `./entry-payload.js`, host-port types, etc.).
  2. NEW `resolver-service-media.ts` — job: resolve media markers and media refs to render IR. Moves unit M, with the long `data-embed-type="media"` doc block (~L570-615) and the "Owner-reported bug (2026-08-12…)" comment on `resolvePostContentMediaContext`. Imports `forEachDocNode`, `toRenderIr`, `ResolveHtmlPageEmbedsDeps` from `./resolver-service-instances.js`. Exports `resolveGalleryWidgetMedia`, `resolveMediaTypeEmbeds`, `resolvePostContentMediaContext`.
  3. NEW `resolver-service-content.ts` — job: resolve post/content markers and their embedded bodies. Moves unit C with the `post` resolver and `content` resolver doc blocks (~L1007-1062, ~L1188-1247) and the "Owner-reported bug (2026-09-22)" comment. Imports from `./resolver-service-instances.js` and `resolvePostContentMediaContext` from `./resolver-service-media.js`. Exports `resolvePostTypeEmbeds`, `resolveContentTypeEmbeds`.
  4. `resolver-service.ts` keeps P, W, R, the file header, and imports the moved names. It must keep exporting `resolvePageWidgets`, `HTML_EMBED_RESOLVERS`, `THEME_OWNED_MARKER_TYPES`, `isPageEmbedType`.
- **Importers to update:**
  - `src/widgets/index.ts` (entry `./widgets`): `export type { ResolvePageWidgetsDeps, …Input, …Required, …Result }` → from `./resolver-service-instances.js`; `resolvePageWidgets` stays.
  - `src/widgets/html/index.ts` (entry `./widgets/html`): `resolveGalleryWidgetMedia` → `../resolver-service-media.js`; `ResolveHtmlPageEmbedsDeps` → `../resolver-service-instances.js`.
  - `src/widgets/html/resolve-html-page-embeds.ts`: `ResolveHtmlPageEmbedsDeps` → `../resolver-service-instances.js` (registry names stay).
  - `src/widgets/__tests__/unit/resolver-service.unit.test.ts`: `resolveGalleryWidgetMedia` → `../../resolver-service-media.js`, `ResolveHtmlPageEmbedsDeps` → `../../resolver-service-instances.js`.
- **After:** resolver-service.ts ~200; instances ~150; media ~205; content ~165. No function over 100.
- **Risks / notes:** no cycles: instances ← media ← content ← resolver-service. `HTML_EMBED_RESOLVERS` keeps its entry order byte for byte. The ~55-line comment above `THEME_OWNED_MARKER_TYPES` stays.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check packages/cms/src/media/tool-registrations.ts packages/cms/src/redirects/redirects.ts packages/cms/src/routing/routing.ts packages/cms/src/taxonomy/write-service.ts packages/cms/src/trash/write-service.ts packages/cms/src/widgets/resolver-service.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
