# Terra job size-01: split 5 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts
- **Over:** `registerAdminSourceControlCredentialsRoutes` 103 (file 148, under)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/features/source-control/__tests__/project-scope.unit.test.ts`; plus `rg -l "source-control-credentials" apps/website/src --glob '*.test.*'`. No test mocks this module.
- **Responsibility map:** A = nested `async function rejectUnlessAuthorized(req: Request, res: Response)` (workspace + `source-control.credentials.write` gate); B (stays) = `readDeps`, `writeDeps`, the five route registrations (≤18 lines each).
- **Splits:** HELPER at module level directly above the register function (after `sendStoreError`): `rejectUnlessSourceControlAuthorized({ req, res, deps }: RejectUnlessSourceControlAuthorizedInput): Promise<boolean>` ← A's body word for word (its comment moves). Keep `const rejectUnlessAuthorized = (req: Request, res: Response) => rejectUnlessSourceControlAuthorized({ req, res, deps });` at the same spot so the route bodies are unchanged. `deps: AdminSourceControlCredentialsDeps`.
- **Importers to update:** none.
- **After:** register fn ~83; file ~152.
- **Risks / notes:** none.

### tovu:apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts
- **Over:** `registerAdminTaxonomyMergeTermRoutes` 117 (file 134, under)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/server/__tests__/routes/taxonomy-merge-term-routes.test.ts`. No test mocks this module.
- **Responsibility map:** A = `app.post("/api/admin/v1/taxonomy/terms/:id/merge/plan", …` (40) · B = `…/merge/confirm` (38) · C = `…/merge/execute` (37) — the merge ceremony steps.
- **Splits:** HELPER at module level above the register function (after `statusFor`): `handleMergeTermPlan({ req, res, deps }: { req: Request; res: Response; deps: RouteDeps }): Promise<void>` ← A's handler body word for word; registration `app.post(PATH, (req, res) => handleMergeTermPlan({ req, res, deps }))`. B and C stay inline (one helper is enough; do not extract more).
- **Importers to update:** none.
- **After:** register fn ~80; file ~138.
- **Risks / notes:** none.

### tovu:apps/website/src/server/inbound/admin-http/routes/themes/explore.ts
- **Over:** file 635 lines (no function over)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-01
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/themes/__tests__/explore-pure-helpers.unit.test.ts`, `.../__tests__/explore-detail-route-branches.test.ts`, `.../__tests__/explore-detail-slug-collision.test.ts`, `.../__tests__/explore-detail-modified.test.ts`, `.../__tests__/explore-file-group-edge-cases.test.ts`, `.../__tests__/explore-file-reset-route-branches.test.ts`, `.../__tests__/integration/explore.integration.test.ts`, `apps/website/src/features/theme/__tests__/preview-refresh.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | declarations | job |
|---|---|---|
| A shared | `authorizeThemeSetPermission`, `authorizeThemeAccess`, `findThemeOrRespond`, `sendThemeFileError`, `reloadTheme`, `bodyRecord`, `bodyStringField` | route plumbing every Explore route shares: gate, theme lookup, error mapping, reload, body parsing |
| B describe | `TEXT_READABLE_EXTENSIONS`, `isTextReadable`, `ThemeExploreFileGroup`, `CONTENT_EDIT_LOCKED_GROUPS`, `isThemeFileWritable`, `pageIdForPagePath`, `ThemeFileContentCollision`, `contentRecordsBySlug`, `NO_CONTENT_COLLISIONS`, `originalSourceFor`, `originalComparableForReset`, `fileModifiedFromOriginal`, `describeThemeFile`, `themePageCollidingContent` | describe one theme file for the listing (readable / writable / modified / colliding page) |
| C (stays) | the `fileExtension, nextAvailableFileName` re-export, every `registerAdminTheme*Route`, `parseThemeFilePutBody`, `isPutWritable`, `handleGeneratedTreeReset`, `resetFileFromOriginal`, `buildFileResetResponse`, `validateRenameTargetName`, `renameThemeFileIfChanged`, `parseThemePagePublishBody` | the Explore routes |

- **Splits:**
  1. NEW `explore-route-shared.ts` (same folder) — job: shared Explore route plumbing. Moves unit A word for word (with their doc comments). Exports all seven except `authorizeThemeAccess`/`findThemeOrRespond`/`sendThemeFileError` which become exported too (the original routes need them). Imports nothing from `explore.ts`.
  2. NEW `explore-file-description.ts` — job: one file-list entry for the Explore listing. Moves unit B word for word (keep each long doc comment, e.g. the `CONTENT_EDIT_LOCKED_GROUPS` and `describeThemeFile` blocks). Exports `ThemeExploreFileGroup`, `ThemeFileContentCollision`, `isThemeFileWritable`, `contentRecordsBySlug`, `NO_CONTENT_COLLISIONS`, `originalSourceFor`, `originalComparableForReset`, `describeThemeFile` (whatever unit C still calls — check with `rg` after the cut). Imports nothing from `explore.ts` (or from `explore-route-shared.ts` unless it truly needs it).
  3. `explore.ts` imports from both new files; copy the file-header paragraph that explains each moved part into the matching new file's header.
