# Terra job size-24: split 7 Tovu file(s) by responsibility (size limits)

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
### tovu:apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts
- **Over:** `registerPublishContentDestinationRoutes` 135 (file 197, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `rg -l "publish-content/destination|registerPublishContentDestinationRoutes" apps/website/src --glob '*.test.*'` (design time: none found by path; smoke = `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/peers.routes.test.ts` if it mounts it, else `npx eslint` + `outline --check` only). No test mocks this module.
- **Responsibility map:** A = `const guard = async (` (mount-path 404 + `publish_content.apply` gate); B = `app.post(`${base}/connect`, …` (53 — connect a destination); C (stays) = `base`, GET (30), disconnect (30).
- **Splits:** HELPERS at module level directly above the register function (after `respondWithError`):
  1. `guardDestinationRoute({ req, res, deps }: GuardDestinationRouteInput)` ← `guard`'s body (copy its params into the object and its return type); keep `const guard = (…same params…) => guardDestinationRoute({ …, deps });` (its comment moves to the helper).
  2. `handleConnectDestination({ req, res, deps, own, guard }: HandleConnectDestinationInput): Promise<void>` ← B's handler body. Types: `deps: PublishContentRouteDeps`, `own: PublishDestinationDeps`, `guard: typeof guard` → declare `type DestinationGuard = (…) => Promise<…>`.
- **Importers to update:** none.
- **After:** register fn ~70; file ~210.
- **Risks / notes:** none.

### tovu:apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts
- **Over:** `registerPublishContentImportRoutes` 170 (file 224, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/publish-content/__tests__/import.routes.pins.test.ts`, `.../__tests__/import-errors.test.ts`, `apps/website/src/server/__tests__/routes/publish-content-import-routes.test.ts`, `.../publish-content/__tests__/backstop-import-ui.routes.test.ts`. No test mocks this module.
- **Responsibility map** (inside `registerPublishContentImportRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A | `function buildHooks(bundleId: string, actorId: string, res: Response, overwriteEntityKeys:` | gated-mutation hooks for one request |
| B | `async function mayReadRawValues(`, `async function rawPlanPreview(` | refuse raw-row previews to read-only accounts |
| C | `app.post(".../publish-content/import/execute", async (re…` | redeem the confirmation and apply |
| D (stays) | plan / confirm / runs registrations | other ceremony steps |

- **Splits:** HELPERS at module level directly above `registerPublishContentImportRoutes` (after `RAW_VALUES_REFUSED`), bodies word for word, comments move:
  1. `buildImportHooks({ deps, bundleId, actorId, res, overwriteEntityKeys }: BuildImportHooksInput)` ← A (return type = what `buildHooks` returns). Call sites `buildHooks(a, b, c, d)` become `buildImportHooks({ deps, bundleId: a, actorId: b, res: c, overwriteEntityKeys: d })` — keep argument order mapping exact.
  2. `mayReadRawValues({ res, principalId, report, deps }: MayReadRawValuesInput): Promise<boolean>` and `rawPlanPreview({ res, input, deps }: RawPlanPreviewInput)` ← B (same return types; `input` = the old second param object).
  3. `handleImportExecute({ req, res, deps }: HandleImportExecuteInput): Promise<void>` ← C's handler body.
  `deps` type = the function's existing `deps` param type (copy it; it is `PublishContentRouteDeps` or similar).
- **Importers to update:** none.
- **After:** register fn ~78; file ~240.
- **Risks / notes:** none beyond argument mapping in step 1.

### tovu:apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts
- **Over:** `registerAdminRecoveryRestoreRoutes` 162 (file 195, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `apps/website/src/server/__tests__/routes/recovery-restore-routes.test.ts`, `apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts`. No test mocks this module.
- **Responsibility map:** A = `app.post("/api/admin/v1/recovery/restore/plan", …` (50) · B = `…/restore/confirm` (43) · C = `…/restore/execute` (67); each is one step of the plan → confirm → execute ceremony.
- **Splits:** HELPERS at module level directly above the register function (after `sendInternalError`), handler bodies word for word:
  1. `handleRestorePlan({ req, res, deps }: RestoreRouteInput): Promise<void>` ← A.
  2. `handleRestoreConfirm({ req, res, deps }: RestoreRouteInput): Promise<void>` ← B.
  3. `handleRestoreExecute({ req, res, deps }: RestoreRouteInput): Promise<void>` ← C.
  `RestoreRouteInput = { req: Request; res: Response; deps: RouteDeps }`. The register function becomes three `app.post(PATH, (req, res) => handleRestoreX({ req, res, deps }))` lines, same order.
- **Importers to update:** none.
- **After:** register fn ~5; helpers 43-67; file ~205.
- **Risks / notes:** handlers that `return res.…` keep the `return` (helper type `Promise<unknown>` then).

### tovu:apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts
- **Over:** `registerAdminPublishCredentialsRoutes` 134 (file 210, under)
- **Phase:** now (STAY-WIRING) · **Batch:** size-24
- **Tests:** `apps/website/src/server/__tests__/routes/publish-credentials-route.test.ts`, `apps/website/src/features/deployments/publish-credentials/__tests__/project-scope.unit.test.ts`. No test mocks this module.
- **Responsibility map** (inside the register function):

| unit | statement anchor | job |
|---|---|---|
| A | `async function verifyAfterSave(id: string)` | verify one just-touched row against its provider |
| B | `async function rejectUnlessAuthorized(req: Request, res: Response)` | workspace + `system.publish` gate |
| C | `app.post(BASE_PATH, asyncRoute({ handler: async (req, res) => {` | create a credential |
| D (stays) | `readDeps`, `writeDeps`, `accountLabelHealScheduler`, `triggerAccountLabelHeal`, GET / PUT / verify / DELETE registrations | wiring + small handlers |

- **Splits:** HELPERS at module level directly above `registerAdminPublishCredentialsRoutes` (after `sendStoreError`), bodies word for word with their long doc comments:
  1. `verifyPublishCredentialAfterSave({ id, deps }: VerifyPublishCredentialAfterSaveInput): Promise<PublishCredentialVerificationResult | …>` (copy the exact return type) ← A; keep `const verifyAfterSave = (id: string) => verifyPublishCredentialAfterSave({ id, deps });` at the same spot — it is still built once per registration and handed to `createAccountLabelHealScheduler` as before.
  2. `rejectUnlessPublishAuthorized({ req, res, deps }: RejectUnlessPublishAuthorizedInput): Promise<boolean>` ← B; keep `const rejectUnlessAuthorized = (req: Request, res: Response) => rejectUnlessPublishAuthorized({ req, res, deps });`.
  3. `handleCreatePublishCredential({ req, res, deps, writeDeps, verifyAfterSave, rejectUnlessAuthorized }: HandleCreatePublishCredentialInput): Promise<void>` ← C's inner `handler` body; registration `app.post(BASE_PATH, asyncRoute({ handler: (req, res) => handleCreatePublishCredential({ … }) }));`. `writeDeps` type = `typeof writeDeps` → declare it via a named type alias above (`type PublishCredentialWriteDeps = { … }` copied from the literal's fields) or pass `deps` and rebuild nothing — prefer passing the same object.
- **Importers to update:** none.
- **After:** register fn ~80; file ~225.
- **Risks / notes:** `verifyAfterSave` identity matters to the heal scheduler's in-flight dedupe (comment says built ONCE) — keep the single `const` before the scheduler.

### tovu:apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts
- **Over:** `registerAdminPublishSiteRoutes` 182 (file 304, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/system/__tests__/publish-site-listing.unit.test.ts`, `.../system/__tests__/publish-site.tw4.pins.test.ts`, `.../system/__tests__/unit/h4-publish.unit.test.ts`. No test mocks this module.
- **Responsibility map** (inside `registerAdminPublishSiteRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A | `app.post("/api/admin/v1/workspaces/:workspaceId/system/publish", async (req, res) => {` | start a publish run |
| B | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish", async (req, res) => {` | read publish status |
| C | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish/preview", async (req, res) =>` | preview what a publish would do |
| D | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish/destinations", …` | list saved destinations |
| E | `app.get("/api/admin/v1/workspaces/:workspaceId/system/publish-targets", …` | list registry targets for the card |
| F (stays) | `const credentialSource = composePublishCredentialSource({` + the five `app.*` registrations | wiring |

- **Splits:** HELPERS at module level directly above `registerAdminPublishSiteRoutes` (after `readPublishTriggerConfig`), one per route handler, each the handler's body word for word (comments above each `app.*` move onto its helper; keep the registration line's own comment too):
  1. `handlePublishStart({ req, res, deps, credentialSource }: HandlePublishStartInput): Promise<void>` ← A's handler body.
  2. `handlePublishPreview({ req, res, deps, credentialSource }: HandlePublishPreviewInput): Promise<void>` ← C.
  3. `handlePublishDestinations({ req, res, deps }: HandlePublishDestinationsInput): Promise<void>` ← D.
  4. `handlePublishTargets({ req, res, deps }: HandlePublishTargetsInput): Promise<void>` ← E.
  Types: `req: Request`, `res: Response` (express), `deps: AdminPublishSiteDeps`, `credentialSource: ReturnType<typeof composePublishCredentialSource>`. Registration becomes `app.post(PATH, (req, res) => handlePublishStart({ req, res, deps, credentialSource }));` — same path strings, same order. B (19 lines) stays inline.
  If a handler `return`s a value (e.g. `return res.status(…).json(…)`), keep the `return` — the helper's return type then is `Promise<unknown>`; do not change statements.
- **Importers to update:** none.
- **After:** `registerAdminPublishSiteRoutes` ~35; largest helper ~55; file ~320.
- **Risks / notes:** `credentialSource` must stay built ONCE per registration (its comment says so) and be passed, not rebuilt per request.

### tovu:apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts
- **Over:** `registerAdminSiteImportRoutes` 112 (file 128, under)
- **Phase:** now (STAY-PRODUCT) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/system/site-imports.integration.test.ts`, `apps/website/src/server/inbound/admin-http/http/__tests__/unexpected-route-errors.test.ts`, `apps/website/src/server/__tests__/routes/owner-action-product-events-wave2.test.ts`. No test mocks this module.
- **Responsibility map:**

| unit | statement anchor | job |
|---|---|---|
| A | `const fail = (res: Response, error: unknown, req: Request) => {` | map an import failure to the response (22 lines) |
| B | `app.post(root + "/uploads", async (req, res, next) => {` | streamed upload with deadline/idle limits + busy flag |
| C (stays) | `root`, `let uploadBusy`, `gate`, `requestSignal`, `ownerGate`, the other four routes | wiring |

- **Splits:** HELPER at module level above the register function (after `importStep`): `sendSiteImportFailure({ res, error, req, deps }: SendSiteImportFailureInput): void` ← A's body (return type = what `fail` returns today). Keep `const fail = (res: Response, error: unknown, req: Request) => sendSiteImportFailure({ res, error, req, deps });`. `deps: Deps`.
  B stays inline — it writes the `let uploadBusy` flag; moving it would need a state holder.
- **Importers to update:** none.
- **After:** register fn ~92; file ~133.
- **Risks / notes:** none.

### tovu:apps/website/src/server/inbound/admin-http/routes/system/sites.ts
- **Over:** `registerAdminSitesRoutes` 128 (file 322, under)
- **Phase:** now (label ?) · **Batch:** size-24
- **Tests:** `apps/website/src/server/inbound/admin-http/routes/sites/sites-wiring.unit.test.ts`, `.../routes/sites/local-sites.unit.test.ts`, `.../routes/sites/sites-home-errors.unit.test.ts`, `.../routes/sites/__tests__/local-sites.pins.unit.test.ts`, `development/scripts/__tests__/sites-route-parity.test.ts`. Check `rg -n "mock.*system/sites" apps/website/src` first (none seen).
- **Responsibility map** (inside `registerAdminSitesRoutes`):

| unit | statement anchor | job |
|---|---|---|
| A (stays) | `const sitesWorkspace = …` … `registerLocalSitesRoutes({ app, deps: { ...deps, localSiteSupervisor, …` | resolve ports + mount sub-route groups |
| B (stays) | `app.get("/api/admin/v1/workspaces/:workspaceId/system/sites", …`, `app.get(".../system/sites/token-sign-in-plugins", …` | listings (20 lines each) |
| C | `app.post("/api/admin/v1/workspaces/:workspaceId/system/sites", async (req, res) => {` | create a site |
| D | `app.post("/api/admin/v1/workspaces/:workspaceId/system/sites/:name/activate", async (req,` | switch the served site |

- **Splits:** HELPERS at module level directly above `registerAdminSitesRoutes` (after `registerDevWarmSiteRoute`), handler bodies word for word:
  1. `handleCreateSite({ req, res, deps, isSiteSwitcherEnabled }: HandleCreateSiteInput): Promise<void>` ← C.
  2. `handleActivateSite({ req, res, deps, isSiteSwitcherEnabled, listSites, devRestart, sitesWorkspace, warmServer }: HandleActivateSiteInput): Promise<void>` ← D.
  Types: `deps: AdminSitesDeps`, `req: Request`, `res: Response`; the resolved locals keep their inferred types — name them with `NonNullable<AdminSitesDeps["listSites"]>` / `ReturnType<typeof warmSiteServerForHost>` / `ReturnType<typeof createSitesWorkspace>` etc. (copy what the declarations resolve to; `devRestart` = the type of its `const`). Registration: `app.post(PATH, (req, res) => handleCreateSite({ req, res, deps, isSiteSwitcherEnabled }));` same order.
- **Importers to update:** none.
- **After:** `registerAdminSitesRoutes` ~65; helpers ~36 each; file ~335.
- **Risks / notes:** keep each handler's early `return` statements as they are (helper returns `Promise<unknown>` if a body returns `res.…`).

## Done check
`node $TOVU/development/refactor-patterns/size-splits/outline.mjs --check apps/website/src/server/inbound/admin-http/routes/publish-content/destination.ts apps/website/src/server/inbound/admin-http/routes/publish-content/import.ts apps/website/src/server/inbound/admin-http/routes/recovery/restore.ts apps/website/src/server/inbound/admin-http/routes/system/publish-credentials.ts apps/website/src/server/inbound/admin-http/routes/system/publish-site.ts apps/website/src/server/inbound/admin-http/routes/system/site-imports.ts apps/website/src/server/inbound/admin-http/routes/system/sites.ts <every new file>` prints only OK lines (or the over items a plan explicitly leaves for the owner). Report per file: OK / STOPPED (reason), new files, before → after counted lines, tests run with pass counts.
