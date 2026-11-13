# Terra job size-50: split 6 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/website/src/features/newsletter/tool-registrations.ts
- **Over:** `buildNewsletterRegistrations` 177 (file 415, under)
- **Phase:** after-move (MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-50
- **Tests:** `apps/website/src/features/newsletter/__tests__/tool-registrations.model-facing-errors.test.ts`, `apps/website/src/features/newsletter/__tests__/delivery-tools.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.newsletter.test.ts`, `apps/website/src/assistant/__tests__/merged-readers-batch.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `NewsletterToolDeps`, `toCampaignWriteServiceDeps`, `toListsDeps`, `toConfirmationDeps`, `toSubscriptionsDeps`, `toUnsubscribeSubscriptionDeps`, `toNewsletterSendPipelineDeps` | deps-bag adapters (stay) |
| B | `newsletterDerivedRisk`, `toCampaignToolView`, `toListToolView`, `toSubscriptionToolView`, `toSendLogToolView`, `NEWSLETTER_MODEL_FACING_ERRORS`, `resendPendingSubscriptionConfirmation` | risk + model-facing views (stay) |
| C | `buildNewsletterRegistrations` `handlers` literal keys `newsletter_list_campaigns` … `newsletter_list_send_log` | read handlers |
| D | keys `newsletter_create_campaign`, `newsletter_update_campaign`, `newsletter_cancel_campaign`, `newsletter_pause_campaign` | campaign write handlers |
| E | keys `newsletter_create_list`, `newsletter_archive_list`, `newsletter_create_subscription`, `newsletter_remove_subscription`, `newsletter_resend_confirmation` | list + subscription (audience) write handlers |

- **Splits:**
  1. HELPERS in `buildNewsletterRegistrations` (same file, directly above it, in this order). Shared input type (plan-named) `interface NewsletterHandlersInput { deps: NewsletterToolDeps }`:
     - `buildNewsletterReadHandlers({ deps }: NewsletterHandlersInput): Record<string, ToolHandler>` ← handler entries `newsletter_list_campaigns: async (ctx) => {` through the end of `newsletter_list_send_log` (~L339-388), returned as an object literal, same key order.
     - `buildNewsletterCampaignWriteHandlers({ deps }: NewsletterHandlersInput): Record<string, ToolHandler>` ← entries `newsletter_create_campaign` through `newsletter_pause_campaign` (~L389-463).
     - `buildNewsletterAudienceWriteHandlers({ deps }: NewsletterHandlersInput): Record<string, ToolHandler>` ← entries `newsletter_create_list` through `newsletter_resend_confirmation` (~L464-534).
     - `buildNewsletterRegistrations` keeps `const handlers: Record<string, ToolHandler> = { ...buildNewsletterReadHandlers({ deps }), ...buildNewsletterCampaignWriteHandlers({ deps }), ...buildNewsletterAudienceWriteHandlers({ deps }) };` (key insertion order unchanged) and its `return buildDomainRegistrations({ metadata: toolMetadata,` statement with its "No `unwiredToolIds`" comment.
- **Importers to update:** none (helpers are module-private; exports unchanged).
- **After:** file ~425; `buildNewsletterRegistrations` ~14; helpers ~48 / ~72 / ~68.
- **Risks / notes:** Comments inside each handler entry move with the entry. Handlers close over `deps` only (outline: `uses: deps`), so no other locals cross. `_surfaces` param stays unused on the builder. After the move the write-service code leaves; the handler groups stay as STAY-WIRING.

### tovu:apps/website/src/features/pages/tool-registrations.ts
- **Over:** `buildPagesRegistrations` 154 (file 429, under)
- **Phase:** after-move (MIXED; MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-50
- **Tests:** `apps/website/src/features/pages/__tests__/tool-registrations.test.ts`, `apps/website/src/features/pages/__tests__/tool-registrations.read-html.test.ts`, `apps/website/src/features/pages/__tests__/tool-registrations.write-region.test.ts`, `apps/website/src/features/pages/__tests__/tool-registrations.move-region.test.ts`, `apps/website/src/features/pages/__tests__/edit-html-permission.test.ts`, `apps/website/src/assistant/__tests__/pages-read-html-batch.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `parsePageExpectedVersion`, `requireCapturedVersion`, `assertExpectedVersion`, `toModelFacingWriteError`, `openForFullWrite`, `FullWriteOpening` | version/CAS guards (stay) |
| B | `assertTopLevelSectionsAreTagged`, `describeRegionProblem`, `requireRegion`, `describeUnsafeRegions`, `joinWarnings`, `describeHandleCollision`, `describeFullWriteHandleCollision`, `parseMovePlacement`, `describeMoveProblem` | region validation + refusal text (stay) |
| C | `PagesToolDeps`, `readPageTheme`, `readDocPageFallback`, `docPageNote`, `normalizePageRegionInput`, `normalizePageInput`, `embedWarningMessages` | reads + input normalizing (stay) |
| D | `buildPagesRegistrations` handler entries `pages_read_html`, `pages_write_html`, `pages_write_region`, `pages_move_region` | one tool handler each → factories |

- **Splits:**
  1. HELPERS in `buildPagesRegistrations` (same file, directly above it, in this order). Shared plan-named input `interface PagesHandlerInput { routeDeps: PagesToolDeps }`; each returns `ToolHandler`:
     - `createReadHtmlHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← the `pages_read_html: async (ctx) => {` arrow (~L534-557) — returns that arrow.
     - `createWriteHtmlHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← `pages_write_html` arrow (~L558-605).
     - `createWriteRegionHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← `pages_write_region` arrow (~L606-680).
     - `createMoveRegionHandler({ routeDeps }: PagesHandlerInput): ToolHandler` ← `pages_move_region` arrow (~L681-727).
     - `buildPagesRegistrations` keeps `const handlers: Record<string, ToolHandler> = { pages_read_html: createReadHtmlHandler({ routeDeps }), pages_write_html: createWriteHtmlHandler({ routeDeps }), pages_write_region: createWriteRegionHandler({ routeDeps }), pages_move_region: createMoveRegionHandler({ routeDeps }) };` and its `return buildDomainRegistrations({ metadata: toolMetadata,` statement unchanged.
- **Importers to update:** none (exports unchanged).
- **After:** file ~435; `buildPagesRegistrations` ~17; factories ~26 / ~50 / ~76 / ~46.
- **Risks / notes:** Comments above/inside each handler move with it. Handlers read only `routeDeps` (outline). If `ToolHandler`'s `ctx` type was inferred from the `Record<string, ToolHandler>` annotation, the factory return type `ToolHandler` keeps the same contextual typing. After the move, write-service pieces leave; these handlers are STAY-WIRING.

### tovu:apps/website/src/features/post/agent-tools.ts
- **Over:** file 704 lines (no function over 100)
- **Phase:** after-move (MIXED: `AgentToolSideEffect`/`AgentToolDefinition` types may move to the Jini core copy) · **Batch:** size-50
- **Tests:** `apps/website/src/features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts`, `apps/website/src/features/post/__tests__/integration/content-tools-default-kind.integration.test.ts`, `apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.post.test.ts`, `apps/website/src/features/post/__tests__/agent-tools.delete-confirmation.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `CONTENT_POST_DELETE_TOOL_ID`, `AgentToolSideEffect`, `AgentToolDefinition`, `POST_KIND_SCHEMA`, `PUBLISH_AT_SCHEMA`, `FEATURED_IMAGE_SCHEMA`, `POST_LIST_FIELDS`, `POST_ID_SCHEMA`, `postAgentToolCatalog` | the Posts/Pages tool catalog (stays) |
| B | `BLOCK_NODE_REF`, `TIPTAP_TEXT_BODY_EXAMPLE`, `TIPTAP_MARK_SCHEMA`, `TIPTAP_TEXT_NODE_SCHEMA`, `TIPTAP_DOC_SCHEMA` | TipTap `bodyJson` JSON-Schema vocabulary |

- **Splits:**
  1. NEW `apps/website/src/features/post/agent-tools-tiptap-schema.ts` — job: the TipTap/ProseMirror `bodyJson` JSON Schema the catalog publishes. Moves (in source order, with every doc comment and the `// ----` banner block above `TIPTAP_MARK_SCHEMA`): `BLOCK_NODE_REF` (L6), `TIPTAP_TEXT_BODY_EXAMPLE`, `TIPTAP_MARK_SCHEMA`, `TIPTAP_TEXT_NODE_SCHEMA`, `TIPTAP_DOC_SCHEMA`. Exports: `TIPTAP_DOC_SCHEMA`, `TIPTAP_TEXT_BODY_EXAMPLE`. Imports `MAX_SLUG_LENGTH`, `SLUG_FORMAT_PATTERN` from `./post.js` (used inside `TIPTAP_DOC_SCHEMA`); nothing from `agent-tools.ts`. Header: copy the `@file` paragraphs of `agent-tools.ts` that explain the TipTap schema / the 2026-09-11 node+mark expansion (the paragraph mentioning `TIPTAP_MARK_SCHEMA` near ~L122 and its neighbours) word for word; keep them in the original header too only if they also describe the catalog.
  2. `agent-tools.ts` adds `import { TIPTAP_DOC_SCHEMA, TIPTAP_TEXT_BODY_EXAMPLE } from "./agent-tools-tiptap-schema.js";` and drops `MAX_SLUG_LENGTH`/`SLUG_FORMAT_PATTERN` from its `./post.js` import only if the catalog no longer uses them (check with rg in the file). No re-export (not a package entry; `features/post/index.ts` re-exports only `CONTENT_POST_DELETE_TOOL_ID`).
- **Importers to update:** `apps/website/src/features/post/__tests__/agent-tools.tiptap-node-vocabulary.test.ts` (`TIPTAP_DOC_SCHEMA` → `../agent-tools-tiptap-schema.js`; keep `postAgentToolCatalog` from `../agent-tools.js`), `apps/website/src/features/post/__tests__/integration/content-tools-default-kind.integration.test.ts` (`TIPTAP_DOC_SCHEMA` → `../../agent-tools-tiptap-schema.js`), `apps/website/src/features/widgets/__tests__/integration/mediawidget.integration.test.ts` (dynamic `import('#src/features/post/agent-tools')` for `TIPTAP_DOC_SCHEMA` → `'#src/features/post/agent-tools-tiptap-schema'`). Comment-only mentions (render.ts, duplicate-embeds.ts, byok-provider-turn.test.ts, tool-registrations.post.test.ts error text) are left alone.
- **After:** `agent-tools.ts` ~285; `agent-tools-tiptap-schema.ts` ~425.
- **Risks / notes:** `tool-registrations.post.test.ts:286` prints a hint string naming `agent-tools.ts` as where `TIPTAP_DOC_SCHEMA` lives — test text, not edited (tests are not edited beyond import paths); flag it in the report. The Jini move only takes the two side-effect/definition types; both new files still hold after it. Object identity matters (test "same TIPTAP_DOC_SCHEMA object") — the catalog must import the one exported constant, not a copy.

### tovu:apps/website/src/features/post/tool-registrations.ts
- **Over:** file 796 lines · `buildPostRegistrations` 278
- **Phase:** after-move (MOVE-AFTER write-service.ts; STAY-WIRING) · **Batch:** size-50
- **Tests:** every `apps/website/src/features/post/__tests__/tool-registrations.*.test.ts` (html-page-body, featured-image-refusal, kind-status-validation-status.integration, schedule-featured, header-navigation, model-facing-errors, list-compact, public-url, admin-url, optimistic-concurrency, author, revisions-sink, published-where, list-scale, guards, partial-update, plugin-hook-failed), plus `.../post/__tests__/content-post-list-filters.test.ts`, `.../post/__tests__/content-duplicate.post-page.test.ts`, `.../post/__tests__/content-duplicate.plugin-hook-failed.test.ts`, `.../post/__tests__/agent-tools.delete-confirmation.test.ts`, `apps/website/src/assistant/__tests__/tool-registrations.post.test.ts`, `apps/website/src/features/change-sets/__tests__/tool-registrations.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `DuplicatePagesHtmlStore`, `DuplicatePagesHtmlStoreFactory`, `PostToolDeps`, `CONTENT_READ_PERMISSION`, `CONTENT_WRITE_PERMISSION`, `ASSISTANT_ACTOR_PLUGIN_ID`, `postCommandDeps` | the deps slice + command-deps bag (leaf) |
| B | `requirePostKind`, `requirePostStatus`, `optionalPostStatus`, `clampPostListLimit`, `requireBodyJson`, `optionalBodyJson`, `optionalNonEmptyString`, `optionalPublishAt`, `FEATURED_IMAGE_REFUSALS`, `resolveFeaturedImageInput`, `PostUpdatePatch`, `parseUpdatePatch`, `assertPatchNotEmpty`, `isPartialPatch`, `mergeUpdatePatch` | tool-input readers + update-patch parsing |
| C | `PostToolView`, `scheduleView`, `toPostToolView`, `PostToolViewWithPublicUrl`, `resolvePublicUrl`, `resolveAdminUrl`, `toPostToolViewWithPublicUrl`, `PUBLISHED_WHERE_LOCAL`, `PUBLISHED_WHERE_LIVE`, `PAGE_HEADER_NAVIGATION`, `headerNavigationView`, `publishedWhereView`, `toPostWriteResultView`, `POST_LIST_TEXT_BUDGET`, `POST_LIST_MIN_EXCERPT_CHARS`, `PostListRow`, `PostListField`, `optionalPostListFields`, `matchesPostListFilters`, `projectPostListRow`, `toExcerpt`, `excerptCharsFor`, `toPostListRow` | model-facing views + compact listing rows |
| D | `deriveDefaultDuplicateTitle`, `duplicatePostOrPage`, `contributePostDuplicateHandlers` | `content_duplicate` post/page contributor |
| E | `CATALOG_BY_ID`, `postDerivedRisk`, `isPostShapeRejection`, `VERSION_CONFLICT_GUIDANCE`, `POST_MODEL_FACING_ERRORS`, `loadDeletablePost`, `assertFreshVersion`, `loadUpdateTarget`, `assertTemplateAvailable`, `assertHtmlBodyUnchanged`, `updateInverse`, `buildPostRegistrations`, `contributePostTools`, both re-exports | the Posts/Pages tool handlers (stays) |

- **Splits:**
  1. NEW `tool-registrations-deps.ts` — job: what Posts/Pages tool handlers depend on. Moves unit A (with doc comments; `ASSISTANT_ACTOR_PLUGIN_ID`'s "see trash-item-tool" comment moves too). Exports all of A (`ASSISTANT_ACTOR_PLUGIN_ID`, permissions, `postCommandDeps` become exported). Imports nothing from the original.
  2. NEW `tool-registrations-input.ts` — job: read and validate Posts/Pages tool inputs (incl. the update patch). Moves unit B. Exports every name the original or other new files use. Imports `PostToolDeps` from `./tool-registrations-deps.js`.
  3. NEW `tool-registrations-views.ts` — job: project a post into model-facing write/list views. Moves unit C. Exports names used elsewhere + the 5 already-exported constants. Imports from `-deps.js` only.
  4. NEW `tool-registrations-duplicate.ts` — job: `content_duplicate`'s post/page contributor. Moves unit D (its large doc blocks move word for word). Imports from `-deps.js` and `-views.js`.
  5. HELPERS in `buildPostRegistrations` (same file, above it, in run order). Plan-named input `interface PostHandlerInput { routeDeps: PostToolDeps }`:
     - `buildPostReadHandlers({ routeDeps }: PostHandlerInput): Record<string, ToolHandler>` ← entries `content_post_search`, `content_post_list`, `content_post_get` (~L917-1000).
     - `createPostCreateHandler({ routeDeps }: PostHandlerInput): ToolHandler` ← the `content_post_create` arrow (~L1001-1080).
     - `runPostUpdate({ routeDeps, principalId, id, merged, publishAt, featuredMediaId, author, showAuthor, basisVersion, templateChoice }: RunPostUpdateInput): ReturnType<typeof updatePost>` ← the body of `execute: () => { return updatePost({` (~L1118-1146); the handler keeps `execute: () => runPostUpdate({ ... })`, reading `merged`/`basisVersion` at execute time exactly as before.
     - `rollbackPostUpdate({ routeDeps, principalId, prior }: RollbackPostUpdateInput): Promise<void>` ← the body of `rollback: async () => { await restorePostForward({` (~L1148-1162); handler keeps `rollback: () => rollbackPostUpdate({ routeDeps, principalId: ctx.principal.id, prior: priorPost })`.
     - `createPostUpdateHandler({ routeDeps }: PostHandlerInput): ToolHandler` ← the `content_post_update` arrow (~L1081-1228) using the two helpers above; the `let priorPost` / `let merged` / `let basisVersion` closure state stays inside it.
     - `createPostDeleteHandler({ routeDeps }: PostHandlerInput): ToolHandler` ← the `content_post_delete` arrow incl. its "Domain execution after the shared approval policy" doc (~L1229-1310).
     - `buildPostRegistrations` keeps `const handlers = { ...buildPostReadHandlers({ routeDeps }), content_post_create: createPostCreateHandler({ routeDeps }), content_post_update: createPostUpdateHandler({ routeDeps }), content_post_delete: createPostDeleteHandler({ routeDeps }) }` (same key order) and its `return buildDomainRegistrations({` statement.
- **Importers to update:** `PostToolDeps` → `tool-registrations-deps.js`: `apps/website/src/assistant/tool-registrations.ts`, `apps/website/src/features/publish-content/type-registry.ts`, and the 20 post tests listed by `rg -l "\bPostToolDeps\b" apps/website/src/features/post/__tests__`; `PUBLISHED_WHERE_LOCAL`/`PUBLISHED_WHERE_LIVE` → `-views.js` in `tool-registrations.published-where.test.ts`; `PAGE_HEADER_NAVIGATION` → `-views.js` in `tool-registrations.header-navigation.test.ts`; `POST_LIST_TEXT_BUDGET`/`POST_LIST_MIN_EXCERPT_CHARS` → `-views.js` in `tool-registrations.list-compact.test.ts`; `contributePostDuplicateHandlers` → `-duplicate.js` in `apps/website/src/assistant/duplicate-resource-registry.ts`, `apps/website/src/server/runtime/composition/tool-catalog-manifest.ts`, `.../post/__tests__/content-duplicate.post-page.test.ts`, `.../content-duplicate.plugin-hook-failed.test.ts`, `.../tool-registrations.admin-url.test.ts`. Not a package entry: no re-exports (check `features/post/index.ts` with rg; if it re-exports any moved name, point it at the new module).
- **After:** original ~435; `buildPostRegistrations` ~15; `createPostUpdateHandler` ~85, other factories ≤ 85; new files ~45 / ~90 / ~130 / ~115.
- **Risks / notes:** Test `tool-registrations.featured-image-refusal.test.ts` `mock.module("../featured-image.js")` — `resolveFeaturedImageInput` moves to `-input.ts` but still imports `../featured-image.js`-relative `./featured-image.js` from the same folder, so the mock still applies; verify. `execute`/`rollback` must stay lazy closures (they read `merged`, `basisVersion`, `priorPost` assigned inside `captureInverse`). Type-only imports of `PostToolDeps` must still use `import type`. The write-service move later takes `updatePost`/`restorePostForward` callers' targets, not these modules.

### tovu:apps/website/src/features/publish-content/publish-backstop-file.ts
- **Over:** `createRawFileSitePort` 102 (file 130, under)
- **Phase:** after-move (MIXED) · **Batch:** size-50
- **Tests:** `apps/website/src/platform/site-dir/__tests__/integration/publish-backstop-file.integration.test.ts`, `apps/website/src/features/publish-content/__tests__/raw-file-contributor.test.ts`, `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/backstop-errors.unit.test.ts`, `apps/website/src/features/media/__tests__/library-publish-transport.test.ts`, `apps/website/src/server/runtime/composition/__tests__/publish-content-manifest.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `missing`, `sha`, `LINK_REFUSAL`, `NOT_REGULAR_REFUSAL`, `BackstopFilesystem`, `lstatOrNull`, `componentsRefusal` | no-follow filesystem probes (stay) |
| B | inner `privateDir`, `parents`, `readBackup` of `createRawFileSitePort` | directory/backup steps that need only `root` + `filesystem` → module level |
| C | `createRawFileSitePort` (`check`, `target`, `read`, `alreadyRestored`, `removeCreatedFile`, `replace`, returned port) | the site-file port (stays) |

- **Splits:**
  1. HELPERS (module level, directly above `createRawFileSitePort`, after `componentsRefusal`), each opening with the same destructure the port uses (`const { mkdirSync, chmodSync } = filesystem;` etc.) so calls stay unbound exactly as today:
     - `ensurePrivateDir({ root, name, filesystem }: EnsurePrivateDirInput): string` ← inner `function privateDir(name: ".publish-staging" | ".publish-previous"): string {` body (keeps its "lstat never follows a link" comment).
     - `ensureParentDirs({ root, relPath, filesystem }: EnsureParentDirsInput): void` ← inner `function parents(relPath: string): void {` body.
     - `readBackupBytes({ backup, filesystem }: ReadBackupBytesInput): Buffer | null` ← inner `function readBackup(backup: string): Buffer | null {` body, with its `/** A backup's bytes ... */` doc.
  2. In `createRawFileSitePort`, delete the three inner functions and replace every call: `privateDir(x)` → `ensurePrivateDir({ root, name: x, filesystem })`, `parents(p)` → `ensureParentDirs({ root, relPath: p, filesystem })`, `readBackup(b)` → `readBackupBytes({ backup: b, filesystem })` (call sites: inside `replace` and the returned object). Drop now-unused names from the port's own destructure only if eslint reports them unused.
- **Importers to update:** none (helpers private; export unchanged).
- **After:** file ~138; `createRawFileSitePort` ~78; helpers ~9 each.
- **Risks / notes:** `filesystem` is the injected fake in tests — helpers must read it from the passed object, never default to `fs`. Keep statement order inside each body.

### tovu:apps/website/src/features/publish-content/repo-handler.ts
- **Over:** `createRepoPublishHandler` 176 · nested `build` 142 (file 252, under)
- **Phase:** after-move (MOVE-AFTER type-registry generation) · **Batch:** size-50
- **Tests:** `apps/website/src/features/publish-content/__tests__/repo-handler.test.ts`, `apps/website/src/features/post/__tests__/publish-content.characterization.test.ts`, `apps/website/src/features/media/__tests__/publish-content.characterization.test.ts`, `apps/website/src/features/navigation/__tests__/publish-content.characterization.test.ts`, `apps/website/src/features/redirects/__tests__/publish-content.characterization.test.ts`
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A | `FieldDisposition`, `ErrorClass`, `RepoWriteContext`, `RepoWriteResult`, `RepoPublishTypeConfig`, `gatewayDeps`, `okOrThrow` | config contract (stay) |
| B | `createRepoPublishHandler` statements `const { entityType, permission } = config;` … `function toRowError(` | derive per-type defaults, field picks, hash, conflict/error mapping |
| C | `build` statements `const ports = () => config.ports(deps);` … `return {` minus `apply` | the per-deps handler (pack/inspect/precheck) |
| D | `build`'s `async function apply(input: {` | the apply-one-row step |

- **Splits:**
  1. HELPER `deriveRepoTypeHelpers<Row, Ports>({ config }: DeriveRepoTypeHelpersInput<Row, Ports>): RepoTypeHelpers<Row>` (module level, above `createRepoPublishHandler`) ← statements from `const { entityType, permission } = config;` through the end of `function toRowError(err: unknown, id: string): unknown {` (~L155-190, incl. the `omitWhenAbsent` doc comment). Returns `{ entityType, permission, portsKey, schemaVersion, dependsOn, idOf, versionOf, packedFields, pick, hashOf, conflict, toRowError }`; new `interface RepoTypeHelpers<Row>` declares those (`hashedFields`/`fieldsWhere`/`omittable` stay internal).
  2. HELPER `createRepoApply<Row, Ports>({ config, helpers, deps, ports, workspaceId }: CreateRepoApplyInput<Row, Ports>): PublishContentHandler["apply"]` (above step 3) ← the `async function apply(input: {` declaration (~L248-330), returned. Its first statement destructures from `helpers` the names it reads (`const { entityType, idOf, versionOf, conflict, toRowError, ... } = helpers;`) so the body is unchanged. If `PublishContentHandler["apply"]` is not assignable, keep the function's own declared signature as the return type.
  3. HELPER `buildRepoPublishHandler<Row, Ports>({ config, helpers, deps }: BuildRepoPublishHandlerInput<Row, Ports>): PublishContentHandler` ← body of `function build(deps: PublishContentDeps)` (~L193-344) with `const apply = createRepoApply({ config, helpers, deps, ports, workspaceId });` in place of the `apply` declaration; opens with the same `helpers` destructure.
  4. `createRepoPublishHandler` becomes: `const helpers = deriveRepoTypeHelpers({ config }); function build(deps: PublishContentDeps): PublishContentHandler { return buildRepoPublishHandler({ config, helpers, deps }); } return { entityType: helpers.entityType, dependsOn: helpers.dependsOn, build, coversTables: config.coversTables, coversRoots: config.coversRoots };`
- **Importers to update:** none (helpers private).
- **After:** file ~265; `createRepoPublishHandler` ~8; `buildRepoPublishHandler` ~62; `createRepoApply` ~80; `deriveRepoTypeHelpers` ~38.
- **Risks / notes:** Generics `<Row, Ports>` must flow through all three helpers (input types are generic interfaces). `pack` is an `async function*` that reads `ports()` lazily — keep `ports` a thunk. `hashOf`'s `config.legacyHashState` call must keep the same argument shape. The type-registry generation move only changes who calls `createRepoPublishHandler`; the split stays valid.

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/features/newsletter/tool-registrations.ts apps/website/src/features/pages/tool-registrations.ts apps/website/src/features/post/agent-tools.ts apps/website/src/features/post/tool-registrations.ts apps/website/src/features/publish-content/publish-backstop-file.ts apps/website/src/features/publish-content/repo-handler.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