- **Importers to update:** `apps/website/src/server/inbound/public-http/middleware/theme-page-preview.ts` (`authorizeThemeSetPermission` → `../../admin-http/routes/themes/explore-route-shared.js`); `apps/website/src/server/inbound/admin-http/routes/themes/duplicate.ts` (`bodyRecord` → `./explore-route-shared.js`); `.../themes/__tests__/explore-pure-helpers.unit.test.ts` (`bodyRecord`, `bodyStringField`, `reloadTheme` → `../explore-route-shared.js`; `fileExtension`, `nextAvailableFileName`, `renameThemeFileIfChanged` stay on `../explore.js`); `.../themes/__tests__/integration/explore.integration.test.ts` (`reloadTheme` → `../../explore-route-shared.js`); `apps/website/src/features/theme/__tests__/preview-refresh.test.ts` (dynamic `import(".../themes/explore.js")` for `reloadTheme` → `.../themes/explore-route-shared.js`). Re-run `rg -n "\b(authorizeThemeSetPermission|reloadTheme|bodyRecord|bodyStringField|ThemeExploreFileGroup)\b" apps --glob '!node_modules'` (note `publish-content/*` import a DIFFERENT `bodyRecord` from `./route-helpers.js` — leave those).
- **After:** `explore.ts` ~455; `explore-route-shared.ts` ~75; `explore-file-description.ts` ~120.
- **Risks / notes:** the `fileExtension`/`nextAvailableFileName` re-export line stays in `explore.ts` (its comment says a test imports it from here).

### tovu:apps/website/src/server/runtime/composition/modules/assistant-byok.ts
- **Over:** `createAssistantByokModule` 231 (file 498 — at the limit, so helpers need room: see split 1)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/server/runtime/composition/modules/__tests__/assistant-byok.history-and-surfaces.unit.test.ts`, `.../assistant-byok.inputs-pin.test.ts`, `.../assistant-byok.error-report.test.ts`, `.../assistant-byok.tool-access-lowering.integration.test.ts`, `.../assistant-byok.ai-generations.test.ts`, `apps/website/src/assistant/__tests__/credential-noise.unit.test.ts`, `apps/website/src/server/runtime/composition/__tests__/site-guide-tools.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | declarations / statements | job |
|---|---|---|
| A history | `MAX_HISTORY_MESSAGES`, `isPlainMessage`, `readByokHistoryMessage`, `lastUserMessageIndex`, `toByokChatMessage`, `resolveMessages` | validate + bound the client-supplied chat history |
| B guidance | nested `loadPinnedPluginGuidance`, `appendAutomaticPluginGuidance`, `preparePluginGuidance` | pinned + automatic plugin guidance for a turn |
| C turn | nested `handleTurn` | one BYOK turn: gates, stream, provider loop |
| D lowering | nested `lowerLocal` | abort live tool runs when access is lowered |
| E (stays) | constants, SSE/trace/outcome helpers, `resolveTurnInputsOrRespond`, `attachTurnMessagesOrRespond`, `createAssistantByokModule` composition | build the BYOK module |

- **Splits:**
  1. NEW `assistant-byok-history.ts` (same folder) — job: client history validation/bounding. Moves unit A word for word (the `MAX_HISTORY_MESSAGES` comment about `assistant-transport.ts` moves). Exports `resolveMessages` (+ `MAX_HISTORY_MESSAGES` only if something else in the original still reads it — the outline says only `resolveMessages` does). Imports nothing from the original. Original imports `resolveMessages` back (used by `resolveTurnInputsOrRespond`).
  2. HELPERS in `assistant-byok.ts`, module level directly above `createAssistantByokModule`, in run order:
     - `lowerLocalToolAccess({ change, liveToolRuns }: LowerLocalToolAccessInput): Promise<void>` ← `lowerLocal` body; caller passes `lowerLocal: (change) => lowerLocalToolAccess({ change, liveToolRuns })` where it was used.
     - `loadPinnedPluginGuidance({ pinned, routeDeps }: LoadPinnedPluginGuidanceInput)`, `appendAutomaticPluginGuidance({ run, principal, conversationId, pluginBody, …existing fields, automaticPluginRuns }: AppendAutomaticPluginGuidanceInput)`, `preparePluginGuidance({ req, res, run, principal, messages, abort, system, routeDeps, automaticPluginRuns }: PreparePluginGuidanceInput)` ← unit B (same return types as today; copy them).
     - `handleByokTurn({ req, res, credentialPort, routeDeps, toolSurface, liveToolRuns, automaticPluginRuns }: HandleByokTurnInput): Promise<void>` ← `handleTurn` body; its `preparePluginGuidance(...)` call gains `routeDeps, automaticPluginRuns`. In the module keep `const handleTurn = (req: Request, res: Response) => handleByokTurn({ req, res, credentialPort, routeDeps, toolSurface: resolvedToolSurface, liveToolRuns, automaticPluginRuns });` — `automaticPluginRuns` is a `let` assigned before routes register, read per request as today.
  All long comments inside `handleTurn` (the `ready` paragraph etc.) move with it.
- **Importers to update:** `resolveMessages` → `assistant-byok-history.js` in `apps/website/src/assistant/__tests__/credential-noise.unit.test.ts` and `apps/website/src/server/runtime/composition/modules/__tests__/assistant-byok.history-and-surfaces.unit.test.ts` (that one keeps `toWireSurfacePayload` from `../assistant-byok.js`).
- **After:** `assistant-byok.ts` ~485; `createAssistantByokModule` ~95; `handleByokTurn` ~88; `assistant-byok-history.ts` ~50.
- **Risks / notes:** the file must end ≤500 — if the helper Input interfaces push it over, inline the input types as `{ … }` literals instead of named interfaces. `automaticPluginRuns`/`serverFederation` are `let`s assigned after the surface is built: pass them at call time inside closures, never capture them at module-build time.

### tovu:apps/website/src/server/runtime/composition/modules/assistant-chats.ts
- **Over:** `createAssistantChatsModule` 152 · its `registerRoutes` 139 (file 193, under)
- **Phase:** now (label ?) · **Batch:** size-01
- **Tests:** `apps/website/src/server/__tests__/assistant-chats-routes.test.ts`, `.../__tests__/assistant-chats-skill-title.unit.test.ts`, `.../__tests__/assistant-chat-recovery.unit.test.ts`, `.../__tests__/assistant-run-finalizer.test.ts`. No test mocks this module.
- **Responsibility map** (inside `registerRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A (stays) | `const reconciled = (options.recoverInterrupted ? …`, `options.onBootWork`, the two `app.use("/api/assistant/chats", …)` | boot repair gate + admin session |
| B | `function storeFor(res: Response) {` | per-requester chat store |
| C (stays) | `app.get("/api/assistant/chats", …`, `app.post("/api/assistant/chats", …`, `app.delete("/api/assistant/chats/:id", …` | list / create / delete (≤15 lines each) |
| D | `app.patch("/api/assistant/chats/:id", (req, res, next) => {` | rename/update a chat |
| E | `app.get("/api/assistant/chats/:id/messages", (req, res, next) => {` | read a chat's messages |
| F | `app.put("/api/assistant/chats/:id/messages/:messageId", (req, res, next) => {` | append/replace a message (+ first-message naming) |

- **Splits:** HELPERS at module level directly above `createAssistantChatsModule`:
  1. `chatStoreFor({ deps, res }: ChatStoreForInput)` ← `storeFor` body (keep its comment; return type = what it returns today). In `registerRoutes` keep `const storeFor = (res: Response) => chatStoreFor({ deps, res });` so the route bodies stay unchanged.
  2. `handleUpdateChat({ req, res, next, storeFor }: ChatRouteInput): void` ← D's handler body.
  3. `handleListChatMessages({ req, res, next, storeFor }: ChatRouteInput): void` ← E.
  4. `handlePutChatMessage({ req, res, next, storeFor }: ChatRouteInput): void` ← F.
  One shared input type `ChatRouteInput = { req: Request; res: Response; next: NextFunction; storeFor: (res: Response) => ReturnType<typeof chatStoreFor> }`. Registrations: `app.patch(PATH, (req, res, next) => handleUpdateChat({ req, res, next, storeFor }));` etc., same order. If a body uses `options`/`finalizer`, add them to that helper's input (check with the outline: D-F use only `storeFor` + module helpers).
- **Importers to update:** none.
- **After:** `registerRoutes` ~65; `createAssistantChatsModule` ~78; file ~210.
- **Risks / notes:** handlers are synchronous `(req, res, next)` that call `next(error)` — keep them synchronous (no `async`).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/server/inbound/admin-http/routes/system/source-control-credentials.ts apps/website/src/server/inbound/admin-http/routes/taxonomy/merge-term.ts apps/website/src/server/inbound/admin-http/routes/themes/explore.ts apps/website/src/server/runtime/composition/modules/assistant-byok.ts apps/website/src/server/runtime/composition/modules/assistant-chats.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
